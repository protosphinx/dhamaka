// Task registry.
//
// A task is a small, typed function that turns an input string into a
// structured inference. Tasks are the unit of work the SDK exposes to
// developers — they think in tasks, not in models. Each task is free to
// short-circuit around the model using rules / tables / regex for the
// deterministic cases, and fall back to the model only for the long tail.
//
// Contract:
//
//   interface Task {
//     id: string;
//     description: string;
//     // Rules-first / instant path. Must return quickly with no I/O.
//     fast(input: string, context: object): TaskResult | null;
//     // Model path. Called only when fast() returns null and a runtime
//     // is available. Receives the engine's generate() and may stream.
//     slow?(input: string, context: object, engine: Engine): Promise<TaskResult>;
//   }
//
//   type TaskResult = {
//     confidence: number;          // 0..1
//     fields?: Record<string, any>; // structured inferences
//     text?: string;                // raw text output (for rewrite / complete)
//     suggestions?: string[];       // list of alternatives (for spellcheck)
//     source: "rule" | "fuzzy" | "model";
//   };

import { findCity, findCityFuzzy } from "./data/cities.js";

// ─── task: city → state/country/timezone/currency ─────────────────────

export const cityToStateTask = {
  id: "city-to-state",
  description:
    "Look up the state, country, timezone, and currency for a city name.",

  fast(input) {
    const exact = findCity(input);
    if (exact) {
      return {
        confidence: 1.0,
        source: "rule",
        fields: exact,
      };
    }
    const fuzzy = findCityFuzzy(input, { maxDistance: 2 });
    if (fuzzy) {
      return {
        confidence: 0.75,
        source: "fuzzy",
        fields: fuzzy,
      };
    }
    return null;
  },

  async slow(input, _context, engine) {
    // The LLM fallback. Only runs when both the exact and fuzzy tables
    // missed, which means the user typed something unusual. We ask the
    // model for JSON and parse it.
    const prompt =
      `You are a geographic autofill helper. The user typed the city name ` +
      `"${input}". Respond with a single line of JSON containing keys ` +
      `"state", "stateName", "country", "countryName", "tz", "currency". ` +
      `Use ISO 3166-1 alpha-2 for country and IANA names for tz. ` +
      `If the city is ambiguous or unknown, respond with exactly NULL.`;
    const reply = await engine.complete(prompt, { temperature: 0.0, maxTokens: 120 });
    if (!reply || /^null$/i.test(reply.trim())) return null;
    try {
      const fields = JSON.parse(reply.trim());
      return { confidence: 0.55, source: "model", fields };
    } catch {
      return null;
    }
  },
};

// ─── task: contextual spellcheck + grammar ────────────────────────────
//
// Model-only. The whole thesis of Dhamaka is "let the on-device LLM do
// the work" — so this task asks a real seq2seq language model to
// REWRITE the input into a correct version, then word-aligns the two
// so the UI can surface chip-level suggestions.
//
// Why seq2seq (text2text-generation) instead of masked-LM fill-mask:
//
//  - A masked-LM checks each word in isolation against its own top-K.
//    That catches obvious misspellings in normal prose ("recieve" isn't
//    in the top-20 predictions at its mask position), but fails at
//    EVERY other failure mode the user cares about:
//       * grammar errors that span multiple words
//           "I has a apple"  → the mask for "has" probably predicts
//                               "have" just fine, but the mask for "a"
//                               gets confused by the broken verb upstream
//       * real-word errors — "I went their" where "their" is perfectly
//                               likely at its mask position even though
//                               it's the wrong word
//       * short / gibberish / SMS-abbreviation inputs where the mask
//           context itself is garbage so the top-K is garbage
//
//  - A proper grammar-correction model (Flan-T5-style seq2seq,
//    instruction-tuned) handles all three in one forward pass: feed it
//    the full sentence, read back the corrected sentence, done.
//    That's how Grammarly-style correction actually works in industry.
//
// Algorithm:
//
//  1. Ask the engine to rewrite the input into corrected text via a
//     plain text-generation prompt. The default model is
//     Xenova/LaMini-Flan-T5-248M which is tiny, instruction-tuned,
//     loads reliably through Transformers.js, and handles grammar
//     correction out of the box.
//  2. Tokenize original + corrected into word arrays (with index
//     positions for the original).
//  3. Run word-level LCS alignment. Every (delete, insert) pair
//     becomes a substitution chip {from, to, index}. Leftover deletes
//     become {from, to: null}. Insertions are dropped in v1 (no
//     natural "from" position to attach a chip to).
//  4. Filter out substitutions that only differ in case/punctuation,
//     so "hello" → "Hello." doesn't produce a noise chip.
//
// The model is called ONCE per debounced input, not once per word.
// Latency is dominated by one seq2seq forward pass: ~250–700 ms for a
// short sentence on flan-T5-small-class models in WASM, depending on
// the device. SmartText's default debounce is 400 ms so there's
// breathing room before the next call stacks up.

