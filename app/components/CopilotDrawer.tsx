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
  toolName?: string;
  toolArguments?: any;
  toolError?: string;
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
  getFileContent: (filePath: string) => string | Promise<string>;
  onApplyCode: (replacementCode: string, isSelection: boolean, targetPath?: string) => void;
  onDeleteFile?: (targetPath: string) => void;
  projectName?: string;
  onRefreshTree?: () => void;
  onOpenFile?: (filePath: string) => void;
}

/**
 * Formats tool execution events and arguments into human-readable action summaries.
 */
export function formatToolDescription(
  toolName: string,
  args: any,
  status: "running" | "success" | "failed",
  error?: string
): string {
  const filePath = args?.filePath || args?.targetPath || args?.path;
  const pageNumber = args?.pageNumber;
  const oldPath = args?.oldPath;
  const newPath = args?.newPath;
  const sha = args?.sha;

  if (status === "failed") {
    const errorSuffix = error ? `: ${error}` : "";
    switch (toolName) {
      case "read_project_file":
      case "read_file_lines":
        return `✕ Failed reading ${filePath || "file"}${errorSuffix}`;
      case "create_file":
        return `✕ Failed creating file ${filePath || "file"}${errorSuffix}`;
      case "write_project_file":
        return `✕ Failed writing ${filePath || "file"}${errorSuffix}`;
      case "apply_patch":
        return `✕ Failed editing ${filePath || "file"}${errorSuffix}`;
      case "compile_project":
        return `✕ Failed compiling project${errorSuffix}`;
      case "list_files":
        return `✕ Failed listing project files${errorSuffix}`;
      case "get_project_preview_image":
        return `✕ Failed rendering preview${pageNumber ? ` (p. ${pageNumber})` : ""}${errorSuffix}`;
      case "get_project_pdf":
        return `✕ Failed fetching project PDF${errorSuffix}`;
      case "delete_file":
        return `✕ Failed deleting ${filePath || "file"}${errorSuffix}`;
      case "rename_file":
        return `✕ Failed renaming ${oldPath || "file"}${errorSuffix}`;
      case "get_file_history":
        return `✕ Failed fetching history for ${filePath || "file"}${errorSuffix}`;
      case "get_file_at_revision":
        return `✕ Failed reading ${filePath || "file"} @ ${sha ? sha.slice(0, 7) : "revision"}${errorSuffix}`;
      case "sync_to_drive":
        return `✕ Failed syncing PDF to Google Drive${errorSuffix}`;
      default:
        return `✕ Failed ${toolName}${errorSuffix}`;
    }
  }

  if (status === "success") {
    switch (toolName) {
      case "read_project_file":
      case "read_file_lines":
        return `✓ Read ${filePath || "file"}`;
      case "create_file":
        return `✓ Created empty file ${filePath || "file"}`;
      case "write_project_file":
        return `✓ Wrote ${filePath || "file"}`;
      case "apply_patch":
        return `✓ Edited ${filePath || "file"}`;
      case "compile_project":
        return `✓ Compiled project`;
      case "list_files":
        return `✓ Listed project files`;
      case "get_project_preview_image":
        return `✓ Rendered preview${pageNumber ? ` (p. ${pageNumber})` : ""}`;
      case "get_project_pdf":
        return `✓ Fetched project PDF`;
      case "delete_file":
        return `✓ Deleted ${filePath || "file"}`;
      case "rename_file":
        return `✓ Renamed ${oldPath || "file"} to ${newPath || "new file"}`;
      case "get_file_history":
        return `✓ Fetched history for ${filePath || "file"}`;
      case "get_file_at_revision":
        return `✓ Read ${filePath || "file"} @ ${sha ? sha.slice(0, 7) : "revision"}`;
      case "sync_to_drive":
        return `✓ Synced PDF to Google Drive`;
      default:
        return `✓ Completed ${toolName}`;
    }
  }

  switch (toolName) {
    case "read_project_file":
    case "read_file_lines":
      return `Reading ${filePath || "file"}...`;
    case "create_file":
      return `Creating empty file ${filePath || "file"}...`;
    case "write_project_file":
      return `Writing ${filePath || "file"}...`;
    case "apply_patch":
      return `Editing ${filePath || "file"}...`;
    case "compile_project":
      return `Compiling project...`;
    case "list_files":
      return `Listing project files...`;
    case "get_project_preview_image":
      return `Rendering preview${pageNumber ? ` (p. ${pageNumber})` : ""}...`;
    case "get_project_pdf":
      return `Fetching project PDF...`;
    case "delete_file":
      return `Deleting ${filePath || "file"}...`;
    case "rename_file":
      return `Renaming ${oldPath || "file"} to ${newPath || "new file"}...`;
    case "get_file_history":
      return `Fetching history for ${filePath || "file"}...`;
    case "get_file_at_revision":
      return `Reading ${filePath || "file"} @ ${sha ? sha.slice(0, 7) : "revision"}...`;
    case "sync_to_drive":
      return `Syncing PDF to Google Drive...`;
    default:
      return `Running ${toolName}...`;
  }
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
  onRefreshTree,
  onOpenFile,
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
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Autocomplete for @mentions
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);

  const filteredMentionFiles = projectFiles.filter((f) =>
    f.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  useEffect(() => {
    const key = `copilot_history_${projectName || "default"}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setMessagesList(JSON.parse(saved));
      } catch (err) {}
    }
    setHistoryLoaded(true);
  }, [projectName]);

  useEffect(() => {
    if (!historyLoaded) return;
    const key = `copilot_history_${projectName || "default"}`;
    localStorage.setItem(key, JSON.stringify(messagesList));
  }, [messagesList, projectName, historyLoaded]);

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

    setShowMentionSuggestions(false);
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
    const atMentionMatches = targetTextToSubmit.match(/@([a-zA-Z0-9_.\-\/]+)/g) || [];
    const filesToFetch = new Set<string>();

    if (activeFilePath) {
      filesToFetch.add(activeFilePath);
    }
    for (const match of atMentionMatches) {
      const fName = match.slice(1);
      if (projectFiles.includes(fName)) {
        filesToFetch.add(fName);
      }
    }

    for (const fName of Array.from(filesToFetch)) {
      try {
        fileContextsRecord[fName] = await getFileContent(fName);
      } catch (err) {
        fileContextsRecord[fName] = "";
      }
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
          fullFileContent: activeFilePath ? fullFileContent : "",
          activeFilePath: activeFilePath,
          compileLog: compileLog,
          errorCount: errorCount,
          warningCount: warningCount,
          projectName: projectName,
          history: messagesList,
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
              const toolDescription = formatToolDescription(chunk.name, chunk.arguments, "running");
              setActiveTools((prev) => {
                if (prev.includes(toolDescription)) return prev;
                return [...prev, toolDescription];
              });
              setMessagesList((prev) => [
                ...prev,
                {
                  id: chunk.id,
                  sender: "copilot",
                  text: toolDescription,
                  isToolCall: true,
                  toolStatus: "running",
                  toolName: chunk.name,
                  toolArguments: chunk.arguments,
                },
              ]);
            } else if (chunk.type === "tool_approval_required") {
              const toolDescription = formatToolDescription(chunk.name, chunk.arguments, "running");
              const isEdit = chunk.name === "apply_patch";
              let previewReplacement: string | undefined = undefined;

              if (chunk.name === "apply_patch" && Array.isArray(chunk.arguments?.patches)) {
                const targetPath = chunk.arguments?.filePath || activeFilePath;
                if (onOpenFile && targetPath) {
                  onOpenFile(targetPath);
                }
                const originalFileText = fileContextsRecord[targetPath] || (targetPath === activeFilePath ? fullFileContent : "");
                if (originalFileText !== undefined) {
                  const lines = originalFileText.split("\n");
                  const sortedPatches = [...chunk.arguments.patches].sort((a: any, b: any) => b.startLine - a.startLine);
                  for (const patch of sortedPatches) {
                    const startIdx = Math.max(0, patch.startLine - 1);
                    const deleteCount = Math.max(0, patch.endLine - patch.startLine + 1);
                    const replacementLines = patch.newContent.split("\n");
                    lines.splice(startIdx, deleteCount, ...replacementLines);
                  }
                  previewReplacement = lines.join("\n");
                  onApplyCode(previewReplacement, false, targetPath);
                }
              }

              setMessagesList((prev) => [
                ...prev,
                {
                  id: chunk.id,
                  sender: "copilot",
                  text: `Approval required: ${toolDescription}`,
                  isToolCall: true,
                  toolStatus: "running",
                  toolName: chunk.name,
                  toolArguments: chunk.arguments,
                  approvalStatus: "pending",
                  actionType: isEdit ? "modify_file" : "delete_file",
                  targetPath: chunk.arguments?.filePath || chunk.arguments?.targetPath || chunk.name,
                  actionDescription: isEdit
                    ? "Review proposed diff hunks in editor. Accept or reject individual hunks or use the actions below:"
                    : toolDescription,
                  replacementCode: isEdit ? undefined : previewReplacement,
                },
              ]);
            } else if (chunk.type === "tool_result") {
              const runningDescription = formatToolDescription(chunk.name, chunk.arguments, "running");
              const finalDescription = formatToolDescription(
                chunk.name,
                chunk.arguments,
                chunk.success ? "success" : "failed",
                chunk.error
              );
              setActiveTools((prev) => prev.filter((t) => t !== runningDescription && t !== chunk.name));
              if (chunk.success) {
                if (onRefreshTree && ["create_file", "apply_patch", "delete_file", "rename_file", "update_project_settings"].includes(chunk.name)) {
                  onRefreshTree();
                }
                if (["create_file", "rename_file"].includes(chunk.name) && onOpenFile) {
                  const patchedPath = chunk.arguments?.filePath ?? chunk.arguments?.targetPath ?? chunk.arguments?.newPath;
                  if (patchedPath) onOpenFile(patchedPath);
                }
              }
              setMessagesList((prev) =>
                prev.map((item) => {
                  if (item.id === chunk.id) {
                    return {
                      ...item,
                      text: finalDescription,
                      toolStatus: chunk.success ? "success" : "failed",
                      toolName: chunk.name || item.toolName,
                      toolArguments: chunk.arguments || item.toolArguments,
                      toolError: chunk.error,
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
        onApplyCode(finalData.replacementCode, false, finalData.targetPath || activeFilePath);
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

  const submitApproval = async (callId: string, action: "approve" | "reject", details?: any) => {
    try {
      await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, callId, details }),
      });
    } catch (err) {}
  };

  const handleApproveAction = (messageId: string, customDetails?: any) => {
    submitApproval(messageId, "approve", customDetails);
    setMessagesList((previousList) =>
      previousList.map((item) => {
        if (item.id === messageId) {
          if (item.actionType === "modify_file" && item.replacementCode) {
            onApplyCode(item.replacementCode, Boolean(selectedText), item.targetPath || activeFilePath);
          } else if (item.actionType === "delete_file" && item.targetPath && onDeleteFile) {
            const mcpTools = ["apply_patch", "create_file", "write_project_file", "delete_file", "rename_file", "update_project_settings"];
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

  const handleRejectAction = (messageId: string, customDetails?: any) => {
    submitApproval(messageId, "reject", customDetails);
    setMessagesList((previousList) =>
      previousList.map((item) => {
        if (item.id === messageId) {
          return { ...item, approvalStatus: "rejected" };
        }
        return item;
      })
    );
  };

  const handleClearHistory = () => {
    const key = `copilot_history_${projectName || "default"}`;
    localStorage.removeItem(key);
    setMessagesList([
      {
        id: "welcome-1",
        sender: "copilot",
        text: "Hello! I am your Open-Overleaf Copilot powered by gemini-3.5-flash-lite. Type a request or reference files using @filename to refine your LaTeX document.",
      },
    ]);
  };

  const insertAtMention = (fileName: string) => {
    setPromptInputText((previousText) => `${previousText} @${fileName} `);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setPromptInputText(value);

    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
      const query = textBeforeCursor.slice(atIndex + 1);
      if ((/\s/.test(charBeforeAt) || atIndex === 0) && !/\s/.test(query)) {
        setMentionQuery(query);
        setMentionStartIndex(atIndex);
        setMentionSelectedIndex(0);
        setShowMentionSuggestions(true);
        return;
      }
    }
    setShowMentionSuggestions(false);
  };

  const selectMentionFile = (fileName: string) => {
    const textarea = textareaRef.current;
    const cursorPos = textarea?.selectionStart || promptInputText.length;
    const startIndex = mentionStartIndex !== null ? mentionStartIndex : promptInputText.lastIndexOf("@");

    if (startIndex !== -1) {
      const beforeAt = promptInputText.slice(0, startIndex);
      const afterCursor = promptInputText.slice(cursorPos);
      const newText = `${beforeAt}@${fileName} ${afterCursor}`;
      setPromptInputText(newText);
      setShowMentionSuggestions(false);

      setTimeout(() => {
        if (textarea) {
          const newPos = startIndex + fileName.length + 2;
          textarea.focus();
          textarea.setSelectionRange(newPos, newPos);
        }
      }, 0);
    } else {
      insertAtMention(fileName);
      setShowMentionSuggestions(false);
    }
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
            onClick={handleClearHistory}
            className="text-zinc-400 hover:text-zinc-100 text-[10px] px-1.5 py-0.5 rounded hover:bg-zinc-800 border border-zinc-700/50"
            title="Clear Chat History"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-xs px-1.5 py-0.5 rounded hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 bg-zinc-950/50 border-b border-zinc-800/50 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-zinc-500 font-medium">Attach Context:</span>
        {activeFilePath ? (
          <span className="bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1">
            <span>@{activeFilePath}</span>
            <span className="text-[9px] text-cyan-400/80">(active)</span>
          </span>
        ) : (
          <span className="text-zinc-500 italic text-[10px]">No active file</span>
        )}
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

              {messageItem.isToolCall && messageItem.toolStatus === "failed" && (
                <div className="mt-2 p-2 bg-rose-950/60 border border-rose-800/60 rounded text-[11px] space-y-1 text-left font-sans">
                  <div className="flex items-center justify-between text-rose-300 font-medium">
                    <span>Tool: <code className="font-mono text-rose-200 bg-rose-900/40 px-1 py-0.5 rounded">{messageItem.toolName || "tool"}</code></span>
                    {messageItem.targetPath && <span className="font-mono text-[10px] text-zinc-400">{messageItem.targetPath}</span>}
                  </div>
                  {messageItem.toolArguments && Object.keys(messageItem.toolArguments).length > 0 && (
                    <div className="text-zinc-400 font-mono text-[9px] bg-zinc-900/80 p-1.5 rounded border border-zinc-800 break-all">
                      {JSON.stringify(messageItem.toolArguments)}
                    </div>
                  )}
                  {messageItem.toolError && (
                    <div className="text-rose-300 font-mono text-[10px] bg-rose-950/80 p-1.5 rounded border border-rose-900/60 break-all whitespace-pre-wrap">
                      {messageItem.toolError}
                    </div>
                  )}
                </div>
              )}

              {messageItem.replacementCode && (
                <div className="mt-2 bg-zinc-950 p-2 rounded border border-zinc-800 font-mono text-[10px] overflow-x-auto panel-scroll max-h-36">
                  <pre className="text-emerald-400 whitespace-pre-wrap">{messageItem.replacementCode}</pre>
                </div>
              )}

              {messageItem.approvalStatus === "pending" && messageItem.actionType !== "modify_file" && (
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
                      Approve
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

              {messageItem.approvalStatus === "approved" && messageItem.actionType !== "modify_file" && (
                <div className="mt-2 text-[10px] text-emerald-400 font-medium">
                  ✓ Approved
                </div>
              )}

              {messageItem.approvalStatus === "rejected" && messageItem.actionType !== "modify_file" && (
                <div className="mt-2 text-[10px] text-zinc-400 font-medium">
                  ✕ Rejected
                </div>
              )}
            </div>
          </div>
        ))}
        {activeTools.length > 0 && (
          <div className="flex items-center gap-2 p-2 bg-zinc-800/60 border border-zinc-700/50 rounded text-[11px] text-zinc-300 animate-pulse">
            <span>{activeTools.join(" · ")}</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      <div className="p-1.5 border-t border-zinc-800 bg-zinc-950 relative">
        {showMentionSuggestions && (
          <div className="absolute bottom-full left-1.5 right-1.5 mb-1 bg-zinc-900 border border-zinc-700/80 rounded-md shadow-2xl z-50 max-h-48 overflow-y-auto panel-scroll p-1">
            <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 flex justify-between items-center select-none">
              <span>Files in project</span>
              <span className="text-[9px] text-zinc-500 font-normal">↑↓ Navigate · ↵ Select · Esc Close</span>
            </div>
            {filteredMentionFiles.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-zinc-500 italic">No matching files found</div>
            ) : (
              filteredMentionFiles.map((fileItem, idx) => (
                <div
                  key={fileItem}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMentionFile(fileItem);
                  }}
                  className={`px-2 py-1.5 text-xs rounded cursor-pointer flex items-center justify-between transition-colors ${
                    idx === mentionSelectedIndex
                      ? "bg-cyan-900/60 text-cyan-200 font-medium"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  <span className="font-mono text-[11px]">@{fileItem}</span>
                  {fileItem === activeFilePath && (
                    <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800/60 px-1 py-0.2 rounded font-sans">
                      active
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
        <div className="flex gap-1.5">
          <textarea
            ref={textareaRef}
            value={promptInputText}
            onChange={handleTextareaChange}
            onKeyDown={(e) => {
              if (showMentionSuggestions && filteredMentionFiles.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionSelectedIndex((prev) => (prev + 1) % filteredMentionFiles.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionSelectedIndex((prev) => (prev - 1 + filteredMentionFiles.length) % filteredMentionFiles.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  selectMentionFile(filteredMentionFiles[mentionSelectedIndex]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setShowMentionSuggestions(false);
                  return;
                }
              }

              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendPrompt();
              }
            }}
            placeholder={
              selectedText
                ? "Refine highlighted selection..."
                : "Ask Copilot to edit or fix LaTeX (type @ for files)..."
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

