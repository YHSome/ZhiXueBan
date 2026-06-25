"use client";

import { useState, useEffect, useRef } from "react";

// 全局状态：单例
let listeners = [];
let currentAbortController = null;
function notify(state) { listeners.forEach((fn) => fn(state)); }

export function updateTokenToast(state) {
  notify(state ? { ...state, _t: Date.now() } : null);
}

export function abortCurrentCall() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
    notify({ phase: "done", bytes: 0, _t: Date.now() });
  }
}

// 通用流式 AI 调用，自动显示 token 球
export async function streamAiCall({ apiKey, baseUrl, model, messages, maxTokens = 20000 }) {
  const controller = new AbortController();
  currentAbortController = controller;
  updateTokenToast({ phase: "loading", bytes: 0 });

  let fullContent = "";
  let totalBytes = 0;
  let buffer = "";
  let gotUsage = false;
  let aborted = false;

  try {
    const res = await fetch("/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, baseUrl, model, messages, maxTokens }),
      signal: controller.signal,
    });
    if (!res.ok) {
      updateTokenToast(null);
      currentAbortController = null;
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "请求失败");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      buffer += decoder.decode(value, { stream: true });
      if (!gotUsage) updateTokenToast({ phase: "loading", bytes: totalBytes });
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
          if (chunk.usage) { updateTokenToast({ phase: "done", bytes: totalBytes, usage: chunk.usage }); gotUsage = true; }
        } catch {}
      }
    }
    if (buffer.trim().startsWith("data: ")) {
      const jsonStr = buffer.trim().slice(6);
      if (jsonStr !== "[DONE]") {
        try {
          const chunk = JSON.parse(jsonStr);
          if (chunk.usage) { updateTokenToast({ phase: "done", bytes: totalBytes, usage: chunk.usage }); gotUsage = true; }
        } catch {}
      }
    }
    if (!gotUsage) updateTokenToast({ phase: "done", bytes: totalBytes });
  } catch (e) {
    if (e.name === "AbortError") {
      aborted = true;
    } else {
      throw e;
    }
  } finally {
    currentAbortController = null;
  }

  return aborted ? "" : fullContent;
}

export default function TokenToast() {
  const [state, setState] = useState(null);
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    listeners.push(setState);
    return () => { listeners = listeners.filter((fn) => fn !== setState); };
  }, []);

  useEffect(() => {
    if (state && state.phase === "loading") {
      setVisible(true);
    } else if (state && state.phase === "done") {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      setHover(false);
    }
  }, [state]);

  const bytes = state?.bytes || 0;
  const approxTokens = state?.usage
    ? state.usage.total_tokens
    : Math.round(bytes / 4);

  return (
    <div
      className={`fixed z-[110] transition-all duration-400 ease-out pointer-events-none ${
        visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-20"
      }`}
      style={{ bottom: "1.5rem", right: "6rem" }}
    >
      <div
        onClick={state?.phase === "loading" ? abortCurrentCall : undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={state?.phase === "loading" ? "单击停止生成" : undefined}
        className={`text-white rounded-full shadow-lg flex items-center justify-center font-mono font-bold w-14 h-14 transition-colors ${
          state?.phase === "loading"
            ? "bg-indigo-600 cursor-pointer hover:bg-red-500 pointer-events-auto"
            : "bg-indigo-400 cursor-default pointer-events-none"
        }`}
      >
        <div className="flex flex-col items-center leading-none">
          {state?.phase === "done" && state.usage && bytes > 0 ? (
            <>
              <span className="text-sm font-bold">
                {Math.round((1 - state.usage.total_tokens / Math.max(1, bytes / 4)) * 100)}%
              </span>
              <span className="text-[8px] opacity-60 font-normal -mt-0.5">
                {approxTokens.toLocaleString()} token
              </span>
            </>
          ) : state?.phase === "loading" ? (
            hover ? (
              <span className="text-lg">×</span>
            ) : (
              <>
                <span className="text-sm animate-pulse">{approxTokens.toLocaleString()}</span>
                <span className="text-[9px] opacity-60 font-normal -mt-0.5">token</span>
              </>
            )
          ) : (
            <>
              <span className="text-sm">{approxTokens.toLocaleString()}</span>
              <span className="text-[9px] opacity-60 font-normal -mt-0.5">token</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
