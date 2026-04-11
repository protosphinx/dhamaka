// Transform — the imperative one-shot AI call.
//
// SmartField is for reactive reflexes on <input> events. Transform is the
// other shape: an imperative, instruction-driven, one-shot call where an
// app passes in some input, an instruction, and optional context, and gets
// back a transformed output.
//
// It's the primitive most app-level AI features are made of: "rewrite this
// formula", "explain this cell", "translate this paragraph", "refactor this
// function", "summarise this range". One call, one answer, all local.
//
//   import { Transform } from "locus";
//
//   const t = new Transform();
//   const result = await t.run({
//     task: "formula-transform",
//     input: "=SUM(A1:A10) * 1.08",
//     instruction: "add a 10% discount for employees",
//     context: { dialect: "excel", headers: ["amount", "isEmployee"] },
//   });
//   // → { output: "=IF(...)", source: "rule", confidence: 0.9 }
//
// Transform goes through the same task registry as SmartField, so tasks
// can advertise a rules-first fast path *and* an LLM slow path. The class
// itself is intentionally thin — the intelligence lives in the tasks.

import { reflex } from "./reflex.js";
import { runTask, getTask } from "./tasks.js";

/**
 * @typedef {object} TransformRequest
 * @property {string}  [task]        Task id from the registry (optional;
 *                                    if omitted we run a generic prompt).
 * @property {string}  input         The content being transformed.
 * @property {string}  [instruction] Natural-language instruction from the
 *                                    user (e.g. "add a 10% discount").
 * @property {object}  [context]     Structured context the task can use
 *                                    (headers, schema, neighbours, etc.).
 * @property {number}  [temperature]
 * @property {number}  [maxTokens]
 * @property {AbortSignal} [signal]
 * @property {number}  [threshold]   Fast-path confidence floor. Below this
 *                                    we escalate to the model (if loaded).
 * @property {boolean} [eager]       If true, always run the model path.
 */

/**
 * @typedef {object} TransformResult
 * @property {string}  output        The transformed output (empty string on failure).
 * @property {"rule"|"fuzzy"|"model"} source
 * @property {number}  confidence    0..1
 * @property {object}  [fields]      Structured fields, if the task produced any.
 * @property {string}  [explanation] Optional human-readable explanation of what changed.
 * @property {string}  [error]       Set when the transform failed gracefully.
 */

const DEFAULT_THRESHOLD = 0.75;

export class Transform {
  /**
   * @param {object} [options]
   * @param {boolean} [options.eager]      If true, always call the model
   * @param {number}  [options.threshold]  Default fast-path confidence floor
   */
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Run a one-shot transformation.
   * @param {TransformRequest} req
   * @returns {Promise<TransformResult>}
   */
  async run(req) {
    if (!req || typeof req.input !== "string") {
      throw new Error("Transform.run: `input` string is required");
    }

    const threshold = req.threshold ?? this.options.threshold ?? DEFAULT_THRESHOLD;
    const eager = req.eager ?? this.options.eager ?? false;

    // Task-routed path. Tasks built for Transform (e.g. formula-transform)
    // receive an input + instruction + context and produce a TaskResult
    // shaped so we can normalise it into a TransformResult below.
    if (req.task) {
      if (!getTask(req.task)) {
        throw new Error(`Transform.run: unknown task "${req.task}"`);
      }
      const result = await reflex.run(req.task, req.input, {
        context: {
          instruction: req.instruction ?? "",
          ...(req.context ?? {}),
        },
        eager,
        threshold,
      });
      return normalize(result, req.input);
    }

    // Generic "no task" path — build a neutral prompt and call the model.
    // This is the escape hatch for one-off transforms that don't warrant a
    // registered task.
    const engine = await reflex.ensure();
    const prompt = buildGenericPrompt(req);
    const output = await engine.complete(prompt, {
      temperature: req.temperature ?? 0.2,
      maxTokens: req.maxTokens ?? 256,
      signal: req.signal,
    });
    return {
      output: (output ?? "").trim(),
      source: "model",
      confidence: 0.6,
    };
  }

  // ─── convenience methods for the formula family ─────────────────────
  //
  // These are thin wrappers so app code reads nicely without importing the
  // Formula class. For anything more elaborate, use `new Formula(...)`.

  /** Rewrite a formula according to a natural-language instruction. */
  formula(input, instruction, context) {
    return this.run({
      task: "formula-transform",
      input,
      instruction,
      context,
    });
  }

  /** Explain what a formula does in plain English. */
  explain(input, context) {
    return this.run({
      task: "formula-explain",
      input,
      context,
    });
  }

  /** Diagnose a formula error and suggest a fix. */
  debug(input, context) {
    return this.run({
      task: "formula-debug",
      input,
      context,
    });
  }
}

// ─── helpers ────────────────────────────────────────────────────────────

/**
 * Map a TaskResult into a TransformResult.
 * Tasks returning `fields.output` surface that as the primary output; tasks
 * returning `text` use that; everything else leaves output empty.
 */
function normalize(result, originalInput) {
  if (!result || typeof result !== "object") {
    return { output: originalInput, source: "rule", confidence: 0 };
  }
  const fields = result.fields ?? {};
  const output =
    typeof fields.output === "string"
      ? fields.output
      : typeof result.text === "string"
        ? result.text
        : "";
  return {
    output,
    source: result.source ?? "rule",
    confidence: result.confidence ?? 0,
    fields,
    explanation: fields.explanation,
    error: fields.error,
  };
}

function buildGenericPrompt(req) {
  const lines = [];
  lines.push("You are an on-device assistant that transforms small inputs.");
  if (req.context && Object.keys(req.context).length) {
    lines.push("Context: " + JSON.stringify(req.context));
  }
  if (req.instruction) {
    lines.push("Instruction: " + req.instruction);
  }
  lines.push("Input:");
  lines.push(req.input);
  lines.push("");
  lines.push("Respond with the transformed output only. No prose, no code fences.");
  return lines.join("\n");
}
