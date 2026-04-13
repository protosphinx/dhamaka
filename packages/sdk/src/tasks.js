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
    // model with a few-shot prompt and parse the structured reply.
    //
    // Few-shot pattern continuation works far better on small models
    // (135M-250M params) than asking for JSON. The model just continues
    // the established pattern.
    if (!input || typeof input !== "string" || !input.trim()) return null;
    if (typeof engine.complete !== "function") return null;

    const prompt = [
      "Complete the city information.",
      "",
      "City: San Francisco → State: California, Country: United States (US), Timezone: America/Los_Angeles, Currency: USD",
      "City: Tokyo → State: Tokyo, Country: Japan (JP), Timezone: Asia/Tokyo, Currency: JPY",
      "City: London → State: England, Country: United Kingdom (GB), Timezone: Europe/London, Currency: GBP",
      "City: Mumbai → State: Maharashtra, Country: India (IN), Timezone: Asia/Kolkata, Currency: INR",
      "City: Sydney → State: New South Wales, Country: Australia (AU), Timezone: Australia/Sydney, Currency: AUD",
      `City: ${input.trim()} →`,
    ].join("\n");

    let reply;
    try {
      reply = await engine.complete(prompt, { temperature: 0.0, maxTokens: 80 });
    } catch {
      return null;
    }
    if (!reply) return null;

    // Parse "State: X, Country: Y (Z), Timezone: T, Currency: C"
    const stateMatch = reply.match(/State:\s*([^,]+)/i);
    const countryMatch = reply.match(/Country:\s*([^(]+)\((\w{2})\)/i);
    const countryFallback = !countryMatch ? reply.match(/Country:\s*([^,]+)/i) : null;
    const tzMatch = reply.match(/Timezone:\s*([\w/._-]+)/i);
    const currencyMatch = reply.match(/Currency:\s*(\w{3})/i);

    const stateName = stateMatch?.[1]?.trim() ?? "";
    const countryName = (countryMatch?.[1] ?? countryFallback?.[1] ?? "").trim();
    const country = countryMatch?.[2]?.trim() ?? "";

    // Need at least a state or country to be useful.
    if (!stateName && !countryName) return null;

    return {
      confidence: 0.6,
      source: "model",
      fields: {
        state: country || stateName.substring(0, 2).toUpperCase(),
        stateName,
        country,
        countryName,
        tz: tzMatch?.[1]?.trim() ?? "",
        currency: currencyMatch?.[1]?.trim() ?? "",
      },
    };
  },
};

// ─── task: contextual spellcheck ──────────────────────────────────────
//
// Hybrid rules-first + model-fallback spellchecker.
//
// The fast() path catches common misspellings and homophones instantly
// using a lookup table — no model, no latency, no download. This covers
// the most frequent real-world typos and makes the demo work immediately.
//
// The slow() path uses per-word masked-LM scoring (distilBERT) for the
// long tail: unusual words, context-dependent errors, and anything the
// rules table doesn't cover. It only runs when an engine with fillMask
// is available.
//
// This layered approach matches the rest of Dhamaka: rules for the
// deterministic head, model for the probabilistic tail.