const MAX_INPUT_LEN = 800;   // truncate enormous pastes before the model
const PROMPT_TEMPLATE =
  // Instruction-style prompt, with the instruction kept very short so
  // LaMini-Flan doesn't waste decode budget echoing it back.
  "Fix the grammar and spelling errors in the text below. Output only " +
  "the corrected text, without explanation.\n\nText: {INPUT}\n\nCorrected:";

export const spellcheckTask = {
  id: "spellcheck",
  description:
    "LLM-driven spelling and grammar correction. Rewrites the input with an " +
    "on-device seq2seq model and word-aligns the diff into chip suggestions.",

  // No fast path. Every correction is a model call.
  fast() {
    return null;
  },

  async slow(input, _context, engine) {
    if (!input || typeof input !== "string" || !input.trim()) {
      return empty(0, 0);
    }

    // Contract: the engine must expose complete(prompt, options). Our
    // TransformersBackend does this for task="text2text-generation" and
    // task="text-generation". The fill-mask path is explicitly not
    // supported here — grammar correction isn't a masked-LM task.
    if (typeof engine.complete !== "function") {
      return {
        confidence: 0,
        source: "model",
        suggestions: [],
        checked: 0,
        skipped: 0,
        error:
          "spellcheck requires a text-generation engine. Configure reflex " +
          "with { task: 'text2text-generation', model: 'Xenova/LaMini-Flan-T5-248M' } " +
          "or another seq2seq instruction model.",
      };
    }

    // Tokenize the ORIGINAL into word positions. We'll use these to
    // resolve chip indices back to the textarea.
    const origWords = tokenizeWithIndices(input);
    if (!origWords.length) return empty(0, 0);

    // Truncate before sending to the model. Grammar correction quality
    // also tanks past a certain input length for small models, so we
    // cap at something generous (800 chars ≈ a short paragraph).
    const prompt = PROMPT_TEMPLATE.replace(
      "{INPUT}",
      input.length > MAX_INPUT_LEN ? input.slice(0, MAX_INPUT_LEN) : input,
    );

    let corrected;
    try {
      const reply = await engine.complete(prompt, {
        maxTokens: 256,
        temperature: 0,
      });
      corrected = cleanModelOutput(String(reply ?? ""));
    } catch (err) {
      return {
        confidence: 0,
        source: "model",
        suggestions: [],
        checked: origWords.length,
        skipped: 0,
        error: `grammar model call failed: ${err?.message ?? err}`,
      };
    }

    // Empty reply → nothing useful; don't fabricate suggestions.
    if (!corrected) return empty(origWords.length, 0);

    // If the model echoed the input unchanged (case-insensitively), the
    // text is clean — no suggestions.
    if (normalize(corrected) === normalize(input)) {
      return {
        confidence: 0.9,
        source: "model",
        suggestions: [],
        checked: origWords.length,
        skipped: 0,
        corrected,
      };
    }

    const corrWords = tokenizeWithIndices(corrected);
    const suggestions = diffWordsToSuggestions(origWords, corrWords);

    return {
      confidence: suggestions.length ? 0.8 : 0.9,
      source: "model",
      suggestions,
      checked: origWords.length,
      skipped: 0,
      corrected,
    };
  },
};

function empty(checked, skipped) {
  return { confidence: 1, source: "model", suggestions: [], checked, skipped };
}

