// AI API 代理路由 —— 避免浏览器跨域限制
export async function POST(request) {
  try {
    const { apiKey, baseUrl, model, messages, temperature, maxTokens } = await request.json();

    if (!apiKey || !baseUrl || !messages) {
      return Response.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o",
        messages,
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens || 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return Response.json(
        { error: error.error?.message || `API 错误: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json({ content: data.choices[0].message.content });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
