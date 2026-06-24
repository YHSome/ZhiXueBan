// 字号管理

const KEY = "zhixueban-font-size";

export function getFontSize() {
  if (typeof window === "undefined") return "standard";
  return localStorage.getItem(KEY) || "standard";
}

export function setFontSize(size) {
  localStorage.setItem(KEY, size);
}
