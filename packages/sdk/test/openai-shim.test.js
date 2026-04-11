import { test } from "node:test";
import assert from "node:assert/strict";
import { installOpenAIShim } from "../src/openai-shim.js";

function fakeDhamaka({ reply = "hello from mock" } = {}) {
  return {
    modelId: "dhamaka-test",
    async complete() {
      return reply;
    },
    async *stream() {
      for (const piece of reply.split(" ")) yield piece + " ";
    },
  };
}

test("openai shim: non-stream returns a well-formed ChatCompletion", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const llm = fakeDhamaka();
    installOpenAIShim(llm);
    const res = await fetch("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
        stream: false,
      }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.object, "chat.completion");
    assert.equal(json.model, "dhamaka-test");
    assert.equal(json.choices[0].message.role, "assistant");
    assert.equal(json.choices[0].message.content, "hello from mock");
    assert.equal(json.choices[0].finish_reason, "stop");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("openai shim: stream returns SSE chunks ending with [DONE]", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const llm = fakeDhamaka({ reply: "one two three" });
    installOpenAIShim(llm);
    const res = await fetch("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /event-stream/);
    const text = await res.text();
    assert.match(text, /data: \{/);
    assert.match(text, /data: \[DONE\]/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("openai shim: passes through non-matching URLs to the original fetch", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async (_url) => {
    called = true;
    return new Response("passthrough", { status: 200 });
  };
  try {
    const llm = fakeDhamaka();
    installOpenAIShim(llm);
    const res = await fetch("https://example.test/other");
    assert.equal(called, true);
    assert.equal(await res.text(), "passthrough");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
