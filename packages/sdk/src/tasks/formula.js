// Formula tasks — the Transform family of tasks for spreadsheet / ERP
// formulas (erp.ai style).
//
// Three tasks ship here:
//
//   formula-transform : rewrite a formula according to an instruction
//   formula-explain   : explain what a formula does in plain English
//   formula-debug     : diagnose an error and suggest a fix
//
// Every task is rules-first. For formula-transform specifically, a handful
// of high-frequency patterns (discounts, taxes, rounding, multipliers,
// null-safety wrappers) are recognised by regex and rewritten structurally
// in microseconds with no model call. Anything else falls through to the
// LLM slow path.
//
// The dialect defaults to Excel/Google-Sheets-compatible syntax. Context
// can override with { dialect: "excel" | "sheets" | "airtable" | "erpai" }.

import { registerTask } from "../tasks.js";

// ─── formula-transform ────────────────────────────────────────────────

const PATTERNS = [
  // "add a 10% discount" / "apply 15% discount" / "10% off"
  {
    name: "percent-discount",
    re: /\b(?:add|apply)?\s*(?:a\s+)?(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:off|discount)\b/i,
    rewrite(input, m) {
      const pct = parseFloat(m[1]);
      const factor = (100 - pct) / 100;
      return {
        output: `(${stripOuter(input)}) * ${round(factor, 4)}`,
        explanation: `Multiplied by ${round(factor, 4)} to apply a ${pct}% discount.`,
      };
    },
  },

  // "add 8% tax" / "add a 7.25% sales tax" / "apply 18% GST"
  {
    name: "percent-tax",
    re: /\b(?:add|apply|include)?\s*(?:a\s+)?(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:sales\s+)?(?:tax|vat|gst)\b/i,
    rewrite(input, m) {
      const pct = parseFloat(m[1]);
      const factor = (100 + pct) / 100;
      return {
        output: `(${stripOuter(input)}) * ${round(factor, 4)}`,
        explanation: `Multiplied by ${round(factor, 4)} to add a ${pct}% tax.`,
      };
    },
  },

  // "round to 2 decimals" / "round to 2 decimal places" / "round to the nearest integer"
  {
    name: "round",
    re: /\bround(?:ed)?\s+(?:to\s+)?(?:(\d+)\s*decimals?(?:\s*places?)?|the\s+nearest\s+(integer|whole|dollar|cent))\b/i,
    rewrite(input, m) {
      let digits = 2;
      if (m[1]) digits = parseInt(m[1], 10);
      else if (m[2]) digits = /cent/i.test(m[2]) ? 2 : 0;
      return {
        output: `ROUND(${stripOuter(input)}, ${digits})`,
        explanation: `Wrapped in ROUND(…, ${digits}).`,
      };
    },
  },

  // "multiply by 1.5" / "multiply by 2"
  {
    name: "multiply-by",
    re: /\bmultiply(?:\s+it)?\s+by\s+(-?\d+(?:\.\d+)?)\b/i,
    rewrite(input, m) {
      const n = parseFloat(m[1]);
      return {
        output: `(${stripOuter(input)}) * ${n}`,
        explanation: `Multiplied by ${n}.`,
      };
    },
  },

  // "divide by 100"
  {
    name: "divide-by",
    re: /\bdivide(?:\s+it)?\s+by\s+(-?\d+(?:\.\d+)?)\b/i,
    rewrite(input, m) {
      const n = parseFloat(m[1]);
      if (n === 0) return null;
      return {
        output: `(${stripOuter(input)}) / ${n}`,
        explanation: `Divided by ${n}.`,
      };
    },
  },

  // "wrap in iferror" / "handle errors" / "fallback to 0 on error"
  {
    name: "iferror",
    re: /\b(?:wrap\s+in\s+iferror|handle\s+errors?|fallback\s+to\s+(-?\d+(?:\.\d+)?)\s+on\s+error)\b/i,
    rewrite(input, m) {
      const fallback = m[1] ?? "0";
      return {
        output: `IFERROR(${stripOuter(input)}, ${fallback})`,
        explanation: `Wrapped in IFERROR with fallback ${fallback}.`,
      };
    },
  },

  // "handle empty cells" / "treat blanks as zero" / "null-safe"
  {
    name: "null-safe",
    re: /\b(?:handle\s+empty|treat\s+blanks?\s+as\s+zero|null[-\s]safe)\b/i,
    rewrite(input) {
      return {
        output: `IFERROR(${stripOuter(input)}, 0)`,
        explanation: `Wrapped in IFERROR to return 0 for empty / errored cells.`,
      };
    },
  },

  // "convert to [currency]" — structural rewrite using a named rate
  {
    name: "currency-convert",
    re: /\bconvert\s+to\s+([A-Za-z]{3})\b/i,
    rewrite(input, m) {
      const currency = m[1].toUpperCase();
      return {
        output: `(${stripOuter(input)}) * ${currency}_RATE`,
        explanation: `Multiplied by the ${currency}_RATE named cell.`,
      };
    },
  },

  // "negate it" / "flip the sign"
  {
    name: "negate",
    re: /\b(?:negate(?:\s+it)?|flip\s+(?:the\s+)?sign)\b/i,
    rewrite(input) {
      return {
        output: `-(${stripOuter(input)})`,
        explanation: `Negated.`,
      };
    },
  },

  // "take absolute value" / "make it positive"
  {
    name: "abs",
    re: /\b(?:absolute\s+value|make\s+(?:it\s+)?positive|abs(?:olute)?)\b/i,
    rewrite(input) {
      return {
        output: `ABS(${stripOuter(input)})`,
        explanation: `Wrapped in ABS.`,
      };
    },
  },
];

