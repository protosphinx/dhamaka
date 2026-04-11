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

// Minimal English stoplist + a short confusables set. For real use this
// would be a distilBERT-class masked LM; for the demo we ship rules that
// catch the classic homophone mistakes and fall through to the model for
// anything else.
const CONFUSABLES = new Map([
  ["their", ["there", "they're"]],
  ["there", ["their", "they're"]],
  ["theyre", ["they're"]],
  ["your", ["you're"]],
  ["youre", ["you're", "your"]],
  ["its", ["it's"]],
  ["alot", ["a lot"]],
  ["recieve", ["receive"]],
  ["seperate", ["separate"]],
  ["definately", ["definitely"]],
  ["occured", ["occurred"]],
  ["untill", ["until"]],
  ["goverment", ["government"]],
  ["teh", ["the"]],
  ["adn", ["and"]],
]);

// Patterns that disambiguate homophones by looking at neighbouring words.
// Each rule: if the pattern matches in `context`, prefer the replacement.
const CONTEXT_RULES = [
  { pattern: /\b(see|meet|visit)\s+you\s+their\b/i, from: "their", to: "there" },
  { pattern: /\btheir\s+(is|are|was|were)\b/i,      from: "their", to: "there" },
  { pattern: /\byour\s+(welcome|right|wrong|going|coming|kidding)\b/i, from: "your", to: "you're" },
  { pattern: /\bits\s+(a|an|going|been|the)\b/i,    from: "its",   to: "it's" },
];

export const spellcheckTask = {
  id: "spellcheck",
  description:
    "Find misspellings and homophone confusions in a block of text.",

  fast(input) {
    if (!input || typeof input !== "string") return { confidence: 1, source: "rule", suggestions: [] };
    const suggestions = [];

    // Context-sensitive rules first (catches "see you their").
    for (const rule of CONTEXT_RULES) {
      const m = input.match(rule.pattern);
      if (m) {
        suggestions.push({
          from: rule.from,
          to: rule.to,
          index: m.index + m[0].toLowerCase().indexOf(rule.from),
          reason: "homophone in context",
        });
      }
    }

    // Per-word confusables.
    const wordRegex = /\b([a-zA-Z']+)\b/g;
    let m;
    while ((m = wordRegex.exec(input)) !== null) {
      const word = m[1].toLowerCase();
      const candidates = CONFUSABLES.get(word);
      if (!candidates) continue;
      // Skip if we already flagged this exact position via a context rule.
      if (suggestions.some((s) => s.index === m.index)) continue;
      suggestions.push({
        from: m[1],
        to: candidates[0],
        alternatives: candidates.slice(1),
        index: m.index,
        reason: "common misspelling",
      });
    }

    return {
      confidence: suggestions.length ? 0.9 : 1.0,
      source: "rule",
      suggestions,
    };
  },

  async slow(input, _context, engine) {
    // Model fallback for corrections the rule set didn't catch.
    const prompt =
      `You are a proofreader. Find misspellings or homophone confusions in ` +
      `the following text and return a JSON array of {from, to, reason}. ` +
      `Return an empty array if the text is correct. Text: """${input}"""`;
    const reply = await engine.complete(prompt, { temperature: 0.0, maxTokens: 300 });
    try {
      const suggestions = JSON.parse(reply.trim());
      return {
        confidence: 0.6,
        source: "model",
        suggestions: Array.isArray(suggestions) ? suggestions : [],
      };
    } catch {
      return { confidence: 0.4, source: "model", suggestions: [] };
    }
  },
};

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
