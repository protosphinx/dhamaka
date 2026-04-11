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
  }

  _install() {
    if (this._ready) return this._ready;

    // Node or any non-DOM environment → go straight to fallback.
    if (typeof window === "undefined" || typeof document === "undefined") {
      this._fallback = new FallbackStore();
      this._ready = Promise.resolve({ fallback: true });
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
        if (typeof msg.type !== "string" || !msg.type.startsWith("dhamaka:")) return;

        if (msg.type === "dhamaka:ready") {
          finish({ fallback: false, origin: msg.origin });
          return;
        }

        const entry = this._pending.get(msg.requestId);
        if (!entry) return;

        if (msg.type === "dhamaka:progress") {
          entry.onProgress?.(msg);
        } else if (msg.type === "dhamaka:response") {
          this._pending.delete(msg.requestId);
          entry.resolve(msg);
        } else if (msg.type === "dhamaka:error") {
          this._pending.delete(msg.requestId);
          entry.reject(new Error(msg.error));
        }
      };
      window.addEventListener("message", this._listener);

      const iframe = document.createElement("iframe");
      iframe.src = this.hubUrl;
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");
      iframe.title = "Dhamaka Hub";
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

    const requestId = this._nextId++;
    return new Promise((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject, onProgress });
      this._iframe.contentWindow.postMessage(
        { type, requestId, ...payload },
        new URL(this.hubUrl).origin,
      );
    });
  }

  async ping() {
    return this._call("dhamaka:ping", {});
  }

  async get(id, { manifestUrl, onProgress } = {}) {
    return this._call("dhamaka:get", { id, manifestUrl }, onProgress);
  }

  async list() {
    return this._call("dhamaka:list", {});
  }

  async delete(id) {
    return this._call("dhamaka:delete", { id });
  }

  /** Whether we ended up in fallback mode (site-local cache only). */
  async mode() {
    const r = await this._install();
    return r.fallback ? "site-local" : "shared";
  }
}

// ───────────────────────────────────────────────────────────────────────────
// FallbackStore
//
// Used when the hub iframe can't be loaded. Stores models in a per-origin
// IndexedDB so the site still works offline — just without cross-site sharing.
// In Node it uses an in-memory Map (no persistence).
// ───────────────────────────────────────────────────────────────────────────

class FallbackStore {
  constructor() {
    this._mem = new Map();
  }

  async handle(msg) {
    switch (msg.type) {
      case "dhamaka:ping":
        return { pong: true, fallback: true };
      case "dhamaka:get":
        return this._get(msg);
      case "dhamaka:list":
        return { list: [...this._mem.values()].map((r) => ({ id: r.id, entry: r.entry })) };
      case "dhamaka:delete":
        this._mem.delete(msg.id);
        return { deleted: msg.id };
      default:
        throw new Error(`fallback: unknown ${msg.type}`);
    }
  }

  async _get(msg) {
    const cached = this._mem.get(msg.id);
    if (cached) return { cached: true, ...cached };

    const manifestUrl = msg.manifestUrl ?? "./manifest.json";
    const manifestRes = await fetch(manifestUrl);
    const manifest = await manifestRes.json();
    const entry = manifest.models.find((m) => m.id === msg.id);
    if (!entry) throw new Error(`unknown model: ${msg.id}`);

    const artifacts = {};
    for (const [name, artifact] of Object.entries(entry.artifacts ?? {})) {
      const res = await fetch(artifact.url);
      if (!res.ok) throw new Error(`fallback fetch failed: ${res.status}`);
      artifacts[name] = new Uint8Array(await res.arrayBuffer());
    }

    const record = { id: msg.id, entry, artifacts };
    this._mem.set(msg.id, record);
    return { cached: false, ...record };
  }
}
