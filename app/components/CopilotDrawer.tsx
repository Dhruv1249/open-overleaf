"use client";

import React, { useState, useEffect, useRef } from "react";

export interface ChatMessageItem {
  id: string;
  sender: "user" | "copilot";
  text: string;
  actionType?: "modify_file" | "delete_file" | "none";
  targetPath?: string;
  actionDescription?: string;
  replacementCode?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  isError?: boolean;
  isToolCall?: boolean;
  toolStatus?: "running" | "success" | "failed";
  isThought?: boolean;
}

export interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeFilePath: string;
  selectedText: string;
  fullFileContent: string;
  compileLog?: string;
  errorCount?: number;
  warningCount?: number;
  projectFiles: string[];
  getFileContent: (filePath: string) => string;
  onApplyCode: (replacementCode: string, isSelection: boolean) => void;
  onDeleteFile?: (targetPath: string) => void;
  projectName?: string;
}

export default function CopilotDrawer({
  isOpen,
  onClose,
  activeFilePath,
  selectedText,
  fullFileContent,
  compileLog = "",
  errorCount = 0,
  warningCount = 0,
  projectFiles,
  getFileContent,
  onApplyCode,
  onDeleteFile,
  projectName,
}: CopilotDrawerProps) {
  const [promptInputText, setPromptInputText] = useState("");
  const [messagesList, setMessagesList] = useState<ChatMessageItem[]>([
    {
      id: "welcome-1",
      sender: "copilot",
      text: "Hello! I am your Open-Overleaf Copilot powered by gemini-3.5-flash-lite. Type a request or reference files using @filename to refine your LaTeX document.",
    },
  ]);
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [rateLimitCountdownNumber, setRateLimitCountdownNumber] = useState(0);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "32px";
      if (promptInputText) {
        if (textarea.scrollHeight > 36) {
          textarea.style.height = `${Math.min(110, textarea.scrollHeight)}px`;
        }
      }
    }
  }, [promptInputText]);

  const handleStopPrompt = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoadingState(false);
    setActiveTools([]);
    setMessagesList((prev) => [
      ...prev,
      {
        id: `copilot-stop-${Date.now()}`,
        sender: "copilot",
        text: "✕ Copilot execution stopped by user.",
        isError: true,
      },
    ]);
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesList]);

  useEffect(() => {
    let countdownIntervalId: NodeJS.Timeout;
    if (rateLimitCountdownNumber > 0) {
      countdownIntervalId = setInterval(() => {
        setRateLimitCountdownNumber((previousValue) => previousValue - 1);
      }, 1000);
    }
    return () => clearInterval(countdownIntervalId);
  }, [rateLimitCountdownNumber]);

  if (!isOpen) return null;

  const handleSendPrompt = async (overridePromptText?: string) => {
    const targetTextToSubmit = overridePromptText || promptInputText;
    if (!targetTextToSubmit.trim() || isLoadingState) return;

    const userMessageId = `user-${Date.now()}`;
    const newUserMessage: ChatMessageItem = {
      id: userMessageId,
      sender: "user",
      text: targetTextToSubmit,
    };

    setMessagesList((previousList) => [...previousList, newUserMessage]);
    if (!overridePromptText) {
      setPromptInputText("");
    }
    setIsLoadingState(true);

    const fileContextsRecord: Record<string, string> = {};
    for (const fileNameItem of projectFiles) {
      fileContextsRecord[fileNameItem] = getFileContent(fileNameItem);
    }

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: targetTextToSubmit,
          fileContexts: fileContextsRecord,
          selectedText: selectedText,
          fullFileContent: fullFileContent,
          activeFilePath: activeFilePath,
          compileLog: compileLog,
          errorCount: errorCount,
          warningCount: warningCount,
          projectName: projectName,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to initialize stream reader");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let finalData: any = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "thought") {
              setMessagesList((prev) => [
                ...prev,
                {
                  id: `thought-${Date.now()}-${Math.random()}`,
                  sender: "copilot",
                  text: chunk.text,
                  isThought: true,
                },
              ]);
            } else if (chunk.type === "tool_start") {
              setActiveTools((prev) => {
                if (prev.includes(chunk.name)) return prev;
                return [...prev, chunk.name];
              });
              setMessagesList((prev) => [
                ...prev,
                {
                  id: chunk.id,
                  sender: "copilot",
                  text: `Running ${chunk.name}${chunk.arguments ? `(${JSON.stringify(chunk.arguments)})` : ""}...`,
                  isToolCall: true,
                  toolStatus: "running",
                },
              ]);
            } else if (chunk.type === "tool_approval_required") {
              setMessagesList((prev) => [
                ...prev,
                {
                  id: chunk.id,
                  sender: "copilot",
                  text: `Tool '${chunk.name}' requires your approval to run.`,
                  isToolCall: true,
                  toolStatus: "running",
                  approvalStatus: "pending",
                  actionType: "delete_file",
                  targetPath: chunk.name,
                  actionDescription: `Arguments: ${JSON.stringify(chunk.arguments)}`,
                },
              ]);
            } else if (chunk.type === "tool_result") {
              setActiveTools((prev) => prev.filter((t) => t !== chunk.name));
              setMessagesList((prev) =>
                prev.map((item) => {
                  if (item.id === chunk.id) {
                    return {
                      ...item,
                      text: chunk.success
                        ? `✓ Completed ${chunk.name}`
                        : `✕ Failed ${chunk.name}: ${chunk.error}`,
                      toolStatus: chunk.success ? "success" : "failed",
                      isError: !chunk.success,
                    };
                  }
                  return item;
                })
              );
            } else if (chunk.type === "final") {
              finalData = chunk.response;
            } else if (chunk.type === "error") {
              throw new Error(chunk.error);
            }
          } catch (e: any) {
            console.error("Failed to parse chunk:", line, e);
          }
        }
      }

      setActiveTools([]);

      if (!finalData) {
        throw new Error("No final response received from AI assistant.");
      }

      const isModify = finalData.actionType === "modify_file";
      const isDelete = finalData.actionType === "delete_file";

      setMessagesList((previousList) => [
        ...previousList,
        {
          id: `copilot-${Date.now()}`,
          sender: "copilot",
          text: finalData.message || (isModify ? "Proposed changes loaded in editor." : "Here is your proposed update:"),
          actionType: finalData.actionType,
          targetPath: finalData.targetPath || activeFilePath,
          actionDescription: finalData.actionDescription || "Apply proposed changes",
          replacementCode: finalData.replacementCode,
          approvalStatus: isDelete ? "pending" : undefined,
        },
      ]);

      if (isModify && finalData.replacementCode) {
        onApplyCode(finalData.replacementCode, false);
      }
    } catch (requestError: any) {
      setActiveTools([]);
      setMessagesList((previousList) => [
        ...previousList,
        {
          id: `copilot-${Date.now()}`,
          sender: "copilot",
          text: requestError.message || "Copilot encountered an issue processing request.",
          isError: true,
        },
      ]);
    } finally {
      setIsLoadingState(false);
    }
  };

  const submitApproval = async (callId: string, action: "approve" | "reject") => {
    try {
      await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, callId }),
      });
    } catch (err) {}
  };

  const handleApproveAction = (messageId: string) => {
    submitApproval(messageId, "approve");
    setMessagesList((previousList) =>
      previousList.map((item) => {
        if (item.id === messageId) {
          if (item.actionType === "modify_file" && item.replacementCode) {
            onApplyCode(item.replacementCode, Boolean(selectedText));
          } else if (item.actionType === "delete_file" && item.targetPath && onDeleteFile) {
            const mcpTools = ["rename_file", "update_project_settings", "sync_to_drive"];
            if (!mcpTools.includes(item.targetPath)) {
              onDeleteFile(item.targetPath);
            }
          }
          return { ...item, approvalStatus: "approved" };
        }
        return item;
      })
    );
  };

  const handleRejectAction = (messageId: string) => {
    submitApproval(messageId, "reject");
    setMessagesList((previousList) =>
      previousList.map((item) => {
        if (item.id === messageId) {
          return { ...item, approvalStatus: "rejected" };
        }
        return item;
      })
    );
  };

  const insertAtMention = (fileName: string) => {
    setPromptInputText((previousText) => `${previousText} @${fileName} `);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-t border-zinc-800 text-zinc-100 shadow-2xl">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="font-semibold text-xs text-zinc-200">Overleaf Copilot</h2>
            <p className="text-[10px] text-zinc-400">gemini-3.5-flash-lite</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <button
              onClick={() => handleSendPrompt("Fix LaTeX compilation errors shown in diagnostics")}
              className="bg-rose-900/60 hover:bg-rose-800/80 border border-rose-700/60 text-rose-200 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-medium transition-colors"
            >
              <span>✗ {errorCount} Error{errorCount > 1 ? "s" : ""}</span>
              <span className="text-cyan-300 font-bold">Fix with AI</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-xs px-1.5 py-0.5 rounded hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 bg-zinc-950/50 border-b border-zinc-800/50 flex flex-wrap items-center gap-1 text-[11px]">
        <span className="text-zinc-500 font-medium">Attach Context:</span>
        {projectFiles.map((fileItem) => (
          <button
            key={fileItem}
            onClick={() => insertAtMention(fileItem)}
            className="bg-zinc-800 hover:bg-zinc-700 text-cyan-400 px-1.5 py-0.5 rounded text-[10px] transition-colors"
          >
            @{fileItem}
          </button>
        ))}
      </div>

      {selectedText && (
        <div className="mx-3 mt-2 p-1.5 bg-amber-950/40 border border-amber-800/40 rounded text-[11px] text-amber-300 flex items-center justify-between">
          <span>Highlighted Selection Active ({selectedText.split("\n").length} lines)</span>
        </div>
      )}

      {rateLimitCountdownNumber > 0 && (
        <div className="mx-3 mt-2 p-2 bg-rose-950/50 border border-rose-800/50 rounded text-xs text-rose-300">
          Rate limit reached (429). Retrying in {rateLimitCountdownNumber}s... (Attempt 1/3)
        </div>
      )}

      <div className="flex-1 overflow-y-auto panel-scroll p-3 space-y-4 min-h-0">
        {messagesList.map((messageItem) => (
          <div
            key={messageItem.id}
            style={{ marginBottom: "16px" }}
            className={`flex flex-col text-xs ${
              messageItem.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[92%] p-2.5 rounded-lg ${
                messageItem.sender === "user"
                  ? "bg-cyan-600 text-white rounded-br-none"
                  : messageItem.isToolCall
                  ? messageItem.toolStatus === "running"
                    ? "bg-zinc-800/40 border border-zinc-700/30 text-zinc-400 rounded-bl-none italic"
                    : messageItem.toolStatus === "success"
                    ? "bg-zinc-800/70 border border-zinc-700/60 text-zinc-300 rounded-bl-none font-mono text-[10px]"
                    : "bg-rose-950/40 border border-rose-800/40 text-rose-300 rounded-bl-none font-mono text-[10px]"
                  : messageItem.isThought
                  ? "bg-zinc-900/60 border border-zinc-800/50 text-zinc-400 rounded-bl-none italic"
                  : messageItem.isError
                  ? "bg-rose-950 border border-rose-800 text-rose-200 rounded-bl-none"
                  : "bg-zinc-800 text-zinc-200 rounded-bl-none border border-zinc-700/50"
              }`}
            >
              {messageItem.isThought && (
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold mb-1 uppercase tracking-wider select-none">
                  <span>Thinking Process</span>
                </div>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{messageItem.text}</p>

              {messageItem.replacementCode && (
                <div className="mt-2 bg-zinc-950 p-2 rounded border border-zinc-800 font-mono text-[10px] overflow-x-auto panel-scroll max-h-36">
                  <pre className="text-emerald-400 whitespace-pre-wrap">{messageItem.replacementCode}</pre>
                </div>
              )}

              {messageItem.approvalStatus === "pending" && (
                <div className="mt-2.5 p-2 bg-amber-950/60 border border-amber-800/60 rounded space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-amber-200">
                    <span className="font-semibold">Approval Required</span>
                    <span className="font-mono text-[10px] text-amber-400">{messageItem.targetPath}</span>
                  </div>
                  <p className="text-[11px] text-zinc-300">{messageItem.actionDescription}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveAction(messageItem.id)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1 rounded text-[11px] font-medium transition-colors"
                    >
                      Approve & Apply
                    </button>
                    <button
                      onClick={() => handleRejectAction(messageItem.id)}
                      className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 py-1 rounded text-[11px] font-medium transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {messageItem.approvalStatus === "approved" && (
                <div className="mt-2 text-[10px] text-emerald-400 font-medium">
                  Action Approved & Applied
                </div>
              )}

              {messageItem.approvalStatus === "rejected" && (
                <div className="mt-2 text-[10px] text-zinc-400 font-medium">
                  Action Rejected
                </div>
              )}
            </div>
          </div>
        ))}
        {activeTools.length > 0 && (
          <div className="flex items-center gap-2 p-2 bg-zinc-800/60 border border-zinc-700/50 rounded text-[11px] text-zinc-300 animate-pulse">
            <span>Running tools: {activeTools.join(", ")}...</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      <div className="p-1.5 border-t border-zinc-800 bg-zinc-950">
        <div className="flex gap-1.5">
          <textarea
            ref={textareaRef}
            value={promptInputText}
            onChange={(e) => setPromptInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendPrompt();
              }
            }}
            placeholder={
              selectedText
                ? "Refine highlighted selection..."
                : "Ask Copilot to edit or fix LaTeX..."
            }
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-[6px] text-[11px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 resize-none min-h-[32px] max-h-[110px] h-auto overflow-y-auto panel-scroll"
          />
          {isLoadingState ? (
            <button
              onClick={handleStopPrompt}
              className="bg-rose-600 hover:bg-rose-500 text-white px-2.5 rounded text-xs font-medium transition-colors min-w-14 self-end h-[32px] flex items-center justify-center"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => handleSendPrompt()}
              disabled={!promptInputText.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-2.5 rounded text-xs font-medium transition-colors min-w-14 self-end h-[32px] flex items-center justify-center"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
