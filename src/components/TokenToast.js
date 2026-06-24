"use client";

import { useState, useEffect } from "react";

// 全局状态：单例
let listeners = [];
function notify(state) { listeners.forEach((fn) => fn(state)); }

export function updateTokenToast(state) {
  notify(state);
}

// 通用流式 AI 调用，自动显示 token 球
export async function streamAiCall({ apiKey, baseUrl, model, messages, maxTokens = 20000 }) {
  updateTokenToast({ phase: "loading", bytes: 0 });
  const res = await fetch("/api/ai", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, baseUrl, model, messages, maxTokens }),
  });
  if (!res.ok) {
    updateTokenToast(null);
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "请求失败");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let totalBytes = 0;
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.length;
    buffer += decoder.decode(value, { stream: true });
    updateTokenToast({ phase: "loading", bytes: totalBytes });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const jsonStr = trimmed.slice(6);
      if (jsonStr === "[DONE]") continue;
      try {
        const chunk = JSON.parse(jsonStr);
        if (chunk.choices?.[0]?.delta?.content) fullContent += chunk.choices[0].delta.content;
        if (chunk.usage) updateTokenToast({ phase: "done", bytes: totalBytes, usage: chunk.usage });
      } catch {}
    }
  }
  setTimeout(() => updateTokenToast(null), 2000);
  return fullContent;
}

export default function TokenToast() {
  const [state, setState] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    listeners.push(setState);
    return () => { listeners = listeners.filter((fn) => fn !== setState); };
  }, []);

  // state 变化时控制显隐动画
  useEffect(() => {
    if (state && state.phase === "loading") {
      // 请求开始：无延迟，直接出现
      setVisible(true);
    } else if (state && state.phase === "done") {
      // 请求完成：停 1.5 秒再隐藏
      const timer = setTimeout(() => setVisible(false), 1500);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [state]);

  // 显示 token 数（字节 → 约 1/4 转 token 估算，等 usage 回来用精确值）
  const bytes = state?.bytes || 0;
  const approxTokens = state?.usage
    ? state.usage.total_tokens
    : Math.round(bytes / 4); // SSE 开销大，粗略估算

  return (
    <div
      className={`fixed z-[110] transition-all duration-400 ease-out pointer-events-none ${
        visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-20"
      }`}
      style={{ bottom: "1.5rem", right: "6rem" }}
    >
      <div className="bg-indigo-600 text-white rounded-full shadow-lg
        flex items-center justify-center font-mono font-bold
        w-14 h-14"
      >
        <div className="flex flex-col items-center leading-none">
          <span className={`text-sm ${state?.phase === "loading" ? "animate-pulse" : ""}`}>
            {approxTokens.toLocaleString()}
          </span>
          <span className="text-[9px] opacity-60 font-normal -mt-0.5">token</span>
        </div>
      </div>
    </div>
  );
}
