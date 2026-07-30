<p align="center">
  <img src="logo.png" alt="智学伴" width="120" />
</p>

<h1 align="center">智学伴 ZhiXueBan</h1>

<p align="center">
  <a href="https://zhi-xue-ban.vercel.app/">🌐 在线体验</a> &nbsp;|&nbsp;
  <a href="https://github.com/YHSome/ZhiXueBan/releases">📦 下载桌面版</a> &nbsp;|&nbsp;
  <a href="../README.md">📄 完整版</a>
</p>

> ℹ️ 当前为**精简版**。想阅读完整版？→ [📄 完整版](../README.md)

---

## ✨ 核心功能

### 🎓 六阶段学习闭环

```
预习阅读 → 小测验 → AI 批改 → 针对性练习 → 以教促学 → 通关
```

每个阶段由 AI 驱动、数据贯通：讲义中嵌入函数图像让学生直观理解抽象概念；小测题目根据当前难度自适应生成；批改后自动诊断薄弱点并生成针对性练习；以教促学环节 AI 扮演学生角色追问验证——只有真正讲通了，错题才会被消除。

### 📐 数学图形渲染引擎

AI 讲义与题目中可直接嵌入五种类型的函数图像——显函数、隐式方程、多函数对比、分段函数、三维曲面。系统通过七层 API 预处理自动纠正 AI 生成的各种语法变体（缺乘号、指数符号错误、分隔符混用等），确保高渲染成功率。分段函数支持跳跃间断点的开闭区间标记，3D 曲面使用 matplotlib 渲染。

### 🧠 四档自适应难度

| 难度 | 设计目标 | 星级范围 |
|------|---------|---------|
| 🟢 简单 | 基础概念入门，建立学习信心 | 1-3 ★ |
| 🔵 基础 | 理解+应用，巩固知识体系 | 2-4 ★ |
| 🔵 进阶 | 综合分析+多步推理 | 3-6 ★（至少一道 5★） |
| 🔴 挑战 | 竞赛级别深度推理，允许超纲延伸 | 4-6 ★（至少一道 6★） |



### 🔧 技术创新点

1. **双模式智能降级提示词系统**：根据 Python 环境自动切换配图/纯文字指令，首次解决了 AI 教学系统中图形渲染与零门槛使用的矛盾
2. **`[REPLY]` 标记化输出机制**：针对 DeepSeek 等推理模型将回复置于 `reasoning_content` 的问题，设计了标记提取方案，不依赖 API 参数即可正确提取用户可见内容
3. **七层 API 预处理管道**：容忍 AI 输出的各类格式变体，大幅降低提示词维护成本
4. **IntersectionObserver 图形懒加载**：仅在元素接近视口时才请求渲染，避免页面卡顿
5. **SSE 流式实时传输**：Token 用量实时可视线计数，费用透明可控

---

## 🚀 快速开始

| 方式 | 说明 |
|------|------|
| 🌐 **在线版** | 打开 [zhi-xue-ban.vercel.app](https://zhi-xue-ban.vercel.app)，配置 API Key 即可使用 |
| 📦 **桌面版** | 从 [Releases](https://github.com/YHSome/ZhiXueBan/releases) 下载安装包，内嵌 Node.js 运行时不需额外安装 |
| 💻 **源码运行** | `npm install && npm run dev`，可选 `pip install numpy matplotlib` 启用图形渲染 |

支持模型：OpenAI / DeepSeek / 通义千问 / 智谱 GLM-4 / Moonshot

---

## 📚 文档

| 文档 | 内容 |
|------|------|
| [✨ 功能介绍与截图](docs/FEATURES.md) | 11 张界面截图 + 每项功能详细说明 |
| [📄 技术白皮书](docs/WHITEPAPER.md) | 问题动机、核心创新、系统架构、七层预处理、分段函数绘制 |
| [🔧 开发指南](docs/DEVELOPMENT.md) | 项目结构、API 路由文档、提示词系统、桌面打包流程 |

---

## 📄 知识产权 · License

本项目为广州大学第二届"庆园杯"人工智能创新应用大赛参赛作品（揭榜挂帅赛道·命题一）。

MIT © YHSome