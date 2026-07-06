"use client";

import { useState } from "react";

const CATEGORIES = [
  {
    name: "希腊字母",
    items: [
      { label: "α", code: "\\alpha" }, { label: "β", code: "\\beta" },
      { label: "γ", code: "\\gamma" }, { label: "δ", code: "\\delta" },
      { label: "ε", code: "\\epsilon" }, { label: "ζ", code: "\\zeta" },
      { label: "η", code: "\\eta" }, { label: "θ", code: "\\theta" },
      { label: "ι", code: "\\iota" }, { label: "κ", code: "\\kappa" },
      { label: "λ", code: "\\lambda" }, { label: "μ", code: "\\mu" },
      { label: "ν", code: "\\nu" }, { label: "ξ", code: "\\xi" },
      { label: "π", code: "\\pi" }, { label: "ρ", code: "\\rho" },
      { label: "σ", code: "\\sigma" }, { label: "τ", code: "\\tau" },
      { label: "υ", code: "\\upsilon" }, { label: "φ", code: "\\phi" },
      { label: "χ", code: "\\chi" }, { label: "ψ", code: "\\psi" },
      { label: "ω", code: "\\omega" },
      { label: "Γ", code: "\\Gamma" }, { label: "Δ", code: "\\Delta" },
      { label: "Θ", code: "\\Theta" }, { label: "Λ", code: "\\Lambda" },
      { label: "Ξ", code: "\\Xi" }, { label: "Π", code: "\\Pi" },
      { label: "Σ", code: "\\Sigma" }, { label: "Φ", code: "\\Phi" },
      { label: "Ψ", code: "\\Psi" }, { label: "Ω", code: "\\Omega" },
    ],
  },
  {
    name: "常用结构",
    items: [
      { label: "分式", code: "\\frac{}{}" },
      { label: "根号", code: "\\sqrt{}" },
      { label: "n次根", code: "\\sqrt[n]{}" },
      { label: "上标", code: "^{}" },
      { label: "下标", code: "_{}" },
      { label: "上下标", code: "_{}^{}" },
      { label: "极限", code: "\\lim_{x \\to \\infty}" },
      { label: "求和", code: "\\sum_{i=1}^{n}" },
      { label: "积分", code: "\\int_{a}^{b}" },
      { label: "二重积分", code: "\\iint_{D}" },
      { label: "闭曲线积分", code: "\\oint_{C}" },
      { label: "导数", code: "\\frac{d}{dx}" },
      { label: "偏导", code: "\\frac{\\partial}{\\partial x}" },
      { label: "组合数", code: "\\binom{n}{k}" },
      { label: "括号", code: "\\left( \\right)" },
      { label: "绝对值", code: "\\left| \\right|" },
      { label: "范数", code: "\\left\\| \\right\\|" },
      { label: "大括号", code: "\\begin{cases} \\\\ \\end{cases}" },
      { label: "矩阵2x2", code: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
      { label: "矩阵3x3", code: "\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}" },
      { label: "行列式", code: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}" },
    ],
  },
  {
    name: "运算符",
    items: [
      { label: "+", code: "+" }, { label: "−", code: "-" },
      { label: "×", code: "\\times" }, { label: "÷", code: "\\div" },
      { label: "±", code: "\\pm" }, { label: "∓", code: "\\mp" },
      { label: "·", code: "\\cdot" }, { label: "∗", code: "\\ast" },
      { label: "⋆", code: "\\star" }, { label: "∘", code: "\\circ" },
      { label: "•", code: "\\bullet" }, { label: "⊕", code: "\\oplus" },
      { label: "⊖", code: "\\ominus" }, { label: "⊗", code: "\\otimes" },
      { label: "⊘", code: "\\oslash" }, { label: "⊙", code: "\\odot" },
      { label: "∩", code: "\\cap" }, { label: "∪", code: "\\cup" },
      { label: "∨", code: "\\vee" }, { label: "∧", code: "\\wedge" },
      { label: "¬", code: "\\neg" }, { label: "∖", code: "\\setminus" },
    ],
  },
  {
    name: "关系符",
    items: [
      { label: "<", code: "<" }, { label: ">", code: ">" },
      { label: "=", code: "=" }, { label: "≤", code: "\\le" },
      { label: "≥", code: "\\ge" }, { label: "≠", code: "\\ne" },
      { label: "≈", code: "\\approx" }, { label: "≡", code: "\\equiv" },
      { label: "≅", code: "\\cong" }, { label: "∼", code: "\\sim" },
      { label: "≃", code: "\\simeq" }, { label: "≪", code: "\\ll" },
      { label: "≫", code: "\\gg" }, { label: "∝", code: "\\propto" },
      { label: "∈", code: "\\in" }, { label: "∉", code: "\\notin" },
      { label: "∋", code: "\\ni" }, { label: "⊂", code: "\\subset" },
      { label: "⊃", code: "\\supset" }, { label: "⊆", code: "\\subseteq" },
      { label: "⊇", code: "\\supseteq" }, { label: "⊄", code: "\\not\\subset" },
    ],
  },
  {
    name: "逻辑/集合",
    items: [
      { label: "∀", code: "\\forall" }, { label: "∃", code: "\\exists" },
      { label: "∄", code: "\\nexists" }, { label: "∅", code: "\\emptyset" },
      { label: "∞", code: "\\infty" }, { label: "∴", code: "\\therefore" },
      { label: "∵", code: "\\because" }, { label: "□", code: "\\square" },
      { label: "∈", code: "\\in" }, { label: "⊂", code: "\\subset" },
      { label: "→", code: "\\rightarrow" }, { label: "⇒", code: "\\Rightarrow" },
      { label: "↔", code: "\\leftrightarrow" }, { label: "⇔", code: "\\Leftrightarrow" },
      { label: "∧", code: "\\land" }, { label: "∨", code: "\\lor" },
      { label: "¬", code: "\\lnot" }, { label: "⊕", code: "\\oplus" },
    ],
  },
  {
    name: "微积分",
    items: [
      { label: "∂", code: "\\partial" }, { label: "∇", code: "\\nabla" },
      { label: "∫", code: "\\int" }, { label: "∬", code: "\\iint" },
      { label: "∭", code: "\\iiint" }, { label: "∮", code: "\\oint" },
      { label: "∯", code: "\\oiint" }, { label: "lim", code: "\\lim" },
      { label: "sup", code: "\\sup" }, { label: "inf", code: "\\inf" },
      { label: "max", code: "\\max" }, { label: "min", code: "\\min" },
      { label: "d/dx", code: "\\frac{d}{dx}" },
      { label: "∂/∂x", code: "\\frac{\\partial}{\\partial x}" },
      { label: "∫dx", code: "\\int_{}^{} dx" },
      { label: "∫∫", code: "\\iint_{D} dxdy" },
      { label: "渐近", code: "\\sim" },
      { label: "O符", code: "\\mathcal{O}" },
      { label: "o符", code: "o" },
    ],
  },
  {
    name: "几何",
    items: [
      { label: "∠", code: "\\angle" }, { label: "△", code: "\\triangle" },
      { label: "□", code: "\\square" }, { label: "⊥", code: "\\perp" },
      { label: "∥", code: "\\parallel" }, { label: "°", code: "^{\\circ}" },
      { label: "′", code: "'" }, { label: "″", code: "''" },
      { label: "π", code: "\\pi" }, { label: "⊙", code: "\\odot" },
      { label: "弧", code: "\\overset{\\Large\\frown}{AB}" },
      { label: "向量", code: "\\vec{}" },
      { label: "线段", code: "\\overline{AB}" },
    ],
  },
  {
    name: "箭头",
    items: [
      { label: "→", code: "\\to" }, { label: "←", code: "\\leftarrow" },
      { label: "⇒", code: "\\Rightarrow" }, { label: "⇐", code: "\\Leftarrow" },
      { label: "↔", code: "\\leftrightarrow" }, { label: "⇔", code: "\\Leftrightarrow" },
      { label: "→", code: "\\rightarrow" }, { label: "⟶", code: "\\longrightarrow" },
      { label: "↦", code: "\\mapsto" }, { label: "⟼", code: "\\longmapsto" },
      { label: "↑", code: "\\uparrow" }, { label: "↓", code: "\\downarrow" },
      { label: "⇑", code: "\\Uparrow" }, { label: "⇓", code: "\\Downarrow" },
      { label: "↗", code: "\\nearrow" }, { label: "↘", code: "\\searrow" },
      { label: "↖", code: "\\nwarrow" }, { label: "↙", code: "\\swarrow" },
      { label: "⇀", code: "\\rightharpoonup" }, { label: "↼", code: "\\leftharpoonup" },
    ],
  },
  {
    name: "杂项",
    items: [
      { label: "…", code: "\\dots" }, { label: "⋯", code: "\\cdots" },
      { label: "⋮", code: "\\vdots" }, { label: "⋱", code: "\\ddots" },
      { label: "ℏ", code: "\\hbar" }, { label: "ℓ", code: "\\ell" },
      { label: "ℜ", code: "\\Re" }, { label: "ℑ", code: "\\Im" },
      { label: "ℵ", code: "\\aleph" }, { label: "∂", code: "\\partial" },
      { label: "∥", code: "\\|" }, { label: "⊥", code: "\\bot" },
      { label: "⌊", code: "\\lfloor" }, { label: "⌋", code: "\\rfloor" },
      { label: "⌈", code: "\\lceil" }, { label: "⌉", code: "\\rceil" },
      { label: "⟨", code: "\\langle" }, { label: "⟩", code: "\\rangle" },
    ],
  },
  {
    name: "函数",
    items: [
      { label: "sin", code: "\\sin" }, { label: "cos", code: "\\cos" },
      { label: "tan", code: "\\tan" }, { label: "cot", code: "\\cot" },
      { label: "sec", code: "\\sec" }, { label: "csc", code: "\\csc" },
      { label: "arcsin", code: "\\arcsin" }, { label: "arccos", code: "\\arccos" },
      { label: "arctan", code: "\\arctan" }, { label: "sinh", code: "\\sinh" },
      { label: "cosh", code: "\\cosh" }, { label: "tanh", code: "\\tanh" },
      { label: "ln", code: "\\ln" }, { label: "log", code: "\\log" },
      { label: "lg", code: "\\lg" }, { label: "exp", code: "\\exp" },
      { label: "gcd", code: "\\gcd" }, { label: "lcm", code: "\\operatorname{lcm}" },
      { label: "det", code: "\\det" },
      { label: "dim", code: "\\dim" }, { label: "ker", code: "\\ker" },
    ],
  },
];

function insertAtCursor(textareaId, code) {
  const el = document.getElementById(textareaId);
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = el.value.slice(start, end);
  const text = selected || code;

  let cursorOffset = text.length;
  const firstBrace = text.indexOf("{}");
  if (firstBrace !== -1) cursorOffset = firstBrace + 1;

  el.setRangeText(text, start, end, "end");
  el.selectionStart = start + cursorOffset;
  el.selectionEnd = start + cursorOffset;
  el.focus();

  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) { setter.call(el, el.value); el.dispatchEvent(new Event("input", { bubbles: true })); }
}

export default function LatexToolbar({ textareaId }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(0);

  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setOpen(!open); }}
        className="text-xs px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors mt-1"
      >
        {open ? "✕ 关闭" : "𝑓 插入公式"}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 w-96 max-h-96 overflow-hidden flex flex-col"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex flex-wrap gap-1 p-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
            {CATEGORIES.map((cat, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCategory(i)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  category === i
                    ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 p-2 overflow-y-auto">
            {CATEGORIES[category].items.map((item) => (
              <button
                key={item.code}
                type="button"
                title={item.desc || item.code}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertAtCursor(textareaId, item.code);
                }}
                className="text-sm px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
