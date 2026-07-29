"use client";

import React, { useState, useEffect, useRef } from "react";

export interface ChatMessageItem {
  id: string;
  sender: "user" | "copilot";
  text: string;
  replacementCode?: string;
  isError?: boolean;
}

export interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeFilePath: string;
  selectedText: string;
  fullFileContent: string;
  projectFiles: string[];
  getFileContent: (filePath: string) => string;
  onApplyCode: (replacementCode: string, isSelection: boolean) => void;
}

/**
 * VS Code Copilot style AI assistant panel powering LaTeX file & selection refinement inside Open-Overleaf.
 */
export default function CopilotDrawer({
  isOpen,
  onClose,
  activeFilePath,
  selectedText,
  fullFileContent,
  projectFiles,
  getFileContent,
  onApplyCode,
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

  const handleSendPrompt = async () => {
    if (!promptInputText.trim() || isLoadingState) return;

    const userMessageId = `user-${Date.now()}`;
    const newUserMessage: ChatMessageItem = {
      id: userMessageId,
      sender: "user",
      text: promptInputText,
    };

    setMessagesList((previousList) => [...previousList, newUserMessage]);
    const currentPromptText = promptInputText;
    setPromptInputText("");
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
          prompt: currentPromptText,
          fileContexts: fileContextsRecord,
          selectedText: selectedText,
          fullFileContent: fullFileContent,
          activeFilePath: activeFilePath,
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

      setMessagesList((previousList) => [
        ...previousList,
        {
          id: `copilot-${Date.now()}`,
          sender: "copilot",
          text: responseData.message || "Here is your refined LaTeX code:",
          replacementCode: responseData.replacementCode,
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

  const insertAtMention = (fileName: string) => {
    setPromptInputText((previousText) => `${previousText} @${fileName} `);
  };

  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-zinc-900 border-l border-zinc-800 text-zinc-100 flex flex-col z-50 shadow-2xl">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
        <div className="flex items-center gap-2">
          <span className="text-xl">✨</span>
          <div>
            <h2 className="font-semibold text-sm">Overleaf Copilot</h2>
            <p className="text-xs text-zinc-400">gemini-3.6-flash-lite</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-100 text-lg px-2 py-1 rounded hover:bg-zinc-800"
        >
          ✕
        </button>
      </div>

      <div className="px-4 py-2 bg-zinc-950/50 border-b border-zinc-800/50 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-zinc-500 font-medium">Insert File Context:</span>
        {projectFiles.map((fileItem) => (
          <button
            key={fileItem}
            onClick={() => insertAtMention(fileItem)}
            className="bg-zinc-800 hover:bg-zinc-700 text-cyan-400 px-1.5 py-0.5 rounded text-[11px] transition-colors"
          >
            @{fileItem}
          </button>
        ))}
      </div>

      {selectedText && (
        <div className="mx-4 mt-3 p-2 bg-amber-950/40 border border-amber-800/40 rounded text-xs text-amber-300 flex items-center justify-between">
          <span>✨ Highlighted Selection Active ({selectedText.split("\n").length} lines)</span>
          <span className="text-[10px] text-amber-400 font-mono">Refine Selection</span>
        </div>
      )}

      {rateLimitCountdownNumber > 0 && (
        <div className="mx-4 mt-3 p-2.5 bg-rose-950/50 border border-rose-800/50 rounded text-xs text-rose-300">
          ⏳ Rate limit reached (429). Retrying in {rateLimitCountdownNumber}s... (Attempt 1/3)
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messagesList.map((messageItem) => (
          <div
            key={messageItem.id}
            className={`flex flex-col text-xs ${
              messageItem.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[90%] p-3 rounded-lg ${
                messageItem.sender === "user"
                  ? "bg-cyan-600 text-white rounded-br-none"
                  : messageItem.isError
                  ? "bg-rose-950 border border-rose-800 text-rose-200 rounded-bl-none"
                  : "bg-zinc-800 text-zinc-200 rounded-bl-none border border-zinc-700/50"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{messageItem.text}</p>

              {messageItem.replacementCode && (
                <div className="mt-3 bg-zinc-950 p-2.5 rounded border border-zinc-800 space-y-2 font-mono text-[11px]">
                  <pre className="overflow-x-auto text-emerald-400 whitespace-pre-wrap max-h-48">
                    {messageItem.replacementCode}
                  </pre>
                  <button
                    onClick={() => onApplyCode(messageItem.replacementCode!, Boolean(selectedText))}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-sans py-1.5 rounded text-xs transition-colors flex items-center justify-center gap-1 font-medium"
                  >
                    <span>⚡</span> Apply to {selectedText ? "Selection" : activeFilePath}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={chatBottomRef} />
      </div>

      <div className="p-3 border-t border-zinc-800 bg-zinc-950 space-y-2">
        <div className="flex gap-2">
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
                ? "Ask Copilot to refine highlighted section or @filename..."
                : "Ask Copilot to generate or refine LaTeX code..."
            }
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 resize-none h-16"
          />
          <button
            onClick={handleSendPrompt}
            disabled={isLoadingState || !promptInputText.trim()}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center min-w-16"
          >
            {isLoadingState ? "..." : "Send"}
          </button>
        </div>
        <p className="text-[10px] text-zinc-500 text-center">
          Press Shift+Enter for newline. Type @filename to attach context.
        </p>
      </div>
    </div>
  );
}
