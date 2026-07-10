#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
高中数学函数/方程图像生成器
============================
从 input.txt 读取函数配置，批量生成函数图像，保存到 output/ 目录。

内置 60+ 种高中数学常见函数/方程，也支持自定义表达式。

input.txt 格式（管道符 "|" 分隔，空行和 # 开头行被忽略）：
  * 预定义函数：名称[|x_min|x_max|y_min|y_max|标题|文件名]
  * 自定义显函数：表达式[|x_min|x_max|y_min|y_max|标题|文件名]
  * 隐式方程：   eq:表达式[|x_min|x_max|y_min|y_max|标题|文件名]
  * 参数方程：   par:x表达式;y表达式[|t_min|t_max|x_min|x_max|y_min|y_max|标题|文件名]
  * 分类批量：   @类别名    （生成该类别下所有函数）
  * 输出全部：   @all       （生成所有预定义函数）

省略的参数自动使用默认值。y_min/y_max 可设为 "auto" 自动计算。

用法：
    python formula_to_image.py              # 读取 input.txt 并生成图像
    python formula_to_image.py --list       # 列出所有预定义函数
    python formula_to_image.py --categories # 列出所有分类
"""

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import patheffects
import os
import sys
import io
from pathlib import Path

# 修复 Windows GBK 终端下 emoji 输出问题
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ============================================================
# 全局配置
# ============================================================
OUTPUT_DIR = Path("output")
INPUT_FILE = Path("input.txt")
DPI = 150
FIG_SIZE = (10, 7)
LINE_WIDTH = 2.5
GRID_ALPHA = 0.3

# 中文字体
_CN_FONTS = ["SimHei", "Microsoft YaHei", "WenQuanYi Micro Hei",
             "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC"]
_available = {f.name for f in matplotlib.font_manager.fontManager.ttflist}
_cn_font = next((fn for fn in _CN_FONTS if fn in _available), "DejaVu Sans")
plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": [_cn_font, "DejaVu Sans"],
    "axes.unicode_minus": False,
    "mathtext.fontset": "dejavusans",
})

SAFE_EVAL = {
    "np": np, "sin": np.sin, "cos": np.cos, "tan": np.tan,
    "arcsin": np.arcsin, "arccos": np.arccos, "arctan": np.arctan,
    "abs": np.abs, "sqrt": np.sqrt, "exp": np.exp, "log": np.log,
    "log2": np.log2, "log10": np.log10, "sign": np.sign,
    "floor": np.floor, "ceil": np.ceil, "pi": np.pi, "e": np.e,
    "sinh": np.sinh, "cosh": np.cosh, "tanh": np.tanh,
}


def _extract_params(expr_str):
    """从 'expr;a=1,b=2' 中提取参数，返回 (clean_expr, params_dict)。

    参数部分用 ; 与表达式隔开，多个参数用逗号分隔。
    仅在最后一段包含 '=' 时才当参数处理，
    这样 curve:x(t);y(t);z(t) 和 par:x(t);y(t) 中的 ; 不会被误判。
    """
    if ";" in expr_str:
        parts = expr_str.rsplit(";", 1)
        if "=" in parts[1]:
            expr_part = parts[0].strip()
            param_part = parts[1].strip()
            params = {}
            for p in param_part.split(","):
                p = p.strip()
                if "=" in p:
                    k, v = p.split("=", 1)
                    try:
                        params[k.strip()] = float(v.strip())
                    except ValueError:
                        pass
            return expr_part, params
    return expr_str, {}


def _make_eval_context(extra_params=None):
    """构建 eval 命名空间，合并全局函数和附加参数。"""
    ctx = dict(SAFE_EVAL)
    if extra_params:
        ctx.update(extra_params)
    return ctx

# ============================================================
# 预定义函数库
# ============================================================
# 格式：{ 名称: { type, expr, x_range, y_range, title, note } }
# type: "explicit" | "implicit" | "parametric"
# expr: 显函数表达式 / 隐式 f(x,y)=0 表达式 / "x(t);y(t)"

PREDEFINED = {}

def _reg(category, entries):
    """批量注册预定义函数"""
    for name, cfg in entries:
        cfg["category"] = category
        PREDEFINED[name] = cfg

# ---- 一次函数（线性）----
_reg("一次函数（线性）", [
    ("y=x",      dict(type="explicit", expr="x", x_range=(-6,6), y_range=(-6,6), title="y = x")),
    ("y=-x",     dict(type="explicit", expr="-x", x_range=(-6,6), y_range=(-6,6), title="y = -x")),
    ("y=2x+1",   dict(type="explicit", expr="2*x+1", x_range=(-5,5), y_range=(-9,11), title="y = 2x + 1")),
    ("y=-0.5x+2",dict(type="explicit", expr="-0.5*x+2", x_range=(-4,8), y_range=(-3,5), title="y = -1/2x + 2")),
    ("y=kx",     dict(type="explicit", expr="2*x", x_range=(-5,5), y_range=(-10,10), title="y = kx (k=2)")),
])

# ---- 二次函数（抛物线）----
_reg("二次函数（抛物线）", [
    ("y=x^2",       dict(type="explicit", expr="x**2", x_range=(-4,4), y_range=(-1,16), title="y = x^2")),
    ("y=-x^2",      dict(type="explicit", expr="-x**2", x_range=(-4,4), y_range=(-16,1), title="y = -x^2")),
    ("y=2x^2",      dict(type="explicit", expr="2*x**2", x_range=(-3,3), y_range=(-1,18), title="y = 2x^2")),
    ("y=0.5x^2",    dict(type="explicit", expr="0.5*x**2", x_range=(-5,5), y_range=(-1,13), title="y = 1/2x^2")),
    ("y=x^2+2x-3",  dict(type="explicit", expr="x**2+2*x-3", x_range=(-5,3), y_range=(-5,12), title="y = x^2 + 2x - 3")),
    ("y=x^2-4x+3",  dict(type="explicit", expr="x**2-4*x+3", x_range=(-1,5), y_range=(-2,8), title="y = x^2 - 4x + 3")),
    ("y=-x^2+2x+3", dict(type="explicit", expr="-x**2+2*x+3", x_range=(-2,4), y_range=(-1,5), title="y = -x^2 + 2x + 3")),
    ("y=ax^2+bx+c", dict(type="explicit", expr="x**2-2*x-3", x_range=(-3,5), y_range=(-5,10), title="y = x^2 - 2x - 3")),
])

# ---- 三次函数 ----
_reg("三次函数", [
    ("y=x^3",       dict(type="explicit", expr="x**3", x_range=(-3,3), y_range=(-27,27), title="y = x^3")),
    ("y=-x^3",      dict(type="explicit", expr="-x**3", x_range=(-3,3), y_range=(-27,27), title="y = -x^3")),
    ("y=x^3-3x",    dict(type="explicit", expr="x**3-3*x", x_range=(-3,3), y_range=(-3,3), title="y = x^3 - 3x")),
    ("y=x^3-x",     dict(type="explicit", expr="x**3-x", x_range=(-2,2), y_range=(-2,2), title="y = x^3 - x")),
])

# ---- 反比例函数 ----
_reg("反比例函数", [
    ("y=1/x",       dict(type="explicit", expr="1/x", x_range=(-5,5), y_range=(-5,5), title="y = 1/x",
                         note="有两支，x=0 处有渐近线")),
    ("y=1/x^2",     dict(type="explicit", expr="1/x**2", x_range=(-5,5), y_range=(-0.5,8), title="y = 1/x^2")),
    ("y=2/x",       dict(type="explicit", expr="2/x", x_range=(-5,5), y_range=(-5,5), title="y = 2/x")),
    ("y=-1/x",      dict(type="explicit", expr="-1/x", x_range=(-5,5), y_range=(-5,5), title="y = -1/x")),
    ("y=k/x",       dict(type="explicit", expr="3/x", x_range=(-5,5), y_range=(-5,5), title="y = k/x (k=3)")),
])

# ---- 幂函数 ----
_reg("幂函数", [
    ("y=x^(1/2)",   dict(type="explicit", expr="np.sqrt(np.maximum(x,0))", x_range=(-0.5,9), y_range=(-0.5,4), title="y = sqrtx")),
    ("y=x^(1/3)",   dict(type="explicit", expr="np.cbrt(x)", x_range=(-8,8), y_range=(-2.5,2.5), title="y = cbrtx")),
    ("y=x^2",       dict(type="explicit", expr="x**2", x_range=(-4,4), y_range=(-1,16), title="y = x^2")),
    ("y=x^3",       dict(type="explicit", expr="x**3", x_range=(-3,3), y_range=(-27,27), title="y = x^3")),
    ("y=x^(-1)",    dict(type="explicit", expr="1/x", x_range=(-5,5), y_range=(-5,5), title="y = x^-^1")),
    ("y=x^0",       dict(type="explicit", expr="np.ones_like(x)", x_range=(-5,5), y_range=(-0.5,2), title="y = x^0 = 1 (x!=0)")),
])

# ---- 指数函数 ----
_reg("指数函数", [
    ("y=2^x",       dict(type="explicit", expr="2**x", x_range=(-4,4), y_range=(-0.5,16), title="y = 2^x")),
    ("y=e^x",       dict(type="explicit", expr="np.exp(x)", x_range=(-4,4), y_range=(-0.5,55), title="y = e^x")),
    ("y=10^x",      dict(type="explicit", expr="10**x", x_range=(-2,2), y_range=(-1,100), title="y = 10^x")),
    ("y=(1/2)^x",   dict(type="explicit", expr="0.5**x", x_range=(-4,4), y_range=(-0.5,16), title="y = (1/2)^x")),
    ("y=(1/e)^x",   dict(type="explicit", expr="np.exp(-x)", x_range=(-4,4), y_range=(-0.5,55), title="y = e^-^x")),
    ("y=a^x_01",    dict(type="explicit", expr="3**x", x_range=(-3,3), y_range=(-0.5,27), title="y = a^x (a=3>1)")),
    ("y=a^x_02",    dict(type="explicit", expr="0.2**x", x_range=(-3,4), y_range=(-1,30), title="y = a^x (a=0.2, 0<a<1)")),
    ("y=e^x-1",     dict(type="explicit", expr="np.exp(x)-1", x_range=(-4,3), y_range=(-2,19), title="y = e^x - 1")),
])

# ---- 对数函数 ----
_reg("对数函数", [
    ("y=ln(x)",     dict(type="explicit", expr="np.log(x)", x_range=(0.01,10), y_range=(-5,3), title="y = ln x")),
    ("y=log2(x)",   dict(type="explicit", expr="np.log2(x)", x_range=(0.01,10), y_range=(-5,4), title="y = log_2 x")),
    ("y=log10(x)",  dict(type="explicit", expr="np.log10(x)", x_range=(0.01,12), y_range=(-3,2), title="y = log_1_0 x (lg x)")),
    ("y=log05(x)",  dict(type="explicit", expr="np.log(x)/np.log(0.5)", x_range=(0.01,10), y_range=(-4,5), title="y = log_0._5 x")),
    ("y=log_a>1",   dict(type="explicit", expr="np.log2(x)", x_range=(0.01,10), y_range=(-5,4), title="y = log_a x (a>1)")),
    ("y=log_0<a<1", dict(type="explicit", expr="np.log(x)/np.log(0.5)", x_range=(0.01,10), y_range=(-4,5), title="y = log_a x (0<a<1)")),
])

# ---- 三角函数 ----
_reg("三角函数", [
    ("y=sin(x)",    dict(type="explicit", expr="np.sin(x)", x_range=(-2*np.pi, 2*np.pi), y_range=(-1.5,1.5), title="y = sin x")),
    ("y=cos(x)",    dict(type="explicit", expr="np.cos(x)", x_range=(-2*np.pi, 2*np.pi), y_range=(-1.5,1.5), title="y = cos x")),
    ("y=tan(x)",    dict(type="explicit", expr="np.tan(x)", x_range=(-1.55, 1.55), y_range=(-5,5), title="y = tan x",
                         note="有渐近线 x=pi/2+kpi")),
    ("y=cot(x)",    dict(type="explicit", expr="1/np.tan(x)", x_range=(0.02, np.pi-0.02), y_range=(-5,5), title="y = cot x")),
    ("y=2sin(x)",   dict(type="explicit", expr="2*np.sin(x)", x_range=(-2*np.pi, 2*np.pi), y_range=(-2.5,2.5), title="y = 2sin x")),
    ("y=sin(2x)",   dict(type="explicit", expr="np.sin(2*x)", x_range=(-np.pi, np.pi), y_range=(-1.5,1.5), title="y = sin 2x")),
    ("y=sin(x+pi/3)",dict(type="explicit", expr="np.sin(x+np.pi/3)", x_range=(-2*np.pi, 2*np.pi), y_range=(-1.5,1.5), title="y = sin(x + pi/3)")),
    ("y=Asin(wx+f)",dict(type="explicit", expr="2*np.sin(1.5*x+np.pi/4)", x_range=(-2*np.pi, 2*np.pi), y_range=(-2.5,2.5), title="y = 2sin(1.5x + pi/4)")),
    ("y=|sin(x)|",  dict(type="explicit", expr="np.abs(np.sin(x))", x_range=(-2*np.pi, 2*np.pi), y_range=(-0.2,1.5), title="y = |sin x|")),
])

# ---- 绝对值函数 ----
_reg("绝对值函数", [
    ("y=|x|",       dict(type="explicit", expr="np.abs(x)", x_range=(-5,5), y_range=(-1,6), title="y = |x|")),
    ("y=|x-2|",     dict(type="explicit", expr="np.abs(x-2)", x_range=(-3,7), y_range=(-1,6), title="y = |x - 2|")),
    ("y=|x+1|-|x-1|",dict(type="explicit", expr="np.abs(x+1)-np.abs(x-1)", x_range=(-4,4), y_range=(-3,3), title="y = |x+1| - |x-1|")),
    ("y=x+|x|",     dict(type="explicit", expr="x+np.abs(x)", x_range=(-5,5), y_range=(-3,12), title="y = x + |x|")),
    ("y=|x^2-1|",   dict(type="explicit", expr="np.abs(x**2-1)", x_range=(-3,3), y_range=(-1,8), title="y = |x^2 - 1|")),
])

# ---- 取整函数 / 分段函数 ----
_reg("取整与分段函数", [
    ("y=[x]",       dict(type="explicit", expr="np.floor(x)", x_range=(-5,5), y_range=(-5,5), title="y = [x]（取整函数）",
                         note="阶梯状，每段左闭右开")),
    ("y={x}",       dict(type="explicit", expr="x-np.floor(x)", x_range=(-3,3), y_range=(-0.2,1.2), title="y = {x}（小数部分）")),
    ("y=sgn(x)",    dict(type="explicit", expr="np.sign(x)", x_range=(-5,5), y_range=(-1.5,1.5), title="y = sgn(x)（符号函数）")),
    ("y=[x>=0]",    dict(type="explicit", expr="np.where(x>=0, 1, 0)", x_range=(-5,5), y_range=(-0.3,1.5), title="y = 1 (x>=0), 0 (x<0)")),
])

# ---- 对勾函数（耐克函数）等 ----
_reg("对勾函数与特殊函数", [
    ("y=x+1/x",     dict(type="explicit", expr="x+1/x", x_range=(-5,5), y_range=(-5,5), title="y = x + 1/x（对勾函数/耐克函数）",
                         note="渐近线 y=x 和 x=0")),
    ("y=x-1/x",     dict(type="explicit", expr="x-1/x", x_range=(-5,5), y_range=(-5,5), title="y = x - 1/x")),
    ("y=ax+b/x",    dict(type="explicit", expr="2*x+3/x", x_range=(-5,5), y_range=(-8,8), title="y = 2x + 3/x")),
    ("y=ln(x)/x",   dict(type="explicit", expr="np.log(x)/x", x_range=(0.05,10), y_range=(-1, 0.5), title="y = (ln x)/x")),
    ("y=x*e^x",     dict(type="explicit", expr="x*np.exp(x)", x_range=(-5,2), y_range=(-0.5,3), title="y = x*e^x")),
    ("y=x/e^x",     dict(type="explicit", expr="x/np.exp(x)", x_range=(-2,6), y_range=(-0.8,0.5), title="y = x / e^x")),
])

# ---- 圆的方程 ----
_reg("圆的方程", [
    ("x^2+y^2=1",       dict(type="implicit", expr="x**2+y**2-1", x_range=(-1.5,1.5), y_range=(-1.5,1.5), title="x^2 + y^2 = 1")),
    ("x^2+y^2=4",       dict(type="implicit", expr="x**2+y**2-4", x_range=(-2.5,2.5), y_range=(-2.5,2.5), title="x^2 + y^2 = 4")),
    ("(x-1)^2+(y+2)^2=4", dict(type="implicit", expr="(x-1)**2+(y+2)**2-4", x_range=(-1.5,3.5), y_range=(-4.5,0.5), title="(x-1)^2 + (y+2)^2 = 4")),
    ("x^2+y^2+Dx+Ey+F=0", dict(type="implicit", expr="x**2+y**2-2*x+4*y-4", x_range=(-2,4), y_range=(-5,1), title="x^2+y^2-2x+4y-4=0")),
])

# ---- 椭圆 ----
_reg("椭圆", [
    ("x^2/4+y^2=1",     dict(type="implicit", expr="x**2/4+y**2-1", x_range=(-2.5,2.5), y_range=(-1.5,1.5), title="x^2/4 + y^2 = 1")),
    ("x^2/9+y^2/4=1",   dict(type="implicit", expr="x**2/9+y**2/4-1", x_range=(-3.5,3.5), y_range=(-2.5,2.5), title="x^2/9 + y^2/4 = 1")),
    ("x^2+y^2/4=1",     dict(type="implicit", expr="x**2+y**2/4-1", x_range=(-1.5,1.5), y_range=(-2.5,2.5), title="x^2 + y^2/4 = 1")),
    ("x^2/16+y^2/9=1",  dict(type="implicit", expr="x**2/16+y**2/9-1", x_range=(-4.5,4.5), y_range=(-3.5,3.5), title="x^2/16 + y^2/9 = 1")),
])

# ---- 双曲线 ----
_reg("双曲线", [
    ("x^2-y^2=1",       dict(type="implicit", expr="x**2-y**2-1", x_range=(-4,4), y_range=(-4,4), title="x^2 - y^2 = 1",
                             note="渐近线 y=±x")),
    ("x^2/4-y^2/9=1",   dict(type="implicit", expr="x**2/4-y**2/9-1", x_range=(-6,6), y_range=(-8,8), title="x^2/4 - y^2/9 = 1",
                             note="渐近线 y=±(3/2)x")),
    ("y^2-x^2=1",       dict(type="implicit", expr="y**2-x**2-1", x_range=(-4,4), y_range=(-4,4), title="y^2 - x^2 = 1",
                             note="上下开口")),
    ("y^2/4-x^2/9=1",   dict(type="implicit", expr="y**2/4-x**2/9-1", x_range=(-8,8), y_range=(-5,5), title="y^2/4 - x^2/9 = 1")),
])

# ---- 抛物线（标准方程）----
_reg("抛物线（标准方程）", [
    ("y^2=4x",      dict(type="implicit", expr="y**2-4*x", x_range=(-1,5), y_range=(-5,5), title="y^2 = 4x（焦点 (1,0)）")),
    ("y^2=-4x",     dict(type="implicit", expr="y**2+4*x", x_range=(-5,1), y_range=(-5,5), title="y^2 = -4x")),
    ("x^2=4y",      dict(type="implicit", expr="x**2-4*y", x_range=(-4,4), y_range=(-1,5), title="x^2 = 4y（焦点 (0,1)）")),
    ("x^2=-4y",     dict(type="implicit", expr="x**2+4*y", x_range=(-4,4), y_range=(-5,1), title="x^2 = -4y")),
    ("y=ax^2",      dict(type="explicit", expr="0.5*x**2", x_range=(-4,4), y_range=(-1,8), title="y = 1/2x^2（抛物线标准形式）")),
])

# ---- 常用函数组合 / 比较 ----
_reg("函数比较（多函数同图）", [
    ("exp_vs_log",  dict(type="multi", exprs=["np.exp(x)", "np.log(x)", "x"],
                         labels=["y=e^x", "y=ln x", "y=x"],
                         x_range=(-2,5), y_range=(-3,8),
                         title="指数函数与对数函数（互为反函数）")),
    ("sin_cos_tan", dict(type="multi", exprs=["np.sin(x)", "np.cos(x)", "np.tan(x)"],
                         labels=["y=sin x", "y=cos x", "y=tan x"],
                         x_range=(-2*np.pi, 2*np.pi), y_range=(-3,3),
                         title="三角函数比较")),
    ("powers",      dict(type="multi", exprs=["x", "x**2", "x**3", "np.sqrt(np.maximum(x,0))"],
                         labels=["y=x", "y=x^2", "y=x^3", "y=sqrtx"],
                         x_range=(0,3), y_range=(-0.5,9),
                         title="幂函数比较（第一象限）")),
    ("quadratics",  dict(type="multi", exprs=["x**2", "2*x**2", "0.5*x**2"],
                         labels=["y=x^2", "y=2x^2", "y=1/2x^2"],
                         x_range=(-3,3), y_range=(-1,12),
                         title="二次函数比较（a 的影响）")),
])

# ---- 三角函数补充（arc）----
_reg("反三角函数", [
    ("y=arcsin(x)", dict(type="explicit", expr="np.arcsin(x)", x_range=(-1,1), y_range=(-np.pi/2-0.3, np.pi/2+0.3), title="y = arcsin x")),
    ("y=arccos(x)", dict(type="explicit", expr="np.arccos(x)", x_range=(-1,1), y_range=(-0.3, np.pi+0.3), title="y = arccos x")),
    ("y=arctan(x)", dict(type="explicit", expr="np.arctan(x)", x_range=(-5,5), y_range=(-np.pi/2-0.3, np.pi/2+0.3), title="y = arctan x")),
])

# ---- 参数化函数（可自定义常数）----
_reg("参数化函数", [
    ("quad_abc",    dict(type="explicit", expr="a*x**2+b*x+c", params={"a": 1, "b": -2, "c": 1},
                         x_range=(-3, 5), y_range=(-3, 5), title="y = ax^2+bx+c (可改 a,b,c)")),
    ("linear_kb",   dict(type="explicit", expr="k*x+b", params={"k": 2, "b": 1},
                         x_range=(-5, 5), y_range=(-9, 11), title="y = kx+b (可改 k,b)")),
    ("sin_Asinwf",  dict(type="explicit", expr="A*np.sin(w*x+f)", params={"A": 2, "w": 1.5, "f": 0.5},
                         x_range=(-2*np.pi, 2*np.pi), y_range=(-2.5, 2.5), title="y = A*sin(wx+f)")),
    ("ellipse_ab",  dict(type="implicit", expr="x**2/a**2+y**2/b**2-1", params={"a": 3, "b": 2},
                         x_range=(-3.5, 3.5), y_range=(-2.5, 2.5), title="x^2/a^2+y^2/b^2=1")),
    ("circle_r",    dict(type="implicit", expr="x**2+y**2-R**2", params={"R": 2},
                         x_range=(-2.5, 2.5), y_range=(-2.5, 2.5), title="x^2+y^2=R^2")),
])


# ============================================================
# 绘图函数
# ============================================================

def _mask_extreme(y, threshold=50):
    """将超出阈值的值替换为 NaN，使得曲线在渐近线处断开"""
    return np.ma.masked_where(np.abs(y) > threshold, y)


def plot_explicit(ax, cfg, x_min, x_max):
    """绘制显函数 y=f(x)"""
    # 处理有间断点的函数：分段采样
    expr_str = cfg["expr"]
    f = eval(f"lambda x: {expr_str}", _make_eval_context(cfg.get("params")))

    # 在 [x_min, x_max] 上采样，避开 x=0 处的间断
    gaps = [0] if ("1/x" in expr_str.replace(" ", "") or "/x" in expr_str.replace(" ", "") or "/ (x)" in expr_str.replace(" ", "")) else []
    # 更通用的检测：如果表达式包含除法
    if "/" in expr_str and "x" in expr_str:
        gaps = [0]  # 在 x=0 处打断

    segments = []
    start = x_min
    for g in sorted(gaps):
        if start < g - 1e-6:
            segments.append((start, g - 0.001))
        if g + 0.001 < x_max:
            start = g + 0.001
        else:
            start = x_max
    if start < x_max:
        segments.append((start, x_max))
    if not segments:
        segments = [(x_min, x_max)]

    for seg_start, seg_end in segments:
        x = np.linspace(seg_start, seg_end, 2000)
        try:
            y = f(x)
            y = _mask_extreme(y)
            ax.plot(x, y, linewidth=LINE_WIDTH, color="#2c3e50",
                    path_effects=[patheffects.Stroke(linewidth=LINE_WIDTH+1, foreground='white', alpha=0.5),
                                  patheffects.Normal()])
        except Exception:
            # 跳过无法计算的点
            x = np.linspace(seg_start, seg_end, 2000)
            valid_mask = np.ones_like(x, dtype=bool)
            for i, xi in enumerate(x):
                try:
                    _ = f(xi)
                except Exception:
                    valid_mask[i] = False
            x_valid = x[valid_mask]
            if len(x_valid) > 0:
                y = np.array([f(xi) for xi in x_valid])
                y = _mask_extreme(y)
                ax.plot(x_valid, y, linewidth=LINE_WIDTH, color="#2c3e50",
                        path_effects=[patheffects.Stroke(linewidth=LINE_WIDTH+1, foreground='white', alpha=0.5),
                                      patheffects.Normal()])


def plot_implicit(ax, cfg, x_min, x_max, y_min, y_max):
    """绘制隐式方程 f(x,y)=0 使用 contour"""
    expr_str = cfg["expr"]
    f = eval(f"lambda x, y: {expr_str}", _make_eval_context(cfg.get("params")))

    x = np.linspace(x_min, x_max, 800)
    y = np.linspace(y_min, y_max, 800)
    X, Y = np.meshgrid(x, y)
    try:
        Z = f(X, Y)
    except Exception:
        Z = np.zeros_like(X)
        for i in range(len(x)):
            for j in range(len(y)):
                try:
                    Z[j, i] = f(X[j, i], Y[j, i])
                except Exception:
                    Z[j, i] = np.nan

    ax.contour(X, Y, Z, levels=[0], colors="#2c3e50", linewidths=LINE_WIDTH)


def plot_parametric(ax, cfg, t_min, t_max):
    """绘制参数方程 x(t), y(t)"""
    x_expr, y_expr = cfg["expr"].split(";")
    ctx = _make_eval_context(cfg.get("params"))
    fx = eval(f"lambda t: {x_expr.strip()}", ctx)
    fy = eval(f"lambda t: {y_expr.strip()}", ctx)

    t = np.linspace(t_min, t_max, 2000)
    try:
        x = fx(t)
        y = fy(t)
    except Exception:
        x = np.array([fx(ti) for ti in t])
        y = np.array([fy(ti) for ti in t])

    ax.plot(x, y, linewidth=LINE_WIDTH, color="#2c3e50")


def plot_multi(ax, cfg, x_min, x_max):
    """绘制多条函数在同一图中"""
    colors = ["#e74c3c", "#2980b9", "#27ae60", "#8e44ad", "#f39c12", "#1abc9c"]
    n_exprs = len(cfg["exprs"])
    default_labels = cfg.get("labels", [f"f{j+1}" for j in range(n_exprs)])
    for idx, (expr_str, label) in enumerate(zip(cfg["exprs"], default_labels)):
        f = eval(f"lambda x: {expr_str}", _make_eval_context(cfg.get("params")))
        x = np.linspace(x_min, x_max, 2000)
        try:
            y = f(x)
        except Exception:
            y = np.array([f(xi) for xi in x])
        y = _mask_extreme(y)
        ax.plot(x, y, linewidth=LINE_WIDTH, color=colors[idx % len(colors)], label=label,
                path_effects=[patheffects.Stroke(linewidth=LINE_WIDTH+1, foreground='white', alpha=0.5),
                              patheffects.Normal()])
    ax.legend(loc="best", fontsize=10, framealpha=0.8)


def draw_axes(ax, x_min, x_max, y_min, y_max):
    """绘制坐标轴（带箭头）"""
    # 坐标轴线
    ax.axhline(y=0, color="black", linewidth=0.8, zorder=0)
    ax.axvline(x=0, color="black", linewidth=0.8, zorder=0)

    # 箭头
    dx = (x_max - x_min) * 0.015
    dy = (y_max - y_min) * 0.015
    ax.annotate("", xy=(x_max, 0), xytext=(x_max - dx*5, 0),
                arrowprops=dict(arrowstyle="->", color="black", lw=1.2))
    ax.annotate("", xy=(0, y_max), xytext=(0, y_max - dy*5),
                arrowprops=dict(arrowstyle="->", color="black", lw=1.2))

    # 原点标签
    ax.text(-dx*3, -dy*3, "O", fontsize=10, ha="right", va="top")

    # 轴标签
    ax.text(x_max + dx, -dy*2, "x", fontsize=12, ha="left", va="center")
    ax.text(-dx*2, y_max + dy, "y", fontsize=12, ha="center", va="bottom")


def _sanitize_title(title):
    """将 Unicode 数学符号替换为 ASCII，确保字体兼容。"""
    reps = {
        '²': '^2', '³': '^3', '¹': '^1', '⁰': '^0',
        '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7',
        '⁸': '^8', '⁹': '^9',
        'ⁿ': '^n', 'ˣ': '^x', '⁻': '^-', '⁺': '^+',
        '₁': '_1', '₂': '_2', '₃': '_3', '₀': '_0',
        '₄': '_4', '₅': '_5', '₆': '_6', '₇': '_7',
        '₈': '_8', '₉': '_9',
        '√': 'sqrt', '∛': 'cbrt',
        '½': '1/2', '⅓': '1/3', '¼': '1/4',
        'π': 'pi', '·': '*',
        '≠': '!=', '≥': '>=', '≤': '<=',
    }
    for uni, ascii_val in reps.items():
        title = title.replace(uni, ascii_val)
    return title


def save_plot(cfg, x_min, x_max, y_min, y_max, title, filename):
    """生成并保存函数图像"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=FIG_SIZE)
    fig.patch.set_facecolor("white")
    ax.set_facecolor("#f8f9fa")

    plot_type = cfg["type"]

    if plot_type == "explicit":
        plot_explicit(ax, cfg, x_min, x_max)
    elif plot_type == "implicit":
        plot_implicit(ax, cfg, x_min, x_max, y_min, y_max)
    elif plot_type == "parametric":
        t_min, t_max = x_min, x_max  # 对参数方程, x_min/x_max 实际是 t_min/t_max
        plot_parametric(ax, cfg, t_min, t_max)
    elif plot_type == "multi":
        plot_multi(ax, cfg, x_min, x_max)

    # 绘制坐标轴
    draw_axes(ax, x_min, x_max, y_min, y_max)

    # 设置范围
    ax.set_xlim(x_min, x_max)
    ax.set_ylim(y_min, y_max)

    # 智能宽高比：xy范围差距3倍以内用等比例（保形），差距太大用auto（可读性优先）
    x_span = x_max - x_min
    y_span = y_max - y_min
    if y_span > 0:
        ratio = x_span / y_span
        if 0.33 < ratio < 3:
            ax.set_aspect('equal')
            fig.set_size_inches(FIG_SIZE[0] * max(ratio, 0.4), FIG_SIZE[1], forward=True)
        else:
            ax.set_aspect('auto')
    else:
        ax.set_aspect('equal')

    # 网格
    ax.grid(True, alpha=GRID_ALPHA, linestyle="--")

    # 标题
    full_title = _sanitize_title(title or cfg.get("title", ""))
    if cfg.get("note"):
        full_title += f"\n({_sanitize_title(cfg['note'])})"
    ax.set_title(full_title, fontsize=14, fontweight="bold", pad=15)

    # 刻度
    ax.tick_params(labelsize=9)

    # 保存
    filepath = OUTPUT_DIR / filename
    plt.tight_layout()
    fig.savefig(filepath, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"  ✓ 已生成: {filepath}")


