"use client";

import { useState, useEffect } from "react";
import { getAllCourses } from "@/lib/courses";
import { getAllExams } from "@/lib/exams";
import { getApiConfig } from "@/lib/api-key";
import TokenToast, { streamAiCall } from "@/components/TokenToast";
import MarkdownRenderer from "@/components/MarkdownRenderer";

export default function ReportPage() {
  const [report, setReport] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 恢复已保存的 AI 评价
    try {
      const saved = localStorage.getItem("zhixueban-report-summary");
      if (saved) setAiSummary(saved);
    } catch {}
  }, []);

  useEffect(() => {
    const courses = getAllCourses();
    let totalSections = 0;
    let completedSections = 0;
    let quizScores = [];
    let weakPoints = [];
    const courseDetails = [];

    for (const course of courses) {
      const cacheKey = `zhixueban-cache-${course.id}`;
      let courseTotal = 0;
      let courseDone = 0;
      let courseScores = [];

      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const cache = JSON.parse(raw);
          for (const [key, data] of Object.entries(cache)) {
            if (!data || typeof data !== "object") continue;
            const [ci, si] = key.split("-").map(Number);
            const chapter = course.chapters?.[ci];
            const section = chapter?.sections?.[si];
            if (!chapter || !section) continue;

            courseTotal++;
            if (data.stage === "completed") courseDone++;

            if (data.review?.score != null) {
              courseScores.push(data.review.score);
              quizScores.push({ course: course.courseTitle, section: section.title, score: data.review.score });
            }
            if (data.review?.weakPoints) {
              weakPoints.push(...data.review.weakPoints.map((w) => ({ point: w, course: course.courseTitle, section: section.title })));
            }
          }
        }
      } catch {}

      if (courseTotal > 0) {
        totalSections += courseTotal;
        completedSections += courseDone;
        const avgScore = courseScores.length > 0
          ? Math.round(courseScores.reduce((a, b) => a + b, 0) / courseScores.length)
          : null;
        courseDetails.push({
          title: course.courseTitle,
          total: courseTotal,
          done: courseDone,
          avgScore,
        });
      }
    }

    const exams = getAllExams();
    const completedExams = exams.filter((e) => e.status === "completed" && e.result);

    // 统计薄弱点频率
    const wpFreq = {};
    for (const w of weakPoints) {
      wpFreq[w.point] = (wpFreq[w.point] || 0) + 1;
    }
    const topWeakPoints = Object.entries(wpFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const generatedReport = {
      totalCourses: courses.length,
      totalSections,
      completedSections,
      completionRate: totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0,
      avgQuizScore: quizScores.length > 0
        ? Math.round(quizScores.reduce((a, b) => a + b.score, 0) / quizScores.length)
        : null,
      totalExams: exams.length,
      completedExams: completedExams.length,
      avgExamScore: completedExams.length > 0
        ? Math.round(completedExams.reduce((a, e) => a + (e.result?.totalScore || 0), 0) / completedExams.length)
        : null,
      topWeakPoints,
      courseDetails,
    };

    setReport(generatedReport);
    setLoading(false);
  }, []);

  async function handleGenerateSummary() {
    if (!report) return;
    setGenerating(true);
    try {
      const config = getApiConfig();
      const summary = await streamAiCall({
        apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
        maxTokens: 1000,
        messages: [
          {
            role: "system",
            content: `你是学习分析专家。根据以下学习数据写一份简短的个性化评价（150-300字）。

课程数：${report.totalCourses}，总小节：${report.totalSections}，已完成：${report.completedSections}，完成率：${report.completionRate}%
小测均分：${report.avgQuizScore ?? "暂无"}，试卷均分：${report.avgExamScore ?? "暂无"}
薄弱点：${report.topWeakPoints?.slice(0, 5).map((w) => w[0]).join("、") || "无"}

要求：语气亲切鼓励，指出优势和改进方向，用 Markdown 格式。`,
          },
          { role: "user", content: "请生成学习评价报告" },
        ],
      });
      setAiSummary(summary);
      localStorage.setItem("zhixueban-report-summary", summary);
    } catch (e) {
      setAiSummary(`生成失败：${e.message}`);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return <div className="text-center py-16 text-zinc-400">加载中...</div>;
  }

  if (!report) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-black dark:text-zinc-50">📊 学习报告</h2>

      {/* AI 评价 */}
      <div className="mb-6">
        {aiSummary ? (
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-xl border border-indigo-200 dark:border-indigo-800 p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">🤖 AI 学习评价</span>
              <button onClick={handleGenerateSummary} disabled={generating}
                className="text-xs text-indigo-400 hover:text-indigo-600 disabled:opacity-50">
                {generating ? "生成中..." : "🔄 重新生成"}
              </button>
            </div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              <MarkdownRenderer content={aiSummary} />
            </div>
          </div>
        ) : (
          <div className="text-center py-8 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <button onClick={handleGenerateSummary} disabled={generating}
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm">
              {generating ? "⏳ AI 正在分析..." : "🤖 一键生成学习评价"}
            </button>
          </div>
        )}
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="课程数" value={report.totalCourses} />
        <StatCard label="完成率" value={`${report.completionRate}%`} sub={`${report.completedSections}/${report.totalSections} 节`} />
        <StatCard label="小测均分" value={report.avgQuizScore != null ? `${report.avgQuizScore}` : "-"} />
        <StatCard label="试卷均分" value={report.avgExamScore != null ? `${report.avgExamScore}` : "-"} sub={`${report.completedExams}/${report.totalExams} 份`} />
      </div>

      {/* 课程详情 */}
      {report.courseDetails.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3 text-black dark:text-zinc-100">📚 课程进度</h3>
          <div className="space-y-2">
            {report.courseDetails.map((c, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-black dark:text-zinc-100">{c.title}</span>
                  <span className="text-xs text-zinc-400">{c.done}/{c.total} 节</span>
                </div>
                <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.round((c.done / c.total) * 100)}%` }} />
                </div>
                {c.avgScore != null && (
                  <p className="text-xs text-zinc-400 mt-1">小测均分 {c.avgScore}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 薄弱点 */}
      {report.topWeakPoints.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 text-black dark:text-zinc-100">⚠️ 常见薄弱点</h3>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="space-y-2">
              {report.topWeakPoints.map(([point, count], i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 w-5">{i + 1}</span>
                  <div className="w-16 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden flex-shrink-0">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (count / report.topWeakPoints[0][1]) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500 flex-1 truncate">{point}</span>
                  <span className="text-xs text-zinc-400 flex-shrink-0">{count}次</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <TokenToast />
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 text-center">
      <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-zinc-400 mt-0.5">{sub}</div>}
    </div>
  );
}
