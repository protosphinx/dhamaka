// SmartForm.
//
// Orchestrates cross-field inference on a <form> element.
//
// The developer declares which source field feeds which target field via
// simple arrow strings:
//
//   new SmartForm(document.querySelector("#checkout"), {
//     infer: {
//       "city → state":    "city-to-state:stateName",
//       "city → country":  "city-to-state:countryName",
//       "city → timezone": "city-to-state:tz",
//     },
//   });
//
// When a source field fires a `smart-field:resolved` event with a matching
// task result, the target fields are populated from the result's `fields`
// object using the suffix after the `:`. Manual edits to a target field
// disengage automatic propagation for that field.

import { SmartField } from "./smart-field.js";

export class SmartForm {
  /**
   * @param {HTMLFormElement} form
   * @param {object} options
   * @param {Record<string, string>} [options.infer]
   *   Map of "sourceName → targetName" to "taskId:resultField".
   * @param {Record<string, string>} [options.tasks]
   *   Map of field name to task id (to auto-attach SmartFields).
   */
  constructor(form, options = {}) {
    if (!form || form.tagName !== "FORM") {
      throw new Error("SmartForm: first argument must be a <form> element");
    }
    this.form = form;
    this.infer = options.infer ?? {};
    this.smartFields = new Map();
    this.manualEdits = new Set();
    this._disposed = false;

    // Auto-attach SmartFields when a task map is provided.
    if (options.tasks) {
      for (const [fieldName, taskId] of Object.entries(options.tasks)) {
        const el = form.elements.namedItem(fieldName);
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          this.smartFields.set(
            fieldName,
            new SmartField(el, { task: taskId }),
          );
        }
      }
    }

    // Listen for any resolved events bubbling up from child SmartFields.
    this._onResolved = (e) => this._handleResolved(e);
    form.addEventListener("smart-field:resolved", this._onResolved);

    // Track manual edits to target fields so we don't stomp them.
    this._onInput = (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return;
      if (this._programmatic) return;
      this.manualEdits.add(t.name);
    };
    form.addEventListener("input", this._onInput, true);
  }

  _handleResolved(event) {
    const detail = event.detail;
    if (!detail || !detail.result || !detail.result.fields) return;
    const sourceEl = event.target;
    if (!sourceEl || !sourceEl.name) return;

    const sourceName = sourceEl.name;
    const fields = detail.result.fields;

    // Walk every declared inference rule whose source matches.
    for (const [rule, mapping] of Object.entries(this.infer)) {
      const [src, tgt] = rule.split(/\s*(?:→|->|>)\s*/).map((s) => s.trim());
      if (src !== sourceName) continue;

      const [taskId, resultKey] = mapping.split(":");
      if (taskId && detail.task !== taskId) continue;
      if (!resultKey) continue;

      const value = fields[resultKey];
      if (value == null || value === "") continue;

      const targetEl = this.form.elements.namedItem(tgt);
      if (!(targetEl instanceof HTMLInputElement || targetEl instanceof HTMLSelectElement || targetEl instanceof HTMLTextAreaElement)) continue;
      if (this.manualEdits.has(tgt)) continue; // user has taken over this field

      this._programmatic = true;
      try {
        targetEl.value = String(value);
        targetEl.dispatchEvent(new Event("change", { bubbles: true }));
      } finally {
        this._programmatic = false;
      }
    }
  }

  /** Mark a target field as manually edited (won't be auto-filled again). */
  lock(fieldName) {
    this.manualEdits.add(fieldName);
  }

  /** Forget manual-edit flags and let inference take over again. */
  unlock(fieldName) {
    if (fieldName) this.manualEdits.delete(fieldName);
    else this.manualEdits.clear();
  }

  dispose() {
    this._disposed = true;
    this.form.removeEventListener("smart-field:resolved", this._onResolved);
    this.form.removeEventListener("input", this._onInput, true);
    for (const sf of this.smartFields.values()) sf.dispose();
    this.smartFields.clear();
  }
}
