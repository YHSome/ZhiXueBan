"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getExam, updateExam } from "@/lib/exams";
import { getApiConfig } from "@/lib/api-key";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import TokenToast, { streamAiCall } from "@/components/TokenToast";
import LatexToolbar from "@/components/LatexToolbar";

function typeLabel(type) {
  const map = { choice: "单选题", fill: "填空题", short: "简答题" };
  return map[type] || type;
}

function TakeExamContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const examId = searchParams.get("examId");
  const [exam, setExam] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [startedAt, setStartedAt] = useState(null);

  useEffect(() => {
    if (examId) {
      const e = getExam(examId);
      setExam(e);
      if (!e) return;

      if (e.status === "completed") {
        setSubmitted(true);
        setReview({
          totalScore: e.result?.totalScore,
          suggestion: e.result?.suggestion,
          elapsed: e.result?.elapsed,
          questions: e.questions,
        });
        return;
      }

      const total = (e.timeLimit || 0) * 60;
      if (total === 0) { setTimeLeft(-1); return; } // -1 表示不限时
      const savedElapsed = e.elapsedSeconds || 0;

      if (e.startedAt) {
        // 已有开始时间 → 恢复计时
        const extraElapsed = Math.floor((Date.now() - e.startedAt) / 1000);
        const totalElapsed = savedElapsed + extraElapsed;
        const remaining = Math.max(0, total - totalElapsed);
        setTimeLeft(remaining);
      } else {
        // 首次进入 → 记录开始时间
        const now = Date.now();
        setStartedAt(now);
        updateExam(examId, { startedAt: now, status: "in_progress" });
        setTimeLeft(total - savedElapsed);
      }
    }
  }, [examId]);

  // 倒计时 + 持久化已用时间（不限时时跳过）
  useEffect(() => {
    if (!exam || timeLeft <= 0 || submitted) return;
    if (timeLeft === -1) return; // 不限时
    const total = (exam.timeLimit || 0) * 60;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        const remaining = t - 1;
        if (remaining <= 0) { clearInterval(timer); return 0; }
        // 每 5 秒存一次已用时间
        if (remaining % 5 === 0) {
          updateExam(examId, { elapsedSeconds: total - remaining });
        }
        return remaining;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [exam, timeLeft, submitted]);

  // 自动提交（exam 和 timeLeft 任一更新都可能触发）
  useEffect(() => {
    if (exam && exam.status === "in_progress" && exam.timeLimit > 0 && timeLeft === 0 && !submitted) {
      setLoading(true);
      handleSubmit();
    }
  }, [exam, timeLeft, submitted]);

  function updateAnswer(qi, val) {
    if (!exam || submitted) return;
    const qs = [...exam.questions];
    qs[qi] = { ...qs[qi], userAnswer: val };
    const updated = { ...exam, questions: qs };
    setExam(updated);
    updateExam(examId, { questions: qs });
  }

  async function handleSubmit() {
    if (!exam || submitted) return;
    setLoading(true);
    setSubmitted(true);

    const total = (exam.timeLimit || 0) * 60;
    const elapsed = total > 0 ? total - timeLeft : Math.floor((Date.now() - (exam.startedAt || Date.now())) / 1000);
    const qaText = exam.questions.map((q, i) =>
      `${i + 1}. [${q.type}] ${q.question} (${q.points || 0}分)\n   正确答案：${q.answer}\n   学生答案：${q.userAnswer || "（未作答）"}`
    ).join("\n\n");

    try {
      const config = getApiConfig();
      const content = await streamAiCall({
        apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
        messages: [
          {
            role: "system",
            content: `批改试卷。每道题都有标注分值。按照分值加权计算总分。

批改规则：
- 选择/填空题：对即满分，错即0分。字母匹配、意思一致即判对。
- 简答题：逻辑正确即判对，不抠字眼。部分正确给一半分。
- 学生答案逻辑正确即判对，不拘泥于标准答案的表述。

每题返回：verdict("correct"/"wrong"/"partial"), score(0-1, partial时有效), steps（详细解析，必填）, feedback

返回 JSON：{"results":[{"verdict":"correct","score":null,"steps":"详细解题步骤","feedback":"点评"}],"totalScore":85,"suggestion":"..."}`,
          },
          { role: "user", content: qaText },
        ],
        maxTokens: 20000,
      });

      let reviewData;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        reviewData = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch {
        try {
          reviewData = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
        } catch {
          throw new Error("批改结果解析失败，请重试");
        }
      }

      const reviewedQuestions = exam.questions.map((q, i) => {
        const r = reviewData.results?.[i] || {};
        return { ...q, verdict: r.verdict || "wrong", partialScore: r.score ?? null, steps: r.steps?.trim() || "", feedback: r.feedback || "" };
      });

      setReview({ ...reviewData, questions: reviewedQuestions, elapsed });
      updateExam(examId, {
        questions: reviewedQuestions,
        status: "completed",
        result: { totalScore: reviewData.totalScore, suggestion: reviewData.suggestion, elapsed },
      });
    } catch (e) {
      setReview({ error: e.message });
    } finally {
      setLoading(false);
    }
  }

  if (!exam) {
    return <div className="text-center py-16 text-zinc-400">试卷不存在</div>;
  }

  // 结果页
  if (submitted && review) {
    if (review.error) {
      return <div className="max-w-2xl mx-auto text-center py-16 text-red-500">批改失败：{review.error}</div>;
    }

    const correctCount = review.questions?.filter((q) => q.verdict === "correct").length || 0;
    const partialCount = review.questions?.filter((q) => q.verdict === "partial").length || 0;
    const wrongCount = review.questions?.filter((q) => q.verdict === "wrong").length || 0;
    const scoreColor = review.totalScore >= 80 ? "text-green-600" : review.totalScore >= 60 ? "text-amber-600" : "text-red-600";

    return (
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-2 text-black dark:text-zinc-50">📋 {exam.title}</h2>
        <p className="text-zinc-500 mb-6">考试完成 · 用时 {Math.floor(review.elapsed / 60)}分{review.elapsed % 60}秒</p>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center mb-6">
          <div className={`text-5xl font-bold mb-2 ${scoreColor}`}>{review.totalScore}<span className="text-lg text-zinc-400">/100</span></div>
          <p className="text-sm text-zinc-500">正确 {correctCount} · 半对 {partialCount} · 错误 {wrongCount}</p>
          {review.suggestion && <p className="text-sm text-zinc-500 mt-2">{review.suggestion}</p>}
        </div>

        <div className="space-y-3 mb-6">
          {review.questions?.map((q, i) => {
            const v = q.verdict;
            const icon = v === "correct" ? "✅" : v === "partial" ? "⚠️" : "❌";
            const bg = v === "correct" ? "bg-green-50 dark:bg-green-900/10 border-green-200" : v === "partial" ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200" : "bg-red-50 dark:bg-red-900/10 border-red-200";
            return (
              <div key={i} className={`rounded-xl border p-4 ${bg}`}>
                <div className="flex items-start gap-2">
                  <span>{icon}</span>
                  <div>
                    <div className="text-sm font-medium text-black dark:text-zinc-100">
                      <span className="inline-block text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded mr-1">{typeLabel(q.type)}</span>
                      {i + 1}. <MarkdownRenderer content={q.question} /> ({q.points || 0}分)
                      {v === "partial" && q.partialScore != null && (
                        <span className="ml-2 text-xs text-amber-600">得{Math.round(q.partialScore * 100)}%</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">你的答案：{q.userAnswer || "（未作答）"}</p>
                    {q.options?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {q.options.map((opt, oi) => (
                          <span key={oi} className={`text-xs px-2 py-0.5 rounded ${opt === q.answer ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : opt === q.userAnswer ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>{opt}</span>
                        ))}
                      </div>
                    )}
                    {v !== "correct" && <div className="text-xs text-green-600 mt-1">正确答案：<MarkdownRenderer content={q.answer} /></div>}
                    {q.feedback && <div className="text-xs text-zinc-500 mt-1 italic"><MarkdownRenderer content={q.feedback} /></div>}
                    {q.steps && (
                      <details className="mt-2">
                        <summary className="text-xs font-medium text-indigo-600 dark:text-indigo-400 cursor-pointer">📝 详细解析</summary>
                        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400"><MarkdownRenderer content={q.steps} /></div>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={() => router.push("/learn")} className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700">
          返回课程列表
        </button>
      </div>
    );
  }

  // 答题页
  const unlimited = timeLeft === -1;
  const minutes = unlimited ? 0 : Math.floor(timeLeft / 60);
  const seconds = unlimited ? 0 : timeLeft % 60;
  const timeColor = unlimited ? "text-zinc-400" : timeLeft < 300 ? "text-red-500" : timeLeft < 600 ? "text-amber-500" : "text-zinc-500";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push("/learn")} className="text-zinc-400 hover:text-zinc-600 text-sm">
          ← 返回
        </button>
        <h2 className="text-xl font-bold text-black dark:text-zinc-50 flex-1">📋 {exam.title}</h2>
        <div className={`font-mono text-lg font-bold ${timeColor}`}>
          {unlimited ? "不限时" : `⏱ ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}
        </div>
      </div>

      <div className="space-y-6 mb-8">
        {exam.questions.map((q, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <div className="font-medium text-black dark:text-zinc-100 mb-3">
              <span className="inline-block text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded mr-2 align-middle">{typeLabel(q.type)}</span>
              {i + 1}. <MarkdownRenderer content={q.question} /> <span className="text-xs text-zinc-400">({q.points || 0}分)</span>
            </div>
            {q.options?.length > 0 ? (
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <label key={oi} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${q.userAnswer === opt ? "bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-transparent"}`}>
                    <input type="radio" name={`q-${i}`} checked={q.userAnswer === opt} onChange={() => updateAnswer(i, opt)}
                      className="text-indigo-600" />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300"><MarkdownRenderer content={String(opt)} /></span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="latex-focus-group">
                <textarea
                  id={`exam-answer-${i}`}
                  value={q.userAnswer || ""} onChange={(e) => updateAnswer(i, e.target.value)}
                  rows={3} placeholder="请输入答案..."
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                />
                <div className="latex-toolbar-wrap opacity-0 max-h-0 overflow-hidden transition-all duration-200">
                  <LatexToolbar textareaId={`exam-answer-${i}`} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button onClick={handleSubmit} disabled={loading || submitted}
        className="w-full py-4 rounded-xl bg-indigo-600 text-white font-semibold text-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
        {loading ? "⏳ AI 正在批改..." : "📩 提交试卷"}
      </button>

      {/* 练习模式 → AI 助手 */}
      {exam.practiceMode && <ExamFloatingHelper exam={exam} />}
    </div>
  );
}

// 练习模式悬浮 AI 助手
function ExamFloatingHelper({ exam }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    const updated = [...messages, { role: "user", content: text }];
    setMessages(updated);

    try {
      const config = getApiConfig();
      const reply = await streamAiCall({
        apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
        maxTokens: 500,
        messages: [
          {
            role: "system",
            content: `你是智学伴的 AI 学习助手。学生正在做一份练习试卷。

试卷内容概要：${exam.questions?.slice(0, 3).map((q, i) => `${i + 1}. ${q.question}`).join("\n")}

⚠️ 规则：只解释概念，不透露答案或解题思路。回答简洁，50-150字。涉及公式用 $...$ 格式，不要用 \\(...\\)。`,
          },
          ...updated,
        ],
      });
      setMessages([...updated, { role: "assistant", content: reply || "出错" }]);
    } catch (e) {
      setMessages([...updated, { role: "assistant", content: `❌ ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(!open)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl transition-all ${open ? "bg-zinc-700 text-white rotate-45" : "bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-110"}`}
        title="AI 学习助手">
        {open ? "+" : "💬"}
      </button>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 flex flex-col overflow-hidden" style={{ maxHeight: "60vh" }}>
          <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
            <span className="font-medium text-sm">💬 AI 学习助手</span>
            <button onClick={() => setOpen(false)} className="text-indigo-200 hover:text-white">✕</button>
          </div>
          <div className="text-xs text-indigo-100 bg-indigo-700 px-4 py-1.5">⚠️ 只解释概念，不透露答案</div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[150px] max-h-[300px]">
            {messages.length === 0 && <p className="text-xs text-zinc-400 text-center py-8">有不懂的概念？问我但不给答案 😊</p>}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.role === "user" ? "bg-indigo-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"}`}>
                  <MarkdownRenderer content={msg.content} />
                </div>
              </div>
            ))}
            {loading && <div className="text-xs text-zinc-400 animate-pulse">思考中...</div>}
          </div>
          <div className="border-t p-3">
            <div className="flex gap-2">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="问概念，不问答案..." disabled={loading}
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-black dark:text-zinc-100 outline-none disabled:opacity-50" />
              <button onClick={send} disabled={!input.trim() || loading}
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50">问</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function TakeExamPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-zinc-400">加载中...</div>}>
      <TakeExamContent />
      <TokenToast />
    </Suspense>
  );
}
