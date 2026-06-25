"use client";

import { useState, useEffect } from "react";
import { getAllCourses } from "@/lib/courses";

function loadResolved() {
  try { return new Set(JSON.parse(localStorage.getItem("zhixueban-resolved") || "[]")); }
  catch { return new Set(); }
}

export default function MistakeBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const resolved = loadResolved();
    let total = 0;
    const courses = getAllCourses();
    for (const course of courses) {
      const cacheKey = `zhixueban-cache-${course.id}`;
      try {
        const raw = localStorage.getItem(cacheKey);
        if (!raw) continue;
        const cache = JSON.parse(raw);
        for (const [key, sectionData] of Object.entries(cache)) {
          if (!sectionData || typeof sectionData !== "object") continue;
          const quizWrong = (sectionData.quiz?.questions || []).filter((q) => q.verdict !== "correct");
          const practiceWrong = (sectionData.practice?.questions || []).filter((q) => q.verdict !== "correct");
          for (const q of [...quizWrong, ...practiceWrong]) {
            const id = `${course.id}-${key}-${q.question?.slice(0, 50)}`;
            if (!resolved.has(id)) total++;
          }
        }
      } catch {}
    }
    setCount(total);
  }, []);

  if (count === 0) return null;

  return (
    <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 font-medium leading-none">
      {count}
    </span>
  );
}