# ============================================================
# 输入解析
# ============================================================

def _match_predefined(line: str):
    """在预定义函数库中查找最长的匹配名称（处理名称中含 | 的情况）。

    返回 (name, rest_of_line) 或 (None, line)。
    rest_of_line 是去掉函数名后的剩余部分（去掉开头的 |）。
    """
    best_name = None
    for name in PREDEFINED:
        if line == name:
            return (name, "")
        if line.startswith(name + "|"):
            if best_name is None or len(name) > len(best_name):
                best_name = name
    if best_name:
        return (best_name, line[len(best_name) + 1:])  # +1 跳过 |
    return (None, line)


def _parse_fields(rest: str):
    """将参数字符串按 | 切分为字段列表（最多 6 个字段，保护标题/文件名中的 |）。

    返回包含 6 个元素的列表 [x_min, x_max, y_min, y_max, title, filename]，
    缺失的字段为 None。
    """
    # 先按 | 分割全部
    raw = [p.strip() for p in rest.split("|")] if rest else []
    # 最后两个字段是 title 和 filename，它们可能包含 | 需要重新拼接
    # 格式：x_min | x_max | y_min | y_max | title | filename
    # 如果 raw 超过 6 个字段，把多的合并到 title
    if len(raw) > 6:
        # 前 4 个：x_min, x_max, y_min, y_max
        # 倒数第 1 个：filename
        # 中间的全部合并为 title（用 | 重新连接）
        fields = raw[:4]
        fields.append("|".join(raw[4:-1]))  # title 包含 |
        fields.append(raw[-1])               # filename
    else:
        fields = raw

    # 补齐到 6 个字段
    while len(fields) < 6:
        fields.append(None)
    return fields