// ── Confusables table: misspelling → correction ──────────────────────
// Covers the ~120 most common English misspellings (Oxford, Wikipedia,
// and autocorrect corpuses). Lowercase keys only.
const CONFUSABLES = new Map([
  // Double-letter errors
  ["accomodate", "accommodate"], ["occurence", "occurrence"], ["occured", "occurred"],
  ["occuring", "occurring"], ["refered", "referred"], ["refering", "referring"],
  ["commited", "committed"], ["commiting", "committing"], ["begining", "beginning"],
  ["writting", "writing"], ["untill", "until"], ["fullfill", "fulfill"],
  ["skillful", "skilful"],
  // ie / ei confusion
  ["recieve", "receive"], ["beleive", "believe"], ["acheive", "achieve"],
  ["percieve", "perceive"], ["decieve", "deceive"], ["concieve", "conceive"],
  ["wierd", "weird"], ["seize", "seize"], ["freind", "friend"],
  // Silent letters / phonetic traps
  ["definately", "definitely"], ["definitly", "definitely"], ["definatly", "definitely"],
  ["seperate", "separate"], ["seperately", "separately"],
  ["goverment", "government"], ["enviroment", "environment"],
  ["parliment", "parliament"],
  ["tommorow", "tomorrow"], ["tommorrow", "tomorrow"], ["tomorow", "tomorrow"],
  ["calender", "calendar"], ["calandar", "calendar"],
  ["neccessary", "necessary"], ["necesary", "necessary"], ["neccesary", "necessary"],
  ["privelege", "privilege"], ["priviledge", "privilege"],
  ["occassion", "occasion"], ["occassionally", "occasionally"],
  ["independant", "independent"], ["independance", "independence"],
  ["existance", "existence"], ["maintainance", "maintenance"],
  ["resistence", "resistance"], ["persistance", "persistence"],
  ["occurrance", "occurrence"],
  // Vowel drops / swaps
  ["apparantly", "apparently"], ["apparant", "apparent"],
  ["arguement", "argument"], ["judgement", "judgment"],
  ["acknowledgement", "acknowledgment"],
  ["embarass", "embarrass"], ["embarassment", "embarrassment"],
  ["harrass", "harass"], ["harrassment", "harassment"],
  ["millenium", "millennium"], ["millenia", "millennia"],
  ["grammer", "grammar"],
  // Common swaps
  ["teh", "the"], ["hte", "the"], ["taht", "that"], ["adn", "and"],
  ["waht", "what"], ["becuase", "because"], ["becasue", "because"],
  ["beacuse", "because"],
  ["alot", "a lot"], ["noone", "no one"], ["eachother", "each other"],
  // -ance / -ence
  ["occurance", "occurrence"], ["aquaintance", "acquaintance"],
  ["rememberance", "remembrance"],
  // -able / -ible
  ["responsable", "responsible"], ["sensable", "sensible"],
  ["compatabile", "compatible"], ["accesible", "accessible"],
  // -tion / -sion
  ["posession", "possession"], ["proffession", "profession"],
  ["supression", "suppression"], ["agression", "aggression"],
  // -ous / -us / -ious
  ["concious", "conscious"], ["consious", "conscious"],
  ["rediculous", "ridiculous"], ["mischievious", "mischievous"],
  // Misc high-frequency
  ["acidentally", "accidentally"], ["accidently", "accidentally"],
  ["adress", "address"], ["absense", "absence"],
  ["aquire", "acquire"], ["aquisition", "acquisition"],
  ["athiest", "atheist"], ["awfull", "awful"],
  ["buisness", "business"], ["carribean", "Caribbean"],
  ["cemetary", "cemetery"], ["changable", "changeable"],
  ["collegue", "colleague"], ["comittee", "committee"],
  ["consensis", "consensus"], ["copywrite", "copyright"],
  ["correspondance", "correspondence"],
  ["curiousity", "curiosity"],
  ["dilemna", "dilemma"], ["dissapear", "disappear"], ["dissapoint", "disappoint"],
  ["ecstacy", "ecstasy"], ["excede", "exceed"],
  ["facinate", "fascinate"],
  ["flourescent", "fluorescent"], ["foriegn", "foreign"],
  ["fourty", "forty"],
  ["guage", "gauge"], ["gaurd", "guard"], ["garantee", "guarantee"],
  ["heirarchy", "hierarchy"],
  ["immediatly", "immediately"], ["imediately", "immediately"],
  ["incidently", "incidentally"],
  ["innoculate", "inoculate"],
  ["knowlege", "knowledge"], ["knowledgable", "knowledgeable"],
  ["liason", "liaison"], ["libary", "library"],
  ["liscense", "license"], ["lisence", "licence"],
  ["manuever", "maneuver"],
  ["medeval", "medieval"], ["momento", "memento"],
  ["miniscule", "minuscule"],
  ["mispell", "misspell"], ["mispelling", "misspelling"],
  ["noticable", "noticeable"],
  ["pasttime", "pastime"], ["perseverence", "perseverance"],
  ["playwrite", "playwright"],
  ["preceed", "precede"], ["procede", "proceed"],
  ["pronounciation", "pronunciation"],
  ["publically", "publicly"],
  ["questionaire", "questionnaire"],
  ["recomend", "recommend"], ["reccomend", "recommend"],
  ["relevent", "relevant"], ["rythm", "rhythm"],
  ["shedule", "schedule"],
  ["sieze", "seize"],
  ["succesful", "successful"], ["successfull", "successful"],
  ["supercede", "supersede"],
  ["surprize", "surprise"],
  ["tendancy", "tendency"],
  ["threshhold", "threshold"],
  ["truely", "truly"],
  ["tyrany", "tyranny"],
  ["unecessary", "unnecessary"],
  ["useable", "usable"],
  ["vaccuum", "vacuum"],
  ["vegatable", "vegetable"],
  ["visious", "vicious"],
  ["wether", "whether"],
  ["yestarday", "yesterday"],
]);