export const formulaTransformTask = {
  id: "formula-transform",
  description:
    "Rewrite a spreadsheet / ERP formula according to a natural-language instruction.",

  fast(input, context) {
    const instruction = context?.instruction ?? "";
    if (!input || !instruction) {
      return { confidence: 0, source: "rule", fields: {} };
    }
    const formula = normaliseFormula(input);
    for (const pattern of PATTERNS) {
      const m = instruction.match(pattern.re);
      if (!m) continue;
      const rewrite = pattern.rewrite(formula, m);
      if (!rewrite) continue;
      return {
        confidence: 0.95,
        source: "rule",
        fields: {
          output: ensureLeadingEquals(rewrite.output, input),
          pattern: pattern.name,
          explanation: rewrite.explanation,
          original: input,
          instruction,
        },
      };
    }
    return null;
  },

  async slow(input, context, engine) {
    const instruction = context?.instruction ?? "";
    const dialect = context?.dialect ?? "excel";
    const headers = context?.headers;
    const grid = context?.grid;

    const lines = [
      `You are an expert ${dialect} formula editor.`,
      `Rewrite the formula below according to the user's instruction.`,
      `Respond with ONLY the new formula, starting with "=". No prose, no fences.`,
      headers ? `Column headers: ${JSON.stringify(headers)}` : "",
      grid ? `Context: ${JSON.stringify(grid).slice(0, 400)}` : "",
      ``,
      `Instruction: ${instruction}`,
      `Original formula: ${input}`,
      ``,
      `New formula:`,
    ].filter(Boolean);

    const output = (await engine.complete(lines.join("\n"), {
      temperature: 0.1,
      maxTokens: 256,
    })) || "";

    const cleaned = cleanModelOutput(output);
    if (!cleaned) {
      return {
        confidence: 0.3,
        source: "model",
        fields: { output: input, error: "model returned no usable formula" },
      };
    }
    return {
      confidence: 0.7,
      source: "model",
      fields: {
        output: ensureLeadingEquals(cleaned, input),
        original: input,
        instruction,
      },
    };
  },
};

// ─── formula-explain ──────────────────────────────────────────────────