def parse_line(line: str, line_no: int):
    """
    解析一行输入，返回 (cfg, x_min, x_max, y_min, y_max, title, filename)
    或 ("batch", [name1, name2, ...]) 表示批量生成
    或 None 表示跳过
    """
    line = line.strip()
    if not line or line.startswith("#"):
        return None

    # 批量生成：@类别名 或 @all
    if line.startswith("@"):
        name = line[1:].strip()
        if name == "all":
            return ("batch_all", list(PREDEFINED.keys()))
        else:
            # 按类别筛选
            matched = [k for k, v in PREDEFINED.items() if v.get("category") == name]
            if matched:
                return ("batch", matched)
            else:
                print(f"  ⚠ 第 {line_no} 行：未找到类别 '{name}'，已跳过")
                return None

    # 尝试匹配预定义函数
    matched_name, rest = _match_predefined(line)
    user_params = {}  # 用户传入的参数，如 a=1,b=2
    if matched_name:
        cfg = PREDEFINED[matched_name].copy()
        # 预定义函数的默认参数
        if "params" in cfg:
            user_params.update(cfg["params"])
        fields = _parse_fields(rest)
    else:
        # 自定义函数：取第一个 | 之前的内容作为表达式
        if "|" in line:
            expr, rest = line.split("|", 1)
            expr = expr.strip()
        else:
            expr = line
            rest = ""
        fields = _parse_fields(rest)

        # 从表达式中提取参数（expr;a=1,b=2）
        expr, extra_params = _extract_params(expr)
        user_params.update(extra_params)

        # 判断表达式类型
        if expr.startswith("eq:"):
            cfg = {"type": "implicit", "expr": expr[3:].strip()}
        elif expr.startswith("par:"):
            cfg = {"type": "parametric", "expr": expr[4:].strip()}
        elif expr.startswith("multi:"):
            exprs = [e.strip() for e in expr[6:].strip().split(";")]
            cfg = {"type": "multi", "exprs": exprs, "labels": exprs}
        else:
            cfg = {"type": "explicit", "expr": expr}

    # 将参数存入 cfg，供 eval 使用
    if user_params:
        cfg["params"] = user_params

    x_min_str, x_max_str, y_min_str, y_max_str, title, filename = fields

    # 解析数值参数
    if x_min_str is not None and x_min_str != "":
        try:
            x_min = float(x_min_str)
            x_max = float(x_max_str) if x_max_str and x_max_str != "" else x_min + 6
        except ValueError:
            print(f"  ⚠ 第 {line_no} 行：无法解析 x_min='{x_min_str}'，使用默认值")
            x_min, x_max = cfg.get("x_range", (-5, 5))
    elif "x_range" in cfg:
        x_min, x_max = cfg["x_range"]
    else:
        x_min, x_max = -5, 5

    if y_min_str is not None and y_min_str != "" and y_min_str.lower() != "auto":
        try:
            y_min = float(y_min_str)
            y_max = float(y_max_str) if y_max_str and y_max_str != "" else y_min + 6
        except ValueError:
            print(f"  ⚠ 第 {line_no} 行：无法解析 y_min='{y_min_str}'，使用默认值")
            y_min, y_max = cfg.get("y_range", (-5, 5))
    elif "y_range" in cfg:
        y_min, y_max = cfg["y_range"]
    else:
        y_min, y_max = -5, 5

    if not title:
        title = cfg.get("title", matched_name or cfg.get("expr", "function"))

    if not filename:
        # 自动生成文件名
        base_name = matched_name or cfg.get("expr", "function")
        # 对特殊字符做区分性替换，避免不同表达式产生相同文件名
        safe_name = base_name.replace("/", "_over_").replace("\\", "_")
        safe_name = safe_name.replace(":", "_").replace("|", "_")
        # 保留 ^ ( ) 等，仅过滤掉真正非法的文件名字符
        safe_name = "".join(c if c.isalnum() or c in "._-+^()[]{}" else "_" for c in safe_name)
        # 压缩连续下划线
        import re as _re
        safe_name = _re.sub(r'_+', '_', safe_name)
        safe_name = safe_name.strip("_") or "function"
        filename = f"{safe_name}.png"
    elif not filename.endswith(".png"):
        filename += ".png"

    return (cfg, x_min, x_max, y_min, y_max, title, filename)


