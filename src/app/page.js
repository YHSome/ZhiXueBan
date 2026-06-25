import Link from "next/link";

// 首页 —— 智学伴：基于生成式 AI 的异步学习平台
export default function Home() {
  // 核心功能介绍
  const features = [
    {
      icon: "📖",
      title: "智能课程生成",
      desc: "描述想学的内容，或上传 PDF/DOCX/PPTX 文件，AI 自动识别章节并拆分为学习单元",
    },
    {
      icon: "🤖",
      title: "AI 授课 + 答疑",
      desc: "AI 讲解每节内容，学习中随时提问。LaTeX 数学公式完美渲染",
    },
    {
      icon: "🎯",
      title: "闯关式学习",
      desc: "阅读 → 小测 → AI 批改 → 针对性练习 → 以教促学 → 通关，一步不能少",
    },
    {
      icon: "📋",
      title: "试卷测评",
      desc: "AI 根据课程自动出卷，或导入已有试卷。限时考试 + AI 批改 + 详细解析",
    },
    {
      icon: "📕",
      title: "错题集",
      desc: "自动收集所有错题，每道题需向 AI 讲解通过才能消除，真正吃透",
    },
    {
      icon: "📊",
      title: "学习报告",
      desc: "完成率、均分、薄弱点一目了然，AI 一键生成个性化学习评价",
    },
    {
      icon: "📚",
      title: "多格式文件解析",
      desc: "支持 PDF、DOCX、PPTX、ZIP，智能提取文字，自动整理知识点",
    },
    {
      icon: "💻",
      title: "桌面应用 + 本地存储",
      desc: "可打包为 Windows 安装包，API Key 和数据只存本地，安全隐私无忧",
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
          突破时空限制，以教促学，让 AI 成为你的私人助教。
          随时学、随时问、随时练——学习不再受制于课堂。
        </p>
        <div className="flex gap-4 justify-center items-center">
          <a
            href="https://github.com/YHSome/ZhiXueBan"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/60 hover:text-white transition-colors"
            title="GitHub 仓库"
          >
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </a>
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
              完成练习、订正完错题之后，<strong>把解题思路讲给 AI 听</strong>。
              AI 判断你是真懂还是蒙的——讲清楚的地方才算真掌握，含糊的地方继续练。错题集里的每道题都要讲通才能消除。
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
            { step: "1", title: "配置 API Key", desc: "支持 DeepSeek、OpenAI 等，Key 仅存本地" },
            { step: "2", title: "创建或导入课程", desc: "描述想学的内容，或上传 PDF/DOCX 文件，AI 自动生成课程" },
            { step: "3", title: "开始闯关学习", desc: "阅读 → 小测 → 练习 → 以教促学 → 通关，AI 全程陪伴" },
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

      {/* 底部版本号 + 链接 */}
      <footer className="text-center mt-16 pb-8">
        <p className="text-xs text-zinc-300 dark:text-zinc-600 mb-1">v1.0.{16}</p>
        <p className="text-xs text-zinc-300 dark:text-zinc-600">
          <a href="https://github.com/YHSome/ZhiXueBan" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 dark:hover:text-zinc-500 transition-colors">GitHub</a>
          <span className="mx-2">·</span>
          <a href="https://zhixueban.vercel.app" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 dark:hover:text-zinc-500 transition-colors">Vercel</a>
        </p>
      </footer>
    </div>
  );
}
