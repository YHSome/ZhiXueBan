// 检测客户端是否支持图形渲染（Python + numpy + matplotlib）
// 结果缓存在 sessionStorage，同标签页内复用

const CACHE_KEY = "zhixueban_graph_support";

export async function checkGraphSupport() {
  // 优先读缓存
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached === "1") return true;
    if (cached === "0") return false;
  } catch {}

  try {
    const res = await fetch("/api/graph/ping");
    const ok = res.ok;
    try { sessionStorage.setItem(CACHE_KEY, ok ? "1" : "0"); } catch {}
    return ok;
  } catch {
    try { sessionStorage.setItem(CACHE_KEY, "0"); } catch {}
    return false;
  }
}

// 同步读取缓存（首次渲染用，避免闪动）
export function getCachedGraphSupport() {
  try { return sessionStorage.getItem(CACHE_KEY) === "1"; } catch { return false; }
}