def parse_input(filepath):
    """读取并解析 input.txt"""
    if not filepath.exists():
        print(f"❌ 找不到输入文件: {filepath}")
        print(f"   将创建示例 input.txt，请编辑后重新运行。")
        create_sample_input(filepath)
        return []

    tasks = []
    with open(filepath, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            result = parse_line(line, i)
            if result is not None:
                tasks.append((i, result))

    return tasks


def create_sample_input(filepath):
    """创建示例输入文件"""
    sample = """# ============================================================
# 高中数学函数图像生成器 - 输入配置
# ============================================================
# 格式说明：
#   * # 开头的行为注释，空行被忽略
#   * @all                        → 生成所有预定义函数
#   * @类别名                     → 生成该类别下所有函数
#   * 函数名                      → 使用默认参数生成预定义函数
#   * 函数名|x_min|x_max|y_min|y_max|标题|文件名 → 覆盖默认参数
#   * 表达式|x_min|x_max|y_min|y_max|标题|文件名  → 自定义显函数 y=f(x)
#   * eq:表达式|...               → 隐式方程 f(x,y)=0
#   * par:x(t);y(t)|t_min|t_max|x_min|x_max|y_min|y_max|标题|文件名 → 参数方程
#   * multi:expr1;expr2;...|...   → 多函数比较图
#   * y_min / y_max 可设为 "auto"
#
# 运行 "python formula_to_image.py --list" 查看所有预定义函数
# 运行 "python formula_to_image.py --categories" 查看分类
# ============================================================

# ---- 基本初等函数（第一批）----
y=sin(x)
y=cos(x)
y=tan(x)|-1.55|1.55|-5|5|y = tan x|tan.png
y=x^2
y=x^3
y=1/x
y=e^x
y=ln(x)|0.01|10|-5|3|y = ln x|ln.png
y=|x|

# ---- 反比例函数 ----
y=2/x
y=-1/x
y=1/x^2

# ---- 幂函数与根式 ----
y=x^(1/2)|-0.5|9|-0.5|4|y = sqrt(x)|sqrt_x.png
y=x^(1/3)|-8|8|-2.5|2.5|y = cbrt(x)|cbrt_x.png

# ---- 指数与对数 ----
y=2^x
y=(1/2)^x
y=ln(x)|0.01|10|-5|3|y = ln x 自然对数|ln_nat.png
y=log10(x)|0.01|12|-3|2|y = lg x 常用对数|lg.png

# ---- 特殊函数 ----
y=x+1/x|-5|5|-5|5|对勾函数 y=x+1/x|nike.png
y=x-1/x|-5|5|-5|5|y=x-1/x|nike2.png
y=[x]|-5|5|-5|5|取整函数 y=[x]|floor.png

# ---- 二次函数（抛物线）----
y=x^2+2x-3|-5|3|-5|12|y=x^2+2x-3 顶点式|quad_vertex.png
y=-x^2+2x+3|-2|4|-1|5|y=-x^2+2x+3|quad_neg.png
y=0.5x^2|-5|5|-1|13|y=1/2 x^2|quad_half.png

# ---- 三次函数 ----
y=x^3-3x|-3|3|-3|3|y=x^3-3x 双峰|cubic_3x.png
y=x^3-x|-2|2|-2|2|y=x^3-x|cubic_x.png

# ---- 绝对值函数 ----
y=|x-2||-3|7|-1|6|y=|x-2||abs_shift.png
y=|x^2-1||-3|3|-1|8|y=|x^2-1||abs_quad.png

# ---- 反三角函数 ----
y=arcsin(x)|-1|1|-1.8|1.8|y = arcsin x|arcsin.png
y=arctan(x)|-5|5|-1.8|1.8|y = arctan x|arctan.png

# ---- 圆锥曲线（隐式方程）----
eq:x**2+y**2-1|-1.5|1.5|-1.5|1.5|单位圆 x^2+y^2=1|circle_unit.png
eq:(x-1)**2+(y+2)**2-4|-1.5|3.5|-4.5|0.5|圆 (x-1)^2+(y+2)^2=4|circle_shift.png
x^2/4+y^2=1
x^2/9+y^2/4=1
x^2-y^2=1
y^2=4x

# ---- 函数比较（多函数同图）----
exp_vs_log|-2|5|-3|8|指数函数与对数函数|exp_vs_log.png
sin_cos_tan|-6.28|6.28|-3|3|三角函数比较|trig_compare.png
powers|0|3|-0.5|9|幂函数比较|powers_cmp.png

# ---- 自定义函数示例 ----
# 表达式用 numpy 语法：x 为自变量，pi=3.14159，e=2.71828
# 可用函数：sin, cos, tan, arcsin, arccos, arctan, abs, sqrt, exp, log, log2, log10, sign, floor, ceil
2*sin(x+pi/4)|-6.28|6.28|-2.5|2.5|y=2sin(x+pi/4)|sin_shifted.png
x*exp(x)|-5|2|-0.5|3|y=x*e^x|xex.png
log(x)/x|0.05|10|-1|0.5|y=ln(x)/x|lnx_over_x.png

# ---- 参数化函数示例（用 ;a=值,b=值 传参数）----
# 二次函数：改 a,b,c
a*x^2+b*x+c;a=1,b=-4,c=3|-3|7|-3|10|y=x^2-4x+3|quad_param.png
# 圆：改半径
x^2+y^2-R^2;R=3|-3.5|3.5|-3.5|3.5|圆 x^2+y^2=9|circle_R3.png
# 椭圆：改半轴
x^2/a^2+y^2/b^2-1;a=5,b=3|-5.5|5.5|-3.5|3.5|椭圆 a=5,b=3|ellipse_ab.png
# 正弦型函数：改振幅、角频率、初相
A*sin(w*x+f);A=3,w=2,f=pi/4|-6.28|6.28|-3.5|3.5|y=3sin(2x+pi/4)|sin_param.png
# 指数函数：改底数和系数
k*a^x;k=2,a=3|-3|3|-1|18|y=2*3^x|exp_param.png
"""
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(sample)
    print(f"✓ 已创建示例配置文件: {filepath}")


def list_predefined():
    """列出所有预定义函数"""
    print("\n预定义函数列表（共 {} 个）：\n".format(len(PREDEFINED)))
    categories = {}
    for name, cfg in PREDEFINED.items():
        cat = cfg.get("category", "其他")
        categories.setdefault(cat, []).append(name)

    for cat, names in categories.items():
        print(f"【{cat}】（{len(names)} 个）")
        for n in names:
            cfg = PREDEFINED[n]
            print(f"    {n:<25s} → {cfg.get('title', '')}")
        print()

    print("用法：在 input.txt 中直接写函数名即可使用默认参数生成图像。")
    print("      也可以 @类别名 批量生成该类别下所有函数，或 @all 生成全部。")


def list_categories():
    """列出所有分类"""
    categories = {}
    for name, cfg in PREDEFINED.items():
        cat = cfg.get("category", "其他")
        categories.setdefault(cat, []).append(name)
    print("\n函数分类：")
    for cat, names in categories.items():
        print(f"  {cat}（{len(names)} 个）")


# ============================================================
# 主流程
# ============================================================

def main():
    global OUTPUT_DIR, INPUT_FILE
    # 命令行参数：python script.py [input.txt] [output_dir]
    if len(sys.argv) > 1:
        if sys.argv[1] in ("--list", "-l"):
            list_predefined()
            return
        if sys.argv[1] in ("--categories", "-c"):
            list_categories()
            return
        if sys.argv[1] in ("--help", "-h"):
            print(__doc__)
            return
    if len(sys.argv) >= 2 and not sys.argv[1].startswith("-"):
        INPUT_FILE = Path(sys.argv[1])
    if len(sys.argv) >= 3:
        OUTPUT_DIR = Path(sys.argv[2])

    tasks = parse_input(INPUT_FILE)
    if not tasks:
        return

    # 展开批量任务
    expanded = []
    for line_no, result in tasks:
        if isinstance(result, tuple) and result[0] in ("batch", "batch_all"):
            _, names = result
            for name in names:
                cfg = PREDEFINED[name].copy()
                x_min, x_max = cfg["x_range"]
                y_min, y_max = cfg["y_range"]
                title = cfg.get("title", name)
                safe_name = "".join(c if c.isalnum() or c in "._-+" else "_" for c in name).strip("_") or name
                filename = f"{safe_name}.png"
                expanded.append((line_no, (cfg, x_min, x_max, y_min, y_max, title, filename)))
        else:
            expanded.append((line_no, result))

    total = len(expanded)
    print(f"\n{'='*50}")
    print(f"  高中数学函数图像生成器")
    print(f"  共 {total} 个函数待生成")
    print(f"  输出目录: {OUTPUT_DIR.resolve()}")
    print(f"{'='*50}\n")

    success = 0
    for line_no, (cfg, x_min, x_max, y_min, y_max, title, filename) in expanded:
        try:
            print(f"[{success+1}/{total}] {title}")
            save_plot(cfg, x_min, x_max, y_min, y_max, title, filename)
            success += 1
        except Exception as e:
            print(f"  ✗ 失败（第 {line_no} 行）: {e}")

    print(f"\n{'='*50}")
    print(f"  完成！成功生成 {success}/{total} 张图像")
    print(f"  图像保存在: {OUTPUT_DIR.resolve()}")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
