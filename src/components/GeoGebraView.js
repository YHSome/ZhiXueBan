"use client";

import { useState, useEffect } from "react";

export default function GeoGebraView({ commands = "", width = "100%", height = 300 }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [error, setError] = useState(null);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    if (!commands?.trim()) return;
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const res = await fetch("/api/graph", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expression: commands, width: 600, height }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        if (!cancelled) setImgUrl(URL.createObjectURL(blob));
      } catch (e) {
        console.warn("Graph render failed for:", commands?.slice(0, 100));
        if (!cancelled) setError(e.message || "图形渲染失败");
      }
    })();

    return () => { cancelled = true; };
  }, [commands, height]);

  if (!commands?.trim()) return null;

  if (error) {
    return (
      <div className="text-xs text-zinc-400 text-center py-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50/30 dark:bg-red-900/10 my-3">
        <div className="text-red-500 font-medium mb-1">图形渲染失败</div>
        <div className="text-red-400 mb-1">{error}</div>
        <details className="text-left">
          <summary className="cursor-pointer text-zinc-400 hover:text-zinc-600 inline-block">📋 查看参数</summary>
          <pre className="text-xs text-zinc-500 mt-1 bg-white dark:bg-zinc-800 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">{commands}</pre>
        </details>
      </div>
    );
  }

  if (!imgUrl) return <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" style={{ height }} />;

  return (
    <div className="my-3">
      <img src={imgUrl} alt="图形" className="rounded-lg border border-zinc-200 dark:border-zinc-700 max-w-full" />
      <details className="mt-1">
        <summary className="text-xs text-zinc-300 dark:text-zinc-600 cursor-pointer hover:text-zinc-500 dark:hover:text-zinc-400 select-none">📋 参数</summary>
        <pre className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 bg-white dark:bg-zinc-800 rounded p-1.5 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">{commands}</pre>
      </details>
    </div>
  );
}
