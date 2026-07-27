"use client";

import { useState, useEffect, useRef } from "react";

function isDevMode() {
  try { return localStorage.getItem("zhixueban-dev-mode") === "1"; } catch { return false; }
}

export default function GeoGebraView({ commands = "", width = "100%", height = 300 }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [error, setError] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [fixedExpr, setFixedExpr] = useState(null);
  const [inView, setInView] = useState(false);
  const ref = useRef(null);
  const currentExpr = fixedExpr || commands;
  const devMode = typeof window !== "undefined" && isDevMode();

  // 懒加载：只在元素接近视口时才请求图片
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    setFixedExpr(null);
    if (!currentExpr?.trim() || !inView) return;
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const res = await fetch("/api/graph", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expression: currentExpr, width: 600, height }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const detail = errData.detail ? ` — ${errData.detail}` : "";
          throw new Error((errData.error || `HTTP ${res.status}`) + detail);
        }
        const blob = await res.blob();
        if (!cancelled) {
          setImgUrl(URL.createObjectURL(blob));
          setFixedExpr(null);
        }
      } catch (e) {
        console.warn("Graph render failed for:", currentExpr?.slice(0, 100));
        if (!cancelled) setError(e.message || "图形渲染失败");
      }
    })();

    return () => { cancelled = true; };
  }, [currentExpr, height, inView]);

  if (!commands?.trim()) return null;

  async function handleFix() {
    const cb = window.__zhixueban_graphFix;
    if (!cb) return;
    setFixing(true);
    try {
      const fixed = await cb(currentExpr, error);
      if (fixed && typeof fixed === "string" && fixed.trim()) {
        console.log("[GeoGebra] Fix applied, new expr:", fixed.trim().slice(0, 100));
        setFixedExpr(fixed.trim());
        setError(null);
        setImgUrl(null);
      }
    } catch {} finally {
      setFixing(false);
    }
  }

  if (error) {
    const hasFix = typeof window !== "undefined" && window.__zhixueban_graphFix;
    return (
      <div ref={ref} className="text-xs text-zinc-400 text-center py-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50/30 dark:bg-red-900/10 my-3">
        <div className="text-red-500 font-medium mb-1">图形渲染失败</div>
        <div className="text-red-400 mb-1">{error}</div>
        {devMode && (
          <details className="text-left">
            <summary className="cursor-pointer text-zinc-400 hover:text-zinc-600 inline-block">📋 查看参数</summary>
            <pre className="text-xs text-zinc-500 mt-1 bg-white dark:bg-zinc-800 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">{currentExpr}</pre>
          </details>
        )}
        {devMode && hasFix && (
          <button onClick={handleFix} disabled={fixing}
            className="mt-2 px-4 py-1.5 rounded-lg bg-indigo-500 text-white text-xs hover:bg-indigo-600 disabled:opacity-50 transition-colors">
            {fixing ? "⏳ AI 修复中..." : "🔧 一键修复"}
          </button>
        )}
      </div>
    );
  }

  if (!imgUrl) return <div ref={ref} className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" style={{ height }} />;

  return (
    <div ref={ref} className="my-3">
      <img src={imgUrl} alt="图形" className="rounded-lg border border-zinc-200 dark:border-zinc-700 max-w-full" />
      {devMode && (
        <details className="mt-1">
          <summary className="text-xs text-zinc-300 dark:text-zinc-600 cursor-pointer hover:text-zinc-500 dark:hover:text-zinc-400 select-none">📋 参数</summary>
          <pre className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 bg-white dark:bg-zinc-800 rounded p-1.5 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">{commands}</pre>
        </details>
      )}
    </div>
  );
}
