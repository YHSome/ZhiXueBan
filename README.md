[点击这里打开在线演示（需代理）](https://zhi-xue-ban.vercel.app/)

# 📚 智学伴

基于生成式 AI 的异步学习解决方案——**突破时空限制，以教促学，让 AI 成为你的私人助教。**

## ✨ 核心特色

### 🎓 以教促学（费曼学习法）

订正错题后，学生向 AI 讲解解题思路。AI 扮演"学生"角色追问验证，只有讲通了才算真正掌握。**教给别人，才是最好的学习。**

### 📖 智能课程系统

- **方式A：模糊描述生成** — 输入想学的内容，AI 自动生成章节结构
- **方式B：文件上传解析** — 拖拽 PDF/DOCX/PPTX，AI 自动识别章节并拆分
- 支持高数、物理、编程等任何学科

### 🎯 闯关式学习流程

```
📖 预习阅读 → ✍️ 小测验 → 🔍 AI 批改 → 📝 针对性练习 → 🎓 以教促学 → 🏆 通关
```

- 学习期间隐藏目录，沉浸式闯关
- AI 实时授课（Markdown + LaTeX 公式渲染）
- 后台异步预生成题目，切换秒开

### 📐 数学图形渲染（图文并茂）

AI 讲义和题目中可直接嵌入函数图像，支持五种类型：

| 类型 | 前缀 | 示例 |
|------|------|------|
| 显函数 | `y=` | `y=sin(x)\|-6.28\|6.28\|-1.5\|1.5\|正弦` |
| 隐式方程 | `eq:` | `eq:x**2/4+y**2/9-1\|-3\|3\|-2\|2\|椭圆` |
| 多函数对比 | `multi:` | `multi:x**2;2*x;-x\|-3\|3\|-3\|3\|对比` |
| 分段函数 | `pw:` | `pw:8,3;1.5*x+3.5\|0\|10\|0\|20\|出租车` |
| 三维曲面 | `3d:` | `3d:x**2+y**2\|-3\|3\|-3\|3\|0\|18\|抛物面` |

- 断点处自动标注开/闭区间（实心/空心圆）
- 连续分段不画多余标记，跳跃间断正确显示
- 3D 曲面使用 matplotlib 渲染，可旋转视角
- **自动降级**：检测不到 Python 环境时，AI 自动切回纯文字模式

> 要求：Python 3 + `numpy` + `matplotlib`

### 📋 试卷测评

- **AI 出卷**：根据课程内容自动生成试卷
- **导入试卷**：上传已有试卷（原卷呈现 / AI 模仿出题）
- **考试模式**：倒计时 + 自动提交 + AI 批改
- **练习模式**：不限时 + AI 学习助手辅佐

### 💬 AI 学习助手

右下角悬浮窗，学习中随时提问——考试中只解释概念不透露答案，阅读中可详细解答。

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 全栈框架 | Next.js 16 |
| 语言 | JavaScript (React) |
| 样式 | Tailwind CSS |
| AI 接入 | OpenAI / DeepSeek / 通义千问 / 智谱 等（兼容格式） |
| Markdown | react-markdown + remark-math + rehype-katex |
| 数学图形 | matplotlib + numpy（通过 Python 子进程） |
| PDF 解析 | pdfjs-dist |
| DOCX 解析 | mammoth |
| PPTX/ZIP 解析 | jszip |
| 桌面打包 | Electron + Inno Setup |
| 数据存储 | 浏览器 localStorage（API Key 不上传） |

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. （可选）安装 Python 图形依赖

```bash
pip install numpy matplotlib
```

不安装也可正常使用——AI 会自动跳过配图，生成纯文字内容。

### 3. 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

### 4. 配置 API Key

进入设置页 → 粘贴 API Key → 测试连接 → 保存。支持:

- OpenAI
- DeepSeek
- Moonshot
- 通义千问
- 智谱 GLM-4

数据**仅保存在浏览器本地**，不上传任何服务器。

### 5. 创建课程开始学习

去 `/create` 描述你想学的内容，或上传 PDF/DOCX 文件，AI 自动生成课程结构。

## 📦 桌面打包（Electron）

```bash
# 1. 构建 Next.js
npm run build

# 2. 手动打包（零网络依赖）
node build-exe.js

# 3. 补文件
xcopy .next release\智学伴\resources\app\.next /E /I /Y
xcopy next.config.mjs release\智学伴\resources\app\ /Y
xcopy formula_to_image.py release\智学伴\resources\app\ /Y

# 4. 生成安装包（需先安装 Inno Setup）
# 用 Inno Setup 打开 setup.iss → Compile
```

输出文件：
- `release\智学伴\智学伴.exe` — 便携版，双击即用
- `release\智学伴Setup.exe` — Windows 安装包

### 一键启动脚本

- `启动智学伴.bat` — 开发模式，自动启动服务 + 打开浏览器
- `启动智学伴-生产模式.bat` — 先编译优化再启动

## 📁 项目结构

```
ZhiXueBan/
├── src/
│   ├── app/
│   │   ├── layout.js              # 网站外壳
│   │   ├── page.js                # 首页
│   │   ├── globals.css            # 全局样式 + KaTeX
│   │   ├── setup/                 # ⚙️ API Key 设置页
│   │   ├── create/                # 📚 课程创建页
│   │   ├── learn/                 # 📖 学习主界面
│   │   ├── exam/                  # 📋 试卷系统
│   │   │   ├── create/            # 新建试卷
│   │   │   └── take/              # 答题页
│   │   └── api/
│   │       ├── ai/                # AI 代理（流式 SSE）
│   │       ├── parse/             # 文件解析
│   │       └── graph/             # 📐 数学图形生成 + ping 检测
│   ├── components/
│   │   ├── MarkdownRenderer.js    # Markdown + LaTeX + [graph] 自动渲染
│   │   ├── GeoGebraView.js        # 内联图形组件（含调试参数展示）
│   │   ├── TokenToast.js          # Token 实时显示
│   │   └── FontSizeToggle.js      # 字号切换
│   └── lib/
│       ├── prompts.js             # AI 提示词（含配图/纯文字双模式）
│       ├── graph-support.js       # Python 环境自动检测
│       ├── ai.js                  # AI 调用工具
│       ├── api-key.js             # API Key 本地管理
│       ├── courses.js             # 课程数据管理
│       ├── exams.js               # 试卷数据管理
│       └── font-size.js           # 字号管理
├── formula_to_image.py            # Python 数学图像生成器（60+预置函数）
├── main.js                        # Electron 主进程
├── build-exe.js                   # EXE 手动打包脚本
├── setup.iss                      # Inno Setup 打包配置
├── 启动智学伴.bat                  # 一键启动脚本
└── package.json
```

## ⚠️ 注意事项

- **API Key 安全**：Key 存储在浏览器 localStorage，不上传服务器，但请勿在公共电脑上保存
- **AI 费用**：每次出题/批改/授课都会调用 AI，注意控制使用频率
- **文件解析限制**：仅支持文字型 PDF/DOCX，扫描件（纯图片）无法提取文字
- **数学图形**：需要 Python + numpy + matplotlib。未安装时自动降级为纯文字，不影响正常使用

## 📄 License

MIT
