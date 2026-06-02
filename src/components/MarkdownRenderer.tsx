import React from "react";
import { Terminal, Lightbulb, AlertCircle, Copy, Check } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  // Split content by code blocks if any exist
  const parts = content.split("```");
  
  return (
    <div className="space-y-5 font-sans text-slate-700 leading-relaxed">
      {parts.map((part, index) => {
        const isCodeBlock = index % 2 === 1;
        
        if (isCodeBlock) {
          // Extract language and code
          const lines = part.split("\n");
          const firstLine = lines[0].trim();
          const language = ["typescript", "javascript", "json", "markdown", "python", "html", "css"].includes(firstLine) 
            ? firstLine 
            : "system";
          
          const codeContent = lines.slice(1).join("\n").trim();
          
          return <CodeBlock key={index} code={codeContent} language={language} />;
        } else {
          return <RegularText key={index} text={part} />;
        }
      })}
    </div>
  );
}

// Inner Component: Code Block with native Copy and styling
function CodeBlock({ code, language }: { code: string; language: string; key?: React.Key | any }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code", err);
    }
  };

  return (
    <div className="border border-slate-700 bg-slate-900 rounded-lg overflow-hidden shadow-md my-4">
      <div className="flex bg-slate-800 px-4 py-2 justify-between items-center text-xs font-mono text-slate-300 border-b border-slate-700/50">
        <span className="flex items-center gap-1.5 uppercase tracking-wider font-semibold text-slate-400">
          <Terminal size={13} />
          {language} template
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors py-0.5 px-2 rounded hover:bg-slate-700/50"
          title="Copy block"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs md:text-sm font-mono text-emerald-400/90 leading-relaxed selection:bg-slate-700">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Inner Component: Regular text parsing headers, blockquotes, bullets
function RegularText({ text }: { text: string; key?: React.Key | any }) {
  const lines = text.split("\n");
  const parsedElements: React.ReactNode[] = [];
  
  let currentListItems: React.ReactNode[] = [];

  const flushList = (key: number) => {
    if (currentListItems.length > 0) {
      parsedElements.push(
        <ul key={`list-${key}`} className="list-none space-y-2 mt-2 mb-4 pl-1">
          {currentListItems}
        </ul>
      );
      currentListItems = [];
    }
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    // Headers: ### Header
    if (trimmed.startsWith("#")) {
      flushList(lineIdx);
      const level = (line.match(/^#+/) || ["#"])[0].length;
      const cleanText = line.replace(/^#+\s*/, "");
      const renderedText = parseInlineStyling(cleanText);

      if (level === 1) {
        parsedElements.push(
          <h1 key={lineIdx} className="text-2xl md:text-3xl font-display font-bold text-slate-900 tracking-tight mt-6 mb-3 pb-1 border-b border-slate-200">
            {renderedText}
          </h1>
        );
      } else if (level === 2) {
        parsedElements.push(
          <h2 key={lineIdx} className="text-xl md:text-2xl font-display font-semibold text-slate-900 tracking-tight mt-5 mb-3">
            {renderedText}
          </h2>
        );
      } else {
        parsedElements.push(
          <h3 key={lineIdx} className="text-base md:text-lg font-display font-semibold text-slate-955 tracking-tight mt-4 mb-2 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-sm bg-indigo-500 inline-block"></span>
            {renderedText}
          </h3>
        );
      }
      return;
    }

    // Blockquotes: > quote
    if (trimmed.startsWith(">")) {
      flushList(lineIdx);
      const cleanText = trimmed.replace(/^>\s*/, "");
      parsedElements.push(
        <div key={lineIdx} className="flex gap-3 border-l-4 border-indigo-500 bg-indigo-50/50 p-4 rounded-r-lg my-4">
          <AlertCircle size={18} className="text-indigo-600 shrink-0 mt-0.5" />
          <p className="font-sans italic text-indigo-950 text-sm md:text-base leading-relaxed">
            {parseInlineStyling(cleanText)}
          </p>
        </div>
      );
      return;
    }

    // List items: - item, * item
    if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
      const cleanText = trimmed.replace(/^[-*]\s*/, "");
      currentListItems.push(
        <li key={lineIdx} className="flex items-start gap-2.5 text-sm md:text-base text-slate-700 leading-relaxed">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0"></span>
          <span className="flex-1">{parseInlineStyling(cleanText)}</span>
        </li>
      );
      return;
    }

    // Check for numbered list: eg "1. "
    const numMatch = trimmed.match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      flushList(lineIdx);
      const cleanText = numMatch[2];
      parsedElements.push(
        <div key={lineIdx} className="flex gap-3 pl-1 py-1 text-sm md:text-base text-slate-700">
          <span className="font-mono text-indigo-500 font-semibold text-sm shrink-0 w-5">{numMatch[1]}.</span>
          <p className="flex-1 leading-relaxed">{parseInlineStyling(cleanText)}</p>
        </div>
      );
      return;
    }

    // Empty lines
    if (trimmed === "") {
      flushList(lineIdx);
      return;
    }

    // Regular paragraph lines
    flushList(lineIdx);
    parsedElements.push(
      <p key={lineIdx} className="text-sm md:text-base text-slate-600 leading-relaxed mb-3">
        {parseInlineStyling(trimmed)}
      </p>
    );
  });

  // Flush any remaining active lists
  flushList(lines.length);

  return <>{parsedElements}</>;
}

// Render bold (**text**) and inline-code (`code`)
function parseInlineStyling(text: string): React.ReactNode[] {
  // Regex to split on bold delimiters (**) or backticks (`)
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={idx} className="bg-slate-100 text-indigo-600 font-mono text-xs px-1.5 py-0.5 rounded border border-slate-200 font-medium">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
