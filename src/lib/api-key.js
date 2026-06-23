// API Key 管理工具（纯前端，存 localStorage）

const STORAGE_KEYS = {
  API_KEY: "zhixueban-api-key",
  API_BASE_URL: "zhixueban-api-base",
  API_MODEL: "zhixueban-api-model",
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
