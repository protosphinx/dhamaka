// Task pipeline benchmarks (Node).
//
// Measures the rules-first fast path for each shipping task.
// These are the latencies that matter: every keystroke in a SmartField
// hits these functions synchronously before any model involvement.

import { runTask } from "../packages/sdk/src/tasks.js";

const ITERATIONS = 10_000;

function bench(label, fn) {
  // Warmup
  for (let i = 0; i < 100; i++) fn();

  const times = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(ITERATIONS * 0.5)];
  const p95 = times[Math.floor(ITERATIONS * 0.95)];
  const p99 = times[Math.floor(ITERATIONS * 0.99)];
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const min = times[0];
  const max = times[times.length - 1];
  return { label, iterations: ITERATIONS, mean, p50, p95, p99, min, max };
}

async function main() {
  const results = [];

  // ── city-to-state ───────────────────────────────────────────────────
  results.push(bench("city-to-state: exact match (San Francisco)", () => {
    runTask("city-to-state", "San Francisco", { threshold: 0.5 });
  }));

  results.push(bench("city-to-state: alias (sf)", () => {
    runTask("city-to-state", "sf", { threshold: 0.5 });
  }));

  results.push(bench("city-to-state: case-insensitive (SAN FRANCISCO)", () => {
    runTask("city-to-state", "SAN FRANCISCO", { threshold: 0.5 });
  }));

  results.push(bench("city-to-state: fuzzy match (San Francsico)", () => {
    runTask("city-to-state", "San Francsico", { threshold: 0.5 });
  }));

  results.push(bench("city-to-state: miss (xyzzy)", () => {
    runTask("city-to-state", "xyzzy", { threshold: 0.5 });
  }));

  // ── spellcheck ──────────────────────────────────────────────────────
  results.push(bench("spellcheck: homophone (see you their)", () => {
    runTask("spellcheck", "I'll see you their tomorrow", { threshold: 0.5 });
  }));

  results.push(bench("spellcheck: misspelling (recieve)", () => {
    runTask("spellcheck", "I recieve your message", { threshold: 0.5 });
  }));

  results.push(bench("spellcheck: clean text (no issues)", () => {
    runTask("spellcheck", "This sentence is perfectly fine and has no errors at all.", { threshold: 0.5 });
  }));

  results.push(bench("spellcheck: multiple errors", () => {
    runTask("spellcheck", "I recieve teh message from their house and your welcome", { threshold: 0.5 });
  }));

  // ── paste-extract ───────────────────────────────────────────────────
  const contactBlob = `Jane Doe
Senior Platform Engineer
Acme Corp
jane.doe@acme.com
+1 (415) 555-1234
https://acme.com
@janedoe`;

  results.push(bench("paste-extract: full contact blob (7 lines)", () => {
    runTask("paste-extract", contactBlob, { threshold: 0.5 });
  }));

  results.push(bench("paste-extract: email-only blob", () => {
    runTask("paste-extract", "Contact me at bob@stripe.com for details", { threshold: 0.5 });
  }));

  // ── print results ───────────────────────────────────────────────────
  const fmt = (ms) => {
    if (ms < 0.001) return `${(ms * 1000).toFixed(1)} ns`;
    if (ms < 1) return `${(ms * 1000).toFixed(1)} µs`;
    return `${ms.toFixed(2)} ms`;
  };

  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║                    DHAMAKA TASK PIPELINE BENCHMARKS                  ║");
  console.log("║                    (rules-first fast path, Node.js)                  ║");
  console.log("╠═══════════════════════════════════════════════════════════════════════╣");
  console.log(`║  iterations per bench: ${ITERATIONS.toLocaleString().padEnd(46)}║`);
  console.log(`║  platform: ${process.platform} ${process.arch}, Node ${process.version.padEnd(30)}║`);
  console.log("╚═══════════════════════════════════════════════════════════════════════╝");
  console.log("");

  console.log("┌─────────────────────────────────────────────────┬─────────┬─────────┬─────────┬─────────┐");
  console.log("│ benchmark                                       │  p50    │  p95    │  p99    │  mean   │");
  console.log("├─────────────────────────────────────────────────┼─────────┼─────────┼─────────┼─────────┤");
  for (const r of results) {
    const name = r.label.length > 49 ? r.label.slice(0, 46) + "..." : r.label.padEnd(49);
    console.log(`│ ${name}│ ${fmt(r.p50).padStart(7)} │ ${fmt(r.p95).padStart(7)} │ ${fmt(r.p99).padStart(7)} │ ${fmt(r.mean).padStart(7)} │`);
  }
  console.log("└─────────────────────────────────────────────────┴─────────┴─────────┴─────────┴─────────┘");

  // Budget check: the goal is <50ms per keystroke, ideally <1ms for rules
  console.log("");
  console.log("Budget check (goal: rules path < 1 ms, total < 50 ms):");
  let allPass = true;
  for (const r of results) {
    const pass = r.p99 < 1.0;
    const icon = pass ? "  ✔" : "  ✘";
    console.log(`${icon}  p99 ${fmt(r.p99).padStart(10)}  ${r.label}`);
    if (!pass) allPass = false;
  }
  console.log("");
  console.log(allPass ? "  ✦ ALL BENCHMARKS WITHIN BUDGET" : "  ⚠ SOME BENCHMARKS OVER BUDGET");

  // Return for programmatic use
  return results;
}

main().catch((err) => { console.error(err); process.exit(1); });
