// SmartField.
//
// Wraps an <input> element with on-device intelligence. The developer
// picks a task (e.g. "city-to-state") and the field does the rest:
//
//   - listens on `input` events
//   - runs the task against the reflex service
//   - dispatches a synthetic `smart-field:resolved` CustomEvent
//     whose `detail` is the task result
//
// The SmartField does not touch any other fields directly. Cross-field
// propagation is the job of SmartForm.

import { reflex } from "./reflex.js";

const DEFAULT_DEBOUNCE_MS = 0; // zero-latency on-device → no debounce needed

export class SmartField {
  /**
   * @param {HTMLInputElement} el
   * @param {object} options
   * @param {string} options.task       Task id from the registry
   * @param {number} [options.debounceMs]
   * @param {number} [options.threshold]
   * @param {boolean} [options.eager]   If true, always hit the model path
   * @param {(r: object) => void} [options.onResult]
   */
  constructor(el, options) {
    if (!el || typeof el.addEventListener !== "function") {
      throw new Error("SmartField: first argument must be an Element");
    }
    if (!options || typeof options.task !== "string") {
      throw new Error("SmartField: options.task is required");
    }
    this.el = el;
    this.task = options.task;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.threshold = options.threshold ?? 0.6;
    this.eager = options.eager ?? false;
    this.onResult = options.onResult ?? null;
    this._timer = null;
    this._disposed = false;
    this._lastResult = null;

    this._handler = () => this._onInput();
    this.el.addEventListener("input", this._handler);

    // Run once on construction in case the field already has a value
    // (e.g. browser autofill or server-rendered pre-fill).
    if (this.el.value) this._onInput();
  }

  _onInput() {
    if (this._disposed) return;
    const value = this.el.value ?? "";
    if (this.debounceMs > 0) {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this._run(value), this.debounceMs);
    } else {
      this._run(value);
    }
  }

  async _run(value) {
    const result = await reflex.run(this.task, value, {
      eager: this.eager,
      threshold: this.threshold,
    });
    if (this._disposed) return;
    this._lastResult = result;
    this.onResult?.(result);
    this.el.dispatchEvent(
      new CustomEvent("smart-field:resolved", {
        detail: { task: this.task, input: value, result },
        bubbles: true,
      }),
    );
  }

  /** Force a re-run against the current value. */
  refresh() {
    this._onInput();
  }

  get lastResult() {
    return this._lastResult;
  }

  dispose() {
    this._disposed = true;
    clearTimeout(this._timer);
    this.el.removeEventListener("input", this._handler);
  }
}
