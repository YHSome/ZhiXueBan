"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiConfig } from "@/lib/api-key";
import { getAllCourses, getCourse, deleteCourse } from "@/lib/courses";
import { getAllExams, deleteExam } from "@/lib/exams";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import TokenToast, { streamAiCall } from "@/components/TokenToast";

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
  async function aiCall(messages, maxTokens = 20000) {
    const config = getApiConfig();
    return streamAiCall({
      apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
      messages, maxTokens,
    });
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
      // 后台预生成小测题目
      prefetchNextStage();
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
    // 已有小测数据且不是错误 → 直接恢复
    if (cache.quiz?.questions?.length > 0 && cache.quiz.questions[0]?.type !== "error") {
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
      ], 20000);

      // 解析 JSON
      let quizData;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        quizData = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      } catch {
        try {
          quizData = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
        } catch {
          throw new Error("AI 出题格式异常，请重试");
        }
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
  async function submitQuiz(force = false) {
    const key = activeKey();
    const cache = activeCache();
    // 已批改过且非强制 → 直接恢复
    if (!force && cache.review) {
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
1. 选择题、填空题、计算题：只有"对"和"错"两种结果。答对即判对，答错即判错。格式问题（如多写了一个标点、大小写不同）不影响正确性，只要核心答案对就判对。
2. 简答题：可以有"半对"——学生答对了部分要点但不完整时，判半对并注明得分比例。
3. 学生用超纲方法答对了——必须判对。不拘泥于章节范围。
4. 当不确定时，倾向判对。

每题都写：
- verdict: "correct" | "wrong" | "partial"
- 如果是 "partial"，额外给 score（0-1之间的小数，如0.5表示得50%分）
- 详细解题步骤（Markdown，有公式用 LaTeX）
- 简短点评

评分规则：每题基准分=100÷题目总数。"correct"得满分，"wrong"得0分，"partial"得基准分×score。最终总分四舍五入。

返回 JSON（不要 markdown 代码块）：
{
  "results": [
    {
      "verdict": "correct",
      "score": null,
      "steps": "详细解题步骤（用Markdown，有公式用LaTeX）",
      "feedback": "点评"
    },
    {
      "verdict": "partial",
      "score": 0.5,
      "steps": "...",
      "feedback": "答对了XX部分，但YY部分有遗漏"
    }
  ],
  "score": 88,
  "weakPoints": ["薄弱点"],
  "suggestion": "学习建议"
}`,
        },
        { role: "user", content: `学生答题情况：\n${qaText}` },
      ], 20000);

      let review;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        review = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      } catch {
        try { review = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); } catch { throw new Error("批改结果异常，请重试"); }
      }

      // 标记结果，附上解题步骤
      const reviewedQuestions = questions.map((q, i) => {
        const r = review.results?.[i] || {};
        return {
          ...q,
          verdict: r.verdict || (r.correct ? "correct" : "wrong"), // 兼容旧格式
          partialScore: r.score ?? null,
          steps: r.steps || "",
          feedback: r.feedback || "",
        };
      });

      updateCache(key, {
        quiz: { ...cache.quiz, questions: reviewedQuestions },
        review: { score: review.score, weakPoints: review.weakPoints || [], suggestion: review.suggestion || "" },
        stage: STAGE.REVIEW,
      });
    } catch (e) {
      updateCache(key, { review: { score: 0, weakPoints: [], suggestion: `批改失败：${e.message}` }, stage: STAGE.REVIEW });
    } finally {
      setLoading(false);
      prefetchNextStage();
    }
  }

  // ---------- 更多练习 ----------
  async function startPractice() {
    const key = activeKey();
    const cache = activeCache();
    // 已有练习数据且不是错误 → 直接恢复
    if (cache.practice?.questions?.length > 0 && cache.practice.questions[0]?.type !== "error") {
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
      ], 20000);

      let practiceData;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        practiceData = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      } catch {
        try { practiceData = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); } catch {
          // 输出原始回复的前 200 字符方便排查
          const snippet = raw.slice(0, 200).replace(/\n/g, " ");
          throw new Error(`解析失败：${snippet}...`);
        }
      }

      if (!practiceData.questions || practiceData.questions.length === 0) {
        throw new Error("AI 未生成题目，请重试");
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

  async function submitPractice(force = false) {
    const key = activeKey();
    const cache = activeCache();
    // 已批改过且非强制 → 直接恢复
    if (!force && cache.practiceReview) {
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
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        review = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      } catch {
        try { review = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); } catch { throw new Error("批改结果异常，请重试"); }
      }

      const reviewedQuestions = questions.map((q, i) => {
        const r = review.results?.[i] || {};
        return {
          ...q,
          verdict: r.verdict || (r.correct ? "correct" : "wrong"),
          partialScore: r.score ?? null,
          feedback: r.feedback || "",
        };
      });

      updateCache(key, {
        practice: { ...cache.practice, questions: reviewedQuestions },
        practiceReview: { score: review.score, suggestion: review.suggestion || "", readyForTeachBack: review.readyForTeachBack !== false },
        stage: STAGE.PRACTICE_REVIEW,
      });
    } catch (e) {
      updateCache(key, { practiceReview: { score: 0, suggestion: `批改失败：${e.message}`, readyForTeachBack: true }, stage: STAGE.PRACTICE_REVIEW });
    } finally {
      setLoading(false);
      prefetchNextStage();
    }
  }

  // ---------- 以教促学 ----------
  async function startTeachBack() {
    const key = activeKey();
    const cache = activeCache();

    // 每次进入都重新收集最新错题
    const quizQuestions = cache.quiz?.questions || [];
    const practiceQuestions = cache.practice?.questions || [];
    const wrongQuestions = [
      ...quizQuestions.filter((q) => q.verdict !== "correct"),
      ...practiceQuestions.filter((q) => q.verdict !== "correct"),
    ];

    // 没有错题 → 直接通关！
    if (wrongQuestions.length === 0) {
      updateCache(key, { stage: STAGE.COMPLETED, teachBack: { approved: true, wrongQuestions: [], chatMessages: [] } });
      return;
    }

    const existingChat = cache.teachBack?.chatMessages || [];

    updateCache(key, {
      teachBack: {
        wrongQuestions,
        chatMessages: wrongQuestions.length > 0 ? existingChat : [],
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

你的角色：扮演一位"学生"，听对方讲解这道题。

⚠️ 核心原则——差不多懂就行，不要抠字眼：
- 学生用大白话讲清楚了思路 → 立刻通过，不要逼他用术语或算式
- 学生表现出对概念的理解，即使表达不完美 → 通过
- 只在学生明显逻辑不通、完全没搞懂时才追问
- 不要反复追问"为什么用加法不用减法"之类的细枝末节
- 最多追问一次，第二次还讲得通就通过

判断标准：这学生是真懂还是蒙的？
- 真懂（哪怕最土的话）→ 直接 ✅ APPROVED
- 蒙的（逻辑矛盾）→ 温和追问一次

回复格式：
- 通过：回复 "✅ APPROVED: 你的理解是对的！" 并简单肯定
- 追问：用口语化语气简短追问一句，不要长篇大论`,
        },
        ...updated,
      ], 1000);

      const approved = answer.includes("✅ APPROVED");
      const newMessages = [...updated, { role: "assistant", content: answer }];

      if (approved) {
        // 这道错题通过，看还有没有下一道
        const nextIndex = tb.currentWrongIndex + 1;
        if (nextIndex < tb.wrongQuestions.length) {
          // 插入系统提示，告诉学生切换到下一题
          const nextQ = tb.wrongQuestions[nextIndex];
          const sysMsg = {
            role: "assistant",
            content: `✅ 这道题通过了！下面是第 ${nextIndex + 1}/${tb.wrongQuestions.length} 道错题：\n\n**${nextQ.question}**`,
          };
          updateCache(key, {
            teachBack: { ...tb, chatMessages: [...newMessages, sysMsg], currentWrongIndex: nextIndex },
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

  // 重新小测：清除数据，重新出题
  async function resetQuiz() {
    const key = activeKey();
    updateCache(key, { quiz: undefined, review: undefined, stage: STAGE.QUIZ });
    await startQuiz();
  }

  // 重新练习：清除练习数据 + 以教促学进度
  async function resetPractice() {
    const key = activeKey();
    updateCache(key, { practice: undefined, practiceReview: undefined, teachBack: undefined, stage: STAGE.PRACTICE });
    await startPractice();
  }

  // 重新批改小测（保留题目和答案，强制重新打分）
  async function reGradeQuiz() {
    await submitQuiz(true);
  }

  // 重新批改练习
  async function reGradePractice() {
    await submitPractice(true);
  }

  // 后台预生成下一阶段内容（阅读时出小测，小测完出练习，练习完准备以教促学）
  async function prefetchNextStage() {
    const key = activeKey();
    const cache = activeCache();
    const stage = cache?.stage;

    // 阅读阶段 → 后台出小测题
    if (stage === STAGE.READING && cache.lecture && (!cache.quiz || cache.quiz.questions?.[0]?.type === "error")) {
      try {
        const raw = await aiCall([
          { role: "system", content: quizGenPrompt(course.courseTitle, cache.lecture) },
          { role: "user", content: "请根据上面的授课内容生成小测验。" },
        ], 20000);
        let quizData;
        try {
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          quizData = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        } catch {
          try { quizData = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); } catch { return; }
        }
        const questions = (quizData.questions || []).map((q) => ({ ...q, userAnswer: "" }));
        updateCache(key, { quiz: { questions } });
      } catch { /* 后台失败静默，用户点的时候再试 */ }
    }

    // 小测批改完 → 后台出练习
    if ((stage === STAGE.REVIEW || stage === STAGE.QUIZ) && cache.review && !cache.practice) {
      try {
        const weakPoints = cache.review?.weakPoints?.join("、") || "综合";
        const raw = await aiCall([
          { role: "system", content: practiceGenPrompt(course.courseTitle, cache.lecture, weakPoints) },
          { role: "user", content: "请根据薄弱点生成针对性练习。" },
        ], 20000);
        let practiceData;
        try {
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          practiceData = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        } catch {
          try { practiceData = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); } catch { return; }
        }
        const questions = (practiceData.questions || []).map((q) => ({ ...q, userAnswer: "" }));
        updateCache(key, { practice: { questions } });
      } catch { /* 静默 */ }
    }

    // 练习批改完 → 后台准备以教促学（收集最新错题）
    if (stage === STAGE.PRACTICE_REVIEW && cache.practiceReview && !cache.teachBack?.chatMessages?.length) {
      const allQuestions = [
        ...(cache.quiz?.questions || []),
        ...(cache.practice?.questions || []),
      ];
      const wrongQuestions = allQuestions.filter((q) => q.verdict !== "correct");
      if (wrongQuestions.length > 0) {
        updateCache(key, {
          teachBack: { wrongQuestions, chatMessages: [], approved: false, currentWrongIndex: 0 },
        });
      }
    }
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
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-zinc-500">{c.chapters?.length || 0} 个章节</p>
                    <CourseProgressBar course={c} />
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); if (confirm(`删除「${c.courseTitle}」？`)) { deleteCourse(c.id); setAllCourses(getAllCourses()); } }}
                  className="text-zinc-400 hover:text-red-500 text-sm px-3 py-1 rounded hover:bg-red-50 transition-colors">🗑️</button>
              </div>
            ))}
          </div>
        )}

        <ExamSection />
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

      {/* 小测（提交后结果原地展示） */}
      {(stage === STAGE.QUIZ || stage === STAGE.REVIEW) && (
        <>
          {cache.review ? (
            /* 已提交 → 题目(只读) + 结果一页展示 */
            <QuizReviewCombined
              title="✍️ 小测验"
              questions={cache.quiz?.questions || []}
              review={cache.review || {}}
              onSubmit={submitQuiz}
              onPractice={startPractice}
              onTeachBack={startTeachBack}
              onRetry={restartSection}
              loading={loading}
            />
          ) : (
            /* 未提交 → 做题 */
            <QuizPanel
              questions={cache.quiz?.questions || []}
              onAnswerChange={(qi, val) => {
                const qs = [...cache.quiz.questions];
                qs[qi] = { ...qs[qi], userAnswer: val };
                updateCache(key, { quiz: { ...cache.quiz, questions: qs } });
              }}
              onSubmit={submitQuiz}
              onRetry={() => {
                updateCache(key, { quiz: undefined });
                startQuiz();
              }}
              loading={loading}
            />
          )}
        </>
      )}

      {/* 针对性练习（提交后结果原地展示） */}
      {(stage === STAGE.PRACTICE || stage === STAGE.PRACTICE_REVIEW) && (
        <>
          {cache.practiceReview ? (
            <QuizReviewCombined
              title="📝 针对性练习"
              questions={cache.practice?.questions || []}
              review={cache.practiceReview || {}}
              onSubmit={submitPractice}
              onTeachBack={startTeachBack}
              onRetry={restartSection}
              onReset={resetPractice}
              onReGrade={reGradePractice}
              loading={loading}
              hidePractice
            />
          ) : (
            <QuizPanel
              title="📝 针对性练习"
              questions={cache.practice?.questions || []}
              onAnswerChange={(qi, val) => {
                const qs = [...cache.practice.questions];
                qs[qi] = { ...qs[qi], userAnswer: val };
                updateCache(key, { practice: { ...cache.practice, questions: qs } });
              }}
              onSubmit={submitPractice}
              onRetry={() => {
                updateCache(key, { practice: undefined });
                startPractice();
              }}
              loading={loading}
            />
          )}
        </>
      )}

      {/* 悬浮 AI 助手（阅读、小测、练习阶段显示）*/}
      {(stage !== STAGE.IDLE && stage !== STAGE.TEACH_BACK && stage !== STAGE.COMPLETED) && (
        <FloatingHelper
          lecture={cache.lecture || ""}
          stage={stage}
          sectionKey={activeKey()}
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
    { key: STAGE.PRACTICE, label: "练习", icon: "📝" },
    { key: STAGE.TEACH_BACK, label: "以教促学", icon: "🎓" },
    { key: STAGE.COMPLETED, label: "完成", icon: "🏆" },
  ];

  // 判断某个阶段是否到达过（有对应数据）
  function hasReached(stageKey) {
    if (!sectionCache) return false;
    switch (stageKey) {
      case STAGE.READING: return !!sectionCache.lecture;
      case STAGE.QUIZ: return !!sectionCache.quiz;
      case STAGE.PRACTICE: return !!sectionCache.practice;
      case STAGE.TEACH_BACK: return !!sectionCache.teachBack;
      case STAGE.COMPLETED: return sectionCache.stage === STAGE.COMPLETED || sectionCache.teachBack?.approved;
      default: return false;
    }
  }

  // 将实际阶段映射到显示阶段
  function displayStage(actualStage) {
    if (actualStage === STAGE.REVIEW) return STAGE.QUIZ;
    if (actualStage === STAGE.PRACTICE_REVIEW) return STAGE.PRACTICE;
    return actualStage;
  }
  const currentDisplayStage = displayStage(currentStage);
  const currentIdx = stages.findIndex((x) => x.key === currentDisplayStage);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((s, i) => {
        const isActive = i <= currentIdx || currentStage === STAGE.COMPLETED;
        const isCurrent = s.key === currentDisplayStage;
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
function QuizPanel({ title = "✍️ 小测验", questions, onAnswerChange, onSubmit, loading, onRetry }) {
  if (questions.length === 0) return <LoadingHint text="AI 正在出题..." />;

  // 出题失败 → 显示重试按钮
  if (questions.length === 1 && questions[0]?.type === "error") {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-red-500 dark:text-red-400 mb-2">出题失败</p>
        <p className="text-sm text-zinc-500 mb-6">{questions[0].question}</p>
        {onRetry && (
          <button onClick={onRetry}
            className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors">
            🔄 重新出题
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xl font-bold mb-6 text-black dark:text-zinc-50">{title}</h3>
      <div className="space-y-6 mb-6">
        {questions.map((q, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <div className="font-medium text-black dark:text-zinc-100 mb-3">
              {i + 1}. <MarkdownRenderer content={q.question} />
            </div>
            {q.options?.length > 0 ? (
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <label key={oi} className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${loading ? "opacity-60" : "cursor-pointer"} ${q.userAnswer === opt ? "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-transparent"}`}>
                    <input type="radio" name={`q-${i}`} checked={q.userAnswer === opt} onChange={() => onAnswerChange(i, opt)}
                      disabled={loading}
                      className="text-indigo-600 focus:ring-indigo-500" />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300"><MarkdownRenderer content={String(opt)} /></span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea value={q.userAnswer || ""} onChange={(e) => onAnswerChange(i, e.target.value)}
                disabled={loading}
                rows={3} placeholder="请输入你的答案..."
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none resize-y text-sm disabled:opacity-60" />
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

// 试卷列表（课程列表页用）
function ExamSection() {
  const router = useRouter();
  const [exams, setExams] = useState([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setExams(getAllExams());
    // 每秒刷新以更新进行中的倒计时
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  function getRemainingInfo(exam) {
    if (exam.status !== "in_progress" || !exam.timeLimit) return null;
    const total = exam.timeLimit * 60;
    const elapsed = (exam.elapsedSeconds || 0) + (exam.startedAt ? Math.floor((now - exam.startedAt) / 1000) : 0);
    const remaining = Math.max(0, total - elapsed);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const urgent = remaining < 300;
    return { mins, secs, urgent, remaining };
  }

  if (exams.length === 0) {
    return (
      <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-black dark:text-zinc-50">📋 我的试卷</h2>
          <button onClick={() => router.push("/exam/create")} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
            + 新建试卷
          </button>
        </div>
        <p className="text-zinc-400 text-sm text-center py-8">还没有试卷，AI 出卷模拟真实考试</p>
      </div>
    );
  }

  return (
    <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-black dark:text-zinc-50">📋 我的试卷</h2>
        <button onClick={() => router.push("/exam/create")} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
          + 新建试卷
        </button>
      </div>
      <div className="space-y-3">
        {exams.map((e) => (
          <div key={e.id} onClick={() => {
            router.push(`/exam/take?examId=${e.id}`)
          }}
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 hover:shadow-md hover:border-indigo-300 cursor-pointer flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-black dark:text-zinc-100 mb-1 truncate">{e.title}</h3>
              <div className="flex items-center gap-3 text-sm text-zinc-500">
                <span>{e.courseTitle}</span>
                <span>·</span>
                <span>{e.questions?.length || 0} 题</span>
                <span>·</span>
                {e.status === "in_progress" && e.timeLimit > 0 ? (
                  (() => {
                    const info = getRemainingInfo(e);
                    return info ? (
                      <>
                        <span>·</span>
                        <span className={`font-mono ${info.urgent ? "text-red-500 animate-pulse" : "text-amber-500"}`}>
                          ⏱ 剩余 {info.mins}:{String(info.secs).padStart(2, "0")}
                        </span>
                      </>
                    ) : <span>·</span>;
                  })()
                ) : (
                  <span>·</span>
                )}
                <span>{e.timeLimit > 0 ? `${e.timeLimit} 分钟` : "不限时"}</span>
                {e.status === "completed" && e.result && (
                  <>
                    <span>·</span>
                    <span className={e.result.totalScore >= 60 ? "text-green-500" : "text-red-500"}>
                      {e.result.totalScore}/100
                    </span>
                  </>
                )}
                {e.status === "ready" && <span className="text-indigo-500">待考试</span>}
              </div>
            </div>
            <button onClick={(ev) => { ev.stopPropagation(); if (confirm("删除试卷？")) { deleteExam(e.id); setExams(getAllExams()); } }}
              className="text-zinc-400 hover:text-red-500 text-sm px-3 py-1 rounded hover:bg-red-50 transition-colors">🗑️</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// 课程进度条（课程列表页用）
function CourseProgressBar({ course }) {
  const [mounted, setMounted] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    const cacheKey = `zhixueban-cache-${course.id}`;
    let total = 0;
    (course.chapters || []).forEach((ch) => {
      (ch.sections || []).forEach(() => { total++; });
    });

    let done = 0;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cache = JSON.parse(raw);
        for (let ci = 0; ci < (course.chapters || []).length; ci++) {
          for (let si = 0; si < ((course.chapters[ci]?.sections) || []).length; si++) {
            if (cache[`${ci}-${si}`]?.stage === "completed") done++;
          }
        }
      }
    } catch {}

    setProgress({ done, total });
    setMounted(true);
  }, [course.id]);

  // 服务端不渲染，等客户端挂载后再渲染，避免 hydration 不匹配
  if (!mounted || progress.total === 0) return null;

  const pct = Math.round((progress.done / progress.total) * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-zinc-400">{progress.done}/{progress.total}</span>
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
                  <div className="text-sm font-medium text-black dark:text-zinc-100">{i + 1}. <MarkdownRenderer content={q.question} /></div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    <span className="text-xs text-zinc-400">你的答案：{q.userAnswer || "（未作答）"}</span>
                    {!q.correct && <div className="text-xs text-green-600 dark:text-green-400">正确答案：<MarkdownRenderer content={q.answer} /></div>}
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
  const currentIdx = teachBack.currentWrongIndex || 0;
  const total = teachBack.wrongQuestions?.length || 0;
  const wrongQ = teachBack.wrongQuestions?.[currentIdx];
  const messages = teachBack.chatMessages || [];
  const progressPct = total > 0 ? Math.round((currentIdx / total) * 100) : 0;

  return (
    <div>
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-xl border-2 border-amber-300 dark:border-amber-700 p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🎓</span>
          <h3 className="font-semibold text-amber-800 dark:text-amber-300">以教促学</h3>
          {total > 0 && (
            <span className="ml-auto text-sm font-bold text-amber-700 dark:text-amber-300">
              错题 {currentIdx + 1}/{total}
            </span>
          )}
        </div>

        {/* 进度条 */}
        {total > 0 && (
          <div className="w-full h-2 bg-amber-200 dark:bg-amber-800 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {wrongQ && (
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
            <p className="text-sm font-medium text-black dark:text-zinc-100 mb-1">{wrongQ.question}</p>
            <div className="flex gap-4 mt-2">
              <span className="text-xs text-zinc-400">正确答案：<MarkdownRenderer content={wrongQ.answer} /></span>
              <span className="text-xs text-red-500">你的答案：{wrongQ.userAnswer || "（未作答）"}</span>
            </div>
          </div>
        )}
      </div>

      {/* 还没开始讲，给提示 */}
      {messages.length === 0 && wrongQ && (
        <div className="text-center py-4 mb-2">
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            👆 向 AI 讲解这道题你是怎么想的，你来讲，AI 来听
          </p>
        </div>
      )}

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

// ===================== 小测/练习 + 批改合并展示 =====================
function QuizReviewCombined({ title, questions, review, onSubmit, onPractice, onTeachBack, onRetry, onReset, onReGrade, loading, hidePractice }) {
  const correctCount = questions.filter((q) => q.verdict === "correct").length;
  const partialCount = questions.filter((q) => q.verdict === "partial").length;
  const wrongCount = questions.filter((q) => q.verdict === "wrong").length;

  return (
    <div>
      <h3 className="text-xl font-bold mb-4 text-black dark:text-zinc-50">{title}</h3>

      {/* 分数卡片 */}
      <div className={`rounded-xl p-5 mb-6 text-center ${review.score >= 80 ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" : review.score >= 60 ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800" : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"}`}>
        <div className="text-3xl font-bold mb-1 text-black dark:text-zinc-100">{review.score}<span className="text-base text-zinc-400">/100</span></div>
        <p className="text-sm text-zinc-500 mb-1">
          正确 {correctCount} · 半对 {partialCount} · 错误 {wrongCount}
        </p>
        {review.suggestion && <p className="text-xs text-zinc-600 dark:text-zinc-400">{review.suggestion}</p>}
        {review.weakPoints?.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center mt-2">
            {review.weakPoints.map((w, i) => (
              <span key={i} className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">薄弱：{w}</span>
            ))}
          </div>
        )}
      </div>

      {/* 逐题结果（只读） */}
      <div className="space-y-3 mb-6">
        {questions.map((q, i) => {
          const v = q.verdict || "wrong";
          const isCorrect = v === "correct";
          const isPartial = v === "partial";
          const borderColor = isCorrect ? "border-green-200 dark:border-green-800" : isPartial ? "border-amber-300 dark:border-amber-700" : "border-red-200 dark:border-red-800";
          const bgColor = isCorrect ? "bg-green-50/50 dark:bg-green-900/10" : isPartial ? "bg-amber-50/50 dark:bg-amber-900/10" : "bg-red-50/50 dark:bg-red-900/10";
          const icon = isCorrect ? "✅" : isPartial ? "⚠️" : "❌";

          return (
            <div key={i} className={`rounded-xl border overflow-hidden ${bgColor} ${borderColor}`}>
              <div className="p-4">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg">{icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-black dark:text-zinc-100">
                      {i + 1}. <MarkdownRenderer content={q.question} />
                      {isPartial && q.partialScore != null && (
                        <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-normal">
                          （得 {Math.round(q.partialScore * 100)}% 分）
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      <span className="text-xs text-zinc-400">你的答案：{q.userAnswer || "（未作答）"}</span>
                      {!isCorrect && <div className="text-xs text-green-600 dark:text-green-400">正确答案：<MarkdownRenderer content={q.answer} /></div>}
                    </div>
                    {q.feedback && <div className="text-xs text-zinc-500 mt-1 italic"><MarkdownRenderer content={q.feedback} /></div>}
                  </div>
                </div>
              </div>
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
          );
        })}
      </div>

      {loading && <LoadingHint text="AI 正在准备..." />}

      {/* 操作按钮 */}
      <div className="space-y-3">
        {!hidePractice ? (
          <button onClick={onPractice} disabled={loading}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            📝 做针对性练习
          </button>
        ) : (
          wrongCount > 0 ? (
            <button onClick={onTeachBack} disabled={loading}
              className="w-full py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors">
              🎓 进入以教促学（错题复盘）
            </button>
          ) : (
            <button onClick={onTeachBack} disabled={loading}
              className="w-full py-3 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 disabled:opacity-50 transition-colors">
              🏆 全对通关！
            </button>
          )
        )}

        {(onReset || onReGrade) && (
          <div className="flex gap-3">
            {onReset && (
              <button onClick={onReset} disabled={loading}
                className="flex-1 py-3 rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors text-sm">
                🔄 重新练习
              </button>
            )}
            {onReGrade && (
              <button onClick={onReGrade} disabled={loading}
                className="flex-1 py-3 rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors text-sm">
                🔍 重新批改
              </button>
            )}
          </div>
        )}
        <button onClick={onRetry} disabled={loading}
          className="w-full py-3 rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors">
          🔄 重新学习本节（从阅读开始）
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

  // 小节切换时：加载该节的对话记录，重置输入和窗口状态
  useEffect(() => {
    const saved = localStorage.getItem(`zhixueban-helper-${sectionKey}`);
    if (saved) {
      try { setHelperMessages(JSON.parse(saved)); } catch { setHelperMessages([]); }
    } else {
      setHelperMessages([]);
    }
    setHelperInput("");
    setOpen(false);
  }, [sectionKey]);

  // 持久化
  useEffect(() => {
    if (helperMessages.length > 0) {
      localStorage.setItem(`zhixueban-helper-${sectionKey}`, JSON.stringify(helperMessages));
    }
  }, [helperMessages, sectionKey]);

  const isExam = stage === STAGE.QUIZ || stage === STAGE.REVIEW || stage === STAGE.PRACTICE || stage === STAGE.PRACTICE_REVIEW;
  const stageLabel = stage === STAGE.READING ? "阅读中" : isExam ? "考试中" : "学习中";

  async function sendHelperMessage() {
    const text = helperInput.trim();
    if (!text || helperLoading) return;
    setHelperInput("");
    setHelperLoading(true);

    const updated = [...helperMessages, { role: "user", content: text }];
    setHelperMessages(updated);

    try {
      const config = getApiConfig();
      const reply = await streamAiCall({
        apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
        maxTokens: 500,
        messages: [
          {
            role: "system",
            content: isExam
              ? `你是智学伴的 AI 学习助手。学生正在${stageLabel}。

根据以下授课内容回答学生的问题：
${lecture.slice(0, 1500)}

⚠️ 重要规则：
- 只解释概念、定义、原理，不透露任何题目的答案
- 不给解题思路或提示
- 如果学生的问题直接问某道题怎么做、答案是什么，委婉拒绝并建议他先自己思考
- 回答简洁，50-150字即可
- 态度友好鼓励`
                : `你是智学伴的 AI 学习助手。学生正在阅读授课内容。

根据以下授课内容回答学生的问题：
${lecture.slice(0, 1500)}

要求：
- 耐心解答任何问题，可以详细解释
- 可以举例帮助理解
- 涉及数学公式请用 $...$（行内）或 $$...$$（块级）LaTeX 格式
- 不要用 \\(...\\) 或 \\[...\\] 这种写法
- 回答清晰有条理
- 态度友好鼓励`,
            },
            ...updated,
          ],
      });
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
        title={isExam ? "AI 学习助手 — 只解释概念，不透露答案" : "AI 学习助手 — 随时提问"}
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
            {isExam ? "⚠️ 只解释概念，不透露答案或解题思路" : "💡 遇到不懂的随时问，AI 为你详细解答"}
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

⚠️ 出题原则：
- ⛔ 纯文字题目：不得引用图片、图形、图表、表格。不得出现"如图所示"、"下图"、"看图"、"数一数下面"等需要视觉的表述。所有信息必须用文字描述。
- 题目自包含：题目本身要说清所有条件和范围，不要让学生猜测"老师想考什么范围"
- 测试理解而非挖坑：考学生对知识的理解，不要出那种"数学上对但超范围所以判错"的题
- 如果学生的思路在逻辑上正确，即使和标准答案角度不同，也应当认可
- 题型多样（单选、填空、简答），难度由浅入深
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
  return `你是智学伴的练习老师。根据以下内容和学生薄弱点，出 3-4 道针对性练习。

课程：${courseTitle}
薄弱点：${weakPoints}
授课内容：${lecture.slice(0, 1500)}

出题原则：
- 纯文字，不得引用图片
- 公式必须用 $...$（行内）$$...$$（块级），禁止用 \\(...\\)
- options 仅选择题需要，填空/简答不要带 options 字段
- 每题附正确答案 answer

返回 JSON（不要 markdown 代码块）：
{"questions":[{"type":"choice","question":"...","options":["A","B","C","D"],"answer":"B"},{"type":"fill","question":"...","answer":"..."},{"type":"short","question":"...","answer":"..."}]}`;
}

// ===================== 默认导出 =====================
export default function LearnPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-zinc-400">加载中...</div>}>
      <LearnContent />
      <TokenToast />
    </Suspense>
  );
}
