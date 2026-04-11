// ╭──────────────────────────────────────────────────────────────────────╮
// │  dhamaka — the public SDK                                            │
// │                                                                      │
// │  A reflex layer for every input on the web. Drop in a SmartField or │
// │  SmartForm, get on-device intelligence (autofill, spellcheck, smart  │
// │  paste, cross-field inference) with zero network latency.            │
// │                                                                      │
// │    import { SmartField, SmartForm, SmartText } from "dhamaka";       │
// │                                                                      │
// │    new SmartField(document.querySelector("#city"), {                 │
// │      task: "city-to-state",                                          │
// │    });                                                               │
// │                                                                      │
// ╰──────────────────────────────────────────────────────────────────────╯

import { createEngine } from "@dhamaka/runtime";
import { HubClient } from "./hub-client.js";
import { Chat } from "./chat.js";

// Auto-register the Transform-family formula tasks. This is a
// side-effect import — pulling in `dhamaka` at all registers every
// built-in task so apps don't have to chase per-family imports.
import "./tasks/formula.js";

// ─── Reflex family ────────────────────────────────────────────────────

export { SmartField } from "./smart-field.js";
export { SmartForm } from "./smart-form.js";
export { SmartText } from "./smart-text.js";
export { attachSmartPaste } from "./paste-extract.js";

// ─── Transform family ─────────────────────────────────────────────────

export { Transform } from "./transform.js";
export {
  formulaTransformTask,
  formulaExplainTask,
  formulaDebugTask,
} from "./tasks/formula.js";

// ─── shared infrastructure ────────────────────────────────────────────

export { reflex } from "./reflex.js";
export {
  runTask,
  registerTask,
  getTask,
  listTasks,
  cityToStateTask,
  spellcheckTask,
  pasteExtractTask,
} from "./tasks.js";

// ─── legacy / advanced surface ────────────────────────────────────────
// Kept for people who want direct model access (chat, completion,
// streaming). Most users should use the SmartField API above.

const DEFAULT_MODEL = "dhamaka-micro";
const DEFAULT_HUB_URL = "https://hub.dhamaka.dev/";

/**
 * @typedef {object} DhamakaLoadOptions
 * @property {string} [hubUrl]
 * @property {string} [manifestUrl]
 * @property {"auto"|"mock"|"wasm"|"window-ai"} [backend]
 * @property {string} [wasmUrl]
 * @property {(p: object) => void} [onProgress]
 */

export class Dhamaka {
  /**
   * Load a Dhamaka model directly. Lower-level than SmartField — use this
   * when you want raw completion / streaming / chat access.
   * @param {string} [modelId=DEFAULT_MODEL]
   * @param {DhamakaLoadOptions} [options]
   */
  static async load(modelId = DEFAULT_MODEL, options = {}) {
    const instance = new Dhamaka(modelId, options);
    await instance._init();
    return instance;
  }

  constructor(modelId, options) {
    this.modelId = modelId;
    this.options = options;
    const hubUrl = options.hubUrl ?? DEFAULT_HUB_URL;
    this.hub = new HubClient({ hubUrl });

    let wasmUrl = options.wasmUrl;
    if (!wasmUrl && typeof URL !== "undefined") {
      try {
        wasmUrl = new URL("runtime/dhamaka-runtime.wasm", hubUrl).href;
      } catch {
        /* fall through */
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
    await this.engine.load({ entry: result.entry, artifacts: result.artifacts });
    this._loadedAt = (globalThis.performance ?? Date).now() - t0;
  }

  async complete(prompt, options) {
    return this.engine.complete(prompt, options);
  }

  async *stream(prompt, options) {
    yield* this.engine.generate(prompt, options);
  }

  chat(options = {}) {
    return new Chat(this, options);
  }

  info() {
    return {
      model: this.modelId,
      cached: this._cached,
      loadMs: Math.round(this._loadedAt),
      engine: this.engine.info(),
    };
  }

  async localModels() {
    return this.hub.list();
  }

  async evict(id) {
    return this.hub.delete(id);
  }

  async unload() {
    await this.engine.unload();
  }
}

export { HubClient } from "./hub-client.js";
export { Chat } from "./chat.js";
