// HubClient — the parent-side half of the hub postMessage protocol.
//
// Responsibilities:
//   1. Inject a single hidden iframe pointing at the hub origin.
//   2. Wait for the hub's "ready" handshake.
//   3. Route typed requests/responses over postMessage with a per-request id.
//   4. Report progress events to the caller.
//   5. Gracefully fall back to a per-origin IndexedDB cache when the iframe
//      can't be loaded (file://, Node, bot environments, strict browsers).

const READY_TIMEOUT_MS = 8000;

export class HubClient {
  constructor({ hubUrl }) {
    this.hubUrl = hubUrl;
    this._iframe = null;
    this._ready = null;
    this._nextId = 1;
    this._pending = new Map();
    this._listener = null;
    this._fallback = null;
    this._tier = null;
  }

  _install() {
    if (this._ready) return this._ready;

    // Node or any non-DOM environment → go straight to fallback.
    if (typeof window === "undefined" || typeof document === "undefined") {
      this._fallback = new FallbackStore();
      this._ready = Promise.resolve({ fallback: true });
      return this._ready;
    }

    // If the Locus browser extension is installed, prefer it. It
    // sidesteps storage partitioning entirely by storing models in its own
    // origin which is the same across every tab on the machine.
    if (typeof window.__locus_extension__ === "object") {
      this._extension = true;
      this._tier = "extension";
      this._ready = Promise.resolve({
        fallback: false,
        extension: true,
        tier: "extension",
      });
      return this._ready;
    }

    this._ready = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (val, err) => {
        if (settled) return;
        settled = true;
        err ? reject(err) : resolve(val);
      };

      this._listener = (event) => {
        const msg = event.data;
        if (!msg || typeof msg !== "object") return;
        if (typeof msg.type !== "string" || !msg.type.startsWith("locus:")) return;

        if (msg.type === "locus:ready") {
          this._tier = msg.tier ?? "unknown";
          finish({ fallback: false, origin: msg.origin, tier: this._tier });
          return;
        }

        const entry = this._pending.get(msg.requestId);
        if (!entry) return;

        if (msg.type === "locus:progress") {
          entry.onProgress?.(msg);
        } else if (msg.type === "locus:response") {
          this._pending.delete(msg.requestId);
          entry.resolve(msg);
        } else if (msg.type === "locus:error") {
          this._pending.delete(msg.requestId);
          entry.reject(new Error(msg.error));
        }
      };
      window.addEventListener("message", this._listener);

      const iframe = document.createElement("iframe");
      iframe.src = this.hubUrl;
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");
      iframe.title = "Locus Hub";
      iframe.style.cssText =
        "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:-9999px;top:-9999px;";
      iframe.onerror = () => {
        this._fallback = new FallbackStore();
        finish({ fallback: true });
      };
      document.body.appendChild(iframe);
      this._iframe = iframe;

      setTimeout(() => {
        if (settled) return;
        // Hub didn't announce in time — degrade to fallback.
        this._fallback = new FallbackStore();
        finish({ fallback: true });
      }, READY_TIMEOUT_MS);
    });

    return this._ready;
  }

  async _call(type, payload, onProgress) {
    const ready = await this._install();

    if (ready.fallback) {
      return this._fallback.handle({ type, ...payload }, onProgress);
    }

    if (ready.extension) {
      return this._callExtension(type, payload, onProgress);
    }

    const requestId = this._nextId++;
    return new Promise((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject, onProgress });
      this._iframe.contentWindow.postMessage(
        { type, requestId, ...payload },
        new URL(this.hubUrl).origin,
      );
    });
  }

  _callExtension(type, payload, onProgress) {
    // The extension content script forwards window.postMessage to the
    // background service worker over chrome.runtime.sendMessage, then posts
    // the response back with the same requestId.
    const requestId = this._nextId++;
    return new Promise((resolve, reject) => {
      const listener = (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || typeof data !== "object") return;
        if (!data.__locusFromExtension) return;
        if (data.requestId !== requestId) return;
        window.removeEventListener("message", listener);
        if (data.type === "locus:error") reject(new Error(data.error));
        else resolve(data);
      };
      window.addEventListener("message", listener);
      window.postMessage({ type, requestId, ...payload }, "*");
      void onProgress;
    });
  }

  async ping() {
    return this._call("locus:ping", {});
  }

  async get(id, { manifestUrl, onProgress } = {}) {
    return this._call("locus:get", { id, manifestUrl }, onProgress);
  }

  async list() {
    return this._call("locus:list", {});
  }

  async delete(id) {
    return this._call("locus:delete", { id });
  }

  /**
   * Which storage tier this client is actually running on. One of:
   *
   *   "shared"          cross-site unpartitioned hub iframe (the dream)
   *   "storage-access"  unpartitioned via the Storage Access API
   *   "partitioned"     per-top-site hub iframe (still persistent, not shared)
   *   "site-local"      hub unreachable → per-origin fallback
   */
  async mode() {
    const r = await this._install();
    if (r.fallback) return "site-local";
    return r.tier ?? this._tier ?? "partitioned";
  }

  /**
   * Ask the hub to request unpartitioned storage via the Storage Access API.
   * Must be called from a user gesture (click, keypress, etc).
   */
  async requestStorageAccess() {
    const ready = await this._install();
    if (ready.fallback) {
      return { granted: false, tier: "site-local", reason: "hub unreachable" };
    }
    return this._call("locus:request-storage-access", {});
  }
}

