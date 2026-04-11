// ╭──────────────────────────────────────────────────────────────────────╮
// │  dhamaka — the public SDK                                            │
// │                                                                      │
// │    import { Dhamaka } from "dhamaka";                                │
// │    const llm = await Dhamaka.load();                                 │
// │    for await (const t of llm.stream("Hello")) process.stdout.write(t)│
// │                                                                      │
// ╰──────────────────────────────────────────────────────────────────────╯

import { createEngine } from "@dhamaka/runtime";
import { HubClient } from "./hub-client.js";
import { Chat } from "./chat.js";

const DEFAULT_MODEL = "dhamaka-micro";
const DEFAULT_HUB_URL = "https://hub.dhamaka.dev/";

/**
 * @typedef {object} DhamakaLoadOptions
 * @property {string} [hubUrl]         URL of the Dhamaka hub iframe.
 * @property {string} [manifestUrl]    Override for the model manifest.
 * @property {"auto"|"mock"|"wasm"} [backend]  Runtime backend.
 * @property {string} [wasmUrl]        URL of the WASM module.
 * @property {(p: object) => void} [onProgress]
 */

export class Dhamaka {
  /**
   * Load a Dhamaka model.
   * @param {string} [modelId=DEFAULT_MODEL]
   * @param {DhamakaLoadOptions} [options]
   */
  static async load(modelId = DEFAULT_MODEL, options = {}) {
    const instance = new Dhamaka(modelId, options);
    await instance._init();
    return instance;
  }

  /** @param {string} modelId @param {DhamakaLoadOptions} options */
  constructor(modelId, options) {
    this.modelId = modelId;
    this.options = options;
    const hubUrl = options.hubUrl ?? DEFAULT_HUB_URL;
    this.hub = new HubClient({ hubUrl });
    // The WASM runtime binary lives on the hub origin at /runtime/…, same
    // place the hub serves model weights from. Resolve it against the hub
    // URL so the fetch works in development (http://localhost:5174/…) and
    // production (https://hub.dhamaka.dev/…) without config.
    let wasmUrl = options.wasmUrl;
    if (!wasmUrl && typeof URL !== "undefined") {
      try {
        wasmUrl = new URL("runtime/dhamaka-runtime.wasm", hubUrl).href;
      } catch {
        // fall through — createEngine will degrade to MockEngine in Node
      }
    }
    this.engine = createEngine({
      backend: options.backend ?? "auto",
      wasmUrl,
    });
    this._cached = false;
    this._loadedAt = 0;
  }

  async _init() {
    const t0 = (globalThis.performance ?? Date).now();
    const result = await this.hub.get(this.modelId, {
      manifestUrl: this.options.manifestUrl,
      onProgress: (p) => this.options.onProgress?.(p),
    });
    this._cached = result.cached;

    await this.engine.load({
      entry: result.entry,
      artifacts: result.artifacts,
    });
    this._loadedAt = (globalThis.performance ?? Date).now() - t0;
  }

  /**
   * One-shot completion.
   * @param {string} prompt
   * @param {object} [options]
   */
  async complete(prompt, options) {
    return this.engine.complete(prompt, options);
  }

  /**
   * Stream tokens as an async iterator.
   * @param {string} prompt
   * @param {object} [options]
   */
  async *stream(prompt, options) {
    yield* this.engine.generate(prompt, options);
  }

  /**
   * Start a stateful chat session.
   * @param {object} [options]
   * @param {string} [options.system]
   */
  chat(options = {}) {
    return new Chat(this, options);
  }

  /** Runtime + cache information. */
  info() {
    return {
      model: this.modelId,
      cached: this._cached,
      loadMs: Math.round(this._loadedAt),
      engine: this.engine.info(),
    };
  }

  /** List models currently sitting in the hub's local storage. */
  async localModels() {
    return this.hub.list();
  }

  /** Evict a model from the hub's local storage. */
  async evict(id) {
    return this.hub.delete(id);
  }

  async unload() {
    await this.engine.unload();
  }
}

export { HubClient } from "./hub-client.js";
export { Chat } from "./chat.js";
