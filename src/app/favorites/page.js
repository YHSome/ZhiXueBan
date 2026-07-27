"use client";

import { useState, useEffect } from "react";
import { getFavorites, removeFavorite, clearFavorites } from "@/lib/favorites";
import MarkdownRenderer from "@/components/MarkdownRenderer";

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  function handleRemove(index) {
    removeFavorite(index);
    setFavorites(getFavorites());
  }

  function handleClear() {
    if (!confirm("确定清空全部收藏？")) return;
    clearFavorites();
    setFavorites([]);
  }

  if (favorites.length === 0) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <div className="text-5xl mb-4">⭐</div>
        <h2 className="text-xl font-bold text-black dark:text-zinc-50 mb-2">收藏夹为空</h2>
        <p className="text-zinc-500">以教促学通过后可以收藏题目，方便复习</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-black dark:text-zinc-50">⭐ 收藏夹</h2>
        <button onClick={handleClear} className="text-sm text-zinc-400 hover:text-red-500 transition-colors">
          清空全部
        </button>
      </div>
      <div className="space-y-4">
        {favorites.map((item, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-400 mb-1">{item.courseTitle}</div>
                <div className="font-medium text-black dark:text-zinc-100 mb-2">
                  <MarkdownRenderer content={item.question} />
                </div>
                {item.options?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {item.options.map((opt, oi) => (
                      <span key={oi} className={`text-xs px-2 py-0.5 rounded ${
                        opt === item.answer ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : opt === item.userAnswer ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>{opt}</span>
                    ))}
                  </div>
                )}
                <div className="text-xs text-zinc-500 space-y-1">
                  {!item.options?.length && <div>✅ 正确答案：<MarkdownRenderer content={item.answer} /></div>}
                  {item.userAnswer && item.options?.length > 0 && (
                    <div>❌ 你的答案：<span className="text-red-500">{item.userAnswer}</span></div>
                  )}
                  {item.userAnswer && !item.options?.length && (
                    <div>❌ 你的答案：<span className="text-red-500">{item.userAnswer}</span></div>
                  )}
                </div>
              </div>
              <button onClick={() => handleRemove(i)}
                className="text-zinc-400 hover:text-red-500 text-sm flex-shrink-0 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