// ───────────────────────────────────────────────────────────────────────────
// FallbackStore
//
// Used when the hub iframe can't be loaded. In a browser it uses a per-origin
// IndexedDB so the site still works offline — just without cross-site sharing.
// In Node (or any DOM-less environment) it falls back to an in-memory Map.
// ───────────────────────────────────────────────────────────────────────────

const FALLBACK_DB = "locus-fallback";
const FALLBACK_STORE = "models";

function hasIndexedDB() {
  return typeof indexedDB !== "undefined";
}

function openFallbackDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FALLBACK_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FALLBACK_STORE)) {
        db.createObjectStore(FALLBACK_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbFallbackGet(id) {
  const db = await openFallbackDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FALLBACK_STORE, "readonly");
    const req = tx.objectStore(FALLBACK_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbFallbackPut(record) {
  const db = await openFallbackDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FALLBACK_STORE, "readwrite");
    const req = tx.objectStore(FALLBACK_STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbFallbackDelete(id) {
  const db = await openFallbackDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FALLBACK_STORE, "readwrite");
    const req = tx.objectStore(FALLBACK_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbFallbackList() {
  const db = await openFallbackDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FALLBACK_STORE, "readonly");
    const req = tx.objectStore(FALLBACK_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

class FallbackStore {
  constructor() {
    this._mem = new Map();
    this._useIdb = hasIndexedDB();
  }

  async handle(msg) {
    switch (msg.type) {
      case "locus:ping":
        return { pong: true, fallback: true, persistent: this._useIdb };
      case "locus:get":
        return this._get(msg);
      case "locus:list":
        return this._list();
      case "locus:delete":
        return this._delete(msg.id);
      default:
        throw new Error(`fallback: unknown ${msg.type}`);
    }
  }

  async _lookup(id) {
    if (this._useIdb) return idbFallbackGet(id);
    return this._mem.get(id);
  }

  async _store(record) {
    if (this._useIdb) return idbFallbackPut(record);
    this._mem.set(record.id, record);
  }

  async _get(msg) {
    const cached = await this._lookup(msg.id);
    if (cached) return { cached: true, ...cached };

    // Resolve manifest URL. If the caller gave us one, use it; otherwise fall
    // back to one relative to the current page (browser) or refuse (Node).
    let manifestUrl = msg.manifestUrl;
    if (!manifestUrl) {
      if (typeof location !== "undefined" && location.href) {
        manifestUrl = new URL("./manifest.json", location.href).href;
      } else {
        throw new Error(
          "fallback: no manifestUrl provided and no page URL to resolve against",
        );
      }
    }
    const manifestRes = await fetch(manifestUrl);
    if (!manifestRes.ok) {
      throw new Error(`fallback manifest fetch failed: ${manifestRes.status}`);
    }
    const manifest = await manifestRes.json();
    const entry = (manifest.models ?? []).find((m) => m.id === msg.id);
    if (!entry) throw new Error(`unknown model: ${msg.id}`);

    const artifacts = {};
    for (const [name, artifact] of Object.entries(entry.artifacts ?? {})) {
      const absUrl = new URL(artifact.url, manifestUrl).href;
      const res = await fetch(absUrl);
      if (!res.ok) {
        throw new Error(`fallback fetch failed: ${res.status} ${absUrl}`);
      }
      artifacts[name] = new Uint8Array(await res.arrayBuffer());
    }

    const record = { id: msg.id, entry, artifacts, fetchedAt: Date.now() };
    await this._store(record);
    return { cached: false, ...record };
  }

  async _list() {
    if (this._useIdb) {
      const rows = await idbFallbackList();
      return {
        list: rows.map((r) => ({
          id: r.id,
          entry: r.entry,
          fetchedAt: r.fetchedAt,
          size: Object.values(r.artifacts ?? {}).reduce(
            (s, b) => s + (b?.byteLength ?? 0),
            0,
          ),
        })),
      };
    }
    return {
      list: [...this._mem.values()].map((r) => ({
        id: r.id,
        entry: r.entry,
        fetchedAt: r.fetchedAt,
        size: Object.values(r.artifacts ?? {}).reduce(
          (s, b) => s + (b?.byteLength ?? 0),
          0,
        ),
      })),
    };
  }

  async _delete(id) {
    if (this._useIdb) await idbFallbackDelete(id);
    else this._mem.delete(id);
    return { deleted: id };
  }
}
