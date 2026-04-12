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

// ─── task: contextual spellcheck ──────────────────────────────────────
//
// Model-only. No rules, no hardcoded confusables, no context regexes.
// The whole thesis of Dhamaka is "let the on-device LLM do the work",
// and a spellchecker is a paradigmatic model task.
//
// Architecture: per-word masked-LM scoring. For each word in the input,
// we mask it with the model's mask token and ask the model to predict
// the most likely token at that position. If the original word is not
// in the top-K predictions, it's flagged as a likely misspelling and
// the top predictions become the suggested corrections.
//
// This is the correct algorithm for a masked-LM spellchecker. It's
// what distilBERT, BERT, RoBERTa, and every production masked-LM
// spellchecker do. It's fast (one forward pass per word, ~50-200ms
// on distilBERT in WASM), small (~65 MB for distilbert-base-uncased),
// and accurate for misspellings and obvious non-words.
//
// If no engine is available, or the engine doesn't support fill-mask,
// the task returns an empty suggestion list rather than inventing
// something. Silence beats fiction.

// Why MIN_WORD_LEN = 2: Users type SMS-abbreviation prose like
// "hi ho wh ar u wr hd". If we filter out every token shorter than 3 the
// spellchecker silently skips EVERYTHING in that input and the UI lies by
// saying "looks clean". 2-char words need checking too; the STOPLIST
// below covers the genuine 2-char function words so we don't flag
// "to / of / in / it / is / be / we / …".
const MIN_WORD_LEN = 2;
const MIN_SUGGESTION_LEN = 3;     // reject 1-2 char "suggestions"
const TOP_K = 20;                 // flag word if not in top-K predictions
const MAX_WORDS_PER_CALL = 40;    // don't spam the model on huge inputs
const STOPLIST = new Set([
  // Trivially correct function words we never want to flag
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at",
  "for", "by", "with", "from", "as", "is", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "can", "could", "should", "may", "might", "must", "not", "no",
  "yes", "so", "than", "then", "this", "that", "these", "those", "i",
  "me", "my", "mine", "you", "your", "yours", "he", "him", "his", "she",
  "her", "hers", "it", "its", "we", "us", "our", "ours", "they", "them",
  "their", "theirs",
  // Short function / filler words added for MIN_WORD_LEN=2. Without these
  // a legit "am" / "up" / "ok" would get sent to the model.
  "am", "up", "ok", "oh", "ah", "eh", "hi", "ha",
]);

export const spellcheckTask = {
  id: "spellcheck",
  description:
    "Per-word masked-LM spellcheck using an on-device language model.",

  // No fast path. Spellcheck is always a model call.
  fast() {
    return null;
  },

  async slow(input, _context, engine) {
    if (!input || typeof input !== "string" || !input.trim()) {
      return { confidence: 1, source: "model", suggestions: [], checked: 0, skipped: 0 };
    }

    // Contract: the engine must expose fillMask(inputWithMask, topK).
    // Our TransformersBackend does when loaded with task="fill-mask".
    if (typeof engine.fillMask !== "function") {
      return {
        confidence: 0,
        source: "model",
        suggestions: [],
        checked: 0,
        skipped: 0,
        error:
          "spellcheck requires a fill-mask engine (e.g. TransformersBackend " +
          "loaded with task: 'fill-mask', model: 'Xenova/distilbert-base-uncased')",
      };
    }

    const maskToken = typeof engine.maskToken === "string" && engine.maskToken
      ? engine.maskToken
      : "[MASK]";

    // Find every word (letters + internal apostrophes, e.g. "don't").
    const WORD_RE = /\b[A-Za-z][A-Za-z']*\b/g;
    const words = [];
    let match;
    while ((match = WORD_RE.exec(input)) !== null) {
      words.push({
        word: match[0],
        index: match.index,
        end: match.index + match[0].length,
      });
    }

    if (!words.length) {
      return { confidence: 1, source: "model", suggestions: [], checked: 0, skipped: 0 };
    }

    // Only actually run the model on words that are plausibly misspellable:
    // drop short words, drop stoplist members, drop pure punctuation.
    const candidates = words.filter((w) => {
      const lower = w.word.toLowerCase();
      if (lower.length < MIN_WORD_LEN) return false;
      if (STOPLIST.has(lower)) return false;
      return true;
    });

    // Cap work on huge inputs so we never spam the model with 200 calls.
    const toCheck = candidates.slice(0, MAX_WORDS_PER_CALL);
    const skipped = words.length - toCheck.length;

    const suggestions = [];
    for (const w of toCheck) {
      // Build a masked sentence. We replace THIS word with the mask token,
      // leaving every other word intact. distilBERT's WordPiece tokenizer
      // handles the rest.
      const masked =
        input.slice(0, w.index) + maskToken + input.slice(w.end);

      let topK;
      try {
        topK = await engine.fillMask(masked, TOP_K);
      } catch (err) {
        // A single failing call shouldn't kill the whole run.
        continue;
      }

      if (!Array.isArray(topK) || !topK.length) continue;

      // Is the original word (case-insensitively) in the top predictions?
      const lower = w.word.toLowerCase();
      const topTokens = topK.map((p) => String(p.token).toLowerCase());
      const isInTopK = topTokens.some((t) => t === lower || normalizeSubword(t) === lower);
      if (isInTopK) continue;

      // Not in top-K → flag it. Take up to 3 distinct alternative corrections.
      // A "real-word suggestion" must pass four gates:
      //   1. letters + apostrophes only (no punctuation, no digits)
      //   2. at least MIN_SUGGESTION_LEN chars (no 1-2 char junk like "xx" or "cd")
      //   3. contains at least one vowel (filters WordPiece fragments that
      //      happened to be valid letter sequences but are not real words)
      //   4. not identical to the original word (case-insensitive)
      const alts = topK
        .map((p) => normalizeSubword(String(p.token)))
        .filter(isPlausibleWord)
        .filter((t) => t.toLowerCase() !== lower)
        .slice(0, 3);

      // Even if there are NO plausible alternatives, still flag the word —
      // distilBERT-in-a-gibberish-context can genuinely have nothing useful
      // to suggest, and hiding the flag would pretend the word looked fine.
      // The chip UI renders alternatives=[] as "word ?" with a tooltip.
      suggestions.push({
        from: w.word,
        to: alts[0] ?? null,
        alternatives: alts.slice(1),
        index: w.index,
        reason: alts.length
          ? "not in top masked-LM predictions"
          : "not in top predictions, and none of the predictions are plausible words",
      });
    }

    return {
      confidence: suggestions.length ? 0.75 : 0.9,
      source: "model",
      suggestions,
      checked: toCheck.length,
      skipped,
    };
  },
};

/**
 * WordPiece subwords like `##ing` are not full words — strip the prefix
 * when matching. For stand-alone whole-word tokens this is a no-op.
 */
function normalizeSubword(token) {
  return token.startsWith("##") ? token.slice(2) : token;
}

/**
 * A token is a plausible whole-word correction if it:
 *   - is letters + apostrophes only (no digits, no punctuation)
 *   - is at least MIN_SUGGESTION_LEN characters long
 *   - contains at least one vowel (filters short WordPiece fragments like
 *     "xx", "cd", "sd" that are in distilBERT's vocabulary but are not
 *     real English words)
 */
function isPlausibleWord(token) {
  if (!token || typeof token !== "string") return false;
  if (token.length < MIN_SUGGESTION_LEN) return false;
  if (!/^[A-Za-z][A-Za-z']*$/.test(token)) return false;
  if (!/[aeiouy]/i.test(token)) return false;
  return true;
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
