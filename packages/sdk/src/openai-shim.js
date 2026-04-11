// Drop-in OpenAI-compatible shim.
//
// Lets any app that already speaks the OpenAI /v1/chat/completions protocol
// swap its backend for a local Dhamaka instance with a single line of config.
//
//   import { Dhamaka } from "dhamaka";
//   import { installOpenAIShim } from "dhamaka/openai";
//
//   const llm = await Dhamaka.load();
//   installOpenAIShim(llm);           // intercepts fetch("/v1/chat/completions")

import { Chat } from "./chat.js";

export function installOpenAIShim(dhamaka, { path = "/v1/chat/completions" } = {}) {
  if (typeof globalThis.fetch !== "function") return;
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (!url.endsWith(path)) return originalFetch(input, init);

    const body = init?.body ? JSON.parse(init.body) : {};
    const messages = body.messages ?? [];
    const stream = !!body.stream;

    const chat = new Chat(dhamaka);
    chat.messages = messages.slice();

    if (!stream) {
      const reply = await dhamaka.complete(chat._render(), {
        temperature: body.temperature,
        maxTokens: body.max_tokens,
      });
      return new Response(
        JSON.stringify({
          id: `dhamaka-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: dhamaka.modelId,
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
          for await (const token of dhamaka.stream(chat._render(), {
            temperature: body.temperature,
            maxTokens: body.max_tokens,
          })) {
            const chunk = {
              id: `dhamaka-${Date.now()}`,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: dhamaka.modelId,
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
