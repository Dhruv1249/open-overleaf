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
    <div className="copilot-drawer">
      {/* ── Header ── */}
      <div className="copilot-header">
        <div className="copilot-header-info">
          <h2 className="copilot-title">Overleaf Copilot</h2>
          <p className="copilot-model">gemini-3.5-flash-lite</p>
        </div>
        <div className="copilot-header-actions">
          {errorCount > 0 && (
            <button
              onClick={() => handleSendPrompt("Fix LaTeX compilation errors shown in diagnostics")}
              className="copilot-error-badge"
              title="Fix compilation errors with AI"
            >
              <span>✗ {errorCount} Error{errorCount > 1 ? "s" : ""}</span>
              <span className="copilot-fix-badge">Fix with AI</span>
            </button>
          )}
          <button
            onClick={handleClearHistory}
            className="copilot-header-btn"
            title="Clear Chat History"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="copilot-header-btn copilot-close-btn"
            title="Close Copilot"
            aria-label="Close Copilot"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Context bar ── */}
      <div className="copilot-context-bar">
        <span className="copilot-context-label">Attach Context:</span>
        {activeFilePath ? (
          <span className="copilot-tag">
            <span>@{activeFilePath}</span>
            <span className="copilot-tag-sub">(active)</span>
          </span>
        ) : (
          <span className="copilot-no-context">No active file</span>
        )}
      </div>

      {/* ── Highlighted selection active banner ── */}
      {selectedText && (
        <div className="copilot-banner-selection">
          <span>Highlighted Selection Active ({selectedText.split("\n").length} lines)</span>
        </div>
      )}

      {/* ── Rate limit banner ── */}
      {rateLimitCountdownNumber > 0 && (
        <div className="copilot-banner-ratelimit">
          Rate limit reached (429). Retrying in {rateLimitCountdownNumber}s... (Attempt 1/3)
        </div>
      )}

      {/* ── Messages list ── */}
      <div className="copilot-messages panel-scroll">
        {messagesList.map((messageItem) => {
          const isUser = messageItem.sender === "user";
          let bubbleClass = "copilot-msg-bubble";
          if (isUser) {
            bubbleClass += " user";
          } else if (messageItem.isToolCall) {
            if (messageItem.toolStatus === "running") {
              bubbleClass += " tool-running";
            } else if (messageItem.toolStatus === "success") {
              bubbleClass += " tool-success";
            } else {
              bubbleClass += " tool-failed";
            }
          } else if (messageItem.isThought) {
            bubbleClass += " thought";
          } else if (messageItem.isError) {
            bubbleClass += " error";
          } else {
            bubbleClass += " assistant";
          }

          return (
            <div
              key={messageItem.id}
              className={`copilot-msg-row ${isUser ? "user" : "copilot"}`}
            >
              <div className={bubbleClass}>
                {messageItem.isThought && (
                  <div className="copilot-thought-header">
                    Thinking Process
                  </div>
                )}
                <p className="copilot-msg-text">{messageItem.text}</p>

                {messageItem.isToolCall && messageItem.toolStatus === "failed" && (
                  <div className="copilot-tool-failure-box">
                    <div className="copilot-tool-failure-header">
                      <span>Tool: <code className="copilot-tool-name">{messageItem.toolName || "tool"}</code></span>
                      {messageItem.targetPath && <span className="copilot-tool-path">{messageItem.targetPath}</span>}
                    </div>
                    {messageItem.toolArguments && Object.keys(messageItem.toolArguments).length > 0 && (
                      <div className="copilot-tool-args">
                        {JSON.stringify(messageItem.toolArguments)}
                      </div>
                    )}
                    {messageItem.toolError && (
                      <div className="copilot-tool-error-msg">
                        {messageItem.toolError}
                      </div>
                    )}
                  </div>
                )}

                {messageItem.replacementCode && (
                  <div className="copilot-code-block panel-scroll">
                    <pre className="copilot-code-pre">{messageItem.replacementCode}</pre>
                  </div>
                )}

                {messageItem.approvalStatus === "pending" && messageItem.actionType !== "modify_file" && (
                  <div className="copilot-approval-card">
                    <div className="copilot-approval-header">
                      <span>Approval Required</span>
                      <span className="copilot-approval-target">{messageItem.targetPath}</span>
                    </div>
                    <p className="copilot-approval-desc">{messageItem.actionDescription}</p>
                    <div className="copilot-approval-actions">
                      <button
                        onClick={() => handleApproveAction(messageItem.id)}
                        className="copilot-btn-approve"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectAction(messageItem.id)}
                        className="copilot-btn-reject"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}

                {messageItem.approvalStatus === "approved" && messageItem.actionType !== "modify_file" && (
                  <div className="copilot-approval-approved">
                    ✓ Approved
                  </div>
                )}

                {messageItem.approvalStatus === "rejected" && messageItem.actionType !== "modify_file" && (
                  <div className="copilot-approval-rejected">
                    ✕ Rejected
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {activeTools.length > 0 && (
          <div className="copilot-active-tools">
            <span>{activeTools.join(" · ")}</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div className="copilot-input-bar">
        {showMentionSuggestions && (
          <div className="copilot-mentions-menu panel-scroll">
            <div className="copilot-mentions-header">
              <span>Files in project</span>
              <span className="copilot-mentions-hint">↑↓ Navigate · ↵ Select · Esc Close</span>
            </div>
            {filteredMentionFiles.length === 0 ? (
              <div className="copilot-mentions-empty">No matching files found</div>
            ) : (
              filteredMentionFiles.map((fileItem, idx) => (
                <div
                  key={fileItem}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMentionFile(fileItem);
                  }}
                  className={`copilot-mention-item ${
                    idx === mentionSelectedIndex ? "selected" : ""
                  }`}
                >
                  <span className="copilot-mention-name">@{fileItem}</span>
                  {fileItem === activeFilePath && (
                    <span className="copilot-mention-active-badge">
                      active
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
        <div className="copilot-input-container">
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
            className="copilot-textarea panel-scroll"
          />
          {isLoadingState ? (
            <button
              onClick={handleStopPrompt}
              className="copilot-btn-stop"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => handleSendPrompt()}
              disabled={!promptInputText.trim()}
              className="copilot-btn-send"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

