import { test } from "node:test";
import assert from "node:assert/strict";
import { Workflow } from "../src/workflow.js";

function fakeEngine(reply) {
  return {
    loaded: false,
    prompts: [],
    options: [],
    async load(payload) {
      this.loaded = true;
      this.loadPayload = payload;
    },
    async complete(prompt, options) {
      this.prompts.push(prompt);
      this.options.push(options);
      return typeof reply === "function" ? reply(prompt, options) : reply;
    },
    info() {
      return { backend: "fake", id: "workflow-test" };
    },
  };
}

test("Workflow: run() returns structured model output with validation", async () => {
  const engine = fakeEngine(
    JSON.stringify({
      summary: "Mapped the row to an invoice draft.",
      action: "draft-invoice",
      output: { invoiceNumber: "INV-1042", total: 480 },
      confidence: 0.91,
      needsReview: false,
      toolCalls: [],
      notes: ["Customer matched by email domain."],
    }),
  );
  const workflow = new Workflow({ engine });

  const result = await workflow.run({
    intent: "Map this pasted CSV row to our invoice schema.",
    input: "billing@example.com,INV-1042,480",
    context: { customerCount: 12 },
    schema: { invoiceNumber: "string", total: "number" },
    validators: [(r) => ({ ok: Boolean(r.output.invoiceNumber), message: "invoice present" })],
  });

  assert.equal(engine.loaded, true);
  assert.equal(result.source, "model");
  assert.equal(result.action, "draft-invoice");
  assert.equal(result.output.invoiceNumber, "INV-1042");
  assert.equal(result.confidence, 0.91);
  assert.equal(result.needsReview, false);
  assert.deepEqual(result.toolCalls, []);
  assert.deepEqual(result.validation, [{ ok: true, message: "invoice present" }]);
  assert.equal(result.backend.backend, "fake");
});

test("Workflow: prompt includes intent, input, context, schema, and tools", async () => {
  const engine = fakeEngine('{"summary":"","action":"return-output","output":{},"confidence":0.5}');
  const workflow = new Workflow({ engine, systemPrompt: "You are Dhamaka in a private ERP tab." });

  await workflow.run({
    intent: "Normalize the import row.",
    input: { row: ["Acme", "net 30"] },
    context: { tenant: "demo" },
    schema: { customerName: "string", paymentTerms: "string" },
    tools: [{ name: "lookupCustomer", description: "Find customer by name" }],
  });

  const prompt = engine.prompts[0];
  assert.match(prompt, /You are Dhamaka in a private ERP tab/);
  assert.match(prompt, /Normalize the import row/);
  assert.match(prompt, /"tenant": "demo"/);
  assert.match(prompt, /"customerName": "string"/);
  assert.match(prompt, /lookupCustomer/);
  assert.equal(engine.options[0].temperature, 0.15);
  assert.equal(engine.options[0].maxTokens, 700);
});

test("Workflow: fenced JSON is accepted", async () => {
  const engine = fakeEngine(
    '```json\n{"summary":"ok","action":"return-output","output":"done","confidence":0.8,"needsReview":false}\n```',
  );
  const result = await new Workflow({ engine }).run({ intent: "Finish this task." });

  assert.equal(result.output, "done");
  assert.equal(result.confidence, 0.8);
  assert.equal(result.needsReview, false);
});

test("Workflow: unstructured model output is kept but marked for review", async () => {
  const engine = fakeEngine("I think the answer is maybe invoice 42.");
  const result = await new Workflow({ engine }).run({ intent: "Extract the invoice id." });

  assert.equal(result.action, "unstructured-response");
  assert.equal(result.output, "I think the answer is maybe invoice 42.");
  assert.equal(result.needsReview, true);
  assert.equal(result.validation[0].ok, true);
});

test("Workflow: validator failures force needsReview=true", async () => {
  const engine = fakeEngine(
    '{"summary":"No invoice id found.","action":"return-output","output":{},"confidence":0.7,"needsReview":false}',
  );
  const workflow = new Workflow({
    engine,
    validators: [(r) => (r.output.invoiceNumber ? true : "invoice number missing")],
  });

  const result = await workflow.run({ intent: "Create an invoice draft." });

  assert.equal(result.needsReview, true);
  assert.deepEqual(result.validation, [{ ok: false, message: "invoice number missing" }]);
});

test("Workflow: executes registered tool calls before final output", async () => {
  const engine = fakeEngine((prompt) => {
    if (prompt.includes("Tool results from app-owned code")) {
      return JSON.stringify({
        summary: "Matched the purchase order.",
        action: "draft-invoice",
        output: { purchaseOrderId: "PO-7", total: 120 },
        confidence: 0.88,
        needsReview: false,
        toolCalls: [],
      });
    }
    return JSON.stringify({
      summary: "Need to match a purchase order first.",
      action: "request-tools",
      output: {},
      confidence: 0.72,
      needsReview: true,
      toolCalls: [{ name: "matchPurchaseOrder", args: { vendor: "Acme", total: 120 } }],
    });
  });
  const workflow = new Workflow({ engine });

  const result = await workflow.run({
    intent: "Create AP draft from invoice email.",
    tools: [
      {
        name: "matchPurchaseOrder",
        description: "Find a PO by vendor and amount",
        async run(args) {
          assert.deepEqual(args, { vendor: "Acme", total: 120 });
          return { purchaseOrderId: "PO-7" };
        },
      },
    ],
  });

  assert.equal(engine.prompts.length, 2);
  assert.equal(result.action, "draft-invoice");
  assert.equal(result.output.purchaseOrderId, "PO-7");
  assert.deepEqual(result.toolResults, [
    { name: "matchPurchaseOrder", ok: true, result: { purchaseOrderId: "PO-7" } },
  ]);
  assert.equal(result.needsReview, false);
});

test("Workflow: missing requested tools mark the result for review", async () => {
  const engine = fakeEngine(
    '{"summary":"Need a lookup.","action":"request-tools","output":{},"confidence":0.6,"needsReview":false,"toolCalls":[{"name":"missingTool","args":{}}]}',
  );
  const result = await new Workflow({ engine }).run({
    intent: "Use an unavailable tool.",
    tools: [{ name: "otherTool", description: "Not the requested tool" }],
  });

  assert.equal(result.needsReview, true);
  assert.deepEqual(result.toolResults, [
    { name: "missingTool", ok: false, error: "tool not registered" },
  ]);
});

test("Workflow: intent is required", async () => {
  const workflow = new Workflow({ engine: fakeEngine("{}") });
  await assert.rejects(() => workflow.run({}), /intent/);
});
