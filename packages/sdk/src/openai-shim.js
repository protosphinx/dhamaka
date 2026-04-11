// Drop-in OpenAI-compatible shim.
//
// Lets any app that already speaks the OpenAI /v1/chat/completions protocol
// swap its backend for a local Locus instance with a single line of config.
//
//   import { Locus } from "locus";
//   import { installOpenAIShim } from "locus/openai";
//
//   const llm = await Locus.load();
//   installOpenAIShim(llm);           // intercepts fetch("/v1/chat/completions")

import { Chat } from "./chat.js";

export function installOpenAIShim(locus, { path = "/v1/chat/completions" } = {}) {
  if (typeof globalThis.fetch !== "function") return;
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (!url.endsWith(path)) return originalFetch(input, init);

    let body = {};
    const raw = init?.body;
    if (raw) {
      try {
        if (typeof raw === "string") body = JSON.parse(raw);
        else if (raw instanceof ArrayBuffer) body = JSON.parse(new TextDecoder().decode(raw));
        else if (ArrayBuffer.isView(raw)) body = JSON.parse(new TextDecoder().decode(raw));
        else if (typeof raw.text === "function") body = JSON.parse(await raw.text());
        else body = JSON.parse(String(raw));
      } catch {
        return new Response(
          JSON.stringify({ error: { message: "invalid JSON body" } }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
    }
    const messages = body.messages ?? [];
    const stream = !!body.stream;

    const chat = new Chat(locus);
    chat.messages = messages.slice();

    if (!stream) {
      const reply = await locus.complete(chat._render(), {
        temperature: body.temperature,
        maxTokens: body.max_tokens,
      });
      return new Response(
        JSON.stringify({
          id: `locus-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: locus.modelId,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: reply },
              finish_reason: "stop",
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const token of locus.stream(chat._render(), {
            temperature: body.temperature,
            maxTokens: body.max_tokens,
          })) {
            const chunk = {
              id: `locus-${Date.now()}`,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: locus.modelId,
              choices: [{ index: 0, delta: { content: token }, finish_reason: null }],
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: { "content-type": "text/event-stream" },
    });
  };
}
