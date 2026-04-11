import { test } from "node:test";
import assert from "node:assert/strict";
import { Chat } from "../src/chat.js";

// Minimal fake Locus instance for testing Chat in isolation.
function fakeLLM(reply = "mock reply") {
  return {
    async complete(_prompt) {
      return reply;
    },
    async *stream(_prompt) {
      for (const piece of reply.split(" ")) yield piece + " ";
    },
  };
}

test("Chat: send() appends user and assistant messages", async () => {
  const chat = new Chat(fakeLLM("hi there"));
  const out = await chat.send("hello");
  assert.equal(out, "hi there");
  assert.deepEqual(chat.messages, [
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi there" },
  ]);
});

test("Chat: system prompt is added when provided", async () => {
  const chat = new Chat(fakeLLM(), { system: "be nice" });
  assert.equal(chat.messages[0].role, "system");
  assert.equal(chat.messages[0].content, "be nice");
});

test("Chat: stream() collects the full reply into the transcript", async () => {
  const chat = new Chat(fakeLLM("one two three"));
  const got = [];
  for await (const token of chat.stream("go")) got.push(token);
  assert.ok(got.join("").includes("one"));
  const last = chat.messages[chat.messages.length - 1];
  assert.equal(last.role, "assistant");
  assert.ok(last.content.includes("three"));
});

test("Chat: history accumulates across turns", async () => {
  const chat = new Chat(fakeLLM("ok"));
  await chat.send("first");
  await chat.send("second");
  assert.equal(chat.messages.length, 4);
  assert.equal(chat.messages[0].content, "first");
  assert.equal(chat.messages[2].content, "second");
});

test("Chat: reset() keeps system prompt by default", async () => {
  const chat = new Chat(fakeLLM(), { system: "be nice" });
  await chat.send("hi");
  chat.reset();
  assert.equal(chat.messages.length, 1);
  assert.equal(chat.messages[0].role, "system");
});

test("Chat: reset({ keepSystem: false }) clears everything", async () => {
  const chat = new Chat(fakeLLM(), { system: "be nice" });
  await chat.send("hi");
  chat.reset({ keepSystem: false });
  assert.equal(chat.messages.length, 0);
});
