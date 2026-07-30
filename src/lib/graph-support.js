// 检测客户端是否支持各项能力
const CACHE_PYTHON = "zhixueban_caps_python";
const CACHE_GRAPH = "zhixueban_caps_graph";
const CACHE_PARSE = "zhixueban_caps_parse";

export async function checkCapabilities() {
  const caps = { python: false, numpy: false, matplotlib: false, parse: false };

  try {
    const res = await fetch("/api/graph/ping");
    if (res.ok) {
      const data = await res.json();
      caps.python = !!data.python;
      caps.numpy = !!data.numpy;
      caps.matplotlib = !!data.matplotlib;
      caps.parse = !!data.parse;
    }
  } catch { /* network error, assume nothing available */ }

  // 缓存到 sessionStorage
  try {
    sessionStorage.setItem(CACHE_PYTHON, caps.python ? "1" : "0");
    sessionStorage.setItem(CACHE_GRAPH, (caps.numpy && caps.matplotlib) ? "1" : "0");
    sessionStorage.setItem(CACHE_PARSE, caps.parse ? "1" : "0");
  } catch {}

  return caps;
}

// 同步读取缓存
export function getCachedCapabilities() {
  try {
    return {
      python: sessionStorage.getItem(CACHE_PYTHON) === "1",
      graph: sessionStorage.getItem(CACHE_GRAPH) === "1",
      parse: sessionStorage.getItem(CACHE_PARSE) === "1",
    };
  } catch { return { python: false, graph: false, parse: false }; }
}

// 兼容旧接口
export function checkGraphSupport() { return checkCapabilities().then(c => c.numpy && c.matplotlib); }
export function getCachedGraphSupport() { return getCachedCapabilities().graph; }
