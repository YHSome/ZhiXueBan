"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { hasApiKey, getApiConfig } from "@/lib/api-key";
import { addCourse } from "@/lib/courses";
import TokenToast from "@/components/TokenToast";
import { streamAiCall } from "@/components/TokenToast";

export default function CreatePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState("describe");
  const [dragOver, setDragOver] = useState(false);
  const [describeInput, setDescribeInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [fileText, setFileText] = useState(null); // 解析出来的文本
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [chapters, setChapters] = useState(null); // AI 识别出的章节
  const [editingChapter, setEditingChapter] = useState(null); // 正在编辑的章节索引
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  // 挂载后才判断，避免 SSR 时 hasApiKey 返回 false 导致 hydration 不一致
  if (mounted && !hasApiKey()) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-zinc-500 dark:text-zinc-400 mb-4">
          请先配置 AI API Key
        </p>
        <button
          onClick={() => router.push("/setup")}
          className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          去配置 →
        </button>
      </div>
    );
  }

  // ===== 方式A：模糊描述生成章节 =====
  async function handleDescribeGenerate() {
    if (!describeInput.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const config = getApiConfig();
      const result = await streamAiCall({
        apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
        messages: [
          {
            role: "system",
            content: `你是一个课程设计专家。用户会描述想学什么，你需要生成课程章节结构。

返回格式必须是严格的 JSON（不要 markdown 代码块）：
{"courseTitle":"课程标题","chapters":[{"title":"章节标题","sections":[{"title":"小节标题"}]}]}

要求：章节数量 3-8 个，每章 2-5 个小节，覆盖用户描述的核心主题，按逻辑顺序排列`,
          },
          { role: "user", content: `我想学习：${describeInput}` },
        ],
        maxTokens: 20000,
      });

      let data;
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        data = JSON.parse(jsonMatch ? jsonMatch[0] : result);
      } catch {
        try {
          const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          data = JSON.parse(cleaned);
        } catch {
          throw new Error("AI 返回了不完整的回复，请重试");
        }
      }

      setChapters(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  // ===== 方式B：上传文件 =====
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    setParseError(null);
    setFileText(null);
    setChapters(null);

    try {
      // 通过服务端 API 解析文件（支持 PDF/DOCX/PPTX/TXT/MD）
      const formData = new FormData();
      formData.append("file", file);
      const parseRes = await fetch("/api/parse", { method: "POST", body: formData });
      const parseData = await parseRes.json();
      if (!parseRes.ok) {
        setParseError(parseData.error || "文件解析失败");
        setParsing(false);
        return;
      }
      const text = parseData.text;
      if (!text || text.trim().length < 50) {
        setParseError("文件内容太少，无法提取有效信息");
        setParsing(false);
        return;
      }

      // 截取前段给 AI 识别章节（足够看到全文结构）
      const maxLen = 80000;
      const textToSend = text.length > maxLen
        ? text.slice(0, maxLen) + `\n\n[文件共 ${text.length} 字符，以上为前 ${maxLen} 字符，后续内容 AI 已省略]`
        : text;

      setFileText(text); // 保存完整文本

      // AI 识别章节
      const config2 = getApiConfig();
      const result = await streamAiCall({
        apiKey: config2.apiKey, baseUrl: config2.baseUrl, model: config2.model,
        messages: [
          {
            role: "system",
            content: `你是一个文档分析专家。分析以下文档内容，识别出章节结构。

返回 JSON：{"courseTitle":"标题","chapters":[{"title":"章","summary":"概述","sections":[{"title":"节"}],"hasGaps":false,"gapDescription":""}]}

要求：识别章节标题模式，标注内容残缺，无章节结构则按知识点划分`,
          },
          { role: "user", content: `请分析以下文档，识别章节结构：\n\n${textToSend}` },
        ],
        maxTokens: 20000,
      });

      // 尝试多种方式解析 JSON（AI 可能返回不完整或格式异常的回复）
      let data;
      try {
        // 先找 JSON 对象（处理 AI 在 JSON 前后加文字的情况）
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : result;
        data = JSON.parse(jsonStr);
      } catch {
        try {
          const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          data = JSON.parse(cleaned);
        } catch {
          throw new Error("AI 返回了不完整的回复，请重试或缩短文件后再试");
        }
      }

      if (!data.chapters || data.chapters.length === 0) {
        setParseError("AI 未能识别出章节结构，请确认文件包含清晰的内容或尝试用「描述生成」方式创建课程");
        setParsing(false);
        return;
      }

      // 标记有残缺的章节
      const chaptersWithGaps = (data.chapters || []).map((ch) => ({
        ...ch,
        hasGaps: ch.hasGaps !== false && !!ch.gapDescription,
      }));

      setChapters({ ...data, chapters: chaptersWithGaps });
    } catch (e) {
      setParseError(`${e.message}`);
    } finally {
      setParsing(false);
    }
  }

  // 编辑章节
  function updateChapter(index, field, value) {
    const updated = [...chapters.chapters];
    updated[index] = { ...updated[index], [field]: value };
    setChapters({ ...chapters, chapters: updated });
  }

  function updateSection(chapterIdx, sectionIdx, value) {
    const updated = [...chapters.chapters];
    const sections = [...updated[chapterIdx].sections];
    sections[sectionIdx] = { ...sections[sectionIdx], title: value };
    updated[chapterIdx] = { ...updated[chapterIdx], sections };
    setChapters({ ...chapters, chapters: updated });
  }

  function addSection(chapterIdx) {
    const updated = [...chapters.chapters];
    updated[chapterIdx] = {
      ...updated[chapterIdx],
      sections: [...updated[chapterIdx].sections, { title: "新小节" }],
    };
    setChapters({ ...chapters, chapters: updated });
  }

  function removeSection(chapterIdx, sectionIdx) {
    const updated = [...chapters.chapters];
    updated[chapterIdx] = {
      ...updated[chapterIdx],
      sections: updated[chapterIdx].sections.filter((_, i) => i !== sectionIdx),
    };
    setChapters({ ...chapters, chapters: updated });
  }

  function addChapter() {
    setChapters({
      ...chapters,
      chapters: [
        ...chapters.chapters,
        { title: "新章节", sections: [{ title: "新小节" }], hasGaps: false },
      ],
    });
  }

  function removeChapter(chapterIdx) {
    const updated = chapters.chapters.filter((_, i) => i !== chapterIdx);
    setChapters({ ...chapters, chapters: updated });
  }

  // 确认章节，保存课程并进入学习
  function confirmChapters() {
    const course = addCourse({
      ...chapters,
      sourceText: fileText || "",  // 原始文件文本（后续补全残缺内容用）
    });
    router.push(`/learn?courseId=${course.id}`);
  }

  // ===== 渲染章节确认界面 =====
  if (chapters) {
    return (
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-2 text-black dark:text-zinc-50">
          📋 确认课程结构
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mb-2">
          课程：{chapters.courseTitle}
        </p>
        <p className="text-zinc-400 dark:text-zinc-500 text-sm mb-6">
          AI 已识别出 {chapters.chapters.length} 个章节。你可以修改、合并或删除，确认后再开始学习。
        </p>

        <div className="space-y-4 mb-8">
          {chapters.chapters.map((chapter, ci) => (
            <div
              key={ci}
              className={`bg-white dark:bg-zinc-900 rounded-xl border-2 p-6 ${
                chapter.hasGaps
                  ? "border-amber-300 dark:border-amber-700"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              {/* 章节标题 */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded">
                  第 {ci + 1} 章
                </span>
                {chapter.hasGaps && (
                  <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
                    ⚠ 内容有残缺 — 学习时 AI 会自动补全
                  </span>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => removeChapter(ci)}
                  className="text-red-400 hover:text-red-600 text-sm px-2 py-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  title="删除此章节"
                >
                  🗑 删除章节
                </button>
              </div>
              <input
                type="text"
                value={chapter.title}
                onChange={(e) => updateChapter(ci, "title", e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-semibold mb-3"
              />

              {/* 小节列表 */}
              <div className="ml-4 space-y-2">
                {(chapter.sections || []).map((section, si) => (
                  <div key={si} className="flex items-center gap-2">
                    <span className="text-zinc-400 text-sm">§</span>
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => updateSection(ci, si, e.target.value)}
                      className="flex-1 px-3 py-2 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    />
                    <button
                      onClick={() => removeSection(ci, si)}
                      className="text-red-400 hover:text-red-600 text-sm px-2"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addSection(ci)}
                  className="text-sm text-indigo-500 hover:text-indigo-700 ml-5"
                >
                  + 添加小节
                </button>
              </div>
            </div>
          ))}

          {/* 添加章节 */}
          <button
            onClick={addChapter}
            className="w-full py-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition-colors text-sm font-medium"
          >
            + 添加章节
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setChapters(null)}
            className="px-6 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            ← 返回
          </button>
          <button
            onClick={confirmChapters}
            className="px-6 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            ✅ 确认，开始学习
          </button>
        </div>
      </div>
    );
  }

  // ===== 主界面：选择创建方式 =====
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-black dark:text-zinc-50">
        📚 创建课程
      </h2>
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        两种方式创建你的学习课程
      </p>

      {/* 模式切换 */}
      <div className="flex gap-2 mb-8">
        <button
          onClick={() => setMode("describe")}
          className={`flex-1 py-4 rounded-xl border-2 text-center transition-colors ${
            mode === "describe"
              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
              : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"
          }`}
        >
          <div className="text-2xl mb-1">💬</div>
          <div className="font-medium text-black dark:text-zinc-100">描述生成</div>
          <div className="text-xs text-zinc-400 mt-1">模糊描述，AI 生成课程</div>
        </button>
        <button
          onClick={() => setMode("upload")}
          className={`flex-1 py-4 rounded-xl border-2 text-center transition-colors ${
            mode === "upload"
              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
              : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"
          }`}
        >
          <div className="text-2xl mb-1">📁</div>
          <div className="font-medium text-black dark:text-zinc-100">上传文件</div>
          <div className="text-xs text-zinc-400 mt-1">PDF/PPT/DOCX 等</div>
        </button>
      </div>

      {/* 方式A：描述生成 */}
      {mode === "describe" && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            描述你想学什么
          </label>
          <textarea
            value={describeInput}
            onChange={(e) => setDescribeInput(e.target.value)}
            placeholder="例如：高中生物必修二的遗传学部分，包括孟德尔定律、基因自由组合、伴性遗传..."
            rows={4}
            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-y"
          />
          <button
            onClick={handleDescribeGenerate}
            disabled={generating || !describeInput.trim()}
            className="mt-4 px-6 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {generating ? "⏳ AI 正在生成课程..." : "🤖 让 AI 生成课程结构"}
          </button>
          {error && (
            <p className="mt-4 text-red-600 dark:text-red-400 text-sm">❌ {error}</p>
          )}
        </div>
      )}

      {/* 方式B：上传文件 */}
      {mode === "upload" && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              const file = e.dataTransfer?.files?.[0];
              if (file && fileInputRef.current) {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInputRef.current.files = dt.files;
                handleFileUpload({ target: { files: dt.files } });
              }
            }}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 scale-[1.02]"
                : "border-zinc-300 dark:border-zinc-700 hover:border-indigo-400 dark:hover:border-indigo-500"
            }`}
          >
            <div className="text-4xl mb-3">📤</div>
            <p className="text-zinc-600 dark:text-zinc-400 mb-1">
              点击或拖拽文件到这里
            </p>
            <p className="text-zinc-400 dark:text-zinc-500 text-sm">
              支持 TXT、PDF、DOCX、PPT、MD 等格式
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.pdf,.docx,.pptx"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {parsing && (
            <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-center">
              <p className="text-indigo-600 dark:text-indigo-400">
                ⏳ 正在解析文件并识别章节结构...
              </p>
            </div>
          )}

          {fileName && !parsing && !chapters && !parseError && (
            <div className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
              <p className="text-zinc-600 dark:text-zinc-400">
                📄 {fileName} — 已就绪，等待 AI 分析...
              </p>
            </div>
          )}

          {parseError && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-red-600 dark:text-red-400">❌ {parseError}</p>
            </div>
          )}
        </div>
      )}
      <TokenToast />
    </div>
  );
}
