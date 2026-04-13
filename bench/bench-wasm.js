// WASM runtime benchmarks (Node).
//
// Measures cold start, warm inference, and throughput of the real
// compiled Rust runtime running in WebAssembly via Node.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// The WasmEngine loads via fetch — stub it with a real Response object.
const wasmPath = resolve("packages/hub/public/runtime/dhamaka-runtime.wasm");
const wasmBytes = await readFile(wasmPath);

globalThis.fetch = async (url) => {
  return new Response(wasmBytes, {
    status: 200,
    headers: { "content-type": "application/wasm" },
  });
};

const { WasmEngine } = await import("../packages/runtime/src/wasm-engine.js");

const WARM_ITERATIONS = 50;

async function main() {
  const results = {};

  // ── WASM file size ──────────────────────────────────────────────────
  results.wasmSizeBytes = wasmBytes.byteLength;
  results.wasmSizeKB = (wasmBytes.byteLength / 1024).toFixed(1);

  // ── Cold start: instantiate + init ──────────────────────────────────
  const coldTimes = [];
  for (let i = 0; i < 5; i++) {
    const engine = new WasmEngine({ wasmUrl: "dhamaka-runtime.wasm" });
    const t0 = performance.now();
    await engine.load({ entry: null });
    coldTimes.push(performance.now() - t0);
    engine.unload();
  }
  coldTimes.sort((a, b) => a - b);
  results.coldStartMs = {
    min: coldTimes[0],
    median: coldTimes[Math.floor(coldTimes.length / 2)],
    max: coldTimes[coldTimes.length - 1],
  };

  // ── Warm inference: stream tokens from a loaded engine ──────────────
  const engine = new WasmEngine({ wasmUrl: "dhamaka-runtime.wasm" });
  await engine.load({ entry: null });

  const prompts = [
    "hello",
    "The quick brown fox",
    "San Francisco is a city in",
    "function fibonacci(n) {",
  ];

  const warmResults = [];
  for (const prompt of prompts) {
    const times = [];
    const tokenCounts = [];
    for (let i = 0; i < WARM_ITERATIONS; i++) {
      const tokens = [];
      const t0 = performance.now();
      for await (const tok of engine.generate(prompt, { maxTokens: 8 })) {
        tokens.push(tok);
      }
      const elapsed = performance.now() - t0;
      times.push(elapsed);
      tokenCounts.push(tokens.length);
    }
    times.sort((a, b) => a - b);
    const medianTime = times[Math.floor(times.length / 2)];
    const medianTokens = tokenCounts[Math.floor(tokenCounts.length / 2)];
    const tokPerSec = medianTokens > 0 ? (medianTokens / medianTime) * 1000 : 0;
    warmResults.push({
      prompt: prompt.length > 30 ? prompt.slice(0, 27) + "..." : prompt,
      medianMs: medianTime,
      medianTokens,
      tokPerSec,
      p95Ms: times[Math.floor(times.length * 0.95)],
    });
  }
  results.warmInference = warmResults;

  // ── Throughput: max tokens in 50ms budget ───────────────────────────
  const budgetMs = 50;
  const budgetTokens = [];
  for (let i = 0; i < 20; i++) {
    let count = 0;
    const t0 = performance.now();
    for await (const tok of engine.generate("hello", { maxTokens: 64 })) {
      count++;
      if (performance.now() - t0 > budgetMs) break;
    }
    budgetTokens.push(count);
  }
  budgetTokens.sort((a, b) => a - b);
  results.tokensIn50ms = budgetTokens[Math.floor(budgetTokens.length / 2)];

  engine.unload();

  // ── Print results ───────────────────────────────────────────────────
  const fmt = (ms) => `${ms.toFixed(2)} ms`;

  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║                    DHAMAKA WASM RUNTIME BENCHMARKS                   ║");
  console.log("║                    (real compiled Rust → wasm32, Node.js)             ║");
  console.log("╠═══════════════════════════════════════════════════════════════════════╣");
  console.log(`║  wasm size: ${results.wasmSizeKB} KB                                               ║`);
  console.log(`║  platform: ${process.platform} ${process.arch}, Node ${process.version.padEnd(30)}║`);
  console.log("╚═══════════════════════════════════════════════════════════════════════╝");
  console.log("");

  console.log("Cold start (WebAssembly.instantiate + dhamaka_init):");
  console.log(`  min:    ${fmt(results.coldStartMs.min)}`);
  console.log(`  median: ${fmt(results.coldStartMs.median)}`);
  console.log(`  max:    ${fmt(results.coldStartMs.max)}`);
  console.log("");

  console.log("Warm inference (generate 8 tokens):");
  console.log("┌────────────────────────────────┬───────────┬─────────┬───────────┬───────────┐");
  console.log("│ prompt                         │  median   │  p95    │  tokens   │  tok/s    │");
  console.log("├────────────────────────────────┼───────────┼─────────┼───────────┼───────────┤");
  for (const r of results.warmInference) {
    const p = r.prompt.padEnd(30);
    console.log(`│ ${p} │ ${fmt(r.medianMs).padStart(9)} │ ${fmt(r.p95Ms).padStart(7)} │ ${String(r.medianTokens).padStart(9)} │ ${r.tokPerSec.toFixed(0).padStart(7)}/s │`);
  }
  console.log("└────────────────────────────────┴───────────┴─────────┴───────────┴───────────┘");
  console.log("");

  console.log(`Throughput budget: ~${results.tokensIn50ms} tokens generated within a 50 ms window`);
  console.log("");

  return results;
}

main().catch((err) => { console.error(err); process.exit(1); });
