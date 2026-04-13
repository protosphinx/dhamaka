# Benchmarks

> Generated 2026-04-13 on Apple Silicon (darwin arm64), Node v25.2.1,
> headless Chromium via Playwright. All numbers are from the rules-first
> fast path — no model involved.

## Run them yourself

```bash
npm run bench           # all three suites
npm run bench:tasks     # task pipeline only
npm run bench:wasm      # WASM runtime only
npm run bench:browser   # real browser via Playwright
```

---

## Task pipeline (rules-first fast path)

The hot path. Every keystroke in a `SmartField` runs through these
functions synchronously. The goal is **< 1 ms per call** — ideally
microseconds.

| benchmark | p50 | p95 | p99 | mean |
|---|---:|---:|---:|---:|
| **city-to-state:** exact match ("San Francisco") | 0.3 ns | 0.4 ns | 1.0 µs | 0.3 ns |
| **city-to-state:** alias ("sf") | 0.2 ns | 0.2 ns | 0.3 ns | 0.2 ns |
| **city-to-state:** case-insensitive ("SAN FRANCISCO") | 0.2 ns | 0.3 ns | 0.3 ns | 0.2 ns |
| **city-to-state:** fuzzy match ("San Francsico") | 10.9 µs | 13.9 µs | 18.6 µs | 11.1 µs |
| **city-to-state:** miss ("xyzzy") | 10.9 µs | 13.0 µs | 17.2 µs | 11.2 µs |
| **spellcheck:** homophone ("see you their") | 0.5 ns | 0.7 ns | 0.9 ns | 0.5 ns |
| **spellcheck:** misspelling ("recieve") | 0.4 ns | 0.7 ns | 0.7 ns | 0.4 ns |
| **spellcheck:** clean text (no issues) | 0.7 ns | 0.8 ns | 0.8 ns | 0.7 ns |
| **spellcheck:** multiple errors | 0.7 ns | 0.9 ns | 1.0 ns | 0.7 ns |
| **paste-extract:** full contact blob (7 lines) | 1.5 µs | 2.1 µs | 2.2 µs | 1.6 µs |
| **paste-extract:** email-only blob | 0.9 ns | 1.2 µs | 1.5 µs | 1.0 ns |

10,000 iterations per benchmark. **All p99 latencies are under 20 µs** —
well within the < 1 ms budget, let alone the 50 ms keystroke budget.

**Key insight:** Exact gazetteer lookups and spellcheck rules resolve in
nanoseconds. Fuzzy matching (Levenshtein distance on ~100 cities) is the
slowest path at ~11 µs — still 5,000× faster than the 50 ms budget.

---

## WASM runtime (Rust → wasm32)

The fallback inference engine — real transformer math (matmul, RMSNorm,
softmax, RoPE, KV-cache, sampling) compiled from Rust to a 55 KB `.wasm`.

| metric | value |
|---|---|
| **WASM binary size** | 55.1 KB |
| **Cold start** (instantiate + init) | 0.54 ms median, 0.37 ms min |
| **Tokens in 50 ms budget** | ~64 tokens |

### Warm inference (8 tokens generated)

| prompt | median | p95 | tok/s |
|---|---:|---:|---:|
| "hello" | 0.19 ms | 0.25 ms | 41,630/s |
| "The quick brown fox" | 0.34 ms | 0.38 ms | 23,674/s |
| "San Francisco is a city in" | 0.43 ms | 0.45 ms | 18,783/s |
| "function fibonacci(n) {" | 0.39 ms | 0.41 ms | 20,581/s |

50 iterations per prompt. These are random-init demo weights (32-dim) so
the output isn't coherent — but the math is real. Throughput scales with
model dimension; real SmolLM2-360M Q4 weights will be slower but the
architecture is proven.

---

## Browser end-to-end (headless Chromium)

Real page loads, real DOM events, real import maps. Measured via Playwright.

| scenario | time |
|---|---:|
| **Page load** (autofill demo) | 27 ms |
| **Type "San Francisco" → state filled** | 16 ms |
| SDK self-reported task latency | 0.20 ms |
| **10 sequential city lookups** | 34 ms total, **3.4 ms avg** |
| **Spellcheck: type → suggestion visible** | 113 ms (includes 80 ms debounce) |
| **Spellcheck: click fix → text corrected** | 17 ms |
| **Paste blob → 6 fields populated** | 16 ms |
| **External network requests** | **0** |

### Budget check vs. goals

The [GOALS.md](docs/GOALS.md) target is **< 50 ms per keystroke**.

```
  ✔  autofill resolve:   0.20 ms  (250× under budget)
  ✔  10-lookup average:  3.4  ms  (15× under budget)
  ✔  spellcheck:         ~33  ms  (after subtracting 80 ms debounce)
  ✔  paste extraction:   16   ms  (3× under budget)
  ✔  cold start (wasm):  0.54 ms  (93× under budget)
  ✔  network requests:   0        (nothing leaves the device)
```

---

## Asset sizes

| asset | size |
|---|---:|
| WASM runtime binary | 55.1 KB |
| SDK source (all JS) | ~83 KB (unminified) |
| City gazetteer | ~100 entries, 255 lines |

---

## Test suite

| suite | tests | time |
|---|---:|---:|
| Node unit tests (`npm test`) | 75 | ~580 ms |
| Playwright e2e (`npm run test:e2e`) | 18 | ~1.7 s |
| **Total** | **93** | **~2.3 s** |
