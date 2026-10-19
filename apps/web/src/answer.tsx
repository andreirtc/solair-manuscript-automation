import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/** Model output stays untrusted: no raw HTML, remote images or executable URLs. */
function normalizeMath(text: string) {
  // Chat assistants use both dollar and LaTeX delimiters. Preserve code verbatim.
  return text
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part
            .replace(
              /\\\[([\s\S]*?)\\\]/g,
              (_all, math) => `\n$$\n${math.trim()}\n$$\n`,
            )
            .replace(/\\\(([^\n]*?)\\\)/g, (_all, math) => `$${math}$`)
            .replace(
              /\$\$([^\n]+?)\$\$/g,
              (_all, math) => `\n$$\n${math.trim()}\n$$\n`,
            ),
    )
    .join("");
}
export function Answer({ text }: { text: string }) {
  return (
    <div className="answer-body">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [
            rehypeKatex,
            { trust: false, throwOnError: false, maxExpand: 1000, maxSize: 20 },
          ],
        ]}
        urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : "")}
        components={{
          a: ({ children, href }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => (
            <span>{alt ? `[Image: ${alt}]` : "[Image omitted]"}</span>
          ),
          table: ({ children }) => (
            <div
              className="answer-table"
              tabIndex={0}
              aria-label="Scrollable comparison table"
            >
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  );
}
