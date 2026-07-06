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
  const [fileRequirements, setFileRequirements] = useState(""); // 文件上传附加需求
  const [reviseInput, setReviseInput] = useState(""); // 确认页的 AI 修改需求
  const [revising, setRevising] = useState(false); // AI 正在修改中
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
            content: `你是智学伴的 AI 课程设计师，核心理念是"以教促学"——学生学完后要能向别人讲清楚。

请根据用户的描述，设计一份结构化的课程大纲。

课程设计原则：
- 章节之间有逻辑递进，形成从基础到进阶的完整学习路径
- 每章标题必须包含具体主题（如"第一章：勾股定理的概念"），禁止纯序号
- 每章必须有 1-5 个小节（至少 1 个，否则无法进入学习），每个小节是一个独立的可教学单元
- 小节标题要具体，让学生一看就知道学什么
- 章节数量 3-8 个，根据内容复杂度灵活决定
- 若用户要求简洁，减少章节数量（合并相近主题），而非缩减小节内容

返回 JSON（不要 markdown 代码块）：
{"courseTitle":"课程标题","chapters":[{"title":"章标题（含主题）","sections":[{"title":"小节标题"}]}]}`,
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

      data.chapters = (data.chapters || []).map((ch) => ({
        ...ch,
        sections: (ch.sections || []).filter((s) => s.title && s.title.trim()),
      }));
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

      setFileText(text);
    } catch (e) {
      setParseError(`${e.message}`);
    } finally {
      setParsing(false);
    }
  }

  // 启动 AI 解析文件章节
  async function handleFileAnalyze() {
    if (!fileText) return;
    setParsing(true);
    setParseError(null);
    try {
      const maxLen = 80000;
      const textToSend = fileText.length > maxLen
        ? fileText.slice(0, maxLen) + `\n\n[文件共 ${fileText.length} 字符，以上为前 ${maxLen} 字符，后续内容 AI 已省略]`
        : fileText;

      const config = getApiConfig();
      const result = await streamAiCall({
        apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
        messages: [
          {
            role: "system",
            content: `你是智学伴的 AI 课程设计师，核心理念是"以教促学"——学生学完后要能向别人讲清楚。

请分析以下文档，提取出适合系统化学习的知识体系。

⚠️ 过滤规则：
- 忽略考试通知、考场规则、行政说明等非知识内容
- 忽略"注意事项""考试题型"等应试元信息
- 只提取可教学、可讲解的知识点

课程设计原则：
- 章节间要有逻辑递进关系，形成完整的学习路径
- 每章标题必须包含具体主题（如"第一章：鸦片战争始末"，禁止纯序号）
- 每章必须有 1-5 个小节（至少 1 个，否则无法进入学习），每个小节是一个独立的可教学单元
- 小节标题要具体，让学生一看就知道这节学什么
- ⚠️ 若文档只有章没有节，或某章内容不全，AI 应自动补全小节（基于章节主题推断）。补全后在 gapDescription 中注明"已自动补全小节"，hasGaps 设为 true 以便用户知晓

返回 JSON：{"courseTitle":"课程标题","chapters":[{"title":"章标题（含主题）","summary":"本章学什么（20字内）","sections":[{"title":"小节标题"},{"title":"小节标题"}],"hasGaps":false,"gapDescription":""}]}

${fileRequirements.trim() ? `用户额外需求：${fileRequirements.trim()}` : ""}`,
          },
          { role: "user", content: `请分析以下文档，识别章节结构：\n\n${textToSend}` },
        ],
        maxTokens: 20000,
      });

      let data;
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        data = JSON.parse(jsonMatch ? jsonMatch[0] : result);
      } catch {
        const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        data = JSON.parse(cleaned);
      }

      if (!data.chapters || data.chapters.length === 0) {
        setParseError("AI 未能识别出章节结构，请尝试用「描述生成」方式创建课程");
        return;
      }

      const chaptersWithGaps = (data.chapters || []).map((ch) => ({
        ...ch,
        sections: (ch.sections || []).filter((s) => s.title && s.title.trim()),
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

  // AI 改写章节结构
  async function handleRevise() {
    if (!reviseInput.trim() || !chapters || revising) return;
    setRevising(true);
    try {
      const config = getApiConfig();
      const currentJson = JSON.stringify(chapters);
      const result = await streamAiCall({
        apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
        messages: [
          {
            role: "system",
            content: `你是课程设计助手。根据用户的修改意见，调整已有课程的章节结构。

当前课程 JSON：${currentJson.slice(0, 3000)}

修改原则：保持课程主题不变，只按用户意见调整。返回完整 JSON（格式与输入相同，包含 courseTitle 和 chapters 数组）`,
          },
          { role: "user", content: `修改意见：${reviseInput.trim()}` },
        ],
        maxTokens: 10000,
      });
      let data;
      try { data = JSON.parse(result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); } catch {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        data = JSON.parse(jsonMatch ? jsonMatch[0] : result);
      }
      setChapters({ ...chapters, courseTitle: data.courseTitle || chapters.courseTitle, chapters: data.chapters || chapters.chapters });
      setReviseInput("");
    } catch (e) {
      setError(`修改失败：${e.message}`);
    } finally {
      setRevising(false);
    }
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

        {/* AI 改写 */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 mb-6">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">🤖 AI 修改课程</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={reviseInput}
              onChange={(e) => setReviseInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRevise()}
              placeholder="如：浓缩一点、增加习题章、拆细第三章..."
              disabled={revising}
              className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
            />
            <button onClick={handleRevise} disabled={revising || !reviseInput.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {revising ? "修改中..." : "发送"}
            </button>
          </div>
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
      <TokenToast />
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

          {fileText && !chapters && (
            <div className="mt-4">
              <input
                type="text"
                value={fileRequirements}
                onChange={(e) => setFileRequirements(e.target.value)}
                disabled={parsing}
                placeholder="附加需求：如更简要、更详细、预计学习时间等（可选）"
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
              />
            </div>
          )}

          {fileName && fileText && !parsing && !chapters && !parseError && (
            <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex items-center justify-between">
              <p className="text-sm text-indigo-600 dark:text-indigo-400">
                📄 {fileName} — 已解析就绪
              </p>
              <div className="flex items-center gap-3">
                <button onClick={() => { setFileName(""); setFileText(null); setFileRequirements(""); }}
                  className="text-zinc-400 hover:text-red-500 text-lg leading-none" title="删除文件">
                  ✕
                </button>
                <button onClick={handleFileAnalyze}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition-colors">
                  🤖 AI 开始分析
                </button>
              </div>
            </div>
          )}

          {fileName && !fileText && !parsing && !chapters && !parseError && (
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
