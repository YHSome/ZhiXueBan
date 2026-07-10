"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// 提取 [graph]...[/graph] 及 ```graph ... ``` 块，拆分为文本+图形段
function splitGraphSegments(text) {
  const segments = [];
  // 同时匹配 [graph]...[/graph] 和 ```graph ... ```（markdown 代码块）
  const regex = /\[graph\]([\s\S]*?)\[\/graph\]|```graph\s*\n([\s\S]*?)\n\s*```/gi;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) segments.push({ type: "text", content: text.slice(last, match.index) });
    const body = (match[1] || match[2] || "").trim();
    segments.push({ type: "graph", content: body });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", content: text.slice(last) });
  if (segments.length === 0) segments.push({ type: "text", content: text });
  return segments;
}

// 把数学模式内的中文自动包上 \text{}，并修复常见 AI LaTeX 错误
function wrapCjkInMath(text) {
  // 先处理块级 $$...$$
  let result = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, body) => {
    let b = body.replace(/\n/g, " ");
    b = fixLatex(b);
    return `$$${wrapBody(b)}$$`;
  });
  // AI 可能把单个 $ 写在单独行——当作块级公式处理
  result = result.replace(/(\n|^)\s*\$\s*\n([\s\S]*?)\n\s*\$\s*(\n|$)/g, (_, before, body, after) => {
    let b = fixLatex(body.trim());
    return `${before}$$\n${wrapBody(b)}\n$$${after}`;
  });
  // 行内 $...$（单行）
  result = result.replace(/(?<!\$)\$(?!\$)([^$\n]+)(?<!\$)\$(?!\$)/g, (_, body) => `$${wrapBody(fixLatex(body))}$`);
  return result;
}

// 修复 AI 常见 LaTeX 错误
function fixLatex(body) {
  return body
    // \\[Xpt] 或 \\[Xcm] 被破坏 → 还原
    .replace(/\\\\\s*\[(\d+\.?\d*)(pt|cm|em|mm)\]/g, '\\\\[$1$2]')
    // 反斜杠后跟空格和数字（如 "\ 2pt]"）→ 还原为 \\[2pt]
    .replace(/\\\s+(\d+\.?\d*)\s*(pt|cm|em|mm)\]/g, '\\\\[$1$2]')
    // 修复 \begin{cases} 中 & 被转义的问题（在 KaTeX 处理前换回来）
    .replace(/&amp;/g, '&');
}

function wrapBody(body) {
  // 跳过已经在 \text{} 里的内容
  // 把连续的中文/全角字符用 \text{} 包起来
  return body.replace(/([一-鿿　-〿＀-￯]+)/g, "\\text{$1}");
}

// 单段纯文本渲染
function TextSegment({ content: raw }) {
  // 解码所有 HTML 实体
  const decoded = raw
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
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false, errorColor: '#9ca3af' }]]}
      components={{
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
  );
}

// 懒加载 GeoGebraView 避免循环依赖
function GraphSegment({ content }) {
  const [GeoGebraView, setGeoGebraView] = useState(null);

  useEffect(() => {
    import("@/components/GeoGebraView").then((mod) => setGeoGebraView(() => mod.default));
  }, []);

  if (!GeoGebraView) {
    return <div className="h-32 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse my-3" />;
  }
  return (
    <div className="my-4">
      <GeoGebraView commands={content} height={280} />
    </div>
  );
}

export default function MarkdownRenderer({ content }) {
  if (!content || typeof content !== "string") return null;

  const segments = splitGraphSegments(content);

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
      {segments.map((seg, i) =>
        seg.type === "graph"
          ? <GraphSegment key={i} content={seg.content} />
          : <TextSegment key={i} content={seg.content} />
      )}
    </div>
  );
}
