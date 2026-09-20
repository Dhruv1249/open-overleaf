"use client";

import React, { useState } from "react";

export interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Renders an inline text snippet formatting bold, italics, inline code, and URLs.
 */
function renderInlineElements(rawText: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const inlineTokenRegex = /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineTokenRegex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      elements.push(rawText.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${match.index}-${token.length}`;

    if (token.startsWith("`") && token.endsWith("`")) {
      elements.push(
        <code key={key} className="copilot-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("***") && token.endsWith("***")) {
      elements.push(
        <strong key={key}>
          <em>{token.slice(3, -3)}</em>
        </strong>
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      elements.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      elements.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("[") && token.includes("](")) {
      const closingBracketIndex = token.indexOf("]");
      const linkLabel = token.slice(1, closingBracketIndex);
      const linkUrl = token.slice(closingBracketIndex + 2, -1);
      elements.push(
        <a
          key={key}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="copilot-link"
        >
          {linkLabel}
        </a>
      );
    } else {
      elements.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < rawText.length) {
    elements.push(rawText.slice(lastIndex));
  }

  return elements;
}

/**
 * Code block snippet component with copy-to-clipboard functionality.
 */
function CodeBlockSnippet({ codeText, language }: { codeText: string; language: string }) {
  const [copiedState, setCopiedState] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopiedState(true);
      setTimeout(() => setCopiedState(false), 2000);
    } catch {
      setCopiedState(false);
    }
  };

  return (
    <div className="copilot-code-block-container">
      <div className="copilot-code-block-header">
        <span className="copilot-code-language">{language || "text"}</span>
        <button
          onClick={handleCopyCode}
          className="copilot-code-copy-btn"
          title="Copy code"
          type="button"
        >
          {copiedState ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="copilot-code-pre-block">
        <code>{codeText}</code>
      </pre>
    </div>
  );
}

/**
 * Markdown renderer component for Copilot assistant messages.
 */
export default function MarkdownContent({ content, className }: MarkdownContentProps) {
  if (!content) {
    return null;
  }

  const renderedBlocks: React.ReactNode[] = [];
  const lines = content.split("\n");
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const currentLine = lines[lineIndex];

    if (currentLine.trim().startsWith("```")) {
      const languageMatch = currentLine.trim().slice(3).trim();
      const codeLines: string[] = [];
      lineIndex++;
      while (lineIndex < lines.length && !lines[lineIndex].trim().startsWith("```")) {
        codeLines.push(lines[lineIndex]);
        lineIndex++;
      }
      if (lineIndex < lines.length) {
        lineIndex++;
      }
      renderedBlocks.push(
        <CodeBlockSnippet
          key={`code-block-${lineIndex}`}
          codeText={codeLines.join("\n")}
          language={languageMatch}
        />
      );
      continue;
    }

    if (currentLine.startsWith("### ")) {
      renderedBlocks.push(
        <h4 key={`h3-${lineIndex}`} className="copilot-md-h3">
          {renderInlineElements(currentLine.slice(4))}
        </h4>
      );
      lineIndex++;
      continue;
    }

    if (currentLine.startsWith("## ")) {
      renderedBlocks.push(
        <h3 key={`h2-${lineIndex}`} className="copilot-md-h2">
          {renderInlineElements(currentLine.slice(3))}
        </h3>
      );
      lineIndex++;
      continue;
    }

    if (currentLine.startsWith("# ")) {
      renderedBlocks.push(
        <h2 key={`h1-${lineIndex}`} className="copilot-md-h1">
          {renderInlineElements(currentLine.slice(2))}
        </h2>
      );
      lineIndex++;
      continue;
    }

    if (currentLine.startsWith("> ")) {
      const quoteLines: string[] = [currentLine.slice(2)];
      lineIndex++;
      while (lineIndex < lines.length && lines[lineIndex].startsWith("> ")) {
        quoteLines.push(lines[lineIndex].slice(2));
        lineIndex++;
      }
      renderedBlocks.push(
        <blockquote key={`quote-${lineIndex}`} className="copilot-md-blockquote">
          {quoteLines.map((quoteParagraph, quoteParagraphIndex) => (
            <p key={`quote-p-${quoteParagraphIndex}`}>
              {renderInlineElements(quoteParagraph)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    if (/^(\s*[-*+]\s+)/.test(currentLine)) {
      const listItems: string[] = [];
      while (lineIndex < lines.length && /^(\s*[-*+]\s+)/.test(lines[lineIndex])) {
        const itemContent = lines[lineIndex].replace(/^(\s*[-*+]\s+)/, "");
        listItems.push(itemContent);
        lineIndex++;
      }
      renderedBlocks.push(
        <ul key={`ul-${lineIndex}`} className="copilot-md-list">
          {listItems.map((listItemText, itemIndex) => (
            <li key={`li-${itemIndex}`}>
              {renderInlineElements(listItemText)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^(\s*\d+\.\s+)/.test(currentLine)) {
      const listItems: string[] = [];
      while (lineIndex < lines.length && /^(\s*\d+\.\s+)/.test(lines[lineIndex])) {
        const itemContent = lines[lineIndex].replace(/^(\s*\d+\.\s+)/, "");
        listItems.push(itemContent);
        lineIndex++;
      }
      renderedBlocks.push(
        <ol key={`ol-${lineIndex}`} className="copilot-md-ordered-list">
          {listItems.map((listItemText, itemIndex) => (
            <li key={`oli-${itemIndex}`}>
              {renderInlineElements(listItemText)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (currentLine.trim() === "") {
      lineIndex++;
      continue;
    }

    const paragraphLines: string[] = [currentLine];
    lineIndex++;
    while (
      lineIndex < lines.length &&
      lines[lineIndex].trim() !== "" &&
      !lines[lineIndex].trim().startsWith("```") &&
      !lines[lineIndex].startsWith("#") &&
      !lines[lineIndex].startsWith("> ") &&
      !/^(\s*[-*+]\s+)/.test(lines[lineIndex]) &&
      !/^(\s*\d+\.\s+)/.test(lines[lineIndex])
    ) {
      paragraphLines.push(lines[lineIndex]);
      lineIndex++;
    }

    renderedBlocks.push(
      <p key={`p-${lineIndex}`} className="copilot-md-paragraph">
        {paragraphLines.map((paragraphLineText, paragraphLineIndex) => (
          <React.Fragment key={`pline-${paragraphLineIndex}`}>
            {paragraphLineIndex > 0 && <br />}
            {renderInlineElements(paragraphLineText)}
          </React.Fragment>
        ))}
      </p>
    );
  }

  return <div className={`copilot-markdown-content ${className || ""}`}>{renderedBlocks}</div>;
}
