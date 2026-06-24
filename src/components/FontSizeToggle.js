"use client";

import { useState, useEffect } from "react";
import { getFontSize, setFontSize, getAllSizes } from "@/lib/font-size";

export default function FontSizeToggle() {
  const [size, setSize] = useState("base");
  const [mounted, setMounted] = useState(false);
  const sizes = getAllSizes();

  useEffect(() => {
    const current = getFontSize();
    setSize(current);
    document.documentElement.className = document.documentElement.className
      .replace(/font-\w+/g, "")
      + ` font-${current}`;
    setMounted(true);
  }, []);

  function change() {
    const idx = sizes.findIndex((s) => s.key === size);
    const next = sizes[(idx + 1) % sizes.length];
    setSize(next.key);
    setFontSize(next.key);
    document.documentElement.className = document.documentElement.className
      .replace(/font-\w+/g, "")
      + ` font-${next.key}`;
  }

  if (!mounted) return <span className="w-8" />;

  return (
    <button
      onClick={change}
      title={`字号：${sizes.find((s) => s.key === size)?.label}`}
      className="px-2 py-1.5 rounded-md text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      A<sup>{sizes.find((s) => s.key === size)?.label}</sup>
    </button>
  );
}
