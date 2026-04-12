// SmartText.
//
// Wraps a <textarea> with contextual spellcheck and (optionally) tab
// completion. Like SmartField but tuned for multi-line text: instead of
// dispatching a single `resolved` event, it maintains a running list of
// suggestions and exposes them via `.suggestions`.

import { reflex } from "./reflex.js";

const DEFAULT_DEBOUNCE_MS = 120; // small debounce for prose editing

export class SmartText {
  /**
   * @param {HTMLTextAreaElement | HTMLInputElement} el
   * @param {object} [options]
   * @param {boolean} [options.spellcheck=true]
   * @param {number}  [options.debounceMs]
   * @param {(s: Array<object>, result: object) => void} [options.onSuggestions]
   *   Called after each run. First arg is the suggestion list (same as
   *   `this.suggestions`); second arg is the full TaskResult including
   *   `checked` / `skipped` counts so the UI can tell "ran and clean"
   *   apart from "nothing was long enough to check".
   */
  constructor(el, options = {}) {
    if (!el || typeof el.addEventListener !== "function") {
      throw new Error("SmartText: first argument must be an Element");
    }
    this.el = el;
    this.doSpellcheck = options.spellcheck ?? true;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.onSuggestions = options.onSuggestions ?? null;
    this.suggestions = [];
    this.lastResult = null;
    this._timer = null;
    this._disposed = false;

    this._handler = () => {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this._run(), this.debounceMs);
    };
    this.el.addEventListener("input", this._handler);
    if (this.el.value) this._handler();
  }

  async _run() {
    if (this._disposed || !this.doSpellcheck) return;
    const text = this.el.value ?? "";
    const result = await reflex.run("spellcheck", text, { threshold: 0.8 });
    if (this._disposed) return;
    this.suggestions = result.suggestions ?? [];
    this.lastResult = result;
    this.onSuggestions?.(this.suggestions, result);
    this.el.dispatchEvent(
      new CustomEvent("smart-text:suggestions", {
        detail: { text, suggestions: this.suggestions, result },
        bubbles: true,
      }),
    );
  }

  /** Apply a suggestion by index. */
  applySuggestion(index) {
    const s = this.suggestions[index];
    if (!s) return false;
    const text = this.el.value ?? "";
    if (typeof s.index === "number" && typeof s.from === "string" && typeof s.to === "string") {
      const before = text.slice(0, s.index);
      const after = text.slice(s.index + s.from.length);
      this.el.value = before + s.to + after;
      this.el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  }

  dispose() {
    this._disposed = true;
    clearTimeout(this._timer);
    this.el.removeEventListener("input", this._handler);
  }
}