/** Letters + internal apostrophes; matches "don't", "it's", "whoa". */
const WORD_RE = /\b[A-Za-z][A-Za-z']*\b/g;

function tokenizeWithIndices(text) {
  const out = [];
  let m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) {
    out.push({ word: m[0], index: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Case-insensitive punctuation-insensitive word comparison key.
 * Used both for LCS equality and for the "did anything actually
 * change" fast-path check.
 */
function wordKey(w) {
  return (typeof w === "string" ? w : w.word)
    .toLowerCase()
    .replace(/['"`.,!?;:—–-]/g, "");
}

function normalize(text) {
  return tokenizeWithIndices(text).map(wordKey).join(" ");
}

/**
 * Flan-T5 / LaMini family models sometimes:
 *   - Wrap their output in quotes ("…")
 *   - Emit a "Corrected:" / "Fixed:" prefix
 *   - Trail an extra newline or period
 *   - Echo "Text:" back
 * Strip all that so the downstream diff gets clean words.
 */
function cleanModelOutput(raw) {
  let out = raw.trim();
  // Drop common leading prefixes
  out = out.replace(
    /^(?:corrected|fixed|answer|output|response|result)\s*[:\-]\s*/i,
    "",
  );
  // Strip paired wrapping quotes
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'")) ||
    (out.startsWith("“") && out.endsWith("”"))
  ) {
    out = out.slice(1, -1);
  }
  return out.trim();
}

/**
 * Word-level LCS alignment. Returns a list of ops:
 *   { type: 'match',  origIdx, corrIdx }
 *   { type: 'delete', origIdx }           (word in original, missing in corrected)
 *   { type: 'insert', corrIdx }           (word in corrected, missing in original)
 *
 * Matching is case/punctuation-insensitive via wordKey().
 */
function alignWords(origWords, corrWords) {
  const a = origWords.map(wordKey);
  const b = corrWords.map(wordKey);
  const n = a.length;
  const m = b.length;
  // Dynamic programming table for LCS length.
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack to recover the alignment.
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ type: "match", origIdx: i - 1, corrIdx: j - 1 });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ type: "delete", origIdx: i - 1 });
      i--;
    } else {
      ops.push({ type: "insert", corrIdx: j - 1 });
      j--;
    }
  }
  while (i > 0) { ops.push({ type: "delete", origIdx: i - 1 }); i--; }
  while (j > 0) { ops.push({ type: "insert", corrIdx: j - 1 }); j--; }
  return ops.reverse();
}

/**
 * Walk the aligned ops and collapse runs of (delete + insert) into
 * substitution suggestions. The LCS backtrack can emit deletes and
 * inserts in EITHER order within a run (that's an artefact of the
 * tie-breaking rule), so we collect the whole contiguous non-match run
 * and pair them up positionally instead of assuming "all deletes then
 * all inserts".
 *
 * Pairing rule: sort deletes by origIdx and inserts by corrIdx, then
 * zip. Leftover deletes become "remove this word" chips (to: null).
 * Leftover inserts are dropped in v1 because a chip needs a position
 * in the original text to anchor to.
 */
function diffWordsToSuggestions(origWords, corrWords) {
  const ops = alignWords(origWords, corrWords);
  const out = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].type === "match") { k++; continue; }

    // Collect the whole adjacent non-match run.
    const runStart = k;
    while (k < ops.length && ops[k].type !== "match") k++;
    const run = ops.slice(runStart, k);

    const deletes = run
      .filter((o) => o.type === "delete")
      .sort((a, b) => a.origIdx - b.origIdx);
    const inserts = run
      .filter((o) => o.type === "insert")
      .sort((a, b) => a.corrIdx - b.corrIdx);
    const paired = Math.min(deletes.length, inserts.length);

    // Paired delete+insert → substitution chip.
    for (let p = 0; p < paired; p++) {
      const ow = origWords[deletes[p].origIdx];
      const cw = corrWords[inserts[p].corrIdx];
      // Skip no-op subs where the only difference is capitalisation.
      if (wordKey(ow) === wordKey(cw)) continue;
      out.push({
        from: ow.word,
        to: cw.word,
        alternatives: [],
        index: ow.index,
        reason: "grammar/spelling correction",
      });
    }
    // Leftover deletes → delete-suggestion chip.
    for (let p = paired; p < deletes.length; p++) {
      const ow = origWords[deletes[p].origIdx];
      out.push({
        from: ow.word,
        to: null,
        alternatives: [],
        index: ow.index,
        reason: "unnecessary word",
      });
    }
    // Leftover inserts are intentionally dropped.
  }
  // Suggestions should be in document order so chips render left→right.
  out.sort((a, b) => a.index - b.index);
  return out;
}

// ─── task: smart paste extraction ─────────────────────────────────────

const EMAIL_RE   = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
const PHONE_RE   = /(\+?\d[\d\s().-]{7,}\d)/g;
const URL_RE     = /\bhttps?:\/\/[^\s]+/g;
const TWITTER_RE = /(?:^|\s)@([a-zA-Z0-9_]{2,15})(?:\s|$)/g;

