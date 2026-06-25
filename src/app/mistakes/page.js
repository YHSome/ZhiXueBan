"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAllCourses } from "@/lib/courses";
import { getApiConfig } from "@/lib/api-key";
import TokenToast, { streamAiCall } from "@/components/TokenToast";
import MarkdownRenderer from "@/components/MarkdownRenderer";

function loadResolved() {
  try { return new Set(JSON.parse(localStorage.getItem("zhixueban-resolved") || "[]")); }
  catch { return new Set(); }
}
function saveResolved(set) {
  localStorage.setItem("zhixueban-resolved", JSON.stringify([...set]));
}
function qid(q) { return `${q.courseId}-${q.sectionKey}-${q.question?.slice(0, 50)}`; }

export default function MistakesPage() {
  const router = useRouter();
  const [mistakes, setMistakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState(loadResolved);
  const [activeTeach, setActiveTeach] = useState(null); // 正在以教促学的题目
  const [teachMessages, setTeachMessages] = useState([]);
  const [teachInput, setTeachInput] = useState("");
  const [teachLoading, setTeachLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const all = [];
    const courses = getAllCourses();

    for (const course of courses) {
      const cacheKey = `zhixueban-cache-${course.id}`;
      try {
        const raw = localStorage.getItem(cacheKey);
        if (!raw) continue;
        const cache = JSON.parse(raw);
        const courseMistakes = [];

        for (const [key, sectionData] of Object.entries(cache)) {
          if (!sectionData || typeof sectionData !== "object") continue;
          const [ci, si] = key.split("-").map(Number);
          const chapter = course.chapters?.[ci];
          const section = chapter?.sections?.[si];
          if (!chapter || !section) continue;

          const wrongFromQuiz = (sectionData.quiz?.questions || []).filter((q) => q.verdict !== "correct");
          const wrongFromPractice = (sectionData.practice?.questions || []).filter((q) => q.verdict !== "correct");

          for (const q of [...wrongFromQuiz, ...wrongFromPractice]) {
            courseMistakes.push({
              ...q,
              courseId: course.id,
              courseTitle: course.courseTitle,
              chapterTitle: chapter.title,
              sectionTitle: section.title,
              sectionKey: key,
            });
          }
        }

        // 过滤已解决的错题
        const unresolved = courseMistakes.filter((q) => !resolved.has(qid(q)));
        if (unresolved.length > 0) {
          all.push({ course, mistakes: unresolved });
        }
      } catch {}
    }

    setMistakes(all);
    setLoading(false);
  }, [resolved]);


  async function startTeachBack(question) {
    setActiveTeach(question);
    setTeachMessages([]);
    setTeachInput("");
  }

  async function sendTeachMessage() {
    if (!teachInput.trim() || teachLoading || !activeTeach) return;
    const text = teachInput.trim();
    setTeachInput("");
    setTeachLoading(true);

    const updated = [...teachMessages, { role: "user", content: text }];
    setTeachMessages(updated);

    try {
      const config = getApiConfig();
      const reply = await streamAiCall({
        apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
        maxTokens: 500,
        messages: [
          {
            role: "system",
            content: `你是错题消除导师。学生需要向你讲解这道错题来证明他掌握了。

原题：${activeTeach.question}
正确答案：${activeTeach.answer}
学生之前的错误答案：${activeTeach.userAnswer || "（未作答）"}

规则：差不多懂就行，不抠字眼。最多追问一次。学生讲清楚了就回复 "✅ APPROVED"。`,
          },
          ...updated,
        ],
      });
      const approved = reply.includes("✅ APPROVED");
      const newMessages = [...updated, { role: "assistant", content: reply }];
      setTeachMessages(newMessages);

      if (approved) {
        const next = new Set(resolved);
        next.add(qid(activeTeach));
        setResolved(next);
        saveResolved(next);
        setTimeout(() => setActiveTeach(null), 1500);
      }
    } catch (e) {
      setTeachMessages([...updated, { role: "assistant", content: `❌ ${e.message}` }]);
    } finally {
      setTeachLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-16 text-zinc-400">加载中...</div>;
  }

  if (mistakes.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="text-5xl mb-4">🎉</div>
        <p className="text-zinc-500 dark:text-zinc-400 text-lg mb-2">错题集为空</p>
        <p className="text-zinc-400 text-sm">暂无错题，继续保持！</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-black dark:text-zinc-50">📕 错题集</h2>
      <p className="text-zinc-500 dark:text-zinc-400 mb-6">
        共 {mistakes.reduce((s, g) => s + g.mistakes.length, 0)} 道错题
      </p>

      <div className="space-y-8">
        {mistakes.map((group, gi) => (
          <div key={gi}>
            <h3 className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 mb-3">
              📚 {group.course.courseTitle}
              <span className="text-sm text-zinc-400 ml-2">({group.mistakes.length} 题)</span>
            </h3>
            <div className="space-y-3">
              {group.mistakes.map((q, mi) => (
                <div
                  key={mi}
                  className={`bg-white dark:bg-zinc-900 rounded-xl border p-4 ${
                    q.verdict === "partial"
                      ? "border-amber-200 dark:border-amber-800"
                      : "border-red-200 dark:border-red-800"
                  }`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-lg">{q.verdict === "partial" ? "⚠️" : "❌"}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-black dark:text-zinc-100 mb-1">
                        <MarkdownRenderer content={q.question} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className="text-zinc-400">
                          {group.course.courseTitle} · {q.chapterTitle} / {q.sectionTitle}
                        </span>
                      </div>
                      <div className="flex gap-4 mt-1 text-xs">
                        <span className="text-red-500">你的答案：{q.userAnswer || "（未作答）"}</span>
                        <span className="text-green-600">正确答案：<MarkdownRenderer content={q.answer} /></span>
                      </div>
                      {q.feedback && (
                        <div className="text-xs text-zinc-500 mt-1 italic">
                          <MarkdownRenderer content={q.feedback} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => router.push(`/learn?courseId=${q.courseId}`)}
                      className="text-xs text-indigo-500 hover:text-indigo-700"
                    >
                      去复习此章节 →
                    </button>
                    <button
                      onClick={() => startTeachBack(q)}
                      className="text-xs bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded hover:bg-amber-200 dark:hover:bg-amber-900/40"
                    >
                      🎓 以教促学消错
                    </button>
                  </div>

                  {/* 以教促学弹窗 */}
                  {activeTeach && qid(activeTeach) === qid(q) && (
                    <div className="mt-3 border-t border-zinc-200 dark:border-zinc-700 pt-3">
                      <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 mb-3">
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          🎓 向 AI 讲解这道题的正确思路，讲清楚即可消除错题
                        </p>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                        {teachMessages.map((msg, i) => (
                          <div key={i} className={`text-xs ${msg.role === "user" ? "text-right" : ""}`}>
                            <span className={`inline-block px-3 py-1.5 rounded-lg max-w-[85%] ${
                              msg.role === "user"
                                ? "bg-amber-500 text-white"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                            }`}>
                              {msg.content}
                            </span>
                          </div>
                        ))}
                        {teachLoading && <div className="text-xs text-zinc-400 animate-pulse">AI 思考中...</div>}
                        <div ref={chatEndRef} />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={teachInput}
                          onChange={(e) => setTeachInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && sendTeachMessage()}
                          placeholder="讲解这道题的正确思路..."
                          disabled={teachLoading}
                          className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-black dark:text-zinc-100 outline-none disabled:opacity-50"
                        />
                        <button onClick={sendTeachMessage} disabled={teachLoading || !teachInput.trim()}
                          className="px-3 py-2 rounded-lg bg-amber-500 text-white text-xs hover:bg-amber-600 disabled:opacity-50">
                          讲解
                        </button>
                        <button onClick={() => setActiveTeach(null)}
                          className="px-3 py-2 rounded-lg border border-zinc-300 text-xs text-zinc-500 hover:bg-zinc-50">
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <TokenToast />
    </div>
  );
}
