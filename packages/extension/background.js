// ╭──────────────────────────────────────────────────────────────────────╮
// │  Dhamaka extension — background service worker                       │
// │                                                                      │
// │  Stores Dhamaka models once per machine in the extension's own       │
// │  origin (chrome-extension://…). Because this origin is the same      │
// │  everywhere the extension is installed, the cache is genuinely       │
// │  shared across every site the user visits — sidestepping the        │
// │  storage partitioning that weakens the standalone iframe approach.   │
// │                                                                      │
// │  Content scripts on consumer sites talk to this worker via           │
// │  chrome.runtime.sendMessage, and the SDK's HubClient detects the     │
// │  extension via a probe and prefers it over the iframe hub when       │
// │  available.                                                          │
// ╰──────────────────────────────────────────────────────────────────────╯

const DB_NAME = "dhamaka-extension";
const DB_VERSION = 1;
const STORE_MODELS = "models";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MODELS)) {
        db.createObjectStore(STORE_MODELS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MODELS, "readonly");
    const req = tx.objectStore(STORE_MODELS).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MODELS, "readwrite");
    const req = tx.objectStore(STORE_MODELS).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MODELS, "readwrite");
    const req = tx.objectStore(STORE_MODELS).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbList() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MODELS, "readonly");
    const req = tx.objectStore(STORE_MODELS).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function shouldVerify(sha) {
  return typeof sha === "string" && /^[0-9a-f]{64}$/i.test(sha) && !/^0+$/.test(sha);
}

async function downloadAndStore(id, manifestUrl) {
  const res = await fetch(manifestUrl, { cache: "no-cache" });
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  const manifest = await res.json();
  const entry = manifest.models?.find((m) => m.id === id);
  if (!entry) throw new Error(`unknown model: ${id}`);

  const artifacts = {};
  for (const [name, artifact] of Object.entries(entry.artifacts ?? {})) {
    const absUrl = new URL(artifact.url, manifestUrl).href;
    const ar = await fetch(absUrl);
    if (!ar.ok) throw new Error(`artifact fetch failed: ${ar.status} ${absUrl}`);
    const bytes = new Uint8Array(await ar.arrayBuffer());
    if (shouldVerify(artifact.sha256)) {
      const hex = await sha256Hex(bytes);
      if (hex !== artifact.sha256.toLowerCase()) {
        throw new Error(`integrity check failed for ${id}/${name}`);
      }
    }
    artifacts[name] = bytes;
  }

  const record = { id, entry, artifacts, fetchedAt: Date.now() };
  await idbPut(record);
  return record;
}

// ─── Message handlers ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;
  if (typeof msg.type !== "string" || !msg.type.startsWith("dhamaka:")) return;

  (async () => {
    try {
      switch (msg.type) {
        case "dhamaka:ping": {
          sendResponse({
            type: "dhamaka:response",
            pong: true,
            version: chrome.runtime.getManifest().version,
            tier: "extension",
          });
          break;
        }
        case "dhamaka:get": {
          let record = await idbGet(msg.id);
          const cached = !!record;
          if (!record) {
            record = await downloadAndStore(msg.id, msg.manifestUrl);
          }
          // We can't transfer ArrayBuffers over chrome.runtime.sendMessage.
          // Instead we pass the record as a plain object — Chrome structured-
          // clones it, which is still zero-alloc from JS's perspective.
          sendResponse({
            type: "dhamaka:response",
            cached,
            id: msg.id,
            entry: record.entry,
            fetchedAt: record.fetchedAt,
            artifacts: record.artifacts,
          });
          break;
        }
        case "dhamaka:list": {
          const rows = await idbList();
          sendResponse({
            type: "dhamaka:response",
            list: rows.map((r) => ({
              id: r.id,
              entry: r.entry,
              fetchedAt: r.fetchedAt,
              size: Object.values(r.artifacts ?? {}).reduce(
                (s, b) => s + (b?.byteLength ?? 0),
                0,
              ),
            })),
          });
          break;
        }
        case "dhamaka:delete": {
          await idbDelete(msg.id);
          sendResponse({ type: "dhamaka:response", deleted: msg.id });
          break;
        }
        default:
          sendResponse({
            type: "dhamaka:error",
            error: `unknown message type: ${msg.type}`,
          });
      }
    } catch (err) {
      sendResponse({
        type: "dhamaka:error",
        error: String(err?.message || err),
      });
    }
  })();

  // Returning true keeps the message channel open for the async sendResponse.
  return true;
});
