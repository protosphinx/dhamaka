// ┌──────────────────────────────────────────────────────────────────────────┐
// │  Locus Hub                                                             │
// │                                                                          │
// │  A tiny script that runs inside a hidden <iframe> on hub.locus.dev.    │
// │  Any Locus-powered site embeds this iframe and talks to it over        │
// │  postMessage. Because the iframe is always the same origin, its          │
// │  IndexedDB and OPFS stores are (ideally) shared across every consumer    │
// │  site — so the model downloads once in a user's lifetime.                │
// │                                                                          │
// │  See README.md for the honest story on browser storage partitioning      │
// │  and how we fall back when cross-site sharing is blocked.                │
// └──────────────────────────────────────────────────────────────────────────┘

const DB_NAME = "locus-hub";
const DB_VERSION = 1;
const STORE_MODELS = "models";
const STORE_META = "meta";

const DEFAULT_MANIFEST_URL = new URL("./manifest.json", import.meta.url).href;

// ─── IndexedDB helpers ─────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MODELS)) {
        db.createObjectStore(STORE_MODELS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbList(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

// ─── Integrity ─────────────────────────────────────────────────────────────

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Zero SHA in the manifest = development placeholder. Treat as "do not verify".
function shouldVerify(sha) {
  return typeof sha === "string" && /^[0-9a-f]{64}$/i.test(sha) && !/^0+$/.test(sha);
}

// ─── Manifest ──────────────────────────────────────────────────────────────

async function loadManifest(manifestUrl) {
  const res = await fetch(manifestUrl, { cache: "no-cache" });
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  return await res.json();
}

function findModel(manifest, id) {
  const entry = manifest.models.find((m) => m.id === id);
  if (!entry) throw new Error(`unknown model: ${id}`);
  return entry;
}

// ─── Download + store ──────────────────────────────────────────────────────

async function downloadArtifact(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const total = Number(res.headers.get("content-length")) || 0;

  if (!res.body) {
    // older browsers: fall back to full-buffer
    const buf = new Uint8Array(await res.arrayBuffer());
    onProgress?.({ received: buf.length, total: buf.length });
    return buf;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.({ received, total });
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

async function fetchAndStoreModel(id, manifestUrl, onProgress) {
  const manifest = await loadManifest(manifestUrl);
  const entry = findModel(manifest, id);

  const artifacts = entry.artifacts ?? {};
  const artifactEntries = Object.entries(artifacts);

  const totalBytesHint = entry.size || 0;
  let cumulativeBefore = 0;

  const stored = {};
  for (const [name, artifact] of artifactEntries) {
    const bytes = await downloadArtifact(artifact.url, (p) => {
      const received = cumulativeBefore + p.received;
      onProgress?.({
        stage: "download",
        artifact: name,
        received,
        total: totalBytesHint || p.total,
      });
    });
    cumulativeBefore += bytes.length;

    if (shouldVerify(artifact.sha256)) {
      const hex = await sha256Hex(bytes);
      if (hex !== artifact.sha256.toLowerCase()) {
        throw new Error(
          `integrity check failed for ${id}/${name}: expected ${artifact.sha256}, got ${hex}`,
        );
      }
    }
    stored[name] = bytes;
  }

  const record = {
    id,
    fetchedAt: Date.now(),
    entry,
    artifacts: stored,
  };
  await idbPut(STORE_MODELS, record);
  return record;
}

// ─── Serving to parent ─────────────────────────────────────────────────────

async function handleGet({ id, manifestUrl, requestId }, reply, progress) {
  let record = await idbGet(STORE_MODELS, id);
  const cached = !!record;
  if (!record) {
    record = await fetchAndStoreModel(
      id,
      manifestUrl || DEFAULT_MANIFEST_URL,
      (p) => progress({ requestId, ...p }),
    );
  }

  // Copy each artifact so we can transfer ownership without invalidating the
  // cached record in memory.
  const transferables = [];
  const artifacts = {};
  for (const [name, bytes] of Object.entries(record.artifacts)) {
    const copy = bytes.slice(0);
    artifacts[name] = copy;
    transferables.push(copy.buffer);
  }

  reply(
    {
      type: "locus:response",
      requestId,
      cached,
      id,
      entry: record.entry,
      fetchedAt: record.fetchedAt,
      artifacts,
    },
    transferables,
  );
}

async function handleList({ requestId }, reply) {
  const records = await idbList(STORE_MODELS);
  reply({
    type: "locus:response",
    requestId,
    list: records.map((r) => ({
      id: r.id,
      fetchedAt: r.fetchedAt,
      size: Object.values(r.artifacts).reduce((s, b) => s + b.byteLength, 0),
      entry: r.entry,
    })),
  });
}

async function handleDelete({ id, requestId }, reply) {
  await idbDelete(STORE_MODELS, id);
  reply({ type: "locus:response", requestId, deleted: id });
}

async function handlePing({ requestId }, reply) {
  reply({
    type: "locus:response",
    requestId,
    pong: true,
    version: "0.1.0",
    origin: location.origin,
    tier: await currentStorageTier(),
  });
}

// ─── Storage Access API ────────────────────────────────────────────────────
//
// Modern browsers partition third-party iframe storage by top-level site. A
// hub iframe embedded on site-A gets a different IndexedDB than the same
// hub iframe embedded on site-B, which kills the cross-site sharing trick.
//
// The Storage Access API lets the iframe ask for unpartitioned storage after
// the user has interacted with the hub origin at least once as a first party.
// This function tries to detect + request it, and reports which tier we got.
//
// Tiers:
//   "shared"        → cross-site unpartitioned storage (the dream)
//   "storage-access"→ granted via Storage Access API
//   "partitioned"   → per-top-site IndexedDB (still persistent, not shared)
//   "unknown"       → couldn't determine

async function currentStorageTier() {
  try {
    if (typeof document === "undefined") return "unknown";

    // If we're not actually embedded in anything, storage is first-party.
    if (window.top === window.self) return "shared";

    if (typeof document.hasStorageAccess === "function") {
      const has = await document.hasStorageAccess();
      if (has) return "storage-access";
    }
    return "partitioned";
  } catch {
    return "unknown";
  }
}

async function handleRequestStorageAccess({ requestId }, reply) {
  if (typeof document === "undefined" || typeof document.requestStorageAccess !== "function") {
    reply({
      type: "locus:response",
      requestId,
      granted: false,
      tier: "partitioned",
      reason: "Storage Access API not supported",
    });
    return;
  }
  try {
    await document.requestStorageAccess();
    reply({
      type: "locus:response",
      requestId,
      granted: true,
      tier: await currentStorageTier(),
    });
  } catch (err) {
    reply({
      type: "locus:response",
      requestId,
      granted: false,
      tier: "partitioned",
      reason: String(err?.message || err),
    });
  }
}

// ─── Message router ────────────────────────────────────────────────────────

function makeReply(source, origin) {
  return (payload, transfer = []) => {
    source.postMessage(payload, { targetOrigin: origin, transfer });
  };
}

function makeProgress(source, origin) {
  return (payload) => {
    source.postMessage(
      { type: "locus:progress", ...payload },
      { targetOrigin: origin },
    );
  };
}

window.addEventListener("message", async (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (typeof msg.type !== "string" || !msg.type.startsWith("locus:")) return;

  const reply = makeReply(event.source, event.origin);
  const progress = makeProgress(event.source, event.origin);

  try {
    switch (msg.type) {
      case "locus:ping":
        await handlePing(msg, reply);
        break;
      case "locus:get":
        await handleGet(msg, reply, progress);
        break;
      case "locus:list":
        await handleList(msg, reply);
        break;
      case "locus:delete":
        await handleDelete(msg, reply);
        break;
      case "locus:request-storage-access":
        await handleRequestStorageAccess(msg, reply);
        break;
      default:
        reply({
          type: "locus:error",
          requestId: msg.requestId,
          error: `unknown message type: ${msg.type}`,
        });
    }
  } catch (err) {
    reply({
      type: "locus:error",
      requestId: msg.requestId,
      error: String(err?.message || err),
    });
  }
});

// Announce ready so the parent can resolve its load promise deterministically.
(async () => {
  const tier = await currentStorageTier();
  window.parent?.postMessage(
    {
      type: "locus:ready",
      version: "0.1.0",
      origin: location.origin,
      tier,
    },
    "*",
  );
})();
