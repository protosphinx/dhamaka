// Smart-paste helper.
//
// Wires a <form> element so that when the user pastes a blob of text
// anywhere inside it (or into a designated drop zone), the paste-extract
// task splits the blob into structured fields and fills them in, as long
// as the user hasn't already manually typed a value there.

import { reflex } from "./reflex.js";

/**
 * @param {HTMLFormElement} form
 * @param {object} [options]
 * @param {HTMLElement} [options.dropZone]  Optional element to watch for paste
 *   events separately from the form (e.g. a dashed "paste a business card here"
 *   panel). Falls back to the form itself.
 * @param {Record<string, string>} [options.fields]
 *   Map of task result fields to form input names, e.g. { name: "fullName" }.
 *   Defaults to identity — the result key is the input name.
 */
export function attachSmartPaste(form, options = {}) {
  if (!form || form.tagName !== "FORM") {
    throw new Error("attachSmartPaste: first argument must be a <form> element");
  }
  const target = options.dropZone ?? form;
  const mapping = options.fields ?? {};

  const handler = async (event) => {
    const clipboard = event.clipboardData || window.clipboardData;
    if (!clipboard) return;
    const text = clipboard.getData("text/plain") || clipboard.getData("text");
    if (!text || !text.includes("\n") && text.length < 20) return; // probably a plain word-level paste

    // If the paste target is an input and it was empty, let the extraction
    // run and populate structured fields — don't also let the raw text fall
    // into the input.
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      const input = event.target;
      if (input.value === "") {
        event.preventDefault();
      }
    }

    const result = await reflex.run("paste-extract", text, { threshold: 0.8 });
    const fields = result.fields ?? {};

    for (const [key, value] of Object.entries(fields)) {
      if (value == null || value === "") continue;
      const targetName = mapping[key] ?? key;
      const el = form.elements.namedItem(targetName);
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) continue;
      if (el.value && el.value !== text) continue; // user already typed here
      el.value = Array.isArray(value) ? value[0] : String(value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    form.dispatchEvent(
      new CustomEvent("smart-paste:extracted", {
        detail: { text, result },
        bubbles: true,
      }),
    );
  };

  target.addEventListener("paste", handler);
  return () => target.removeEventListener("paste", handler);
}