export const pasteExtractTask = {
  id: "paste-extract",
  description:
    "Split a pasted blob (business card, contact info, signature) into structured form fields.",

  fast(input) {
    if (!input || typeof input !== "string" || !input.trim()) {
      return { confidence: 0, source: "rule", fields: {} };
    }

    const fields = {};
    const matchedRanges = [];

    // Emails
    const emails = [...input.matchAll(EMAIL_RE)].map((m) => m[0]);
    if (emails.length) {
      fields.email = emails[0];
      if (emails.length > 1) fields.emails = emails;
    }

    // Phone numbers — crude but catches the common forms.
    const phones = [...input.matchAll(PHONE_RE)]
      .map((m) => m[1].replace(/[^\d+]/g, ""))
      .filter((p) => p.length >= 7 && p.length <= 16);
    if (phones.length) {
      fields.phone = phones[0];
      if (phones.length > 1) fields.phones = phones;
    }

    // URLs / websites
    const urls = [...input.matchAll(URL_RE)].map((m) => m[0]);
    if (urls.length) fields.website = urls[0];

    // Twitter / X handles
    const twitter = [...input.matchAll(TWITTER_RE)].map((m) => m[1]);
    if (twitter.length) fields.twitter = twitter[0];

    // Derive a company guess from the email domain when no model is around.
    if (fields.email && !fields.company) {
      const domain = fields.email.split("@")[1] ?? "";
      const label = domain.split(".")[0] ?? "";
      if (label && !/^(gmail|yahoo|hotmail|outlook|icloud|proton|protonmail|me)$/.test(label)) {
        fields.company = label.charAt(0).toUpperCase() + label.slice(1);
      }
    }

    // Name heuristic — the first line that isn't obviously a URL, email,
    // phone, or title-word is usually the name. Weak, but it's the
    // rules-layer, not the final answer.
    const lines = input
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (EMAIL_RE.test(line)) { EMAIL_RE.lastIndex = 0; continue; }
      if (PHONE_RE.test(line)) { PHONE_RE.lastIndex = 0; continue; }
      if (URL_RE.test(line))   { URL_RE.lastIndex = 0; continue; }
      if (line.length > 60) continue;
      if (/^\d/.test(line))   continue;
      // Looks like a name if it's 2-4 capitalised words.
      if (/^[A-Z][a-zA-Z'.-]+(\s+[A-Z][a-zA-Z'.-]+){1,3}$/.test(line)) {
        fields.name = line;
        break;
      }
    }

    const confidence =
      Object.keys(fields).length >= 2 ? 0.85
        : Object.keys(fields).length >= 1 ? 0.6
        : 0.0;
    return { confidence, source: "rule", fields };
  },

  async slow(input, _context, engine) {
    const prompt =
      `Extract contact fields from the following pasted text. Return a ` +
      `JSON object with any of: name, email, phone, company, title, ` +
      `address, website, twitter. Omit fields you can't determine. ` +
      `Text: """${input}"""`;
    const reply = await engine.complete(prompt, { temperature: 0.0, maxTokens: 300 });
    try {
      const fields = JSON.parse(reply.trim());
      return {
        confidence: 0.7,
        source: "model",
        fields: typeof fields === "object" && fields ? fields : {},
      };
    } catch {
      return { confidence: 0.4, source: "model", fields: {} };
    }
  },
};

// ─── registry ─────────────────────────────────────────────────────────

const registry = new Map();

export function registerTask(task) {
  if (!task || typeof task.id !== "string") {
    throw new Error("registerTask: task must have a string id");
  }
  registry.set(task.id, task);
  return task;
}

export function getTask(id) {
  return registry.get(id) ?? null;
}

export function listTasks() {
  return [...registry.values()];
}

// Register the built-ins.
registerTask(cityToStateTask);
registerTask(spellcheckTask);
registerTask(pasteExtractTask);

/**
 * Run a task. Tries the fast path first; if the fast path returns null or
 * a confidence below `threshold`, falls back to the slow (model) path when
 * an engine is available. Always returns a TaskResult (possibly empty).
 *
 * @param {string} taskId
 * @param {string} input
 * @param {object} [options]
 * @param {object} [options.context]
 * @param {import("@dhamaka/runtime").Engine} [options.engine]
 * @param {number} [options.threshold=0.5]
 */
export async function runTask(taskId, input, options = {}) {
  const task = getTask(taskId);
  if (!task) throw new Error(`unknown task: ${taskId}`);
  const context = options.context ?? {};
  const threshold = options.threshold ?? 0.5;

  const fast = task.fast?.(input, context);
  if (fast && fast.confidence >= threshold) return fast;

  if (options.engine && task.slow) {
    try {
      const slow = await task.slow(input, context, options.engine);
      if (slow) return slow;
    } catch (err) {
      // Model path failure shouldn't break the page — log and fall through.
      if (typeof console !== "undefined") {
        console.warn(`[dhamaka] task ${taskId} model path failed:`, err);
      }
    }
  }

  return fast ?? { confidence: 0, source: "rule", fields: {} };
}