// ── Homophone context rules ──────────────────────────────────────────
// Each rule: [trigger word, correction, regex that must match the full input].
// Only fires when the trigger word appears AND the surrounding context
// matches, so we don't over-correct legitimate uses.
const CONTEXT_RULES = [
  // their / there / they're
  ["their", "there", /\btheir\s+(is|are|was|were|will|would|could|should|has|have|had|might|may|must)\b/i],
  ["their", "there", /\b(?:see|saw|meet|visit|go|went|get|got|arrive|arrived|be)\s+(?:\w+\s+)*their\b/i],
  ["their", "they're", /\btheir\s+(going|coming|leaving|running|doing|trying|getting|making|saying|looking)\b/i],
  ["there", "their", /\b(?:in|of|with|from|about)\s+there\s+(?:own|car|house|home|work|school|office|life|family|friend)/i],
  // your / you're
  ["your", "you're", /\byour\s+(going|coming|welcome|right|wrong|doing|being|getting|making|looking)\b/i],
  // its / it's
  ["its", "it's", /\bits\s+(a|the|not|been|going|very|really|always|never|about|just|also|only)\b/i],
  // then / than
  ["then", "than", /\b(?:more|less|better|worse|greater|larger|smaller|higher|lower|rather|other)\s+then\b/i],
  // affect / effect
  ["affect", "effect", /\b(?:the|an?|no|positive|negative|side|special)\s+affect\b/i],
  ["effect", "affect", /\b(?:will|does|did|could|would|can|may|might|won't|doesn't|didn't)\s+effect\b/i],
  // loose / lose
  ["loose", "lose", /\b(?:will|might|could|would|don't|didn't|won't|going to|gonna|about to)\s+loose\b/i],
];

const MIN_WORD_LEN = 3;           // ignore very short words
const MIN_SUGGESTION_LEN = 3;     // reject 1-2 char "suggestions"
const TOP_K = 20;                 // flag word if not in top-K predictions
const MAX_WORDS_PER_CALL = 40;    // don't spam the model on huge inputs
const MIN_CONTEXT_QUALITY = 0.4;  // ≥40% of words must be known English

// Words the model should NEVER check — common function words, pronouns,
// question words, prepositions, conjunctions, auxiliaries, adverbs.
const STOPLIST = new Set([
  // articles / determiners
  "the", "a", "an", "this", "that", "these", "those", "every", "each",
  "some", "any", "all", "both", "few", "many", "much", "most", "other",
  "another", "such", "own",
  // pronouns
  "i", "me", "my", "mine", "myself", "you", "your", "yours", "yourself",
  "he", "him", "his", "himself", "she", "her", "hers", "herself",
  "it", "its", "itself", "we", "us", "our", "ours", "ourselves",
  "they", "them", "their", "theirs", "themselves",
  "who", "whom", "whose", "which", "what", "whoever", "whatever",
  // conjunctions / prepositions
  "and", "or", "but", "nor", "so", "yet", "for", "if", "when", "while",
  "because", "since", "although", "though", "unless", "until", "after",
  "before", "during", "between", "among", "through", "about", "above",
  "below", "into", "onto", "upon", "within", "without", "against",
  "along", "around", "behind", "beside", "beyond", "despite", "toward",
  "towards", "across", "under", "over", "off", "out", "up", "down",
  "of", "to", "in", "on", "at", "by", "with", "from", "as",
  // auxiliaries / modals
  "is", "are", "was", "were", "be", "been", "being", "am",
  "have", "has", "had", "having",
  "do", "does", "did", "doing", "done",
  "will", "would", "shall", "should", "can", "could", "may", "might",
  "must", "need", "dare", "ought",
  // question words / relative
  "how", "why", "where", "when", "what", "which", "who", "whom", "whose",
  // common adverbs (never misspelled)
  "not", "no", "yes", "very", "really", "quite", "rather", "just",
  "also", "too", "still", "already", "always", "never", "often",
  "sometimes", "usually", "probably", "perhaps", "maybe", "actually",
  "here", "there", "now", "then", "than", "only", "even", "well",
  "back", "away", "again", "once", "twice", "soon", "later", "today",
  "tomorrow", "yesterday", "ago", "almost", "enough",
  // common short verbs / adjectives
  "get", "got", "go", "went", "gone", "come", "came", "say", "said",
  "make", "made", "take", "took", "taken", "give", "gave", "given",
  "know", "knew", "known", "think", "thought", "see", "saw", "seen",
  "want", "use", "used", "find", "found", "tell", "told", "ask",
  "asked", "work", "try", "tried", "call", "called", "keep", "kept",
  "let", "put", "run", "ran", "set", "like", "liked", "look",
  "looked", "help", "helped", "show", "showed", "hear", "heard",
  "play", "move", "moved", "live", "lived", "pay", "paid",
  "new", "old", "good", "bad", "big", "long", "great", "little",
  "right", "wrong", "same", "different", "small", "large", "high",
  "low", "first", "last", "next", "real", "sure", "true", "full",
  "early", "late", "hard", "easy", "far", "near", "fast", "free",
  "able", "own", "best", "better", "more", "less", "least",
  // common nouns (high-frequency, never misspelled)
  "time", "year", "people", "way", "day", "man", "woman", "child",
  "world", "life", "hand", "part", "place", "case", "week", "end",
  "home", "water", "room", "area", "money", "story", "fact", "month",
  "lot", "book", "eye", "job", "word", "side", "kind", "head",
  "house", "name", "line", "city", "state", "thing", "number",
]);

// ── Known English words: model should never flag these ───────────────
// The masked-LM can't reliably predict common words in noisy/gibberish
// context. Any word in this set is assumed correct regardless of what
// the model says. This prevents "how → ckey" type garbage.
const KNOWN_WORDS = new Set([
  ...STOPLIST,
  // Additional content words the model might wrongly flag
  "company", "system", "program", "question", "government", "night",
  "point", "group", "problem", "service", "friend", "father", "mother",
  "power", "hour", "game", "member", "car", "family", "community",
  "idea", "body", "information", "parent", "face", "reason", "result",
  "change", "order", "price", "report", "school", "office", "music",
  "person", "class", "market", "country", "history", "morning", "girl",
  "boy", "door", "art", "war", "food", "table", "student", "teacher",
  "letter", "window", "color", "sound", "paper", "land", "form",
  "heart", "horse", "road", "street", "field", "picture", "tree",
  "black", "white", "short", "able", "human", "local", "open",
  "close", "young", "strong", "clear", "whole", "simple", "certain",
  "important", "possible", "special", "second", "third", "whose",
  "final", "general", "public", "private", "happy", "sorry", "ready",
  "please", "thank", "thanks", "hello", "okay", "fine", "done",
  "address", "email", "phone", "data", "computer", "internet", "page",
  "file", "message", "button", "text", "image", "video", "click",
  "type", "search", "post", "link", "list", "code", "test", "user",
  "input", "output", "error", "value", "content", "server", "model",
  "event", "issue", "check", "update", "version", "start", "stop",
  "about", "before", "after", "between", "through", "during",
]);

export const spellcheckTask = {
  id: "spellcheck",
  description:
    "Contextual spellcheck: rules-first for common misspellings, model fallback for the long tail.",

  fast(input) {
    if (!input || typeof input !== "string" || !input.trim()) {
      return { confidence: 1, source: "rule", suggestions: [] };
    }

    const suggestions = [];

    // Pass 1: confusables table — catch common misspellings.
    const WORD_RE = /\b[A-Za-z][A-Za-z']*\b/g;
    let match;
    while ((match = WORD_RE.exec(input)) !== null) {
      const word = match[0];
      const lower = word.toLowerCase();
      const fix = CONFUSABLES.get(lower);
      if (fix) {
        suggestions.push({
          from: word,
          to: fix,
          alternatives: [],
          index: match.index,
          reason: "common misspelling",
        });
      }
    }

    // Pass 2: homophone context rules.
    for (const [trigger, correction, pattern] of CONTEXT_RULES) {
      if (pattern.test(input)) {
        // Find the trigger word's position in the input.
        const triggerRe = new RegExp(`\\b${trigger}\\b`, "gi");
        let m;
        while ((m = triggerRe.exec(input)) !== null) {
          // Don't double-flag if confusables already caught it.
          const alreadyFlagged = suggestions.some(
            (s) => s.index === m.index && s.from.toLowerCase() === trigger,
          );
          if (!alreadyFlagged) {
            suggestions.push({
              from: m[0],
              to: correction,
              alternatives: [],
              index: m.index,
              reason: "homophone — wrong word for this context",
            });
          }
        }
      }
    }

    if (!suggestions.length) return null; // let slow() handle it
    // Sort by position so chips appear in reading order.
    suggestions.sort((a, b) => a.index - b.index);
    return { confidence: 0.9, source: "rule", suggestions };
  },

  async slow(input, _context, engine) {
    if (!input || typeof input !== "string" || !input.trim()) {
      return { confidence: 1, source: "model", suggestions: [] };
    }

    // If the engine doesn't support fill-mask, return null so the caller
    // falls back to whatever fast() produced.
    if (typeof engine.fillMask !== "function") {
      return null;
    }

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
      return { confidence: 1, source: "model", suggestions: [] };
    }

    // ── Context quality gate ──────────────────────────────────────────
    // The masked-LM only works when the surrounding context is real
    // English. If most of the input is gibberish (short random strings,
    // key-mashing), the model produces garbage predictions and flags
    // valid words with nonsense corrections. Don't run it.
    const knownCount = words.filter(
      (w) => KNOWN_WORDS.has(w.word.toLowerCase()),
    ).length;
    const quality = words.length > 0 ? knownCount / words.length : 0;

    // Start with rule-based suggestions.
    const rulesResult = this.fast(input);
    const suggestions = [...(rulesResult?.suggestions ?? [])];

    if (quality < MIN_CONTEXT_QUALITY) {
      // Context too noisy — return rules only, skip model entirely.
      suggestions.sort((a, b) => a.index - b.index);
      return {
        confidence: suggestions.length ? 0.85 : 0.5,
        source: "rule",
        suggestions,
      };
    }

    const maskToken = typeof engine.maskToken === "string" && engine.maskToken
      ? engine.maskToken
      : "[MASK]";

    const ruleIndices = new Set(suggestions.map((s) => s.index));

    const candidates = words.filter((w) => {
      if (ruleIndices.has(w.index)) return false;
      const lower = w.word.toLowerCase();
      if (lower.length < MIN_WORD_LEN) return false;
      if (STOPLIST.has(lower)) return false;
      // Never flag known English words — the model can't reliably
      // predict them in all contexts and flagging "how" as "ckey" is
      // worse than missing a rare real-word error.
      if (KNOWN_WORDS.has(lower)) return false;
      return true;
    });

    const toCheck = candidates.slice(0, MAX_WORDS_PER_CALL);

    for (const w of toCheck) {
      const masked =
        input.slice(0, w.index) + maskToken + input.slice(w.end);

      let topK;
      try {
        topK = await engine.fillMask(masked, TOP_K);
      } catch {
        continue;
      }

      if (!Array.isArray(topK) || !topK.length) continue;

      const lower = w.word.toLowerCase();
      const topTokens = topK.map((p) => String(p.token).toLowerCase());
      const isInTopK = topTokens.some((t) => t === lower || normalizeSubword(t) === lower);
      if (isInTopK) continue;

      // Only accept the suggestion if the model's top prediction looks
      // like a genuine correction (edit distance ≤ 3 from the original,
      // or the original contains no vowels suggesting a non-word).
      const alts = topK
        .map((p) => normalizeSubword(String(p.token)))
        .filter(isPlausibleWord)
        .filter((t) => t.toLowerCase() !== lower)
        .slice(0, 3);

      // If the word contains at least one vowel and is ≥ 4 chars,
      // require the top suggestion to be a close edit to prevent
      // context-based false positives (e.g., "table" → "chair").
      const hasVowel = /[aeiouy]/i.test(w.word);
      if (hasVowel && w.word.length >= 4 && alts.length > 0) {
        const dist = editDistance(lower, alts[0].toLowerCase());
        if (dist > 3) continue; // too different — probably a context prediction, not a spelling fix
      }

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

    suggestions.sort((a, b) => a.index - b.index);
    return {
      confidence: suggestions.length ? 0.8 : 0.9,
      source: suggestions.some((s) => s.reason?.includes("masked-LM")) ? "model" : "rule",
      suggestions,
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

/**
 * Levenshtein edit distance between two strings.
 * Used to filter model suggestions — a genuine spelling correction
 * should be close (edit distance ≤ 3) to the original word. A distant
 * suggestion like "how → ckey" (distance 4) is a context prediction,
 * not a spelling fix.
 */
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
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
