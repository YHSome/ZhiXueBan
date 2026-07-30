"use client";

import { useState, useEffect } from "react";
import MistakeBadge from "@/components/MistakeBadge";
import { checkCapabilities, getCachedCapabilities } from "@/lib/graph-support";

export default function NavBar() {
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState(() => getCachedCapabilities());
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    checkCapabilities().then((c) => {
      setCaps({ python: c.python, graph: c.numpy && c.matplotlib, parse: c.parse });
      setChecked(true);
    });
  }, []);

  const warnings = [];
  if (checked) {
    if (!caps.graph) warnings.push("图形渲染不可用（缺少 numpy/matplotlib）");
    if (!caps.parse) warnings.push("文件解析不可用（缺少 PyMuPDF/python-docx）");
  }

  const links = (
    <>
      <a href="/" onClick={() => setOpen(false)} className="block px-3 py-1.5 rounded-md text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">首页</a>
      <a href="/learn" onClick={() => setOpen(false)} className="block px-3 py-1.5 rounded-md text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">学习</a>
      <a href="/mistakes" onClick={() => setOpen(false)} className="relative block px-3 py-1.5 rounded-md text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">错题集<MistakeBadge /></a>
      <a href="/favorites" onClick={() => setOpen(false)} className="block px-3 py-1.5 rounded-md text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">收藏夹</a>
      <a href="/report" onClick={() => setOpen(false)} className="block px-3 py-1.5 rounded-md text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">学习报告</a>
      <a href="/setup" onClick={() => setOpen(false)} className="block px-3 py-1.5 rounded-md text-sm bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors">⚙️ 设置</a>
    </>
  );

  return (
    <header className="bg-white dark:bg-black border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
        <a href="/" className="text-lg md:text-xl font-bold text-blue-600 flex items-center gap-2 hover:opacity-80 transition-opacity no-underline">
          <img src="/logo.png" alt="智学伴" className="h-6 w-6 md:h-7 md:w-7" />智学伴
        </a>

        {/* 桌面端：平铺 */}
        <nav className="hidden md:flex items-center gap-1">{links}</nav>

        {/* 移动端：汉堡菜单 */}
        <div className="md:hidden relative">
          <button onClick={() => setOpen(!open)} className="px-3 py-1.5 rounded-md text-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            {open ? "✕" : "☰"}
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 z-50 flex flex-col">
              {links}
            </div>
          )}
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800 px-4 py-1.5 text-center text-xs text-red-600 dark:text-red-400">
          ⚠️ {warnings.join(" · ")} — 功能不受影响，自动降级纯文字 / 禁止上传
        </div>
      )}
    </header>
  );
}
