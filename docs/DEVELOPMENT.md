<p align="center">
  <img src="logo.png" alt="智学伴" width="100" />
</p>

<h3 align="center">智学伴 ZhiXueBan</h3>

<p align="center">
  <a href="../README.md">← 返回主页</a> &nbsp;|&nbsp;
  <a href="OVERVIEW.md">📋 精简版</a> &nbsp;|&nbsp;
  <a href="WHITEPAPER.md">📄 技术白皮书</a> &nbsp;|&nbsp;
  <a href="FEATURES.md">📸 功能展示</a>
</p>

---

# 开发指南

## 项目结构

```
ZhiXueBan/
├── src/
│   ├── app/
│   │   ├── layout.js              # 根布局
│   │   ├── page.js                # 首页
│   │   ├── globals.css            # 全局样式 + KaTeX
│   │   ├── setup/                 # ⚙️ 设置页
│   │   ├── create/                # 📚 课程创建
│   │   ├── learn/                 # 📖 学习主界面（六阶段状态机）
│   │   ├── exam/
│   │   │   ├── create/            # 📋 试卷创建
│   │   │   └── take/              # ✍️ 答题页
│   │   └── api/
│   │       ├── ai/route.js        # SSE 流式 AI 代理
│   │       ├── parse/
│   │       │   ├── route.js       # 文件解析 API
│   │       │   └── parse.py       # Python 解析脚本
│   │       └── graph/
│   │           ├── route.js       # 数学图形生成 + 七层预处理
│   │           └── ping/route.js  # Python 环境检测
│   ├── components/
│   │   ├── MarkdownRenderer.js    # Markdown + KaTeX + [graph] 块渲染
│   │   ├── GeoGebraView.js        # 图形内联渲染 + 一键修复 + 开发者模式
│   │   ├── TokenToast.js          # Token 实时用量显示
│   │   ├── FontSizeToggle.js      # 字号切换
│   │   └── LatexToolbar.js        # LaTeX 公式输入工具栏
│   └── lib/
│       ├── prompts.js             # AI 提示词（双模式 + 四档难度）
│       ├── graph-support.js       # Python 环境自动检测
│       ├── api-key.js             # 本地配置管理（API Key + 难度 + 开发者模式）
│       ├── ai.js                  # AI 调用工具
│       ├── courses.js             # 课程数据管理（localStorage）
│       ├── exams.js               # 试卷数据管理（localStorage）
│       └── font-size.js           # 字号管理
├── formula_to_image.py            # Python 数学图像生成器
├── main.js                        # Electron 主进程
├── build-exe.js                   # EXE 打包脚本
├── setup.iss                      # Inno Setup 配置
└── package.json
```

## API 路由

### `POST /api/ai`

SSE 流式 AI 调用。

```json
// Request
{
  "messages": [{ "role": "user", "content": "..." }],
  "apiKey": "sk-...",
  "baseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-v4-pro",
  "maxTokens": 40000
}
// Response: SSE text/event-stream
```

### `GET /api/graph/ping`

检测 Python 环境是否可用。

```json
// Response
{ "ok": true, "python": "python" }
// 或
{ "ok": false, "reason": "no-python" }
```

### `POST /api/graph`

生成数学函数图像。

```json
// Request
{
  "expression": "y=sin(x)|-6.28|6.28|-1.5|1.5|正弦函数",
  "width": 600,
  "height": 400
}
// Response: image/png (二进制) 或
// { "error": "...", "detail": "Python stderr..." }
```

支持的五种图形格式：

| 前缀 | 示例 | 参数段数 |
|------|------|---------|
| `y=` | `y=sin(x)\|xmin\|xmax\|ymin\|ymax\|标题` | 5 |
| `eq:` | `eq:x**2+y**2-1\|xmin\|xmax\|ymin\|ymax\|标题` | 5 |
| `multi:` | `multi:x**2;2*x;-x\|xmin\|xmax\|ymin\|ymax\|标题` | 5 |
| `pw:` | `pw:8,3;1.5*x+3.5\|xmin\|xmax\|ymin\|ymax\|标题` | 5 |
| `3d:` | `3d:x**2+y**2\|xmin\|xmax\|ymin\|ymax\|zmin\|zmax\|标题` | 7 |

## 图形渲染管线

```
AI 生成 [graph] 块
  ↓
MarkdownRenderer.splitGraphSegments() 提取
  ↓
GeoGebraView.useEffect() fetch /api/graph
  ↓
route.js 七层预处理
  ├─ 1. 参数标签剥离：|xmin=0| → |0|
  ├─ 2. 定义域简写：-4<=x<=5 → |-4|5|-4|5|
  ├─ 3. 变量统一：t/θ → x
  ├─ 4. 指数补全：^→** / )2→)**2 / x2→x**2
  ├─ 5. 乘号补全：2x→2*x / )(→)*( / 数字(→数字*(
  ├─ 6. 常量包装：1→np.ones_like(x)*(1)
  └─ 7. 等号处理 + 比较符保护
  ↓
判断图形类型
  ├─ pw: → 内联 Python 逐段绘制脚本
  ├─ 3d: → 内联 Python 3D 曲面脚本
  ├─ multi:+隐式 → 内联 Python 多隐式脚本
  └─ 其他 → formula_to_image.py
  ↓
返回 PNG blob → 显示
```

## 提示词系统

```javascript
// prompts.js

// 讲义生成 — hasGraph 控制是否包含配图模板
lecturePrompt(courseTitle, chapterTitle, sectionTitle, hasGraph)

// 小测出题 — difficulty: easy|normal|hard|challenge
quizPrompt(courseTitle, lecture, hasGraph, difficulty)

// 针对性练习
practicePrompt(courseTitle, lecture, weakPoints, hasGraph, difficulty)
```

### 难度映射

| difficulty | 标签 | 引导 | 星级 |
|-----------|------|------|------|
| `easy` | 简单 | 基础概念，课本例题 | 1-3 |
| `normal` | 基础 | 理解+应用 | 2-4 |
| `hard` | 进阶 | 综合分析，多步推理 | 3-6（≥1道5★） |
| `challenge` | 挑战 | 竞赛级别，允许超纲 | 4-6（≥1道6★） |

## 桌面打包

```bash
# 1. 构建 Next.js
npm run build

# 2. 运行打包脚本
node build-exe.js

# 3. 补充文件
cp formula_to_image.py release/智学伴/resources/app/
cp next.config.mjs release/智学伴/resources/app/

# 输出：release/智学伴/智学伴.exe
```

## 数据存储

所有数据存储在浏览器 localStorage：

| Key | 内容 |
|-----|------|
| `zhixueban-api-key` | API Key |
| `zhixueban-api-base` | API 地址 |
| `zhixueban-api-model` | 模型名称 |
| `zhixueban-difficulty` | 难度设置 |
| `zhixueban-dev-mode` | 开发者模式 |
| `zhixueban-cache-{courseId}` | 课程学习进度缓存 |
| `zhixueban-helper-{courseId}-{sectionKey}` | AI 助手对话记录 |
