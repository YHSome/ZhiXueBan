// AI API 代理路由 —— 支持 streaming 实时 token 显示
export async function POST(request) {
  try {
    const { apiKey, baseUrl, model, messages, temperature, maxTokens, stream: useStream } = await request.json();

    if (!apiKey || !baseUrl || !messages) {
      return Response.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const doStream = useStream !== false; // 默认流式

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
        stream: doStream,
      }),
    });

    // 非流式模式：直接返回 JSON
    if (!doStream) {
      const data = await response.json();
      if (!response.ok) {
        return Response.json({ error: data.error?.message || `API 错误: ${response.status}` }, { status: response.status });
      }
      return Response.json({
        content: data.choices[0].message.content,
        usage: data.usage || null,
      });
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return Response.json(
        { error: error.error?.message || `API 错误: ${response.status}` },
        { status: response.status }
      );
    }

    // 流式返回 SSE，透传给客户端
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // 直接把原始 SSE 字节传给客户端
            controller.enqueue(value);
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
