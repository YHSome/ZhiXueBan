<p align="center">
  <img src="docs/logo.png" alt="智学伴" width="120" />
</p>

<h1 align="center">智学伴 ZhiXueBan</h1>

<p align="center">
  <strong>基于生成式 AI 的异步学习解决方案</strong><br/>
  突破时空限制 · 以教促学 · 让 AI 成为每一个学生的私人助教
</p>

<p align="center">
  <a href="https://zhi-xue-ban.vercel.app/">🌐 在线演示</a> &nbsp;|&nbsp;
  <a href="#快速开始">🚀 快速开始</a> &nbsp;|&nbsp;
  <a href="https://github.com/YHSome/ZhiXueBan/releases">📦 下载桌面版</a> &nbsp;|&nbsp;
  <a href="docs/WHITEPAPER.md">📄 技术白皮书</a>
</p>

---

## ✨ 特色

- 🎓 **以教促学** — 费曼学习法：学生向 AI 讲解思路，讲通才算掌握
- 📖 **AI 生成课程** — 自然语言描述或上传 PDF/DOCX，自动生成结构化课程
- 🎯 **六阶段闯关** — 预习→小测→批改→练习→以教促学→通关
- 📐 **图文并茂** — 内建数学图形引擎，AI 讲义自动嵌入函数图像（支持 2D/3D）
- 🧠 **自适应难度** — 四档调节（简单/基础/进阶/挑战），每题标注星级
- 📋 **试卷系统** — AI 出卷 + 导入试卷 + 倒计时考试 + 自动批改
- 🔒 **零服务端成本** — 数据全部本地存储，API Key 不上传
- 📦 **多端交付** — Web 版、Vercel 部署、Windows 桌面 EXE

→ [查看完整功能介绍与截图](docs/FEATURES.md)

---

## 🚀 快速开始

### Web 版

```bash
npm install
npm run dev
# → http://localhost:3000
```

### 桌面版

从 [Releases](https://github.com/YHSome/ZhiXueBan/releases) 下载 → 解压 → 双击 `智学伴.exe`

### 可选：Python 图形渲染

```bash
pip install numpy matplotlib
```

未安装则自动降级纯文字模式。

### 配置

打开设置页 → 粘贴 API Key → 选择模型（支持 OpenAI / DeepSeek / 通义千问 / 智谱）→ 开始学习

---

## 📚 文档

| 文档 | 说明 |
|------|------|
| [✨ 功能介绍](docs/FEATURES.md) | 完整功能展示与截图 |
| [📄 技术白皮书](docs/WHITEPAPER.md) | 系统架构、核心创新、技术决策 |
| [🔧 开发指南](docs/DEVELOPMENT.md) | 项目结构、API 文档、打包部署 |

---

## 📄 License

MIT © YHSome