const FUNCTION_EXPLAIN = new Map([
  ["SUM",     "adds up every value in the range"],
  ["AVERAGE", "computes the arithmetic mean of the range"],
  ["MIN",     "returns the smallest value in the range"],
  ["MAX",     "returns the largest value in the range"],
  ["COUNT",   "counts how many numeric cells are in the range"],
  ["COUNTA",  "counts how many non-empty cells are in the range"],
  ["IF",      "picks one of two branches based on a condition"],
  ["IFERROR", "catches errors from the wrapped expression and returns a fallback"],
  ["ROUND",   "rounds a number to a given number of decimal places"],
  ["ABS",     "returns the absolute value"],
  ["VLOOKUP", "looks up a value in the first column of a table and returns a matching row value"],
  ["XLOOKUP", "looks up a value and returns a matching result, with modern match/error handling"],
  ["INDEX",   "returns a cell at a given row/column in a range"],
  ["MATCH",   "finds the position of a value in a range"],
  ["SUMIF",   "sums cells that meet a single condition"],
  ["SUMIFS",  "sums cells that meet multiple conditions"],
  ["COUNTIF", "counts cells that meet a single condition"],
  ["COUNTIFS","counts cells that meet multiple conditions"],
  ["AND",     "returns TRUE only if every argument is TRUE"],
  ["OR",      "returns TRUE if any argument is TRUE"],
  ["NOT",     "inverts a boolean"],
  ["CONCAT",  "joins text values together"],
  ["CONCATENATE", "joins text values together"],
  ["TEXT",    "formats a number as text with a given pattern"],
  ["LEFT",    "returns the first N characters of a string"],
  ["RIGHT",   "returns the last N characters of a string"],
  ["MID",     "returns a substring"],
  ["LEN",     "returns the length of a string"],
  ["TRIM",    "strips leading and trailing whitespace"],
  ["LOWER",   "lowercases a string"],
  ["UPPER",   "uppercases a string"],
  ["NOW",     "returns the current date and time"],
  ["TODAY",   "returns today's date"],
  ["DATE",    "builds a date from year / month / day"],
]);

