// Workflow — model-first browser-local reasoning for app workflows.
//
// SmartField and Transform are narrow primitives. Workflow is the product
// surface for complex private app work: give the local model user intent,
// app state, available tools, and validation rules; get back a structured
// result the app can inspect before applying.

import { createEngine } from "@dhamaka/runtime";

/**
 * @typedef {object} WorkflowRequest
 * @property {string} intent                 What the user wants done.
 * @property {string|object} [input]         Focused input such as a formula, row, or pasted blob.
 * @property {object} [context]              App state/schema/selection/data needed for reasoning.
 * @property {object} [schema]               Shape the returned output should follow.
 * @property {Array<object>} [tools]         App tools/actions the model may request by name.
 * @property {Array<Function>} [validators]  Post-model validators run before the result is trusted.
 * @property {number} [maxToolRounds]        How many tool-execution rounds to allow. Default 1.
 * @property {number} [temperature]
 * @property {number} [maxTokens]
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {object} WorkflowResult
 * @property {"model"} source
 * @property {string} intent
 * @property {string} action
 * @property {string} summary
 * @property {string|object} output
 * @property {Array<object>} toolCalls
 * @property {Array<object>} toolResults
 * @property {number} confidence
 * @property {boolean} needsReview
 * @property {Array<{ ok: boolean, message?: string }>} validation
 * @property {string} raw
 * @property {object} backend
 */

export class Workflow {
  /**
   * @param {object} [options]
   * @param {object} [options.engine]       Already-loaded Engine-compatible object, useful in tests.
   * @param {"auto"|"mock"|"wasm"|"window-ai"|"transformers"} [options.backend]
   * @param {string} [options.model]
   * @param {string} [options.task]
   * @param {string} [options.cdn]
   * @param {string} [options.systemPrompt]
   * @param {Array<Function>} [options.validators]
   * @param {number} [options.maxToolRounds]
   */
  constructor(options = {}) {
    this.options = options;
    this.engine = options.engine ?? null;
    this.loading = null;
  }

  /**
   * Run a model-first workflow and return a structured result.
   * @param {WorkflowRequest} req
   * @returns {Promise<WorkflowResult>}
   */
  async run(req = {}) {
    if (!req || typeof req.intent !== "string" || !req.intent.trim()) {
      throw new Error("Workflow.run: `intent` string is required");
    }

    const engine = await this.ensureEngine();
    const completionOptions = {
      temperature: req.temperature ?? 0.15,
      maxTokens: req.maxTokens ?? 700,
      signal: req.signal,
    };

    const prompt = buildWorkflowPrompt(req, this.options.systemPrompt);
    let raw = await engine.complete(prompt, completionOptions);
    let parsed = parseModelJson(raw);
    let result = normalizeWorkflowResult(parsed, raw, req, engine.info?.() ?? {});
    const toolResults = [];

    const maxToolRounds = Math.max(
      0,
      Math.floor(req.maxToolRounds ?? this.options.maxToolRounds ?? 1),
    );
    for (let round = 0; round < maxToolRounds && result.toolCalls.length; round++) {
      const roundResults = await runToolCalls(result.toolCalls, req.tools ?? [], req);
      if (!roundResults.length) break;
      toolResults.push(...roundResults);
      if (!roundResults.some((toolResult) => toolResult.ok)) break;

      const followupPrompt = buildWorkflowPrompt(
        { ...req, toolResults },
        this.options.systemPrompt,
      );
      raw = await engine.complete(followupPrompt, completionOptions);
      parsed = parseModelJson(raw);
      result = normalizeWorkflowResult(parsed, raw, req, engine.info?.() ?? {});
    }

    result.toolResults = toolResults;
    result.validation = await validateResult(result, req, this.options.validators ?? []);
    result.needsReview =
      !!result.needsReview ||
      result.validation.some((check) => check.ok === false) ||
      toolResults.some((toolResult) => toolResult.ok === false) ||
      result.toolCalls.length > 0;
    return result;
  }

  async ensureEngine() {
    if (this.engine) {
      if (this.engine.loaded === false && typeof this.engine.load === "function") {
        await this.engine.load({ entry: this.options.entry ?? null });
      }
      return this.engine;
    }
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const engine = createEngine({
        backend: this.options.backend ?? "auto",
        model: this.options.model,
        task: this.options.task ?? "text2text-generation",
        cdn: this.options.cdn,
        systemPrompt: this.options.systemPrompt,
      });
      await engine.load({ entry: this.options.entry ?? null });
      this.engine = engine;
      return engine;
    })();
    return this.loading;
  }
}

