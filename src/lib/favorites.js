// 收藏夹管理（localStorage）

const KEY = "zhixueban-favorites";

export function getFavorites() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function addFavorite(item) {
  const list = getFavorites();
  // 去重：同题目不重复收藏
  if (!list.some((f) => f.question === item.question)) {
    list.unshift({ ...item, savedAt: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list));
  }
}

export function removeFavorite(index) {
  const list = getFavorites();
  list.splice(index, 1);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function clearFavorites() {
  localStorage.removeItem(KEY);
}