export const formulaExplainTask = {
  id: "formula-explain",
  description: "Explain what a spreadsheet formula does in plain English.",

  fast(input) {
    if (!input || typeof input !== "string") {
      return { confidence: 0, source: "rule", fields: {} };
    }
    const body = input.replace(/^=/, "");
    const fns = [...body.matchAll(/\b([A-Z][A-Z0-9_]*)\s*\(/g)]
      .map((m) => m[1])
      .filter((name, i, arr) => arr.indexOf(name) === i);

    if (!fns.length) {
      // Pure arithmetic — describe the operation tree.
      const ops = detectArithmetic(body);
      if (ops.length) {
        return {
          confidence: 0.85,
          source: "rule",
          fields: {
            output: `This formula ${ops.join(", then ")}.`,
            functions: [],
            original: input,
          },
        };
      }
      return null;
    }

    const parts = fns
      .map((fn) => {
        const gloss = FUNCTION_EXPLAIN.get(fn);
        return gloss ? `${fn} ${gloss}` : null;
      })
      .filter(Boolean);

    if (!parts.length) return null;

    return {
      confidence: 0.85,
      source: "rule",
      fields: {
        output: `This formula uses ${parts.join("; ")}.`,
        functions: fns,
        original: input,
      },
    };
  },

  async slow(input, _context, engine) {
    const prompt =
      `Explain the following spreadsheet formula in one or two plain-English sentences. ` +
      `Respond with only the explanation.\n\nFormula: ${input}\n\nExplanation:`;
    const out = (await engine.complete(prompt, {
      temperature: 0.2,
      maxTokens: 160,
    })) || "";
    return {
      confidence: 0.6,
      source: "model",
      fields: { output: out.trim(), original: input },
    };
  },
};

// ─── formula-debug ────────────────────────────────────────────────────

const ERROR_ADVICE = new Map([
  ["#DIV/0!",
    "The formula is dividing by a zero or empty cell. Wrap the denominator in IF or IFERROR, " +
    "for example `=IFERROR(A/B, 0)`."],
  ["#N/A",
    "A lookup (VLOOKUP / XLOOKUP / MATCH) didn't find its target. Check the lookup value is " +
    "in the target column, and consider IFERROR for a graceful fallback."],
  ["#REF!",
    "A cell reference points at a deleted or out-of-range cell. Check recent edits that " +
    "moved rows/columns, and rebuild any references that now point to empty space."],
  ["#VALUE!",
    "The formula is using a text value where a number is expected (or vice versa). Check " +
    "that every arithmetic operand is numeric."],
  ["#NAME?",
    "A function or named range is spelled wrong. Check the spelling of every function name " +
    "and any named ranges."],
  ["#NUM!",
    "A numeric operation is producing an invalid result (e.g. the square root of a negative " +
    "or a value too large to represent). Constrain inputs before the operation."],
  ["#NULL!",
    "Two ranges that don't intersect are being combined. Use a comma between arguments " +
    "instead of a space."],
  ["#SPILL!",
    "A dynamic-array result has no room to spill. Clear the blocking cells or move the " +
    "formula to an empty area."],
]);

export const formulaDebugTask = {
  id: "formula-debug",
  description: "Diagnose a formula error and suggest a fix.",

  fast(input, context) {
    const error = (context?.error ?? "").trim();
    if (error && ERROR_ADVICE.has(error)) {
      return {
        confidence: 0.9,
        source: "rule",
        fields: {
          output: ERROR_ADVICE.get(error),
          error,
          original: input,
        },
      };
    }
    // Detect division-by-zero risk statically.
    if (/\/\s*(?:0|B\d|\$?[A-Z]+\$?\d+\s*(?:-|$))/.test(input)) {
      return {
        confidence: 0.6,
        source: "rule",
        fields: {
          output:
            "This formula divides by a cell. If that cell is empty or zero you'll get " +
            "#DIV/0!. Consider `=IFERROR(…, 0)` or `=IF(B1=0, 0, …)`.",
          original: input,
        },
      };
    }
    return null;
  },

  async slow(input, context, engine) {
    const error = context?.error ?? "";
    const prompt =
      `The following spreadsheet formula is producing an error. Diagnose what's wrong and ` +
      `suggest a fix in one short paragraph.\n\nFormula: ${input}\nError: ${error}\n\nDiagnosis:`;
    const out = (await engine.complete(prompt, {
      temperature: 0.1,
      maxTokens: 200,
    })) || "";
    return {
      confidence: 0.6,
      source: "model",
      fields: { output: out.trim(), error, original: input },
    };
  },
};

// ─── helpers ──────────────────────────────────────────────────────────

function normaliseFormula(input) {
  return String(input || "").trim();
}

function ensureLeadingEquals(output, originalInput) {
  const had = String(originalInput || "").trim().startsWith("=");
  const has = String(output).trim().startsWith("=");
  if (had && !has) return "=" + output;
  return output;
}

function stripOuter(formula) {
  return String(formula || "").replace(/^=+/, "").trim();
}

function round(n, places) {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

function cleanModelOutput(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  // Drop code fences if the model used them.
  s = s.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```$/i, "");
  // Take only the first non-empty line (models sometimes add explanations).
  const first = s.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
  return first ?? "";
}

function detectArithmetic(body) {
  const ops = [];
  if (/\*/.test(body)) ops.push("multiplies terms together");
  if (/\//.test(body)) ops.push("divides terms");
  if (/\+/.test(body)) ops.push("adds terms");
  if (/-/.test(body)) ops.push("subtracts terms");
  return ops;
}

// ─── auto-register on import ──────────────────────────────────────────

registerTask(formulaTransformTask);
registerTask(formulaExplainTask);
registerTask(formulaDebugTask);
