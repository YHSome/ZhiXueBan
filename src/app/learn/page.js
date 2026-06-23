"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiConfig } from "@/lib/api-key";
import { getAllCourses, getCourse, deleteCourse } from "@/lib/courses";
import MarkdownRenderer from "@/components/MarkdownRenderer";

// ===================== 阶段枚举 =====================
const STAGE = {
  IDLE: "idle",               // 未开始
  READING: "reading",         // 预习阅读
  QUIZ: "quiz",               // 小测
  REVIEW: "review",           // AI 批改+建议
  PRACTICE: "practice",       // 更多练习
  PRACTICE_REVIEW: "practice_review", // 练习批改
  TEACH_BACK: "teach_back",   // 以教促学（错题复盘讲给 AI）
  COMPLETED: "completed",     // 本节完成 ✅
};

// ===================== 主组件 =====================
function LearnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get("courseId");

  const [course, setCourse] = useState(null);
  const [allCourses, setAllCourses] = useState([]);
  const [activeChapter, setActiveChapter] = useState(null);
  const [activeSection, setActiveSection] = useState(null);
  const [sectionCache, setSectionCache] = useState({});
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  // ---------- 工具函数 ----------
  function sectionKey(ci, si) { return `${ci}-${si}`; }
  function cacheStorageKey() { return `zhixueban-cache-${courseId}`; }

  function activeKey() {
    if (activeChapter === null || activeSection === null) return null;
    return sectionKey(activeChapter, activeSection);
  }

  function activeCache() {
    const key = activeKey();
    return key ? sectionCache[key] : null;
  }

  // 当前阶段
  function currentStage() {
    return activeCache()?.stage || STAGE.IDLE;
  }

  // 是否在闯关中（隐藏目录）
  const inProgress =
    currentStage() !== STAGE.IDLE && currentStage() !== STAGE.COMPLETED;

  // ---------- 加载数据 ----------
  useEffect(() => {
    setAllCourses(getAllCourses());
  }, []);

  useEffect(() => {
    if (courseId) {
      const c = getCourse(courseId);
      setCourse(c);
      setActiveChapter(null);
      setActiveSection(null);
      const cached = localStorage.getItem(cacheStorageKey());
      if (cached) { try { setSectionCache(JSON.parse(cached)); } catch {} }
      else setSectionCache({});
    } else {
      setCourse(null);
      setSectionCache({});
    }
  }, [courseId]);

  useEffect(() => {
    if (courseId && Object.keys(sectionCache).length > 0) {
      localStorage.setItem(cacheStorageKey(), JSON.stringify(sectionCache));
    }
  }, [sectionCache, courseId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sectionCache]);

  // ---------- AI 调用 ----------
  async function aiCall(messages, maxTokens = 2000) {
    const config = getApiConfig();
    const res = await fetch("/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model, messages, maxTokens }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data.content;
  }

  function updateCache(key, partial) {
    setSectionCache((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), ...partial },
    }));
  }

  // ---------- 选择章节/小节 ----------
  function selectChapter(ci) { setActiveChapter(ci); setActiveSection(null); }
  function selectSection(si) { setActiveSection(si); }

  // ---------- 进入阅读 ----------
  async function startReading(ci, si) {
    selectSection(si);
    const key = sectionKey(ci, si);
    const cache = sectionCache[key];

    // 已完成 → 直接显示
    if (cache?.stage === STAGE.COMPLETED) return;

    // 已有讲义 → 恢复阶段
    if (cache?.lecture && cache?.stage) return;

    // 立刻显示阅读框架，避免黑屏等待
    updateCache(key, { stage: STAGE.READING });
    setLoading(true);
    const chapter = course.chapters[ci];
    const section = chapter.sections[si];
    try {
      const result = await aiCall([
        { role: "system", content: lectureSystemPrompt(course.courseTitle, chapter.title, section.title) },
        { role: "user", content: `请讲解"${section.title}"这一节的内容。` },
      ]);
      updateCache(key, { lecture: result, chatMessages: [] });
    } catch (e) {
      updateCache(key, { lecture: `❌ 生成失败：${e.message}` });
    } finally {
      setLoading(false);
    }
  }

  // ---------- 生成小测 ----------
  async function startQuiz() {
    const key = activeKey();
    const cache = activeCache();
    // 已有小测数据 → 直接恢复，不重新生成
    if (cache.quiz?.questions?.length > 0) {
      setLoading(false);
      updateCache(key, { stage: STAGE.QUIZ });
      return;
    }
    updateCache(key, { stage: STAGE.QUIZ });
    setLoading(true);
    try {
      const raw = await aiCall([
        { role: "system", content: quizGenPrompt(course.courseTitle, cache.lecture) },
        { role: "user", content: "请根据上面的授课内容生成小测验。" },
      ], 3000);

      // 解析 JSON
      let quizData;
      try { quizData = JSON.parse(raw.trim()); } catch {
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        quizData = JSON.parse(cleaned);
      }

      const questions = (quizData.questions || []).map((q) => ({
        ...q,
        userAnswer: "",
      }));

      updateCache(key, { quiz: { questions }, stage: STAGE.QUIZ });
    } catch (e) {
      updateCache(key, { quiz: { questions: [{ type: "error", question: `出题失败：${e.message}`, answer: "" }], }, stage: STAGE.QUIZ });
    } finally {
      setLoading(false);
    }
  }

  // ---------- 提交小测 ----------
  async function submitQuiz() {
    const key = activeKey();
    const cache = activeCache();
    // 已批改过 → 直接恢复
    if (cache.review) {
      setLoading(false);
      updateCache(key, { stage: STAGE.REVIEW });
      return;
    }
    const questions = cache.quiz?.questions || [];
    setLoading(true);

    // 构造批改 prompt（含客户端预判提示）
    const qaText = questions.map((q, i) => {
      const userAns = (q.userAnswer || "").trim();
      const correctAns = (q.answer || "").trim();

      // 客户端预判（帮助 AI 更准确）
      let hint = "";
      if (q.type === "choice") {
        // 选择题：检查选项字母是否匹配
        const userLetter = userAns.match(/^[A-Za-z]/)?.[0]?.toUpperCase();
        const correctLetter = correctAns.match(/^[A-Za-z]/)?.[0]?.toUpperCase();
        if (userLetter && correctLetter && userLetter === correctLetter) {
          hint = " [预判：选项字母匹配，大概率正确]";
        } else if (userAns && correctAns && (
          userAns.includes(correctAns.slice(0, 3)) || correctAns.includes(userAns.slice(0, 3))
        )) {
          hint = " [预判：答案内容部分匹配]";
        }
      } else if (q.type === "fill") {
        // 填空题：简单相似度
        const u = userAns.toLowerCase().replace(/\s/g, "");
        const c = correctAns.toLowerCase().replace(/\s/g, "");
        if (u === c || u.includes(c) || c.includes(u)) {
          hint = " [预判：答案匹配]";
        }
      }

      return `${i + 1}. 题目：${q.question}\n   正确答案：${correctAns}\n   学生答案：${userAns || "（未作答）"}${hint}`;
    }).join("\n\n");

    try {
      const raw = await aiCall([
        {
          role: "system",
          content: `你是学习评测专家。请逐题批改学生的小测，判断每道题的对错。

授课内容：${cache.lecture.slice(0, 1000)}

⚠️ 批改规则（务必遵守）：
1. 选择题：学生选了正确选项即判对。不需要完全逐字匹配，只要选中的选项字母或内容与正确选项一致即可。例如正确答案是"B"，学生答"B"或"B. xxx"都应判对。
2. 填空题：学生答案的**核心意思**与正确答案一致即判对。不要纠缠于措辞差异。例如正确答案是"假"，学生答"假"或"false"或"F"都应判对。
3. 简答题：学生答案**覆盖了核心要点**即判对。不需要完整复述，只要关键逻辑正确。部分正确但不够完整的，判错但 feedback 中说明差在哪里。
4. 不要因为答得太简短而判错——只看内容对不对。

每题都写：
- 详细解题步骤（Markdown，有公式用 LaTeX）
- 简短点评（为什么对/为什么错）
- correct 字段（true/false）

评分规则：每题分值相同，满分100。例如4道题，每道25分，对几道就是几分×25。

返回 JSON（不要 markdown 代码块）：
{
  "results": [
    {
      "correct": true/false,
      "steps": "详细解题步骤（用Markdown，有公式用LaTeX）",
      "feedback": "点评"
    }
  ],
  "score": 75,
  "weakPoints": ["薄弱点"],
  "suggestion": "学习建议"
}`,
        },
        { role: "user", content: `学生答题情况：\n${qaText}` },
      ], 4000);

      let review;
      try { review = JSON.parse(raw.trim()); } catch {
        review = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      }

      // 标记错题，附上解题步骤
      const reviewedQuestions = questions.map((q, i) => ({
        ...q,
        correct: review.results?.[i]?.correct ?? false,
        steps: review.results?.[i]?.steps || "",
        feedback: review.results?.[i]?.feedback || "",
      }));

      updateCache(key, {
        quiz: { ...cache.quiz, questions: reviewedQuestions },
        review: { score: review.score, weakPoints: review.weakPoints || [], suggestion: review.suggestion || "" },
        stage: STAGE.REVIEW,
      });
    } catch (e) {
      updateCache(key, { review: { score: 0, weakPoints: [], suggestion: `批改失败：${e.message}` }, stage: STAGE.REVIEW });
    } finally {
      setLoading(false);
    }
  }

  // ---------- 更多练习 ----------
  async function startPractice() {
    const key = activeKey();
    const cache = activeCache();
    // 已有练习数据 → 直接恢复
    if (cache.practice?.questions?.length > 0) {
      setLoading(false);
      updateCache(key, { stage: STAGE.PRACTICE });
      return;
    }
    updateCache(key, { stage: STAGE.PRACTICE });
    setLoading(true);
    try {
      const weakPoints = cache.review?.weakPoints?.join("、") || "综合";
      const raw = await aiCall([
        { role: "system", content: practiceGenPrompt(course.courseTitle, cache.lecture, weakPoints) },
        { role: "user", content: "请根据薄弱点生成针对性练习。" },
      ], 3000);

      let practiceData;
      try { practiceData = JSON.parse(raw.trim()); } catch {
        practiceData = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      }

      const questions = (practiceData.questions || []).map((q) => ({
        ...q,
        userAnswer: "",
      }));

      updateCache(key, { practice: { questions }, stage: STAGE.PRACTICE });
    } catch (e) {
      updateCache(key, { practice: { questions: [{ type: "error", question: `生成失败：${e.message}`, answer: "" }] }, stage: STAGE.PRACTICE });
    } finally {
      setLoading(false);
    }
  }

  async function submitPractice() {
    const key = activeKey();
    const cache = activeCache();
    // 已批改过 → 直接恢复
    if (cache.practiceReview) {
      setLoading(false);
      updateCache(key, { stage: STAGE.PRACTICE_REVIEW });
      return;
    }
    const questions = cache.practice?.questions || [];
    setLoading(true);

    const qaText = questions.map((q, i) =>
      `${i + 1}. 题目：${q.question}\n   正确答案：${q.answer}\n   学生答案：${q.userAnswer || "（未作答）"}`
    ).join("\n\n");

    try {
      const raw = await aiCall([
        { role: "system", content: `批改练习。授课内容：${cache.lecture.slice(0, 800)}\n返回JSON：{"results":[{"correct":true/false,"feedback":"点评"}],"score":85,"readyForTeachBack":true/false,"suggestion":"建议"}` },
        { role: "user", content: qaText },
      ], 2000);

      let review;
      try { review = JSON.parse(raw.trim()); } catch {
        review = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      }

      const reviewedQuestions = questions.map((q, i) => ({
        ...q,
        correct: review.results?.[i]?.correct ?? false,
        feedback: review.results?.[i]?.feedback || "",
      }));

      updateCache(key, {
        practice: { ...cache.practice, questions: reviewedQuestions },
        practiceReview: { score: review.score, suggestion: review.suggestion || "", readyForTeachBack: review.readyForTeachBack !== false },
        stage: STAGE.PRACTICE_REVIEW,
      });
    } catch (e) {
      updateCache(key, { practiceReview: { score: 0, suggestion: `批改失败：${e.message}`, readyForTeachBack: true }, stage: STAGE.PRACTICE_REVIEW });
    } finally {
      setLoading(false);
    }
  }

  // ---------- 以教促学 ----------
  async function startTeachBack() {
    const key = activeKey();
    const cache = activeCache();

    // 已有以教促学数据 → 直接恢复
    if (cache.teachBack) {
      setLoading(false);
      updateCache(key, { stage: STAGE.TEACH_BACK });
      return;
    }

    // 收集错题
    const wrongQuestions = [
      ...(cache.quiz?.questions || []).filter((q) => !q.correct),
      ...(cache.practice?.questions || []).filter((q) => !q.correct),
    ];

    updateCache(key, {
      teachBack: {
        wrongQuestions,
        chatMessages: [],
        approved: false,
        currentWrongIndex: 0,
      },
      stage: STAGE.TEACH_BACK,
    });
  }

  async function sendTeachBackMessage() {
    const key = activeKey();
    const cache = activeCache();
    const tb = cache.teachBack;
    if (!tb) return;

    const input = document.getElementById("teachback-input")?.value?.trim();
    if (!input) return;
    document.getElementById("teachback-input").value = "";

    const updated = [...(tb.chatMessages || []), { role: "user", content: input }];
    updateCache(key, { teachBack: { ...tb, chatMessages: updated } });
    setLoading(true);

    const wrongQ = tb.wrongQuestions[tb.currentWrongIndex];
    try {
      const answer = await aiCall([
        {
          role: "system",
          content: `你是智学伴的"以教促学"导师。学生正在向你讲解一道他之前做错的题。

原题：${wrongQ?.question || "无"}
正确答案：${wrongQ?.answer || "无"}
学生之前的错误答案：${wrongQ?.userAnswer || "无"}

你的角色：扮演一位严格的"学生"，听学生讲解这道题的思路。
规则：
1. 判断学生的讲解是否逻辑正确、真正理解了题目
2. 如果不清楚或不完整，追问细节
3. 如果讲错了，指出并引导
4. 如果学生讲得正确且完整，回复 "✅ APPROVED: 你讲得很好，我理解了！"
5. 使用口语化的语气`,
        },
        ...updated,
      ], 1000);

      const approved = answer.includes("✅ APPROVED");
      const newMessages = [...updated, { role: "assistant", content: answer }];

      if (approved) {
        // 这道错题通过，看还有没有下一道
        const nextIndex = tb.currentWrongIndex + 1;
        if (nextIndex < tb.wrongQuestions.length) {
          updateCache(key, {
            teachBack: { ...tb, chatMessages: newMessages, currentWrongIndex: nextIndex },
          });
        } else {
          // 所有错题讲完 → 完成！
          updateCache(key, {
            teachBack: { ...tb, chatMessages: newMessages, approved: true },
            stage: STAGE.COMPLETED,
          });
        }
      } else {
        updateCache(key, {
          teachBack: { ...tb, chatMessages: newMessages },
        });
      }
    } catch (e) {
      updateCache(key, {
        teachBack: { ...tb, chatMessages: [...updated, { role: "assistant", content: `❌ ${e.message}` }] },
      });
    } finally {
      setLoading(false);
    }
  }

  // ---------- 重新学习 ----------
  function restartSection() {
    const key = activeKey();
    updateCache(key, { stage: STAGE.READING });
  }

  function resetSection() {
    const key = activeKey();
    setSectionCache((prev) => { const n = { ...prev }; delete n[key]; return n; });
    updateCache(key, {});
  }

  // 跳回之前的阶段（进度条点击）—— 保留全部数据，只改阶段
  function jumpToStage(targetStage) {
    const key = activeKey();
    if (!key) return;
    const cache = sectionCache[key];
    if (!cache) return;
    // 清除可能卡住的 loading 状态，并只更新 stage
    setLoading(false);
    updateCache(key, { stage: targetStage });
  }

  // ---------- 侧边栏图标 ----------
  function sectionStageIcon(ci, si) {
    const cache = sectionCache[sectionKey(ci, si)];
    if (cache?.stage === STAGE.COMPLETED) return "🏆";
    if (cache?.stage && cache.stage !== STAGE.IDLE) return "⏳";
    return "📖";
  }

  // =================== 渲染 ===================

  // ---- 课程列表 ----
  if (!courseId) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-black dark:text-zinc-50">📚 我的课程</h2>
          <button onClick={() => router.push("/create")} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
            + 新建课程
          </button>
        </div>
        {allCourses.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-zinc-500 dark:text-zinc-400 mb-4">还没有课程</p>
            <button onClick={() => router.push("/create")} className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700">
              创建第一门课程 →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {allCourses.map((c) => (
              <div key={c.id} onClick={() => router.push(`/learn?courseId=${c.id}`)}
                className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 hover:shadow-md hover:border-indigo-300 cursor-pointer flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-black dark:text-zinc-100 mb-1 truncate">{c.courseTitle}</h3>
                  <p className="text-sm text-zinc-500">{c.chapters?.length || 0} 个章节</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); if (confirm(`删除「${c.courseTitle}」？`)) { deleteCourse(c.id); setAllCourses(getAllCourses()); } }}
                  className="text-zinc-400 hover:text-red-500 text-sm px-3 py-1 rounded hover:bg-red-50 transition-colors">🗑️</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (courseId && !course) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-zinc-500 mb-4">课程不存在</p>
        <button onClick={() => router.push("/learn")} className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700">← 返回</button>
      </div>
    );
  }

  // ---- 章节列表 ----
  if (activeChapter === null || (!inProgress && activeSection === null)) {
    return (
      <div className="flex gap-6 h-[calc(100vh-100px)]">
        <aside className="w-72 flex-shrink-0 overflow-y-auto">
          <button onClick={() => router.push("/learn")} className="text-sm text-indigo-500 hover:text-indigo-700 mb-3 block">← 返回课程列表</button>
          <h3 className="font-semibold text-sm text-zinc-500 mb-3 uppercase">📚 {course.courseTitle}</h3>
          <div className="space-y-1">
            {course.chapters.map((chapter, ci) => (
              <div key={ci}>
                <button onClick={() => selectChapter(ci)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeChapter === ci ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 font-medium" : "text-zinc-600 hover:bg-zinc-100"}`}>
                  <span className="text-xs text-zinc-400 mr-2">第{ci + 1}章</span>{chapter.title}
                </button>
                {activeChapter === ci && (
                  <div className="ml-4 mt-1 space-y-1">
                    {(chapter.sections || []).map((section, si) => (
                      <button key={si} onClick={() => startReading(ci, si)}
                        className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${activeSection === si ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800" : "text-zinc-500 hover:bg-zinc-50"}`}>
                        <span className="mr-1.5">{sectionStageIcon(ci, si)}</span>{section.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
        <main className="flex-1 flex items-center justify-center text-center">
          <div>
            <div className="text-5xl mb-4">👈</div>
            <p className="text-zinc-500 text-lg">选择左侧章节开始闯关</p>
            <p className="text-zinc-400 text-sm mt-2">🏆 = 已完成  ⏳ = 进行中  📖 = 未开始</p>
          </div>
        </main>
      </div>
    );
  }

  // ---- 闯关模式（全屏）----
  const cache = activeCache();
  const stage = currentStage();
  const chap = course.chapters[activeChapter];
  const sect = chap.sections[activeSection];
  const key = activeKey();

  return (
    <div className="max-w-3xl mx-auto py-4">
      {/* 顶部进度条 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setActiveSection(null)}
            className="text-sm text-zinc-400 hover:text-zinc-600">
            ← {chap.title}
          </button>
          <span className="text-xs text-zinc-400">
            {sect.title}
          </span>
        </div>
        {/* 阶段指示器 */}
        <StageIndicator
          currentStage={stage}
          onJumpToStage={jumpToStage}
          sectionCache={cache}
        />
      </div>

      {/* ===== 阶段内容 ===== */}

      {/* 阅读阶段 */}
      {stage === STAGE.READING && (
        <div>
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-xl border border-indigo-200 dark:border-indigo-800 p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">📖</span>
              <h3 className="font-semibold text-indigo-800 dark:text-indigo-300">预习阅读</h3>
            </div>
            <MarkdownRenderer content={cache.lecture || "加载中..."} />
          </div>
          {loading && <LoadingHint text="AI 正在备课..." />}
          <button onClick={startQuiz} disabled={loading}
            className="w-full py-4 rounded-xl bg-indigo-600 text-white font-semibold text-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            🎯 我读完了，开始小测
          </button>
        </div>
      )}

      {/* 小测阶段 */}
      {stage === STAGE.QUIZ && (
        <QuizPanel
          questions={cache.quiz?.questions || []}
          onAnswerChange={(qi, val) => {
            const qs = [...cache.quiz.questions];
            qs[qi] = { ...qs[qi], userAnswer: val };
            updateCache(key, { quiz: { ...cache.quiz, questions: qs } });
          }}
          onSubmit={submitQuiz}
          loading={loading}
        />
      )}

      {/* 批改阶段 */}
      {stage === STAGE.REVIEW && (
        <ReviewPanel
          questions={cache.quiz?.questions || []}
          review={cache.review || {}}
          onRetry={restartSection}
          onPractice={startPractice}
          onTeachBack={startTeachBack}
          loading={loading}
        />
      )}

      {/* 更多练习 */}
      {stage === STAGE.PRACTICE && (
        <QuizPanel
          title="📝 针对性练习"
          questions={cache.practice?.questions || []}
          onAnswerChange={(qi, val) => {
            const qs = [...cache.practice.questions];
            qs[qi] = { ...qs[qi], userAnswer: val };
            updateCache(key, { practice: { ...cache.practice, questions: qs } });
          }}
          onSubmit={submitPractice}
          loading={loading}
        />
      )}

      {/* 悬浮 AI 助手（小测和练习阶段显示）*/}
      {(stage === STAGE.QUIZ || stage === STAGE.PRACTICE) && (
        <FloatingHelper
          lecture={cache.lecture || ""}
          stage={stage}
          sectionKey={activeKey()}
        />
      )}

      {/* 练习批改 */}
      {stage === STAGE.PRACTICE_REVIEW && (
        <ReviewPanel
          title="📝 练习结果"
          questions={cache.practice?.questions || []}
          review={cache.practiceReview || {}}
          onRetry={restartSection}
          onTeachBack={startTeachBack}
          loading={loading}
          hidePractice
        />
      )}

      {/* 以教促学 */}
      {stage === STAGE.TEACH_BACK && (
        <TeachBackPanel
          teachBack={cache.teachBack || {}}
          onSend={sendTeachBackMessage}
          loading={loading}
        />
      )}

      {/* 完成 */}
      {stage === STAGE.COMPLETED && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎉</div>
          <h3 className="text-2xl font-bold text-black dark:text-zinc-50 mb-2">本节通关！</h3>
          <p className="text-zinc-500 mb-2">你已掌握「{sect.title}」</p>
          {cache.review && (
            <p className="text-sm text-zinc-400 mb-6">
              小测 {cache.review.score} 分 · 练习 {cache.practiceReview?.score || "-"} 分 · 以教促学 ✅
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <button onClick={resetSection} className="px-6 py-3 rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50">
              🔄 重新学习
            </button>
            <button onClick={() => setActiveSection(null)} className="px-6 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
              下一节 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== 子组件 =====================

// 阶段指示器
function StageIndicator({ currentStage, onJumpToStage, sectionCache }) {
  const stages = [
    { key: STAGE.READING, label: "阅读", icon: "📖" },
    { key: STAGE.QUIZ, label: "小测", icon: "✍️" },
    { key: STAGE.REVIEW, label: "批改", icon: "🔍" },
    { key: STAGE.PRACTICE, label: "练习", icon: "📝" },
    { key: STAGE.PRACTICE_REVIEW, label: "批改", icon: "🔍" },
    { key: STAGE.TEACH_BACK, label: "以教促学", icon: "🎓" },
    { key: STAGE.COMPLETED, label: "完成", icon: "🏆" },
  ];

  // 合并连续重复的"批改"
  const displayStages = [];
  const seen = new Set();
  for (const s of stages) {
    if (s.key === STAGE.PRACTICE_REVIEW && displayStages.some((d) => d.key === STAGE.REVIEW)) continue;
    if (!seen.has(s.label)) { seen.add(s.label); displayStages.push(s); }
  }

  // 判断某个阶段是否到达过（有对应数据）
  function hasReached(stageKey) {
    if (!sectionCache) return false;
    switch (stageKey) {
      case STAGE.READING: return !!sectionCache.lecture;
      case STAGE.QUIZ: return !!sectionCache.quiz;
      case STAGE.REVIEW: return !!sectionCache.review;
      case STAGE.PRACTICE: return !!sectionCache.practice;
      case STAGE.PRACTICE_REVIEW: return !!sectionCache.practiceReview;
      case STAGE.TEACH_BACK: return !!sectionCache.teachBack;
      case STAGE.COMPLETED: return sectionCache.stage === STAGE.COMPLETED;
      default: return false;
    }
  }

  const currentIdx = stages.findIndex((x) => x.key === currentStage);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {displayStages.map((s, i) => {
        const stageIdx = stages.findIndex((x) => x.key === s.key);
        const isActive = stageIdx <= currentIdx || currentStage === STAGE.COMPLETED;
        const isCurrent = s.key === currentStage
          || (currentStage === STAGE.PRACTICE_REVIEW && s.key === STAGE.REVIEW);
        // 核心改动：到达过就能点（不限于"之前"的阶段）
        const canJump = hasReached(s.key) && !isCurrent && onJumpToStage;

        return (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && (
              <div className={`w-4 h-0.5 ${isActive ? "bg-indigo-400" : "bg-zinc-200 dark:bg-zinc-700"}`} />
            )}
            {canJump ? (
              <button
                type="button"
                onClick={() => onJumpToStage(s.key)}
                title={`跳转到「${s.label}」`}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                  isActive
                    ? "text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                    : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                <span>{s.icon}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ) : (
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                  isCurrent
                    ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium"
                    : isActive
                      ? "text-zinc-500"
                      : "text-zinc-300 dark:text-zinc-600"
                }`}
              >
                <span>{s.icon}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 加载提示
function LoadingHint({ text }) {
  return (
    <div className="flex items-center gap-3 text-indigo-500 justify-center py-4">
      <span className="animate-pulse">⏳</span><span>{text}</span>
    </div>
  );
}

// 小测 / 练习面板
function QuizPanel({ title = "✍️ 小测验", questions, onAnswerChange, onSubmit, loading }) {
  if (questions.length === 0) return <LoadingHint text="AI 正在出题..." />;

  return (
    <div>
      <h3 className="text-xl font-bold mb-6 text-black dark:text-zinc-50">{title}</h3>
      <div className="space-y-6 mb-6">
        {questions.map((q, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <p className="font-medium text-black dark:text-zinc-100 mb-3">
              {i + 1}. {q.question}
            </p>
            {q.options ? (
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <label key={oi} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${q.userAnswer === opt ? "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-transparent"}`}>
                    <input type="radio" name={`q-${i}`} checked={q.userAnswer === opt} onChange={() => onAnswerChange(i, opt)}
                      className="text-indigo-600 focus:ring-indigo-500" />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{opt}</span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea value={q.userAnswer || ""} onChange={(e) => onAnswerChange(i, e.target.value)}
                rows={3} placeholder="请输入你的答案..."
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none resize-y text-sm" />
            )}
          </div>
        ))}
      </div>
      {loading && <LoadingHint text="AI 正在批改..." />}
      <button onClick={onSubmit} disabled={loading}
        className="w-full py-4 rounded-xl bg-indigo-600 text-white font-semibold text-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
        📩 提交
      </button>
    </div>
  );
}

// 批改结果面板
function ReviewPanel({ title = "🔍 批改结果", questions, review, onRetry, onPractice, onTeachBack, loading, hidePractice }) {
  const wrongCount = questions.filter((q) => !q.correct).length;

  return (
    <div>
      <h3 className="text-xl font-bold mb-6 text-black dark:text-zinc-50">{title}</h3>

      {/* 分数卡片 */}
      <div className={`rounded-xl p-6 mb-6 text-center ${review.score >= 80 ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" : review.score >= 60 ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800" : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"}`}>
        <div className="text-4xl font-bold mb-1 text-black dark:text-zinc-100">{review.score}<span className="text-lg text-zinc-400">/100</span></div>
        <p className="text-sm text-zinc-500 mb-2">正确 {questions.length - wrongCount}/{questions.length} · 错误 {wrongCount}</p>
        {review.suggestion && <p className="text-sm text-zinc-600 dark:text-zinc-400">{review.suggestion}</p>}
        {review.weakPoints?.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center mt-2">
            {review.weakPoints.map((w, i) => (
              <span key={i} className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">薄弱：{w}</span>
            ))}
          </div>
        )}
      </div>

      {/* 逐题反馈 —— 含详细解题步骤 */}
      <div className="space-y-4 mb-6">
        {questions.map((q, i) => (
          <div key={i} className={`rounded-xl border overflow-hidden ${q.correct ? "bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800" : "bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800"}`}>
            {/* 题目 + 结果 */}
            <div className="p-4">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-lg">{q.correct ? "✅" : "❌"}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-black dark:text-zinc-100">{i + 1}. {q.question}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    <span className="text-xs text-zinc-400">你的答案：{q.userAnswer || "（未作答）"}</span>
                    {!q.correct && <span className="text-xs text-green-600 dark:text-green-400">正确答案：{q.answer}</span>}
                  </div>
                  {q.feedback && (
                    <p className="text-xs text-zinc-500 mt-1 italic">{q.feedback}</p>
                  )}
                </div>
              </div>
            </div>

            {/* 详细解题步骤（折叠） */}
            {q.steps && (
              <details className="border-t border-inherit">
                <summary className="px-4 py-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 cursor-pointer hover:bg-white/50 dark:hover:bg-zinc-800/50">
                  📝 查看详细解题步骤
                </summary>
                <div className="px-4 pb-4 pt-2 bg-white/50 dark:bg-zinc-800/50">
                  <MarkdownRenderer content={q.steps} />
                </div>
              </details>
            )}
          </div>
        ))}
      </div>

      {loading && <LoadingHint text="AI 正在准备..." />}

      <div className="space-y-3">
        {!hidePractice ? (
          /* 小测批改：只能去练习，不能直接跳到以教促学 */
          <>
            {wrongCount > 0 && (
              <button onClick={onPractice} disabled={loading}
                className="w-full py-3 rounded-xl border-2 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                📝 做针对性练习（针对薄弱点）
              </button>
            )}
            {wrongCount === 0 && (
              <button onClick={onTeachBack} disabled={loading}
                className="w-full py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors">
                🎓 进入以教促学（讲解你的完整思路）
              </button>
            )}
          </>
        ) : (
          /* 练习批改：只能去以教促学 */
          <button onClick={onTeachBack} disabled={loading}
            className="w-full py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors">
            🎓 进入以教促学（错题复盘）
          </button>
        )}
        <button onClick={onRetry} disabled={loading}
          className="w-full py-3 rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors">
          🔄 重新学习本节
        </button>
      </div>
    </div>
  );
}

// 以教促学面板
function TeachBackPanel({ teachBack, onSend, loading }) {
  const wrongQ = teachBack.wrongQuestions?.[teachBack.currentWrongIndex || 0];
  const messages = teachBack.chatMessages || [];

  return (
    <div>
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-xl border-2 border-amber-300 dark:border-amber-700 p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🎓</span>
          <h3 className="font-semibold text-amber-800 dark:text-amber-300">以教促学</h3>
        </div>
        <p className="text-sm text-amber-700 dark:text-amber-400 mb-4">
          向 AI 讲解你做错的题目——只有你讲清楚了，AI 才认可你真正掌握了。
        </p>
        {wrongQ && (
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
            <p className="text-sm font-medium text-black dark:text-zinc-100 mb-1">📋 错题（{(teachBack.currentWrongIndex || 0) + 1}/{teachBack.wrongQuestions.length}）</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{wrongQ.question}</p>
            <p className="text-xs text-zinc-400 mt-1">正确答案：{wrongQ.answer}</p>
            <p className="text-xs text-red-500 mt-1">你的答案：{wrongQ.userAnswer || "（未作答）"}</p>
          </div>
        )}
      </div>

      {/* 对话 */}
      <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-xl px-4 py-3 ${msg.role === "user" ? "bg-amber-500 text-white" : "bg-white dark:bg-zinc-800 border border-zinc-200 text-zinc-700 dark:text-zinc-300"}`}>
              <div className="text-xs mb-1 opacity-70">{msg.role === "user" ? "🙋 你的讲解" : "🤖 AI 学生"}</div>
              <MarkdownRenderer content={msg.content} />
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-zinc-800 border rounded-xl px-4 py-3">
              <span className="text-sm text-zinc-400 animate-pulse">AI 正在听...</span>
            </div>
          </div>
        )}
      </div>

      {/* 输入 */}
      <div className="flex gap-3">
        <input id="teachback-input" type="text" placeholder="向 AI 讲解这道题的解题思路..."
          onKeyDown={(e) => e.key === "Enter" && onSend()} disabled={loading}
          className="flex-1 px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-50" />
        <button onClick={onSend} disabled={loading}
          className="px-6 py-3 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
          讲解
        </button>
      </div>
    </div>
  );
}

// ===================== 悬浮 AI 助手（小测/练习时可用）=====================
function FloatingHelper({ lecture, stage, sectionKey }) {
  const [open, setOpen] = useState(false);
  const [helperMessages, setHelperMessages] = useState([]);
  const [helperInput, setHelperInput] = useState("");
  const [helperLoading, setHelperLoading] = useState(false);
  const helperEndRef = useRef(null);

  useEffect(() => {
    helperEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [helperMessages]);

  // 加载该小节的助手对话历史
  useEffect(() => {
    const saved = localStorage.getItem(`zhixueban-helper-${sectionKey}`);
    if (saved) { try { setHelperMessages(JSON.parse(saved)); } catch {} }
  }, [sectionKey]);

  // 持久化
  useEffect(() => {
    if (helperMessages.length > 0) {
      localStorage.setItem(`zhixueban-helper-${sectionKey}`, JSON.stringify(helperMessages));
    }
  }, [helperMessages, sectionKey]);

  const stageLabel = stage === STAGE.QUIZ ? "小测中" : "练习中";

  async function sendHelperMessage() {
    const text = helperInput.trim();
    if (!text || helperLoading) return;
    setHelperInput("");
    setHelperLoading(true);

    const updated = [...helperMessages, { role: "user", content: text }];
    setHelperMessages(updated);

    try {
      const config = getApiConfig();
      const res = await fetch("/api/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
          messages: [
            {
              role: "system",
              content: `你是智学伴的 AI 学习助手。学生正在${stageLabel}。

根据以下授课内容回答学生的问题：
${lecture.slice(0, 1500)}

⚠️ 重要规则：
- 只解释概念、定义、原理，不透露任何题目的答案
- 不给解题思路或提示
- 如果学生的问题直接问某道题怎么做、答案是什么，委婉拒绝并建议他先自己思考
- 回答简洁，50-150字即可
- 态度友好鼓励`,
            },
            ...updated,
          ],
          maxTokens: 500,
        }),
      });
      const data = await res.json();
      const reply = data.content || "抱歉，出了点问题。";
      setHelperMessages([...updated, { role: "assistant", content: reply }]);
    } catch (e) {
      setHelperMessages([...updated, { role: "assistant", content: `❌ ${e.message}` }]);
    } finally {
      setHelperLoading(false);
    }
  }

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl transition-all ${
          open
            ? "bg-zinc-700 dark:bg-zinc-300 text-white dark:text-zinc-800 rotate-45"
            : "bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-110"
        }`}
        title="AI 学习助手 — 只解释概念，不透露答案"
      >
        {open ? "+" : "💬"}
        {!open && helperMessages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {helperMessages.filter((m) => m.role === "assistant").length}
          </span>
        )}
      </button>

      {/* 悬浮聊天窗 */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 flex flex-col overflow-hidden"
          style={{ maxHeight: "70vh" }}>
          {/* 标题栏 */}
          <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
            <div>
              <span className="font-medium text-sm">💬 AI 学习助手</span>
              <span className="text-xs text-indigo-200 ml-2">{stageLabel}</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-indigo-200 hover:text-white text-lg leading-none">✕</button>
          </div>
          <div className="text-xs text-indigo-100 bg-indigo-700 px-4 py-1.5">
            ⚠️ 只解释概念，不透露答案或解题思路
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[400px]">
            {helperMessages.length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-8">
                学习中遇到不懂的概念？<br />问我，但我不告诉你答案 😊
              </p>
            )}
            {helperMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                }`}>
                  <MarkdownRenderer content={msg.content} />
                </div>
              </div>
            ))}
            {helperLoading && (
              <div className="flex justify-start">
                <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2">
                  <span className="text-xs text-zinc-400 animate-pulse">思考中...</span>
                </div>
              </div>
            )}
            <div ref={helperEndRef} />
          </div>

          {/* 输入 */}
          <div className="border-t border-zinc-200 dark:border-zinc-700 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={helperInput}
                onChange={(e) => setHelperInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendHelperMessage()}
                placeholder="问概念，不问答案..."
                disabled={helperLoading}
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
              />
              <button
                onClick={sendHelperMessage}
                disabled={!helperInput.trim() || helperLoading}
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                问
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ===================== AI Prompts =====================
function lectureSystemPrompt(courseTitle, chapterTitle, sectionTitle) {
  return `你是智学伴的 AI 讲师。讲解课程内容。

课程：${courseTitle}
章节：${chapterTitle}
本节：${sectionTitle}

要求：
- 通俗易懂，适当举例
- 层次清晰（概念 → 详解 → 举例 → 小结）
- 涉及公式用 LaTeX（行内 $...$，块级 $$...$$）
- 500-800字，Markdown格式`;
}

function quizGenPrompt(courseTitle, lecture) {
  return `你是智学伴的出题老师。根据以下授课内容出 3-5 道小测验题。

课程：${courseTitle}
授课内容：${lecture.slice(0, 2000)}

出题要求：
- 题型多样（单选、填空、简答）
- 覆盖本节核心知识点
- 难度由浅入深
- 每道题附上正确答案

返回 JSON（不要 markdown 代码块）：
{
  "questions": [
    {
      "type": "choice|fill|short",
      "question": "题目内容",
      "options": ["A. x", "B. y", "C. z"],  // 仅选择题需要
      "answer": "正确答案"
    }
  ]
}`;
}

function practiceGenPrompt(courseTitle, lecture, weakPoints) {
  return `你是智学伴的练习老师。根据以下内容和学生的薄弱点，出 3-4 道针对性练习。

课程：${courseTitle}
薄弱点：${weakPoints}
授课内容：${lecture.slice(0, 1500)}

返回 JSON：{"questions":[{"type":"choice|fill|short","question":"...","answer":"..."}]}`;
}

// ===================== 默认导出 =====================
export default function LearnPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-zinc-400">加载中...</div>}>
      <LearnContent />
    </Suspense>
  );
}
