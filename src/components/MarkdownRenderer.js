"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// 把数学模式内的中文自动包上 \text{}，并去掉公式内部的换行符
function wrapCjkInMath(text) {
  // 先处理块级 $$...$$
  let result = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, body) => `$$${wrapBody(body.replace(/\n/g, " "))}$$`);
  // AI 可能把单个 $ 写在单独行——当作块级公式处理
  result = result.replace(/(\n|^)\s*\$\s*\n([\s\S]*?)\n\s*\$\s*(\n|$)/g, (_, before, body, after) => `${before}$$\n${wrapBody(body.trim())}\n$$${after}`);
  // 行内 $...$（单行）
  result = result.replace(/(?<!\$)\$(?!\$)([^$\n]+)(?<!\$)\$(?!\$)/g, (_, body) => `$${wrapBody(body)}$`);
  return result;
}

function wrapBody(body) {
  // 跳过已经在 \text{} 里的内容
  // 把连续的中文/全角字符用 \text{} 包起来
  return body.replace(/([一-鿿　-〿＀-￯]+)/g, "\\text{$1}");
}

export default function MarkdownRenderer({ content }) {
  if (!content || typeof content !== "string") return null;
  // 解码所有 HTML 实体
  const decoded = content
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");

  // 统一 LaTeX 分隔符
  let normalized = decoded
    .replace(/\\\[/g, "\n$$\n")
    .replace(/\\\]/g, "\n$$\n")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");

  // 数学模式中的中文自动包 \text{}
  normalized = wrapCjkInMath(normalized);

  return (
    <div className="prose prose-zinc dark:prose-invert max-w-none text-sm leading-relaxed
      prose-headings:text-zinc-800 dark:prose-headings:text-zinc-100
      prose-h2:text-xl prose-h2:font-bold prose-h2:mt-6 prose-h2:mb-3
      prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-2
      prose-p:text-zinc-700 dark:prose-p:text-zinc-300 prose-p:my-2
      prose-ul:my-2 prose-li:text-zinc-700 dark:prose-li:text-zinc-300
      prose-code:bg-zinc-100 dark:prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
      prose-pre:bg-zinc-900 dark:prose-pre:bg-zinc-950 prose-pre:text-zinc-100 prose-pre:rounded-lg
      prose-blockquote:border-indigo-500 prose-blockquote:bg-indigo-50 dark:prose-blockquote:bg-indigo-950/20
      prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100
      prose-a:text-indigo-600 dark:prose-a:text-indigo-400
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        components={{
          // 代码块用深色背景
          pre({ children }) {
            return (
              <pre className="bg-zinc-900 dark:bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm my-4">
                {children}
              </pre>
            );
          },
          code({ className, children, ...props }) {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-zinc-100 dark:bg-zinc-800 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-sm" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
