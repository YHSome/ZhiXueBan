// 调用 AI API 的工具函数

import { getApiConfig } from "./api-key";

// 通用的 AI 调用（从客户端发送配置，不经过服务端存储）
export async function callAI({ messages, temperature = 0.7, maxTokens = 4000 }) {
  const config = getApiConfig();

  if (!config.apiKey) {
    throw new Error("请先配置 API Key");
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API 请求失败: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 验证 API Key 是否有效
export async function validateApiKey(apiKey, baseUrl, model) {
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "回复：OK" }],
        max_tokens: 5,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { valid: false, error: error.error?.message || `状态码 ${response.status}` };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
