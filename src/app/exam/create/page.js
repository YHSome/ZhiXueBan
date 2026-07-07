"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getApiConfig } from "@/lib/api-key";
import { getAllCourses } from "@/lib/courses";
import { addExam, getAllExams } from "@/lib/exams";
import TokenToast, { streamAiCall } from "@/components/TokenToast";

export default function CreateExamPage() {
  const router = useRouter();
  const [mode, setMode] = useState("ai"); // "ai" | "import"
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLimit, setTimeLimit] = useState(60);
  const [practiceMode, setPracticeMode] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // 导入试卷相关
  const [importMode, setImportMode] = useState("original"); // "original" | "mimic"
  const [fileParsing, setFileParsing] = useState(false);
  const [importFileText, setImportFileText] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const fileInputRef = useRef(null);

  const courses = getAllCourses();
  const selectedCourse = courses.find((c) => c.id === courseId);

  async function handleGenerate() {
    if (!title.trim()) { setError("请输入试卷名称"); return; }
    if (!courseId) { setError("请选择关联课程"); return; }
    if (getAllExams().some((e) => e.title === title.trim())) { setError("试卷名称已存在，请换一个"); return; }

    setGenerating(true);
    setError(null);

    try {
      // 收集课程的授课内容
      const allLectures = [];
      for (const ch of selectedCourse.chapters || []) {
        for (const s of ch.sections || []) {
          allLectures.push(`## ${ch.title} / ${s.title}`);
        }
      }

      const config = getApiConfig();
      const content = await streamAiCall({
          apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
          messages: [
            {
              role: "system",
              content: `你是出卷老师。根据课程内容出一份综合试卷。

课程：${selectedCourse.courseTitle}
章节概要：${allLectures.join("\n")}

出卷要求：
- 共 ${questionCount} 道题，覆盖所有章节
- 题型：单选、填空、简答，难度递进
- 每道题注明分值（满分100）
- 纯文字题目，不得引用图片
- 涉及数学公式请用 LaTeX 语法：行内用 $...$，块级用 $$...$$
- 每题附正确答案

返回 JSON：
{
  "questions": [
    {"type":"choice|fill|short","question":"...","options":["A","B","C","D"],"answer":"...","points":10}
  ]
}`,
            },
            { role: "user", content: `请生成一份《${title}》试卷，共${questionCount}题，限时${timeLimit}分钟。` },
          ],
        maxTokens: 40000,
      });


      let examData;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        examData = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch {
        try {
          const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          examData = JSON.parse(cleaned);
        } catch {
          throw new Error("AI 返回解析失败，请重试");
        }
      }

      const exam = addExam({
        title: title.trim(),
        courseId,
        courseTitle: selectedCourse.courseTitle,
        questions: (examData.questions || []).map((q) => ({ ...q, userAnswer: "" })),
        timeLimit: practiceMode ? 0 : timeLimit,
        practiceMode,
        status: "ready", // ready | in_progress | completed
      });

      router.push(`/exam/take?examId=${exam.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  // 导入试卷：上传文件并解析
  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setFileParsing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "解析失败");
      setImportFileText(data.text);
      // 没命名的自动用文件名
      const baseName = file.name.replace(/\.[^.]+$/, "");
      if (!title.trim()) setTitle(baseName);
    } catch (e) {
      setError(e.message);
    } finally {
      setFileParsing(false);
    }
  }

  // 导入试卷：AI 处理
  async function handleImportGenerate() {
    if (!importFileText) { setError("请先上传试卷文件"); return; }
    if (!title.trim()) { setError("请输入试卷名称"); return; }
    if (getAllExams().some((e) => e.title === title.trim())) { setError("试卷名称已存在，请换一个"); return; }
    setGenerating(true);
    setError(null);

    const isOriginal = importMode === "original";

    try {
      const config = getApiConfig();
      const content = await streamAiCall({
          apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
          messages: [
            {
              role: "system",
              content: isOriginal
                ? `你是试卷解析专家。从以下试卷原文中提取所有题目。

要求：
- 逐题提取，保持原题原文不变
- 识别题型（choice/fill/short）
- ⚠️ 填空题：原文中的挖空（如 ___ 、( ) 、空白处）自动替换为标准下划线 ______
- 选择题保留选项
- 每题附正确答案
- 纯文字题目，忽略图片引用
- 涉及公式用 LaTeX：行内 $...$，块级 $$...$$

返回 JSON：{"questions":[{"type":"choice|fill|short","question":"...","options":["A","B"],"answer":"...","points":5}]}`
                : `你是出卷专家。分析以下试卷的风格、难度和题型，模仿出新的题目。

要求：
- 模仿原卷的题型分布和难度
- 知识点与原卷一致但题目不同
- 题型：单选、填空、简答
- 每题附正确答案和分值
- 纯文字，公式用 LaTeX：行内 $...$，块级 $$...$$

返回 JSON：{"questions":[{"type":"choice|fill|short","question":"...","options":["A","B"],"answer":"...","points":5}]}`,
            },
            {
              role: "user",
              content: isOriginal
                ? `请从以下试卷中提取所有题目：\n\n${importFileText.slice(0, 20000)}`
                : `请模仿以下试卷风格出题（${questionCount}道）：\n\n${importFileText.slice(0, 15000)}`,
            },
          ],
        maxTokens: 40000,
      });

      let examData;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        examData = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch {
        try {
          examData = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
        } catch {
          throw new Error("AI 返回格式异常，请重试或减少题目数量");
        }
      }

      const exam = addExam({
        title: title.trim(),
        courseId: courseId || "imported",
        courseTitle: selectedCourse?.courseTitle || "导入试卷",
        questions: (examData.questions || []).map((q) => ({ ...q, userAnswer: "" })),
        timeLimit: practiceMode ? 0 : timeLimit,
        practiceMode,
        status: "ready",
        importedFrom: isOriginal ? "original" : "mimic",
      });

      router.push(`/exam/take?examId=${exam.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-black dark:text-zinc-50">📋 新建试卷</h2>
      <p className="text-zinc-500 dark:text-zinc-400 mb-6">AI 出卷或导入已有试卷</p>

      {/* 模式切换 */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setMode("ai")}
          className={`flex-1 py-3 rounded-xl border-2 text-center transition-colors ${mode === "ai" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"}`}>
          <span className="font-medium text-black dark:text-zinc-100">🤖 AI 出卷</span>
        </button>
        <button onClick={() => setMode("import")}
          className={`flex-1 py-3 rounded-xl border-2 text-center transition-colors ${mode === "import" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"}`}>
          <span className="font-medium text-black dark:text-zinc-100">📄 导入试卷</span>
        </button>
      </div>

      <div className="space-y-6">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">试卷名称</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="如：高等数学期末测试"
            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>

        {/* AI 出卷模式 */}
        {mode === "ai" && (
          <>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">关联课程</label>
              {!mounted ? (
                <div className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 h-11" />
              ) : courses.length === 0 ? (
                <p className="text-zinc-400 text-sm">还没有课程，请先去创建课程</p>
              ) : (
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">选择课程...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.courseTitle}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">题目数量</label>
                <input type="number" value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))}
                  min={3} max={50}
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                <label className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">练习模式</span>
                  <button type="button" onClick={() => setPracticeMode(!practiceMode)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${practiceMode ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-600"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${practiceMode ? "left-5" : "left-0.5"}`} />
                  </button>
                </label>
                {!practiceMode && (
                  <input type="number" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}
                    min={5} max={300}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
                )}
                {practiceMode && <p className="text-sm text-zinc-400">🤖 不限时，AI 助手辅助</p>}
              </div>
            </div>

            {error && <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{error}</div>}

            <button onClick={handleGenerate} disabled={generating || !title.trim() || !courseId}
              className="w-full py-4 rounded-xl bg-indigo-600 text-white font-semibold text-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {generating ? "⏳ AI 正在出卷..." : "🤖 AI 生成试卷"}
            </button>
          </>
        )}

        {/* 导入试卷模式 */}
        {mode === "import" && (
          <>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">上传试卷文件</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation(); setDragOver(false);
                  const file = e.dataTransfer?.files?.[0];
                  if (file && fileInputRef.current) {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    fileInputRef.current.files = dt.files;
                    handleImportFile({ target: { files: dt.files } });
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragOver
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 scale-[1.02]"
                    : "border-zinc-300 dark:border-zinc-700 hover:border-indigo-400"
                }`}
              >
                <div className="text-3xl mb-2">📤</div>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">点击上传 PDF/DOCX/TXT</p>
                {importFileName && <p className="text-indigo-500 text-sm mt-1">📄 {importFileName}</p>}
                {fileParsing && <p className="text-indigo-400 text-sm mt-1">⏳ 解析中...</p>}
                <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.docx" onChange={handleImportFile} className="hidden" />
              </div>
            </div>

            {importFileText && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">处理方式</label>
                <div className="flex gap-2">
                  <button onClick={() => setImportMode("original")}
                    className={`flex-1 py-3 rounded-lg border-2 text-sm transition-colors ${importMode === "original" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"}`}>
                    📋 原卷呈现
                  </button>
                  <button onClick={() => setImportMode("mimic")}
                    className={`flex-1 py-3 rounded-lg border-2 text-sm transition-colors ${importMode === "mimic" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"}`}>
                    🤖 AI 模仿出题
                  </button>
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                  {importMode === "original" ? "逐题提取试卷原题，保持原样" : "分析试卷风格，生成相似新题"}
                </p>

                {importMode === "mimic" && (
                  <div className="mt-3">
                    <label className="text-xs text-zinc-500 mb-1 block">题目数量</label>
                    <input type="number" value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))}
                      min={3} max={50}
                      className="w-32 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                )}
              </div>
            )}

            {/* 练习模式（导入也支持） */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
              <label className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">练习模式</span>
                <button type="button" onClick={() => setPracticeMode(!practiceMode)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${practiceMode ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-600"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${practiceMode ? "left-5" : "left-0.5"}`} />
                </button>
              </label>
              {!practiceMode && (
                <input type="number" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}
                  min={5} max={300}
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
              )}
              {practiceMode && <p className="text-sm text-zinc-400">🤖 不限时，AI 助手辅助</p>}
            </div>

            {error && <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{error}</div>}

            <button onClick={handleImportGenerate} disabled={generating || !title.trim() || !importFileText}
              className="w-full py-4 rounded-xl bg-indigo-600 text-white font-semibold text-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {generating ? "⏳ AI 正在处理..." : importMode === "original" ? "📋 提取原题" : "🤖 AI 模仿出题"}
            </button>
          </>
        )}
      </div>
      <TokenToast />
    </div>
  );
}
