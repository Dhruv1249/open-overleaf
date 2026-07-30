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
      text: "Hello! I am your Open-Overleaf Copilot powered by gemini-3.6-flash-lite. Type a request or reference files using @filename to refine your LaTeX document.",
    },
  ]);
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [rateLimitCountdownNumber, setRateLimitCountdownNumber] = useState(0);
  const chatBottomRef = useRef<HTMLDivElement>(null);

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
      });

      if (response.status === 429) {
        setRateLimitCountdownNumber(30);
      }

      const responseData = await response.json();

      if (!response.ok || !responseData.success) {
        setMessagesList((previousList) => [
          ...previousList,
          {
            id: `copilot-${Date.now()}`,
            sender: "copilot",
            text: responseData.error || "Copilot encountered an issue processing request.",
            isError: true,
          },
        ]);
        return;
      }

      const hasActionToApprove = responseData.actionType && responseData.actionType !== "none";

      setMessagesList((previousList) => [
        ...previousList,
        {
          id: `copilot-${Date.now()}`,
          sender: "copilot",
          text: responseData.message || "Here is your proposed update:",
          actionType: responseData.actionType,
          targetPath: responseData.targetPath || activeFilePath,
          actionDescription: responseData.actionDescription || "Apply proposed changes",
          replacementCode: responseData.replacementCode,
          approvalStatus: hasActionToApprove ? "pending" : undefined,
        },
      ]);
    } catch (requestError: any) {
      setMessagesList((previousList) => [
        ...previousList,
        {
          id: `copilot-${Date.now()}`,
          sender: "copilot",
          text: requestError.message || "Failed to communicate with Copilot API.",
          isError: true,
        },
      ]);
    } finally {
      setIsLoadingState(false);
    }
  };

  const handleApproveAction = (messageId: string) => {
    setMessagesList((previousList) =>
      previousList.map((item) => {
        if (item.id === messageId) {
          if (item.actionType === "modify_file" && item.replacementCode) {
            onApplyCode(item.replacementCode, Boolean(selectedText));
          } else if (item.actionType === "delete_file" && item.targetPath && onDeleteFile) {
            onDeleteFile(item.targetPath);
          }
          return { ...item, approvalStatus: "approved" };
        }
        return item;
      })
    );
  };

  const handleRejectAction = (messageId: string) => {
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
          <span className="text-lg">✨</span>
          <div>
            <h2 className="font-semibold text-xs text-zinc-200">Overleaf Copilot</h2>
            <p className="text-[10px] text-zinc-400">gemini-3.6-flash-lite</p>
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
          <span>✨ Highlighted Selection Active ({selectedText.split("\n").length} lines)</span>
        </div>
      )}

      {rateLimitCountdownNumber > 0 && (
        <div className="mx-3 mt-2 p-2 bg-rose-950/50 border border-rose-800/50 rounded text-xs text-rose-300">
          ⏳ Rate limit reached (429). Retrying in {rateLimitCountdownNumber}s... (Attempt 1/3)
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messagesList.map((messageItem) => (
          <div
            key={messageItem.id}
            className={`flex flex-col text-xs ${
              messageItem.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[92%] p-2.5 rounded-lg ${
                messageItem.sender === "user"
                  ? "bg-cyan-600 text-white rounded-br-none"
                  : messageItem.isError
                  ? "bg-rose-950 border border-rose-800 text-rose-200 rounded-bl-none"
                  : "bg-zinc-800 text-zinc-200 rounded-bl-none border border-zinc-700/50"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{messageItem.text}</p>

              {messageItem.replacementCode && (
                <div className="mt-2 bg-zinc-950 p-2 rounded border border-zinc-800 font-mono text-[10px] overflow-x-auto max-h-36">
                  <pre className="text-emerald-400 whitespace-pre-wrap">{messageItem.replacementCode}</pre>
                </div>
              )}

              {messageItem.approvalStatus === "pending" && (
                <div className="mt-2.5 p-2 bg-amber-950/60 border border-amber-800/60 rounded space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-amber-200">
                    <span className="font-semibold">⚠️ Approval Required</span>
                    <span className="font-mono text-[10px] text-amber-400">{messageItem.targetPath}</span>
                  </div>
                  <p className="text-[11px] text-zinc-300">{messageItem.actionDescription}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveAction(messageItem.id)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1 rounded text-[11px] font-medium transition-colors"
                    >
                      ✓ Approve & Apply
                    </button>
                    <button
                      onClick={() => handleRejectAction(messageItem.id)}
                      className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 py-1 rounded text-[11px] font-medium transition-colors"
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              )}

              {messageItem.approvalStatus === "approved" && (
                <div className="mt-2 text-[10px] text-emerald-400 font-medium">
                  ✓ Action Approved & Applied
                </div>
              )}

              {messageItem.approvalStatus === "rejected" && (
                <div className="mt-2 text-[10px] text-zinc-400 font-medium">
                  ✕ Action Rejected
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={chatBottomRef} />
      </div>

      <div className="p-2 border-t border-zinc-800 bg-zinc-950 space-y-1.5">
        <div className="flex gap-1.5">
          <textarea
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
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded p-2 text-[11px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 resize-none h-14"
          />
          <button
            onClick={() => handleSendPrompt()}
            disabled={isLoadingState || !promptInputText.trim()}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-2.5 py-1.5 rounded text-xs font-medium transition-colors min-w-14"
          >
            {isLoadingState ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
