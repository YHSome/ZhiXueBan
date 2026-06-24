import Link from "next/link";

// 首页 —— 智学伴：基于生成式 AI 的异步学习平台
export default function Home() {
  // 核心功能介绍
  const features = [
    {
      icon: "🤖",
      title: "AI 智能答疑",
      desc: "学习中遇到问题随时提问，支持文字、图片、PDF 上传，AI 即时解答",
    },
    {
      icon: "📝",
      title: "AI 自动出题",
      desc: "根据你的学习内容，AI 自动生成练习题和测验，巩固所学知识",
    },
    {
      icon: "🛤️",
      title: "个性化学习路径",
      desc: "AI 分析你的水平和目标，为你定制专属的学习计划和进度",
    },
    {
      icon: "⏰",
      title: "真正的异步学习",
      desc: "不限时间地点，按自己的节奏学习。AI 助教 24 小时在线",
    },
    {
      icon: "📚",
      title: "智能知识库",
      desc: "上传图文、PDF、视频等学习资料，AI 自动提取知识点、生成摘要",
    },
    {
      icon: "📊",
      title: "学习报告",
      desc: "AI 自动分析你的学习数据，生成薄弱点分析和改进建议",
    },
    {
      icon: "📋",
      title: "AI 考试模拟",
      desc: "模拟真实考试环境，AI 自动批改并给出详细解析",
    },
    {
      icon: "👥",
      title: "协作讨论",
      desc: "与同学异步讨论问题，AI 参与引导，碰撞出更多思路",
    },
  ];

  return (
    <div>
      {/* 顶部横幅 */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 rounded-2xl p-10 mb-12 text-white text-center">
        <h2 className="text-4xl font-bold mb-3">
          基于生成式 AI 的异步学习方案
        </h2>
        <p className="text-lg text-purple-100 max-w-2xl mx-auto mb-6">
          突破时间和空间的限制，让 AI 成为你的私人助教。
          随时学、随时问、随时练——学习不再受制于课堂。
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/setup"
            className="bg-white text-purple-700 font-semibold px-8 py-3 rounded-lg hover:bg-purple-50 transition-colors text-lg inline-block"
          >
            开始使用 →
          </Link>
          <Link
            href="/learn"
            className="border border-white/40 text-white font-semibold px-8 py-3 rounded-lg hover:bg-white/10 transition-colors text-lg inline-block"
          >
            已有课程
          </Link>
        </div>
      </div>

      {/* ===== 以教促学：核心亮点 ===== */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-2xl border-2 border-amber-300 dark:border-amber-700 p-10 mb-12">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          <div className="flex-1 text-center lg:text-left">
            <span className="inline-block bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full mb-4">
              核心特色
            </span>
            <h3 className="text-3xl font-bold mb-4 text-black dark:text-zinc-50">
              🎓 以教促学
            </h3>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-3">
              费曼学习法的 AI 实践——<strong>教给别人，才是最好的学习。</strong>
            </p>
            <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4">
              每当你完成练习、订正完错题之后，系统会要求你<strong>向 AI 讲解这道题的解题思路</strong>。
              AI 会像一位严格的"学生"，不断追问直到确认你真正理解了——讲不清楚的地方，就是你还没学会的地方。
            </p>
            <div className="flex flex-wrap gap-3">
              {["订正错题 →", "向AI讲解思路 →", "AI追问验证 →", "真正掌握 ✓"].map((step) => (
                <span
                  key={step}
                  className="bg-white dark:bg-zinc-800 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-3 py-1 rounded-md text-sm font-medium"
                >
                  {step}
                </span>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 text-8xl">🎓</div>
        </div>
      </div>

      {/* 核心功能 */}
      <h3 className="text-2xl font-bold text-center mb-8 text-black dark:text-zinc-50">
        为什么选择智学伴
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        {features.map((f) => (
          <div
            key={f.title}
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 hover:shadow-lg transition-shadow"
          >
            <div className="text-3xl mb-4">{f.icon}</div>
            <h4 className="text-lg font-semibold mb-2 text-black dark:text-zinc-50">
              {f.title}
            </h4>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
              {f.desc}
            </p>
          </div>
        ))}
      </div>

      {/* 工作流程 */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-10 mb-12">
        <h3 className="text-2xl font-bold text-center mb-10 text-black dark:text-zinc-50">
          三步开始你的学习
        </h3>
        <div className="flex flex-col md:flex-row gap-8 justify-center">
          {[
            { step: "1", title: "选择或上传课程", desc: "从课程库中选择，或上传你自己的学习资料（图文/PDF/视频）" },
            { step: "2", title: "AI 生成学习计划", desc: "AI 分析内容，为你生成个性化学习路径和练习" },
            { step: "3", title: "边学边问边教", desc: "按节奏学习 → AI答疑 → 做练习 → 订正 → 向AI讲解思路" },
          ].map((s) => (
            <div key={s.step} className="flex-1 text-center">
              <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                {s.step}
              </div>
              <h4 className="font-semibold mb-2 text-black dark:text-zinc-50">{s.title}</h4>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
