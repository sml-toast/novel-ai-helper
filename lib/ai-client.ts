// 墨笺的 AI 客户端：直接调用用户自己配置的 OpenAI 兼容 /v1/chat/completions（流式）。
// 不依赖任何后端；密钥只存在本机浏览器，从浏览器直连模型服务。

import type { CompanionKind } from "@/components/CompanionPanel";
import type { AiConfig } from "@/lib/settings-config";

const SYSTEM_PROMPT = `你是「墨笺」，一位坐在作者身旁的小说写作搭档。你不是工具，而是陪他往下写的人。
你的语言要像文学编辑又像朋友：敏锐、克制、有温度，不替作者决定剧情，只帮他把文字推得更深。
回答用中文，简洁有节奏，避免套话与说教。`;

function buildUserPrompt(kind: CompanionKind, text: string): string {
  const excerpt = text.length > 2000 ? text.slice(-2000) : text;
  switch (kind) {
    case "continue":
      return `这是作者刚写下的正文：\n\n"""\n${excerpt}\n"""\n\n请接着最后一句，续写一段（约 150–300 字）。只输出续写内容，不要解释、不要引号包裹。`;
    case "polish":
      return `这是作者写下的正文：\n\n"""\n${excerpt}\n"""\n\n请替他润色：不改动原意与人称，只理顺节奏、让短句有留白、情绪有落地的空隙。只输出润色后的全文，不要解释。`;
    case "foreshadow":
      return `这是作者写下的正文：\n\n"""\n${excerpt}\n"""\n\n请像编辑一样，指出文中已经埋下、却尚未回响的意象或细节（伏笔），并给一两句如何让它在后文呼应、加深回响的建议。用要点列出，简洁。`;
  }
}

export async function streamAi(
  cfg: AiConfig,
  kind: CompanionKind,
  text: string,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = `${base}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model || "gpt-4o-mini",
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(kind, text) },
      ],
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `AI 服务返回 ${res.status}${detail ? " · " + detail.slice(0, 140) : ""}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        /* 心跳或分片，忽略 */
      }
    }
  }
  return full;
}
