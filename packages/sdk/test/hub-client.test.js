import { test } from "node:test";
import assert from "node:assert/strict";
import { HubClient } from "../src/hub-client.js";

// In Node, HubClient skips the iframe path entirely and uses FallbackStore.

test("HubClient: mode() is site-local in Node", async () => {
  const c = new HubClient({ hubUrl: "http://example.test/" });
  assert.equal(await c.mode(), "site-local");
});

test("HubClient: ping() works via fallback", async () => {
  const c = new HubClient({ hubUrl: "http://example.test/" });
  const res = await c.ping();
  assert.equal(res.pong, true);
  assert.equal(res.fallback, true);
});

test("HubClient: get() fetches manifest and artifacts via the configured fetch", async () => {
  const c = new HubClient({ hubUrl: "http://example.test/" });

  // Mock global fetch used by FallbackStore.
  const manifest = {
    models: [
      {
        id: "test-model",
        artifacts: {
          weights: { url: "http://example.test/weights.bin" },
          config: { url: "http://example.test/config.json" },
        },
      },
    ],
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.endsWith("manifest.json")) {
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    if (url.endsWith("weights.bin")) {
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    }
    if (url.endsWith("config.json")) {
      return new Response(new Uint8Array([5, 6]), { status: 200 });
    }
    return new Response("404", { status: 404 });
  };

  try {
    const got = await c.get("test-model", {
      manifestUrl: "http://example.test/manifest.json",
    });
    assert.equal(got.cached, false);
    assert.ok(got.artifacts?.weights instanceof Uint8Array);
    assert.equal(got.artifacts.weights.byteLength, 4);
    assert.equal(got.artifacts.config.byteLength, 2);

    // A second call should now be a cache hit.
    const again = await c.get("test-model", {
      manifestUrl: "http://example.test/manifest.json",
    });
    assert.equal(again.cached, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HubClient: list() and delete() work via fallback", async () => {
  const c = new HubClient({ hubUrl: "http://example.test/" });

  const manifest = {
    models: [
      {
        id: "test-model",
        artifacts: { weights: { url: "http://example.test/w.bin" } },
      },
    ],
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) =>
    url.endsWith("manifest.json")
      ? new Response(JSON.stringify(manifest), { status: 200 })
      : new Response(new Uint8Array([9, 9, 9]), { status: 200 });

  try {
    await c.get("test-model", { manifestUrl: "http://example.test/manifest.json" });

    const listed = await c.list();
    assert.ok(listed.list.length >= 1);

    const deleted = await c.delete("test-model");
    assert.equal(deleted.deleted, "test-model");

    const afterDelete = await c.list();
    assert.equal(afterDelete.list.find((r) => r.id === "test-model"), undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HubClient: get() throws a clean error for unknown model", async () => {
  const c = new HubClient({ hubUrl: "http://example.test/" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ models: [] }), { status: 200 });
  try {
    await assert.rejects(
      c.get("no-such-model", { manifestUrl: "http://example.test/manifest.json" }),
      /unknown model/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