function buildWorkflowPrompt(req, systemPrompt) {
  const parts = [];
  parts.push(systemPrompt || "You are a browser-local LLM embedded inside a web app.");
  parts.push(
    "Handle the user's private workflow using only the supplied app context. " +
      "Return strict JSON only. Do not include markdown fences.",
  );
  parts.push(
    'Required JSON shape: {"summary": string, "action": string, "output": object|string, ' +
      '"confidence": number, "needsReview": boolean, "toolCalls": [{"name": string, "args": object}], "notes": string[]}',
  );
  parts.push(`Intent: ${req.intent.trim()}`);
  if (req.input !== undefined) {
    parts.push("Focused input:");
    parts.push(formatBlock(req.input));
  }
  if (req.context && Object.keys(req.context).length) {
    parts.push("App context:");
    parts.push(formatBlock(req.context));
  }
  if (req.schema && Object.keys(req.schema).length) {
    parts.push("Output schema:");
    parts.push(formatBlock(req.schema));
  }
  if (Array.isArray(req.tools) && req.tools.length) {
    parts.push("Available app tools/actions:");
    parts.push(formatBlock(req.tools.map(describeToolForPrompt)));
    parts.push("If a tool/action is needed, include it in toolCalls. Do not invent tool names.");
  }
  if (Array.isArray(req.toolResults) && req.toolResults.length) {
    parts.push("Tool results from app-owned code:");
    parts.push(formatBlock(req.toolResults));
    parts.push("Use these tool results to return the final workflow output.");
  }
  parts.push(
    "Prefer useful structured output over prose. Mark needsReview true when confidence is low, " +
      "the instruction is ambiguous, or applying the result could change important data.",
  );
  return parts.join("\n\n");
}

function formatBlock(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function describeToolForPrompt(tool) {
  if (!tool || typeof tool !== "object") return tool;
  const { name, description, inputSchema, schema, parameters } = tool;
  return { name, description, inputSchema: inputSchema ?? schema ?? parameters };
}

function parseModelJson(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const candidate = firstJsonObject(unfenced);
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

function firstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function normalizeWorkflowResult(parsed, raw, req, backend) {
  if (!parsed || typeof parsed !== "object") {
    return {
      source: "model",
      intent: req.intent.trim(),
      action: "unstructured-response",
      summary: "The model did not return structured JSON.",
      output: String(raw ?? "").trim(),
      toolCalls: [],
      toolResults: [],
      confidence: 0.25,
      needsReview: true,
      validation: [],
      raw: String(raw ?? ""),
      backend,
    };
  }
  const confidence = Number.isFinite(Number(parsed.confidence))
    ? Math.max(0, Math.min(1, Number(parsed.confidence)))
    : 0.5;
  return {
    source: "model",
    intent: req.intent.trim(),
    action: typeof parsed.action === "string" ? parsed.action : "return-output",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    output: parsed.output ?? parsed.fields ?? "",
    toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [],
    toolResults: [],
    confidence,
    needsReview: Boolean(parsed.needsReview),
    validation: [],
    raw: String(raw ?? ""),
    backend,
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
  };
}

async function runToolCalls(toolCalls, tools, req) {
  if (!Array.isArray(toolCalls) || !toolCalls.length || !Array.isArray(tools) || !tools.length) {
    return [];
  }
  const toolsByName = new Map(
    tools
      .filter((tool) => tool && typeof tool.name === "string")
      .map((tool) => [tool.name, tool]),
  );
  const results = [];
  for (const call of toolCalls) {
    const name = call?.name;
    if (typeof name !== "string") continue;
    const tool = toolsByName.get(name);
    if (!tool || typeof tool.run !== "function") {
      results.push({ name, ok: false, error: "tool not registered" });
      continue;
    }
    try {
      const value = await tool.run(call.args ?? {}, { request: req, call });
      results.push({ name, ok: true, result: value });
    } catch (err) {
      results.push({ name, ok: false, error: err?.message || "tool failed" });
    }
  }
  return results;
}

async function validateResult(result, req, defaultValidators) {
  const validators = [...defaultValidators, ...(req.validators ?? [])];
  if (!validators.length) return [{ ok: true, message: "no validators registered" }];
  const checks = [];
  for (const validator of validators) {
    if (typeof validator !== "function") continue;
    try {
      checks.push(normalizeValidation(await validator(result, req)));
    } catch (err) {
      checks.push({ ok: false, message: err?.message || "validator threw" });
    }
  }
  return checks.length ? checks : [{ ok: true, message: "no validators registered" }];
}

function normalizeValidation(value) {
  if (value === undefined || value === null || value === true) return { ok: true };
  if (value === false) return { ok: false, message: "validation failed" };
  if (typeof value === "string") return { ok: false, message: value };
  if (typeof value === "object") {
    return {
      ok: value.ok !== false,
      message: value.message,
    };
  }
  return { ok: Boolean(value) };
}
