// 数学图形生成 API —— 调用 formula_to_image.py
export async function POST(request) {
  try {
    const { expression, width = 600, height = 400 } = await request.json();
    if (!expression?.trim()) {
      return Response.json({ error: "缺少 expression 参数" }, { status: 400 });
    }

    const os = require("os");
    const path = require("path");
    const fs = require("fs");
    const { execSync } = require("child_process");

    // 检测 Python
    let pythonCmd = null;
    try { pythonCmd = execSync("where python 2>nul || which python3 2>/dev/null || which python 2>/dev/null", { encoding: "utf8", shell: true, timeout: 5000 }).split("\n")[0]?.trim(); } catch {}
    if (!pythonCmd || !fs.existsSync(pythonCmd)) {
      try { execSync("python3 --version", { stdio: "ignore", shell: true, timeout: 5000 }); pythonCmd = "python3"; } catch {
        try { execSync("python --version", { stdio: "ignore", shell: true, timeout: 5000 }); pythonCmd = "python"; } catch {}
      }
    }
    if (!pythonCmd) {
      return Response.json({ error: "未检测到 Python" }, { status: 500 });
    }

    // 创建临时工作目录
    const workDir = path.join(os.tmpdir(), `zhixueban_graph_${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });
    const inputFile = path.join(workDir, "input.txt");
    const outputDir = path.join(workDir, "output");
    fs.mkdirSync(outputDir, { recursive: true });

    // 写入表达式，每行一条
    const lines = expression.replace(/\\n/g, "\n").split("\n").filter((l) => l.trim());

    // 预处理：将 AI 可能输出的数学格式转为 Python 语法
    const processedLines = lines.map((line) => {
      // 展开定义域简写：将 "y:expr| -4<=x<=5 |标题" → "y:expr|-4|5|-4|5|标题"
      line = line.replace(/\|\s*(-?\d+(?:\.\d+)?)\s*<=\s*x\s*<=\s*(-?\d+(?:\.\d+)?)\s*\|/g,
        (_, xMin, xMax) => `|${xMin}|${xMax}|${xMin}|${xMax}|`);

      // 按 | 分割，第一个字段是表达式，其余是参数
      const parts = line.split("|");
      let expr = parts[0].trim();

      // 确定前缀类型（只有 eq:/multi:/par: 需要保留，y= 和空前缀不需要）
      let prefix = "";
      // 先统一去除前缀可能的空格（如 "multi: y=x" → "multi:y=x"）
      expr = expr.replace(/^(eq|multi|par|3d|pw|y)\s*:\s*/, (_, p) => p + ":");

      if (expr.startsWith("3d:")) { prefix = "3d:"; expr = expr.slice(3).trim(); }
      else if (expr.startsWith("pw:")) {
        // 分段函数：保留原始段数据，后续用内联 Python 逐段绘制（避免跳跃间断点被连线）
        prefix = "pw:";
        expr = expr.slice(3).trim();
      }
      else if (expr.startsWith("eq:")) { prefix = "eq:"; expr = expr.slice(3).trim(); }
      else if (expr.startsWith("multi:")) {
        prefix = "multi:";
        expr = expr.slice(6).trim();
        // 剥离每个子表达式的 y=/eq: 前缀（兼容空格变体如 "y = x"）
        expr = expr.split(";").map((sub) => {
          let s = sub.trim().replace(/^(?:eq|y)\s*[:=]\s*/, "");
          // 纯数字常量包装为 np.ones_like(x)*N（formula_to_image.py 不支持裸常量）
          if (/^-?\d+(?:\.\d+)?$/.test(s)) s = `np.ones_like(x)*(${s})`;
          return s;
        }).join(";");
      }
      else if (expr.startsWith("par:")) { prefix = "par:"; expr = expr.slice(4).trim(); }
      else if (expr.startsWith("y=") || expr.startsWith("y:")) { expr = expr.slice(2).trim(); }
      // 安全网：如果表达式含 y 但没有前缀，很可能是忘了写 eq: 的隐式方程
      else if (/\by\b/.test(expr) && /\bx\b/.test(expr) && !/^(sin|cos|tan|log|exp|sqrt|abs)\b/.test(expr)) {
        prefix = "eq:";
      }

      // 统一自变量名：t/theta/θ → x（formula_to_image.py 只认 x）
      expr = expr.replace(/\btheta\b/gi, 'x');
      expr = expr.replace(/θ/g, 'x');
      expr = expr.replace(/\bt\b/g, 'x');

      // 替换 ^ 为 **（Python 幂运算）
      expr = expr.replace(/\^/g, "**");

      // 修复省略指数符号的写法：)数字 → )**数字，变量后紧跟数字 → 变量**数字
      // 例如 (x-2)2 → (x-2)**2, y2 → y**2
      expr = expr.replace(/\)(\d+(?:\.\d+)?)/g, ')**$1');
      expr = expr.replace(/\b([a-zA-Z])(\d+(?:\.\d+)?)\b/g, '$1**$2');

      // 修复省略乘号的写法：数字紧跟变量 → 数字*变量
      // 例如 2x → 2*x, 0.5x → 0.5*x（保留科学计数法如 2e3）
      expr = expr.replace(/(\d+(?:\.\d+)?)([a-zA-Z])/g, (match, num, letter) => {
        if (letter === 'e' || letter === 'E') return match;
        return `${num}*${letter}`;
      });

      // 纯数字常量 → 包装为 np.ones_like(x)*N（避免 formula_to_image.py 报错）
      if (/^-?\d+(?:\.\d+)?$/.test(expr)) {
        expr = `np.ones_like(x)*(${expr})`;
      }

      // 保护比较运算符不被 = 处理破坏（<=, >=, !=）
      expr = expr.replace(/<=/g, '\x00LE\x00');
      expr = expr.replace(/>=/g, '\x00GE\x00');
      expr = expr.replace(/!=/g, '\x00NE\x00');

      // 处理 = rhs 格式：将等号右边移到左边
      if (expr.includes("=")) {
        const eqIdx = expr.indexOf("=");
        const left = expr.slice(0, eqIdx).trim();
        const right = expr.slice(eqIdx + 1).trim();
        if (right && right !== "0") {
          expr = `${left} - (${right})`;
        } else {
          expr = left;
        }
      }

      // 恢复比较运算符
      expr = expr.replace(/\x00LE\x00/g, '<=');
      expr = expr.replace(/\x00GE\x00/g, '>=');
      expr = expr.replace(/\x00NE\x00/g, '!=');

      // 重新组装（只加回 eq:/multi:/par: 前缀）
      parts[0] = prefix + expr;
      return parts.join("|");
    });

    const processedInput = processedLines.join("\n");
    console.log("[Graph API] Input:", JSON.stringify(expression.slice(0, 200)), "→ Processed:", JSON.stringify(processedInput.slice(0, 200)));

    // 检测是否为 3d: 三维曲面（formula_to_image.py 不支持）
    const firstLine = processedLines[0] || "";
    const is3D = firstLine.startsWith("3d:");

    // 检测是否为 multi: 隐式方程（子表达式含 y，formula_to_image.py 不支持）
    const isMultiImplicit = firstLine.startsWith("multi:") &&
      firstLine.slice(6).split("|")[0].split(";").some((s) => /\by\b/.test(s.trim()));

    // 检测是否为 pw: 分段函数（逐段绘制，避免跳跃间断点被连线）
    const isPiecewise = firstLine.startsWith("pw:");

    if (isPiecewise) {
      // 内联 Python 脚本：逐段绘制分段函数
      const pwScriptPath = path.join(workDir, "_piecewise.py");
      const parts = firstLine.split("|");
      const segStr = parts[0].slice(3); // 去掉 "pw:"
      const segs = segStr.split(";").map((s) => {
        const trimmed = s.trim();
        const commaIdx = trimmed.lastIndexOf(",");
        if (commaIdx < 0) return { expr: trimmed };
        const expr = trimmed.slice(0, commaIdx).trim();
        const cond = trimmed.slice(commaIdx + 1).trim();
        // 纯数字断点（如 "8,3" → bp=3）
        const numBp = parseFloat(cond);
        if (!isNaN(numBp)) return { expr, bp: numBp };
        // 条件式断点（如 "x<=-1" → bp=-1; "-1<x<=2" → bp=2）
        const upperMatch = cond.match(/(?:<=|<)\s*(-?\d+(?:\.\d+)?)\s*$/);
        if (upperMatch) return { expr, bp: parseFloat(upperMatch[1]) };
        // 无条件或无上界 → 默认段
        return { expr };
      }).filter((s) => s.expr);
      const xMin3 = parseFloat(parts[1]) || -5;
      const xMax3 = parseFloat(parts[2]) || 5;
      const yMin3 = parseFloat(parts[3]) || -5;
      const yMax3 = parseFloat(parts[4]) || 5;
      const title3d = (parts[5] || "").replace(/['"\\]/g, "");

      const pyScriptPW = `
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import patheffects
import os, json

SAFE = {"np": np, "sin": np.sin, "cos": np.cos, "tan": np.tan,
        "arcsin": np.arcsin, "arccos": np.arccos, "arctan": np.arctan,
        "abs": np.abs, "sqrt": np.sqrt, "exp": np.exp, "log": np.log,
        "log2": np.log2, "log10": np.log10, "sign": np.sign,
        "floor": np.floor, "ceil": np.ceil, "pi": np.pi, "e": np.e,
        "sinh": np.sinh, "cosh": np.cosh, "tanh": np.tanh}
SEGS = json.loads(${JSON.stringify(JSON.stringify(segs))})
XMIN, XMAX = ${xMin3}, ${xMax3}
YMIN, YMAX = ${yMin3}, ${yMax3}
TITLE = ${JSON.stringify(title3d)}
OUTPUT = os.path.join(${JSON.stringify(outputDir)}, "graph.png")

fig, ax = plt.subplots(figsize=(10, 7))
fig.patch.set_facecolor("white")
ax.set_facecolor("#f8f9fa")

# 逐段绘制：每段在自己区间内独立画线，断点处按开闭区间画实心/空心圆
COLOR = "#2c3e50"
PE = [patheffects.Stroke(linewidth=3.5, foreground='white', alpha=0.5), patheffects.Normal()]

def eval_at(xv, expr_str):
    f = eval(f"lambda x: {expr_str}", SAFE)
    yv = f(xv)
    if np.isscalar(yv):
        yv = np.full_like(xv, yv)
    # 用 y 范围上限的 3 倍做渐近线截断阈值（避免 y=1/x 之类爆炸）
    limit = max(abs(YMIN), abs(YMAX)) * 3 + 10
    return np.ma.masked_where(np.abs(yv) > limit, yv)

prev_bp = XMIN
for i, s in enumerate(SEGS):
    expr_str = s["expr"]
    bp = s.get("bp", None)
    has_bp = bp is not None and bp < XMAX
    x_end = bp if has_bp else XMAX

    if x_end <= prev_bp:
        continue

    x = np.linspace(prev_bp, x_end, max(100, int((x_end - prev_bp) / (XMAX - XMIN) * 800 + 0.5)))
    try:
        y = eval_at(x, expr_str)
        ax.plot(x, y, linewidth=2.5, color=COLOR, path_effects=PE)

        # 左端点（x=prev_bp）：判断是否跳跃间断
        y_left = eval_at(np.array([prev_bp]), expr_str)[0]
        if i == 0:
            # 首段左端点：闭区间，实心
            ax.plot(prev_bp, y_left, 'o', color=COLOR, markersize=6, zorder=7)
        else:
            # 检查前一段在此处的值，判断是否连续
            prev_expr = SEGS[i-1]["expr"]
            y_prev = eval_at(np.array([prev_bp]), prev_expr)[0]
            gap = abs(y_left - y_prev)
            if gap > 0.01 * max(1, abs(y_left), abs(y_prev)):
                # 有跳跃 → 空心圆（开区间）
                ax.plot(prev_bp, y_left, 'o', color='white', markersize=8, zorder=5)
                ax.plot(prev_bp, y_left, 'o', color=COLOR, markersize=6, fillstyle='none', zorder=6)
            # 连续则不画空心圆

        # 右端点（x=x_end）：实心在上层（覆盖同位置的左侧空心圆）
        y_right = eval_at(np.array([x_end]), expr_str)[0]
        ax.plot(x_end, y_right, 'o', color=COLOR, markersize=6, zorder=7)

    except Exception as e:
        pass

    prev_bp = x_end

# Axes
ax.axhline(y=0, color="black", linewidth=0.8, zorder=0)
ax.axvline(x=0, color="black", linewidth=0.8, zorder=0)
dx = (XMAX - XMIN) * 0.015
dy = (YMAX - YMIN) * 0.015
ax.annotate("", xy=(XMAX, 0), xytext=(XMAX - dx*5, 0),
            arrowprops=dict(arrowstyle="->", color="black", lw=1.2))
ax.annotate("", xy=(0, YMAX), xytext=(0, YMAX - dy*5),
            arrowprops=dict(arrowstyle="->", color="black", lw=1.2))
ax.text(-dx*3, -dy*3, "O", fontsize=10, ha="right", va="top")
ax.text(XMAX + dx, -dy*2, "x", fontsize=12, ha="left", va="center")
ax.text(-dx*2, YMAX + dy, "y", fontsize=12, ha="center", va="bottom")
ax.set_xlim(XMIN, XMAX)
ax.set_ylim(YMIN, YMAX)
x_span = XMAX - XMIN
y_span = YMAX - YMIN
if y_span > 0:
    ratio = x_span / y_span
    if 0.33 < ratio < 3:
        ax.set_aspect('equal')
        fig.set_size_inches(10 * max(ratio, 0.4), 7, forward=True)
    else:
        ax.set_aspect('auto')
ax.grid(True, alpha=0.3, linestyle="--")
if TITLE:
    ax.set_title(TITLE, fontsize=14, fontweight="bold", pad=15)
ax.tick_params(labelsize=9)
plt.tight_layout()
fig.savefig(OUTPUT, dpi=150, bbox_inches="tight", facecolor="white")
plt.close(fig)
print(f"OK {OUTPUT}")
`.trim();

      fs.writeFileSync(pwScriptPath, pyScriptPW, "utf-8");
      execSync(`${pythonCmd} "${pwScriptPath}"`, {
        encoding: "utf-8", timeout: 30000, cwd: workDir, shell: true,
      });

    } else if (is3D) {
      // 内联 Python 脚本：matplotlib 3D 曲面
      const script3dPath = path.join(workDir, "_3d_surface.py");
      const parts = firstLine.split("|");
      const expr3d = parts[0].slice(3).trim(); // 去掉 "3d:"
      const xMin3 = parseFloat(parts[1]) || -5;
      const xMax3 = parseFloat(parts[2]) || 5;
      const yMin3 = parseFloat(parts[3]) || -5;
      const yMax3 = parseFloat(parts[4]) || 5;
      const zMin3 = parseFloat(parts[5]);
      const zMax3 = parseFloat(parts[6]);
      const title3d = (parts[7] || "").replace(/['"\\]/g, "");

      const pyScript3D = `
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
from matplotlib import cm
import matplotlib.font_manager as fm
import os

# 中文字体
_CN = ["SimHei", "Microsoft YaHei", "WenQuanYi Micro Hei",
       "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC"]
_avail = {f.name for f in fm.fontManager.ttflist}
_cn = next((fn for fn in _CN if fn in _avail), "DejaVu Sans")
plt.rcParams.update({"font.family": "sans-serif", "font.sans-serif": [_cn, "DejaVu Sans"],
                     "axes.unicode_minus": False, "mathtext.fontset": "dejavusans"})

SAFE = {"np": np, "sin": np.sin, "cos": np.cos, "tan": np.tan,
        "arcsin": np.arcsin, "arccos": np.arccos, "arctan": np.arctan,
        "abs": np.abs, "sqrt": np.sqrt, "exp": np.exp, "log": np.log,
        "log2": np.log2, "log10": np.log10, "sign": np.sign,
        "floor": np.floor, "ceil": np.ceil, "pi": np.pi, "e": np.e,
        "sinh": np.sinh, "cosh": np.cosh, "tanh": np.tanh,
        "x": None, "y": None}
EXPR = ${JSON.stringify(expr3d)}
XMIN, XMAX = ${xMin3}, ${xMax3}
YMIN, YMAX = ${yMin3}, ${yMax3}
ZMIN = ${isNaN(zMin3) ? "None" : zMin3}
ZMAX = ${isNaN(zMax3) ? "None" : zMax3}
TITLE = ${JSON.stringify(title3d)}
OUTPUT = os.path.join(${JSON.stringify(outputDir)}, "graph.png")

f = eval(f"lambda x, y: {EXPR}", SAFE)
xv = np.linspace(XMIN, XMAX, 150)
yv = np.linspace(YMIN, YMAX, 150)
X, Y = np.meshgrid(xv, yv)
Z = f(X, Y)

fig = plt.figure(figsize=(12, 9))
ax = fig.add_subplot(111, projection='3d')
surf = ax.plot_surface(X, Y, Z, cmap=cm.viridis, alpha=0.88,
                       linewidth=0, antialiased=True, rstride=1, cstride=1)
# 底面投影轮廓
if ZMIN is not None:
    ax.contour(X, Y, Z, zdir='z', offset=ZMIN, cmap=cm.viridis, alpha=0.4, linewidths=0.8)
fig.colorbar(surf, ax=ax, shrink=0.5, aspect=10, pad=0.1, label='z')

ax.set_xlabel('x', fontsize=11)
ax.set_ylabel('y', fontsize=11)
ax.set_zlabel('z', fontsize=11)
ax.set_xlim(XMIN, XMAX)
ax.set_ylim(YMIN, YMAX)
if ZMIN is not None and ZMAX is not None:
    ax.set_zlim(ZMIN, ZMAX)
if TITLE:
    ax.set_title(TITLE, fontsize=14, fontweight="bold", pad=20)
ax.view_init(elev=28, azim=-60)
ax.xaxis.pane.fill = False
ax.yaxis.pane.fill = False
ax.zaxis.pane.fill = False
ax.xaxis.pane.set_edgecolor('#cccccc')
ax.yaxis.pane.set_edgecolor('#cccccc')
ax.zaxis.pane.set_edgecolor('#cccccc')
plt.tight_layout()
fig.savefig(OUTPUT, dpi=150, bbox_inches="tight", facecolor="white")
plt.close(fig)
print(f"OK {OUTPUT}")
`.trim();

      fs.writeFileSync(script3dPath, pyScript3D, "utf-8");
      execSync(`${pythonCmd} "${script3dPath}"`, {
        encoding: "utf-8", timeout: 30000, cwd: workDir, shell: true,
      });

    } else if (isMultiImplicit) {
      // 使用内联 Python 脚本处理多隐式方程组合图
      const multiScriptPath = path.join(workDir, "_multi_implicit.py");
      const parts = firstLine.split("|");
      const exprPart = parts[0].slice(6); // 去掉 "multi:"
      const exprs = exprPart.split(";").map((s) => {
        let e = s.trim();
        if (e.startsWith("eq:")) e = e.slice(3).trim();
        if (e.startsWith("y=")) e = e.slice(2).trim();
        return e;
      }).filter(Boolean);
      const xMin = parseFloat(parts[1]) || -5;
      const xMax = parseFloat(parts[2]) || 5;
      const yMin = parseFloat(parts[3]) || -5;
      const yMax = parseFloat(parts[4]) || 5;
      const title = (parts[5] || "").replace(/['"\\]/g, "");

      const pyScript = `
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import patheffects
import os

SAFE = {"np": np, "sin": np.sin, "cos": np.cos, "tan": np.tan,
        "arcsin": np.arcsin, "arccos": np.arccos, "arctan": np.arctan,
        "abs": np.abs, "sqrt": np.sqrt, "exp": np.exp, "log": np.log,
        "log2": np.log2, "log10": np.log10, "sign": np.sign,
        "floor": np.floor, "ceil": np.ceil, "pi": np.pi, "e": np.e,
        "sinh": np.sinh, "cosh": np.cosh, "tanh": np.tanh,
        "x": None, "y": None}
EXPRS = ${JSON.stringify(exprs)}
XMIN, XMAX, YMIN, YMAX = ${xMin}, ${xMax}, ${yMin}, ${yMax}
TITLE = ${JSON.stringify(title)}
OUTPUT = os.path.join(${JSON.stringify(outputDir)}, "graph.png")

COLORS = ["#e74c3c", "#2980b9", "#27ae60", "#8e44ad", "#f39c12", "#1abc9c"]
LINESTYLES = ['-', '--', '-.', ':']

fig, ax = plt.subplots(figsize=(10, 7))
fig.patch.set_facecolor("white")
ax.set_facecolor("#f8f9fa")

for idx, expr_str in enumerate(EXPRS):
    f = eval(f"lambda x, y: {expr_str}", SAFE)
    xv = np.linspace(XMIN, XMAX, 800)
    yv = np.linspace(YMIN, YMAX, 800)
    X, Y = np.meshgrid(xv, yv)
    try:
        Z = f(X, Y)
    except Exception:
        Z = np.zeros_like(X)
        for i in range(len(xv)):
            for j in range(len(yv)):
                try: Z[j, i] = f(X[j, i], Y[j, i])
                except: Z[j, i] = np.nan
    ax.contour(X, Y, Z, levels=[0], colors=COLORS[idx % len(COLORS)],
               linewidths=2.5, linestyles=LINESTYLES[idx % len(LINESTYLES)])

ax.axhline(y=0, color="black", linewidth=0.8, zorder=0)
ax.axvline(x=0, color="black", linewidth=0.8, zorder=0)
dx = (XMAX - XMIN) * 0.015
dy = (YMAX - YMIN) * 0.015
ax.annotate("", xy=(XMAX, 0), xytext=(XMAX - dx*5, 0),
            arrowprops=dict(arrowstyle="->", color="black", lw=1.2))
ax.annotate("", xy=(0, YMAX), xytext=(0, YMAX - dy*5),
            arrowprops=dict(arrowstyle="->", color="black", lw=1.2))
ax.text(-dx*3, -dy*3, "O", fontsize=10, ha="right", va="top")
ax.text(XMAX + dx, -dy*2, "x", fontsize=12, ha="left", va="center")
ax.text(-dx*2, YMAX + dy, "y", fontsize=12, ha="center", va="bottom")
ax.set_xlim(XMIN, XMAX)
ax.set_ylim(YMIN, YMAX)
x_span = XMAX - XMIN
y_span = YMAX - YMIN
if y_span > 0:
    ratio = x_span / y_span
    if 0.33 < ratio < 3:
        ax.set_aspect('equal')
        fig.set_size_inches(10 * max(ratio, 0.4), 7, forward=True)
    else:
        ax.set_aspect('auto')
ax.grid(True, alpha=0.3, linestyle="--")
if TITLE:
    ax.set_title(TITLE, fontsize=14, fontweight="bold", pad=15)
ax.tick_params(labelsize=9)
plt.tight_layout()
fig.savefig(OUTPUT, dpi=150, bbox_inches="tight", facecolor="white")
plt.close(fig)
print(f"OK {OUTPUT}")
`.trim();

      fs.writeFileSync(multiScriptPath, pyScript, "utf-8");
      execSync(`${pythonCmd} "${multiScriptPath}"`, {
        encoding: "utf-8", timeout: 30000, cwd: workDir, shell: true,
      });
    } else {
      // 普通模式：使用 formula_to_image.py
      fs.writeFileSync(inputFile, processedInput, "utf-8");
      const scriptPath = path.resolve(process.cwd(), "formula_to_image.py");
      execSync(`${pythonCmd} "${scriptPath}" "${inputFile}" "${outputDir}"`, {
        encoding: "utf-8",
        timeout: 30000,
        cwd: workDir,
        shell: true,
      });
    }

    // 读取生成的图片
    const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".png"));
    if (files.length === 0) {
      try { fs.rmSync(workDir, { recursive: true }); } catch {}
      return Response.json({ error: "图形渲染失败，未生成图片" }, { status: 500 });
    }

    const imgBuffer = fs.readFileSync(path.join(outputDir, files[0]));
    try { fs.rmSync(workDir, { recursive: true }); } catch {}

    return new Response(imgBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("Graph API error:", e.message, e.stderr || "");
    return Response.json({ error: `渲染失败：${e.message?.slice(0, 200)}` }, { status: 500 });
  }
}
