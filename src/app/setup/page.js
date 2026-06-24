"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setApiKey, setApiBaseUrl, setApiModel, getApiKey, getApiBaseUrl, getApiModel } from "@/lib/api-key";
import { validateApiKey } from "@/lib/ai";
import { getFontSize, setFontSize } from "@/lib/font-size";

export default function SetupPage() {
  const router = useRouter();
  const [apiKey, setApiKeyState] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o");
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [fontSize, setFontSizeState] = useState("standard");

  // 客户端挂载后从 localStorage 加载已保存的配置
  useEffect(() => {
    setApiKeyState(getApiKey() || "");
    setBaseUrl(getApiBaseUrl() || "https://api.openai.com/v1");
    setModel(getApiModel() || "gpt-4o");
    setFontSizeState(getFontSize());
    setLoaded(true);
  }, []);

  function handleFontSizeChange(size) {
    setFontSizeState(size);
    setFontSize(size);
    document.documentElement.className = document.documentElement.className
      .replace(/font-\w+/g, "") + ` font-${size}`;
  }

  // 国内常用 API 快速切换
  const presets = [
    { label: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-4o" },
    { label: "DeepSeek", url: "https://api.deepseek.com/v1", model: "deepseek-v4-pro" },
    { label: "Moonshot", url: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
    { label: "通义千问", url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
    { label: "智谱", url: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4" },
  ];

  async function handleTest() {
    if (!apiKey.trim()) {
      setMessage({ type: "error", text: "请先输入 API Key" });
      return;
    }
    setTesting(true);
    setMessage(null);
    try {
      const result = await validateApiKey(apiKey.trim(), baseUrl.trim(), model.trim());
      if (result.valid) {
        setMessage({ type: "success", text: "✅ 连接成功！API Key 有效" });
      } else {
        setMessage({ type: "error", text: `❌ 验证失败：${result.error}` });
      }
    } catch (e) {
      setMessage({ type: "error", text: `❌ 网络错误：${e.message}` });
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    setApiKey(apiKey.trim());
    setApiBaseUrl(baseUrl.trim());
    setApiModel(model.trim());
    setMessage({ type: "success", text: "✅ 配置已保存！" });
    setTimeout(() => router.push("/create"), 800);
  }

  function handlePreset(preset) {
    setBaseUrl(preset.url);
    setModel(preset.model);
    setMessage(null);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-black dark:text-zinc-50">
        ⚙️ 配置你的 AI
      </h2>
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        输入你的 API Key，数据只保存在本地浏览器，不会被上传到任何服务器。
      </p>

      {/* API Key 输入 */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKeyState(e.target.value)}
          placeholder="sk-xxxxxxxxxxxxxxxx"
          className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
      </div>

      {/* 提供商和模型 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            API 地址
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
          />
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            模型名称
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      {/* 字号 */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">字号</label>
        <div className="flex gap-2">
          <button
            onClick={() => handleFontSizeChange("standard")}
            className={`flex-1 py-3 rounded-lg border-2 text-sm transition-colors ${fontSize === "standard" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300" : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"}`}
          >
            标准
          </button>
          <button
            onClick={() => handleFontSizeChange("large")}
            className={`flex-1 py-3 rounded-lg border-2 text-sm transition-colors ${fontSize === "large" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300" : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"}`}
          >
            大号
          </button>
        </div>
      </div>

      {/* 快捷切换 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          快捷切换国内 AI
        </label>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p)}
              className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400 transition-colors border border-zinc-200 dark:border-zinc-700"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleTest}
          disabled={testing}
          className="px-6 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          {testing ? "测试中..." : "🔍 测试连接"}
        </button>
        <button
          onClick={handleSave}
          disabled={!apiKey.trim()}
          className="px-6 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          💾 保存并开始
        </button>
      </div>

      {/* 提示信息 */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
