// API Key 管理工具（纯前端，存 localStorage）

const STORAGE_KEYS = {
  API_KEY: "zhixueban-api-key",
  API_BASE_URL: "zhixueban-api-base",
  API_MODEL: "zhixueban-api-model",
  DIFFICULTY: "zhixueban-difficulty",
  DEV_MODE: "zhixueban-dev-mode",
};

// 默认值
const DEFAULTS = {
  BASE_URL: "https://api.openai.com/v1",
  MODEL: "gpt-4o",
};

// 获取存储的 API Key
export function getApiKey() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.API_KEY);
}

// 保存 API Key
export function setApiKey(key) {
  localStorage.setItem(STORAGE_KEYS.API_KEY, key);
}

// 获取 API 基础地址
export function getApiBaseUrl() {
  if (typeof window === "undefined") return DEFAULTS.BASE_URL;
  return localStorage.getItem(STORAGE_KEYS.API_BASE_URL) || DEFAULTS.BASE_URL;
}

// 保存 API 基础地址
export function setApiBaseUrl(url) {
  localStorage.setItem(STORAGE_KEYS.API_BASE_URL, url);
}

// 获取模型名称
export function getApiModel() {
  if (typeof window === "undefined") return DEFAULTS.MODEL;
  return localStorage.getItem(STORAGE_KEYS.API_MODEL) || DEFAULTS.MODEL;
}

// 保存模型名称
export function setApiModel(model) {
  localStorage.setItem(STORAGE_KEYS.API_MODEL, model);
}

// 检查是否已配置 API Key
export function hasApiKey() {
  return !!getApiKey();
}

// ── 开发者模式 ──
export function getDevMode() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEYS.DEV_MODE) === "1";
}
export function setDevMode(on) { localStorage.setItem(STORAGE_KEYS.DEV_MODE, on ? "1" : "0"); }

// ── 难度 ──
export function getDifficulty() {
  if (typeof window === "undefined") return "normal";
  return localStorage.getItem(STORAGE_KEYS.DIFFICULTY) || "normal";
}
export function setDifficulty(level) { localStorage.setItem(STORAGE_KEYS.DIFFICULTY, level); }
export function getDifficultyOptions() {
  return [
    { value: "easy", label: "简单", desc: "基础概念，入门练习" },
    { value: "normal", label: "基础", desc: "常规难度，巩固理解" },
    { value: "hard", label: "进阶", desc: "综合运用，高阶挑战" },
    { value: "challenge", label: "挑战", desc: "竞赛级别，深度推理" },
  ];
}

// 清除所有配置
export function clearApiConfig() {
  localStorage.removeItem(STORAGE_KEYS.API_KEY);
  localStorage.removeItem(STORAGE_KEYS.API_BASE_URL);
  localStorage.removeItem(STORAGE_KEYS.API_MODEL);
}

// 获取完整配置
export function getApiConfig() {
  return {
    apiKey: getApiKey(),
    baseUrl: getApiBaseUrl(),
    model: getApiModel(),
  };
}
