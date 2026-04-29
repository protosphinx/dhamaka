<!-- ╔══════════════════════════════════════════════════════════════════════╗ -->
<!-- ║                                                                      ║ -->
<!-- ║                           D H A M A K A                              ║ -->
<!-- ║                                                                      ║ -->
<!-- ╚══════════════════════════════════════════════════════════════════════╝ -->

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/banner.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/banner.svg">
  <img src="./docs/banner.svg" alt="Dhamaka — the local AI capability layer for web apps." width="100%">
</picture>

<br/>

**`🧠 on-device`** &nbsp;·&nbsp; **`⚡ 0 ms`** &nbsp;·&nbsp; **`🔒 private`** &nbsp;·&nbsp; **`🆓 $0/call`** &nbsp;·&nbsp; **`🌐 every browser`** &nbsp;·&nbsp; **`📴 offline`**

<br/>

```bash
npm install dhamaka
```

[![npm](https://img.shields.io/npm/v/dhamaka.svg?logo=npm)](https://www.npmjs.com/package/dhamaka) &nbsp;·&nbsp; [![license](https://img.shields.io/npm/l/dhamaka.svg)](./LICENSE) &nbsp;·&nbsp; [live demos →](https://protosphinx.github.io/dhamaka/)

</div>

---

## ✦ the thesis

> **Stop sending the data to the model. Ship the model to the data.**

A web application already holds everything an AI call needs to be useful. The user's data is in the tab. The app's schema, state, and affordances are already in JavaScript memory. The actions the user can take are already expressed in code. The only reason AI calls travel to a server is historical — because until very recently, the models were too big to ship.

That's no longer true. Local models are now small enough, fast enough, and good enough to run inside a browser tab. Which means the whole mental model of cloud AI — *data travels to model* — is upside down. Flip it. Ship the model to the data.

Every architectural decision in Dhamaka follows from that one inversion. The four capability families below are not a feature list — they're the four *shapes* a call can take once you accept that the model lives where the data already is:

- **🪞 Reflex** — understand what the user typed, in the field they typed it
- **🔧 Transform** — rewrite what the app holds, using the app's own context
- **🔎 Search** — retrieve from the user's own data, locally *(planned)*
- **🤖 Agent** — act through the actions the app already exposes *(v2)*

When in doubt, optimize for this test: *would this call still work if the user's laptop had no network connection and no account with any AI provider?* If yes, it belongs in Dhamaka. If no, it doesn't.

---

## ✦ what is this

**Dhamaka is a JavaScript SDK that lets any web app add AI capabilities that run 100% in the user's browser tab.** No servers. No API keys. No round trips. No rate limits. No privacy exposure. Your prompts never leave the device, your model weights never leave the device, your users' data never leaves the device.

It is **not** another general-purpose browser LLM runtime. Transformers.js, WebLLM, wllama, and Chrome's `window.ai` already occupy that layer. Dhamaka sits three layers above them — a task-oriented capability layer that any product can drop in to add on-device reflexes, transformations, and reasoning without building any of the plumbing.

### Four capability families, one SDK

```
  ┌────────────────────────────────────────────────────────────────────┐
  │  Dhamaka — local AI capability layer                               │
  ├────────────────────────────────────────────────────────────────────┤
  │                                                                    │
  │  🪞 Reflex    reactive, keystroke-level, rules-first               │
  │              SmartField · SmartForm · SmartText · attachSmartPaste │
  │              use when: every <input> should feel intelligent       │
  │                                                                    │
  │  🔧 Transform imperative, one-shot, instruction-driven             │
  │              Transform · Formula.* · Text.* · Code.*               │
  │              use when: an app needs "rewrite this X given Y"       │
  │                                                                    │
  │  🔎 Search    semantic search over in-memory data (later)          │
  │              use when: users search their own local data           │
  │                                                                    │
  │  🤖 Agent     multi-step tool use over app-exposed actions (v2)    │
  │              use when: the app has actions and the user has intent │
  │                                                                    │
  ├────────────────────────────────────────────────────────────────────┤
  │  shared: task registry · reflex service · engine backends          │
  │  (window.ai → Rust WASM → MockEngine)                              │
  └────────────────────────────────────────────────────────────────────┘
```

Two families are shipping today — **Reflex** and **Transform**. The other two are planned. Every family shares the same engine, the same task registry, and the same deploy story, so adding a new family is a matter of adding tasks, not forking the SDK.

---

## ✦ the hero use case — formula editing in erp.ai

Dhamaka's flagship Transform integration is the formula editor in **[erp.ai](https://erp.ai)**. ERP formulas are the single most sensitive thing a company owns — pricing models, margins, payroll math, commission tiers, inventory rules, compliance checks. The idea of shipping them to a third-party AI provider is a non-starter for any serious enterprise, which is exactly why Microsoft's Copilot-for-Excel is blocked in so many orgs.

Dhamaka lets erp.ai ship **Copilot-for-your-formulas that runs in the user's tab** — every formula edit, every explain-this, every debug-this call happens locally. No SOC2 questionnaires, no data-residency contracts, no per-user AI subscription, no latency on per-cell edits, no rate limits when 50 analysts hit the same sheet at once.

```js
import { Transform } from "dhamaka";
const t = new Transform();

// User selects a cell showing `=SUM(A1:A10) * 1.08` and types
// "add a 10% discount for employees"
const r = await t.formula(
  "=SUM(A1:A10) * 1.08",
  "add a 10% discount for employees",
  { dialect: "excel", headers: ["amount", "isEmployee"] },
);
// r.output       → "=(SUM(A1:A10) * 1.08) * 0.9"
// r.source       → "rule"   (the discount pattern matched the fast path)
// r.explanation  → "Multiplied by 0.9 to apply a 10% discount."
// r.confidence   → 0.95
```

That call resolved in under a millisecond — no model ran, because "add a 10% discount" is a pattern the rules layer recognises and rewrites structurally. When the instruction is something weirder ("pull the tax rate from the third sheet and apply it only to rows where the vendor country is DE"), the same call transparently escalates to the on-device LLM.

More formula-family calls on the same primitive:

```js
// Explain a formula in plain English
await t.explain("=IFERROR(VLOOKUP(A2, Prices!A:B, 2, FALSE), 0)");
// → "This formula uses IFERROR catches errors from the wrapped expression…
//    and VLOOKUP looks up a value in the first column of a table…"

// Diagnose and fix a broken formula
await t.debug("=A1/B1", { error: "#DIV/0!" });
// → "The formula is dividing by a zero or empty cell. Wrap the denominator
//    in IFERROR: =IFERROR(A1/B1, 0)."
```

Every one of these runs on-device. Every one is free. Every one is instant. Every one works offline. None of them touch a server erp.ai has to run or pay for.

---

## ✦ other use cases this unlocks

The pattern generalises to **any web app where AI calls need to be free, private, instant, and cross-browser** — i.e. almost any app where users are typing real data into real forms:

**ERP / finance / analytics**
- Formula editing, explanation, debugging (the erp.ai integration above)
- Natural-language filters over spreadsheet ranges
- "Find the anomaly in this column" / "what's driving this trend"
- Smart CSV import: auto-detect headers, map to schema, flag bad rows

**Forms / checkout / onboarding**
- Type "San Francisco" → state, country, timezone, currency populate live
- Smart paste: business cards split into name / email / phone / company
- Contextual spellcheck that catches "see you their" and "your welcome"
- Cross-field inference: ZIP → city, email domain → company, date range → duration

**Writing tools**
- Tone rewriting ("make it formal / shorter / friendlier") on any `<textarea>`
- Inline translation as the user types in a different language
- Proofreading with context-aware suggestions

**Internal tools / admin panels**
- Natural-language search over in-memory tables
- "Fix this row's data" / "what fields are missing" / "is this a duplicate"
- Free-text classification of incoming records

Every one of these is impossible as a server-side product because network latency, per-call cost, privacy exposure, rate limits, or offline support kills it. Every one becomes trivial when inference is free and local.

---

## ✦ working demos

Spin up the dev stack (`npm run dev`) and open <http://localhost:5173> to try them live:

| demo | family | what it shows | primitive |
|---|---|---|---|
| **[Address autofill](packages/playground/public/demos/autofill.html)** | Reflex | City → state / country / timezone / currency populate synchronously | `SmartField` + `SmartForm` |
| **[Contextual spellcheck](packages/playground/public/demos/spellcheck.html)** | Reflex | Homophone-in-context detection, not just dictionary matches | `SmartText` |
| **[Smart paste](packages/playground/public/demos/paste.html)** | Reflex | Paste a contact blob, watch it split into the right fields | `attachSmartPaste` |
| **[Formula editor](packages/playground/public/demos/formula.html)** *(in progress)* | Transform | erp.ai-style spreadsheet, live formula rewrites from plain-English instructions | `Transform.formula()` |

---

## ✦ the stack

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  your app                                                            │
  │                                                                      │
  │   <input>      <input>      <textarea>      <cell formula>           │
  │      │            │              │                 │                 │
  │      ▼            ▼              ▼                 ▼                 │
  │  ╔════════════════════════════╗ ╔══════════════════════════════════╗ │
  │  ║     🪞 Reflex family       ║ ║    🔧 Transform family           ║ │
  │  ║                            ║ ║                                  ║ │
  │  ║   SmartField               ║ ║   Transform.run({…})             ║ │
  │  ║   SmartForm                ║ ║   Transform.formula(…)           ║ │
  │  ║   SmartText                ║ ║   Transform.explain(…)           ║ │
  │  ║   attachSmartPaste         ║ ║   Transform.debug(…)             ║ │
  │  ║                            ║ ║                                  ║ │
  │  ║   (reactive, keystroke,    ║ ║   (imperative, one-shot,         ║ │
  │  ║    rules-first)            ║ ║    instruction-driven)           ║ │
  │  ╚═════════════╦══════════════╝ ╚═══════════════╦══════════════════╝ │
  │                │                                │                     │
  │                └────────────────┬───────────────┘                     │
  │                                 ▼                                     │
  │         ┌────────────────────────────────────────────┐                │
  │         │  task registry                             │                │
  │         │  city-to-state · spellcheck · paste-extract│                │
  │         │  formula-transform · formula-explain · …   │                │
  │         │  (every task: rules → fuzzy → model)       │                │
  │         └──────────────────┬─────────────────────────┘                │
  │                            │                                         │
  │                            ▼                                         │
  │         ┌────────────────────────────────────────────┐                │
  │         │  reflex service   ← resident engine        │                │
  │         │                     (warm, KV-cached)      │                │
  │         └──────────────────┬─────────────────────────┘                │
  │                            │                                         │
  │                            ▼                                         │
  │         ┌────────────────────────────────────────────────────┐        │
  │         │  engine backends (auto-selected by factory)        │        │
  │         │  ┌─────────────┐ ┌───────────────┐ ┌────────────┐  │        │
  │         │  │  window.ai  │ │ Transformers  │ │ MockEngine │  │        │
  │         │  │  (Chrome)   │ │     .js       │ │  (Node /   │  │        │
  │         │  │  Gemini     │ │  (every other │ │  tests)    │  │        │
  │         │  │  Nano       │ │   browser)    │ │            │  │        │
  │         │  │  resident   │ │  real LLMs    │ │ canned     │  │        │
  │         │  │  free fast  │ │  ~90–250 MB   │ │ responses  │  │        │
  │         │  │             │ │  1st-visit DL │ │            │  │        │
  │         │  └─────────────┘ └───────────────┘ └────────────┘  │        │
  │         │           ↑               ↑              ↑         │        │
  │         │           └── auto pick in priority order ──┘      │        │
  │         │                                                    │        │
  │         │  crates/dhamaka-runtime (Rust → 55 KB .wasm) is a  │        │
  │         │  v2 swap target, wired in but not yet primary —    │        │
  │         │  needs Q4 quant + SIMD128 + real SmolLM2 weights   │        │
  │         └────────────────────────────────────────────────────┘        │
  └──────────────────────────────────────────────────────────────────────┘
```

**The shape that matters:** Dhamaka is the **product layer above the runtime**. The SDK is split into capability families (Reflex, Transform, and soon Search / Agent) that share everything below them — task registry, reflex service, engine backends. Adding a new family is a matter of adding tasks, not forking the SDK. The runtime underneath is a swappable dependency — Chrome's `window.ai` when present, otherwise `@huggingface/transformers` loaded lazily from `esm.sh`. The Rust crate in `crates/dhamaka-runtime` is a v2 swap target, not the primary runtime: Transformers.js has years of quantization, BPE tokenization, and ONNX/WebAssembly runtime work we're not going to reinvent, and trying to be *both* the product layer and the runtime would mean fighting HuggingFace on a layer they'll always win. We pick the product layer and let them pick the runtime.

| package | what it does |
|---|---|
| [`dhamaka`](packages/sdk)              | **public SDK**: `SmartField`, `SmartForm`, `SmartText`, `attachSmartPaste`, `Transform`, task registry, reflex service. The thing you actually install. |
| [`@dhamaka/runtime`](packages/runtime) | engine backends: `WindowAiBackend` → `TransformersBackend` → `WasmEngine` → `MockEngine`, plus the factory that picks one |
| [`dhamaka-runtime` (Rust)](crates/dhamaka-runtime) | the compiled v2 runtime — matmul, RMSNorm, softmax, RoPE, KV-cache, sampling — 55 KB `.wasm`. Architecture is done; real weights, Q4 quantization, and SIMD128 are the missing pieces before this replaces Transformers.js as the primary backend |
| [`@dhamaka/hub`](packages/hub)         | static origin hosting the cross-site model cache + `.wasm` runtime |
| [`@dhamaka/extension`](packages/extension) | Manifest V3 browser extension — shared cache across every site on the machine |
| [`@dhamaka/playground`](packages/playground) | zero-dep dev server running hub + playground + live demos for every capability family |

---

## ✦ the task registry

Developers think in **tasks**, not in models. Each task is a small, typed function that turns an input (plus optional instruction and context) into a structured inference. The SDK decides what runs — a lookup table, a regex, a fuzzy match, a pattern rewrite, or an on-device LLM — based on which path is fastest for the shape of the input. Registered tasks are available to every capability family that wants them.

### Reflex family

| task id              | status | what it does                                                       | backend layers                             |
|----------------------|:------:|--------------------------------------------------------------------|--------------------------------------------|
| `city-to-state`      |   ⬤    | city → state, country, timezone, currency                          | gazetteer → fuzzy → LLM                    |
| `spellcheck`         |   ⬤    | misspellings + homophone-in-context                                | dictionary → context regex → masked LM     |
| `paste-extract`      |   ⬤    | contact blob → name / email / phone / company / website / twitter  | regex → heuristic → LLM                    |
| `address-autofill`   |   ◎    | street → city, state, ZIP                                          | geocoder → LLM                             |
| `date-parse`         |   ◎    | "next Tuesday" → ISO date                                          | chrono-node-style rules → LLM              |
| `color-name`         |   ◎    | "forest green" → `#228B22`                                         | static table → embedding similarity        |
| `format-validate`    |   ◎    | live phone / SSN / IBAN / ZIP validation with natural-language errors | regex → LLM                             |
| `tab-complete`       |   ◎    | per-keystroke next-token completion                                | n-gram → tiny causal LM                    |
| `cross-field-infer`  |   ◎    | fill related fields from one hint                                  | SmartForm rules + LLM                      |

### Transform family

| task id              | status | what it does                                                       | backend layers                             |
|----------------------|:------:|--------------------------------------------------------------------|--------------------------------------------|
| `formula-transform`  |   ⬤    | rewrite a spreadsheet / ERP formula from a plain-English instruction | pattern rewrites → LLM                   |
| `formula-explain`    |   ⬤    | explain what a formula does in plain English                       | function gloss table → LLM                 |
| `formula-debug`      |   ⬤    | diagnose a formula error and suggest a fix                         | error-code advice → LLM                    |
| `tone-rewrite`       |   ◎    | rewrite prose "more formal / shorter / friendlier"                 | small instruction-tuned LM                 |
| `translate`          |   ◎    | translate a paragraph between languages                            | `window.ai` Translator API → LLM fallback  |
| `code-refactor`      |   ◎    | refactor a code snippet following a natural-language instruction   | small code LM                              |
| `code-explain`       |   ◎    | explain a code snippet in plain English                            | small code LM                              |

⬤ shipping  ·  ◎ planned

`registerTask(customTask)` lets any app ship their own task on top of the same pipeline — any app's domain-specific transformation (refactoring your DSL, normalising your data, applying your style guide) can plug into Dhamaka's rules-first / model-fallback architecture without forking the SDK.

---

## ✦ the engine backends

One `Engine` interface, four implementations, auto-selected by the factory in priority order. The SDK surface never moves when the runtime swaps.

```
  ┌───────────────────────┬────────────────────────────────────────────────┐
  │ WindowAiBackend       │ Chrome 138+ Prompt API / Gemini Nano.          │
  │ (priority 1)          │ Resident, free, GPU-accelerated. Wins on       │
  │                       │ Chrome when available. Shared with the browser │
  │                       │ so the user pays nothing for the download.     │
  ├───────────────────────┼────────────────────────────────────────────────┤
  │ TransformersBackend   │ @huggingface/transformers v3, lazily imported  │
  │ (priority 2)          │ from esm.sh the first time an engine is        │
  │                       │ instantiated. Real LLMs (SmolLM2-135M,         │
  │ ← primary today       │ LaMini-Flan-T5-248M, distilBERT, MiniLM        │
  │                       │ embeddings). ~90–250 MB first-visit download,  │
  │                       │ cached in IndexedDB forever after. Works on    │
  │                       │ every browser with WebAssembly + fetch.        │
  ├───────────────────────┼────────────────────────────────────────────────┤
  │ WasmEngine            │ Our Rust runtime compiled to a 55 KB .wasm.    │
  │ (priority 3)          │ Architecture complete (matmul, RMSNorm,        │
  │                       │ softmax, RoPE, KV-cache, sampling) with 27     │
  │ ← v2 swap target      │ cargo tests. Not primary yet: needs Q4         │
  │                       │ quantization + SIMD128 + real SmolLM2 weights  │
  │                       │ before it can compete with Transformers.js on  │
  │                       │ model coverage or inference speed.             │
  ├───────────────────────┼────────────────────────────────────────────────┤
  │ MockEngine            │ Canned-response stand-in for Node + tests.     │
  │ (priority 4)          │ Zero dependencies, fully deterministic. Never  │
  │                       │ used in a browser.                             │
  └───────────────────────┴────────────────────────────────────────────────┘
```

On a typical modern Chrome: `window.ai` wins, nothing downloads, spellcheck responds in ~100 ms. On Firefox / Safari / older Chromes: Transformers.js wins, first visit waits 30–90 seconds for the model download, every visit after that is instant and offline. On Node (tests, SSR): `MockEngine` wins so CI never tries to download a language model.

In browsers, the factory prefers `window.ai` when available and falls back to the WASM runtime otherwise. Same SDK surface either way. In Node (tests, SSR), the factory picks `MockEngine` so unit tests don't need a real model.

---

## ✦ five-minute quickstart

### just want to use the SDK?

```bash
npm install dhamaka
```

```js
import { SmartField } from "dhamaka";

new SmartField(document.querySelector("#city"), {
  task: "city-to-state",
  onResult: (r) => console.log(r.fields), // { state, country, tz, currency, ... }
});
```

The package is self-contained — the WASM runtime is bundled, no extra install step. See **[the API](#-the-api)** below for the full surface.

### want to hack on the runtime itself?

```bash
git clone https://github.com/protosphinx/dhamaka
cd dhamaka

# one-time: compile the Rust runtime to WebAssembly
crates/dhamaka-runtime/build.sh

# run the dev stack
npm run dev
```

```
  ✦ hub         http://localhost:5174
  ✦ playground  http://localhost:5173

  Dhamaka dev stack running. Ctrl+C to stop.
```

Open **http://localhost:5173** and click into any of the three demos. The playground hot-reads the SDK + runtime sources, so every JS edit shows up on refresh. Re-run `build.sh` only when editing the Rust runtime.

> Don't have Rust installed? The compiled `.wasm` is checked in under `packages/hub/public/runtime/` so `npm run dev` works on a fresh clone too. Install Rust only if you want to modify the inference engine itself.

---

## ✦ the API

Dhamaka ships two capability families today. Pick the one that matches the shape of what you're building: **Reflex** for reactive keystroke-level intelligence on `<input>` and `<textarea>` elements, **Transform** for imperative one-shot "rewrite this X given instruction Y" calls.

### 🪞 Reflex family — reactive, continuous, rules-first

#### `SmartField` — one field, one task

```js
import { SmartField } from "dhamaka";

new SmartField(document.querySelector("#city"), {
  task: "city-to-state",
  onResult: (r) => {
    // r.source      → "rule" | "fuzzy" | "model"
    // r.confidence  → 0..1
    // r.fields      → { state, stateName, country, countryName, tz, currency }
  },
});
```

Every keystroke fires the task. Rules-first, so typical inputs resolve in under a millisecond with no model involvement. The task registry decides when (and whether) to escalate to the LLM.

#### `SmartForm` — cross-field inference

```js
import { SmartField, SmartForm } from "dhamaka";

const form = document.querySelector("#checkout");

new SmartForm(form, {
  tasks: { city: "city-to-state" },           // auto-attach a SmartField
  infer: {
    "city → state":    "city-to-state:stateName",
    "city → country":  "city-to-state:countryName",
    "city → timezone": "city-to-state:tz",
    "city → currency": "city-to-state:currency",
  },
});
```

Type "San Francisco" in the city field, the state / country / timezone / currency fields fill themselves from the same task result — synchronously, no debounce, no network. Manually edit any target field and it's locked out of automatic propagation until `smartForm.unlock()`.

#### `SmartText` — contextual spellcheck on every textarea

```js
import { SmartText } from "dhamaka";

const textarea = document.querySelector("textarea");

const smart = new SmartText(textarea, {
  onSuggestions: (suggestions) => {
    // [{ from: "their", to: "there", index: 14, reason: "homophone in context" }]
    renderSuggestionChips(suggestions);
  },
});

// Apply a suggestion by index
smart.applySuggestion(0);
```

Catches classic homophone-in-context mistakes ("see you their", "your welcome", "alot of", "its a good idea") that a plain dictionary spellchecker misses.

#### `attachSmartPaste` — any form, any blob

```js
import { attachSmartPaste } from "dhamaka";

const form = document.querySelector("#contact-form");
attachSmartPaste(form, {
  dropZone: document.querySelector("#paste-zone"),
});

form.addEventListener("smart-paste:extracted", (e) => {
  console.log("filled", e.detail.result.fields);
});
```

Paste a contact blob (business card, signature, LinkedIn blurb) and the `name`, `email`, `phone`, `company`, `website`, `twitter` fields populate themselves. Fields the user has already typed into are never overwritten.

### 🔧 Transform family — imperative, one-shot, instruction-driven

#### `Transform` — generic "input + instruction + context → output"

```js
import { Transform } from "dhamaka";

const t = new Transform();

// Generic one-shot via any registered task
const r = await t.run({
  task: "formula-transform",
  input: "=SUM(A1:A10) * 1.08",
  instruction: "add a 10% discount for employees",
  context: { dialect: "excel", headers: ["amount", "isEmployee"] },
});
// r.output      → "=(SUM(A1:A10) * 1.08) * 0.9"
// r.source      → "rule"         (pattern matched the fast path)
// r.confidence  → 0.95
// r.explanation → "Multiplied by 0.9 to apply a 10% discount."
```

One call, one answer, all local. If the task's rules layer can handle the instruction it resolves in microseconds with zero model calls. Otherwise it transparently escalates to the on-device LLM with a well-structured prompt including context, dialect, and schema hints — the app doesn't have to know which path ran.

#### `Transform.formula` / `.explain` / `.debug` — formula shortcuts

Convenience wrappers for the three shipping formula tasks, so erp.ai-style integrations are one import and three methods:

```js
const t = new Transform();

// Rewrite a formula from a natural-language instruction
await t.formula("=SUM(A1:A10) * 1.08", "add a 10% discount for employees");
// → { output: "=(SUM(A1:A10) * 1.08) * 0.9", source: "rule", confidence: 0.95 }

// Explain a formula in plain English
await t.explain("=IFERROR(VLOOKUP(A2, Prices!A:B, 2, FALSE), 0)");
// → { output: "This formula uses IFERROR catches errors… and VLOOKUP looks up…" }

// Diagnose an error and suggest a fix
await t.debug("=A1/B1", { error: "#DIV/0!" });
// → { output: "The formula is dividing by a zero or empty cell. Wrap…" }
```

Every call runs 100% in the browser tab. No network, no API key, no per-call cost, no rate limit, no data leaving the user's machine — which is what makes this integration viable for products like erp.ai where formulas contain pricing, margins, payroll math, and commission tiers that cannot be sent to a third-party AI provider under any circumstances.

#### Registering your own transform task

Every Dhamaka-powered app can register custom tasks on top of the same rules-first / model-fallback architecture:

```js
import { registerTask, Transform } from "dhamaka";

registerTask({
  id: "product-sku-normalize",
  description: "Normalize messy product SKUs to the canonical format",
  fast(input) {
    const m = input.match(/^([A-Z]{2,4})[-_\s]?(\d{4,8})$/i);
    if (!m) return null;
    return {
      confidence: 0.95,
      source: "rule",
      fields: { output: `${m[1].toUpperCase()}-${m[2]}` },
    };
  },
  async slow(input, _ctx, engine) {
    const prompt = `Normalize this SKU to "XX-NNNN" format: "${input}". SKU:`;
    const out = await engine.complete(prompt, { temperature: 0 });
    return { confidence: 0.6, source: "model", fields: { output: out.trim() } };
  },
});

// Now any Transform call with task: "product-sku-normalize" works
await new Transform().run({ task: "product-sku-normalize", input: "abc 123456" });
```

### Configure the engine (optional)

```js
import { reflex } from "dhamaka";

reflex.configure({
  backend: "auto",            // "window-ai" | "wasm" | "mock" | "auto"
  wasmUrl: "/runtime/dhamaka-runtime.wasm",
});
```

Most apps never call this — `auto` picks the fastest backend available (Chrome's `window.ai` → the compiled Rust `.wasm` → `MockEngine`).

### Legacy: raw `Dhamaka.load()` for direct model access

For apps that want raw completion / streaming / chat (LLM chatbots, content generation, etc.) — not the SmartField surface — the lower-level class is still available:

```js
import { Dhamaka } from "dhamaka";

const llm = await Dhamaka.load();
for await (const token of llm.stream("hello")) process.stdout.write(token);
```

And the drop-in OpenAI `/v1/chat/completions` shim:

```js
import { installOpenAIShim } from "dhamaka/openai";
installOpenAIShim(llm);
```

---

## ✦ download once, use everywhere — the honest version

Modern browsers increasingly **partition third-party storage** by the top-level site for privacy. That makes the classic "shared iframe" trick weaker than it used to be. Dhamaka handles this by degrading gracefully at three tiers:

```
  ╭──────────────────────────────────────────────────────────────╮
  │                                                              │
  │   tier 1 · shared hub iframe  (the dream)                    │
  │            one download per user, across all Dhamaka sites   │
  │            ↓ falls back to ↓                                 │
  │                                                              │
  │   tier 2 · Storage Access API                                │
  │            user-gated unpartitioned access when available    │
  │            ↓ falls back to ↓                                 │
  │                                                              │
  │   tier 3 · per-origin IndexedDB                              │
  │            still private, still offline, still fast —        │
  │            just one download per origin instead of one per   │
  │            user                                              │
  │                                                              │
  │   tier 4 · (phase 2) a browser extension                     │
  │            sidesteps partitioning entirely, one local cache  │
  │            for every site on the machine                     │
  │                                                              │
  ╰──────────────────────────────────────────────────────────────╯
```

`Dhamaka.hub.mode()` tells your app which tier it actually got, so you can show a "⚡ shared cache hit" badge when it matters and silently degrade when it doesn't.

---

## ✦ what's real today

```
  🪞 Reflex family  (the product surface for input-level reflexes)
  [x]  SmartField       — task-routed oninput reflexes on a single <input>
  [x]  SmartForm        — cross-field inference rules with manual-edit locks
  [x]  SmartText        — contextual spellcheck on a <textarea>
  [x]  attachSmartPaste — regex + heuristic extraction, onpaste

  Built-in Reflex tasks  (rules-first for deterministic tasks,
                          model-only for probabilistic ones)
  [x]  city-to-state : 100+ city gazetteer with alias + diacritic
                       normalisation, Levenshtein fuzzy fallback, LLM
                       long-tail handler. Rules-first because a city's
                       state is an objectively-correct lookup.
  [x]  spellcheck    : model-only. Every call hits the on-device LLM
                       (via Transformers.js or window.ai), prompts for
                       a JSON array of {from, to, reason}, parses the
                       response. NO hardcoded dictionary, NO homophone
                       rules, NO confusables map. The whole thesis of
                       Dhamaka is "let the LLM do the work" and a
                       spellchecker is a paradigmatic model task.
  [x]  paste-extract : email / phone / URL / Twitter regex + name
                       heuristic + non-freemail-domain company inference,
                       LLM fallback for gaps. Rules-first because contact
                       field extraction is mostly regex-shaped; the
                       model handles the long tail.

  🔧 Transform family  (the product surface for imperative one-shot calls)
  [x]  Transform           — generic run({ task, input, instruction, context })
  [x]  Transform.formula() — rewrite a formula from a plain-English instruction
  [x]  Transform.explain() — explain a formula in plain English
  [x]  Transform.debug()   — diagnose a formula error and suggest a fix

  Built-in Transform tasks  (rules → pattern rewrites → model)
  [x]  formula-transform : 10 structural rewrite patterns shipping at launch —
                           percent discount, percent tax, round to N decimals,
                           multiply / divide by N, IFERROR wrapping, null-safe
                           wrapping, currency conversion, negate, absolute value.
                           LLM fallback for anything the patterns can't match.
  [x]  formula-explain   : function-gloss table covering SUM / AVERAGE / MIN /
                           MAX / COUNT / IF / IFERROR / ROUND / VLOOKUP / XLOOKUP
                           / SUMIFS / INDEX / MATCH / TEXT / LEN / TRIM / … plus
                           arithmetic-tree detection. LLM fallback for composites.
  [x]  formula-debug     : advice table for every common error code (#DIV/0!,
                           #N/A, #REF!, #VALUE!, #NAME?, #NUM!, #NULL!, #SPILL!),
                           static detection of divide-by-cell risk, LLM fallback.

  Shared infrastructure  (every family rides on top of this)
  [x]  reflex service       — resident engine, lazy-loaded, one per page
  [x]  task registry        — registerTask / getTask / runTask + built-ins
  [x]  Engine abstract interface with four backends
  [x]  WindowAiBackend      — Chrome 138+ Prompt API / Gemini Nano
  [x]  TransformersBackend  — @huggingface/transformers v3 via esm.sh,
                              real cross-browser LLM runtime, lazy import
  [x]  WasmEngine           — 55 KB Rust runtime (architecture complete,
                              waiting on Q4 + SIMD + real weights)
  [x]  MockEngine           — deterministic stand-in for Node / tests
  [x]  createEngine() auto-detection:
                              window.ai → transformers → wasm → mock

  Rust runtime  (the compiled fallback inference engine)
  [x]  matmul, RMSNorm, softmax, rotary, KV-cached self-attention,
       SwiGLU/SiLU, top-k + top-p + temperature sampling
  [x]  #[no_mangle] extern "C" ABI exposed to WebAssembly
  [x]  27 native cargo tests covering every primitive

  Cross-site cache  (the moat)
  [x]  hub ↔ sdk postMessage bridge (get / list / delete / progress)
  [x]  IndexedDB-backed hub storage with SHA-256 integrity checks
  [x]  zero-copy ArrayBuffer transfer from hub → consumer
  [x]  fallback cache (real IndexedDB in browsers, in-memory in Node)
  [x]  Storage Access API tier for unpartitioned storage
  [x]  Manifest V3 browser extension (phase 2)
  [x]  SDK auto-detection of the extension with tiered mode reporting

  Playground + tests + CI
  [x]  3 shipping demos: address autofill, contextual spellcheck, smart paste
  [~]  formula demo (erp.ai-style spreadsheet) — in flight, next commit
  [x]  zero-dependency dev server with correct MIME + CORS
  [x]  OpenAI /v1/chat/completions shim (for legacy Dhamaka.load() users)
  [x]  102 tests — 27 Rust (cargo test) + 75 JS (node --test), including
       4 integration tests that drive the real compiled .wasm
  [x]  GitHub Actions CI: Rust crate build → wasm artifact upload → JS
       tests on Node 20 + 22, plus a dev-server smoke test

  In flight (see docs/GOALS.md)
  [ ]  Transform tests: Transform class, formula task patterns, explain table,
       debug error-code table, model-escalation fallthrough
  [ ]  Formula demo page in the playground (erp.ai-style spreadsheet with
       live pattern-rewritten formula edits)
  [ ]  Text family: tone-rewrite, translate, summarize
  [ ]  Code family: code-refactor, code-explain, code-fix
  [ ]  Search family: semantic search over in-memory data
  [ ]  Agent family: multi-step tool use over app-exposed actions
  [ ]  SharedWorker upgrade (current reflex is a module-level singleton;
       same API, swap drop-in for multi-tab residency)
  [ ]  Transformers.js adapter so the fallback engine can load HF models
       instead of the tiny Rust-random model
  [ ]  Real SmolLM2-360M Q4 weights hosted on the hub
  [ ]  SIMD128 + WebGPU fast paths
  [ ]  Extension published on the Chrome Web Store
```

**v0.1 honesty note:** the Rust runtime does real transformer math end-to-end in WebAssembly, but the weights it loads for v0.1 are a 32-dim random-init demo model — so when a task escalates to the LLM layer, the model output isn't coherent English yet. **Every shipping task deliberately resolves entirely in its rules layer for the demo inputs** so you can feel the product without depending on the long-tail model. The formula family in particular was designed so the 10 most common ERP formula edits (discounts, taxes, rounding, multipliers, null-safety) are all pattern rewrites that produce correct output with no model call at all. When real weights arrive, the same task code transparently upgrades to handle the long tail.

---

## ✦ tests

```
  ╭─────────────────────────────────────────────────────────────╮
  │                                                             │
  │        ██████   ██████       ██████   █████   ██████        │
  │        ╚════██ ██╔═══██╗     ╚════██╗██╔══██╗██╔════╝       │
  │         █████╔╝ ╚██████║      █████╔╝███████║██║            │
  │        ██╔═══╝ ██╗═══██║     ██╔═══╝ ██╔══██║██║            │
  │        ███████╗╚██████╔╝     ███████╗██║  ██║╚██████╗       │
  │        ╚══════╝ ╚═════╝      ╚══════╝╚═╝  ╚═╝ ╚═════╝       │
  │                                                             │
  │          27 rust tests  ·  75 js tests  ·  102 total        │
  │                                                             │
  ╰─────────────────────────────────────────────────────────────╯
```

### run them

```bash
# everything (Rust native + JS + end-to-end wasm)
cargo test --manifest-path crates/dhamaka-runtime/Cargo.toml
npm test

# just the Rust crate
cd crates/dhamaka-runtime && cargo test

# just the JS side
npm test

# one specific file
node --test packages/runtime/test/wasm-engine.test.js
```

Zero test-runner dependencies. Rust uses `cargo test`, JS uses the Node 20+ built-in `node --test`. No jest, no mocha, no vitest, no install step past `rustup` and the Node toolchain.

### Rust · `cargo test` · 27 tests

The hot path. Every tensor primitive, the sampler, the forward pass, and the model init are covered by native unit tests that run in milliseconds.

| file                         | tests | what it covers                                                                 |
|------------------------------|:-----:|---------------------------------------------------------------------------------|
| `src/rng.rs`                 |   4   | xorshift64* determinism, `next_f32()` range, FNV-1a seed-hash distinctness      |
| `src/tensor.rs`              |  10   | matmul (identity + 2×2 reference), RMSNorm, softmax sums to 1 + translation invariance, SiLU at 0 and large positive, in-place add/mul, RoPE identity at pos 0 + norm preservation |
| `src/sampler.rs`             |   5   | greedy picks max, temperature=0 is greedy, deterministic for same seed, `top_k=1` always hits argmax, `top_p=0.01` collapses to the mode |
| `src/transformer.rs`         |   3   | forward pass produces finite logits, is deterministic for same seed, **different positions produce different logits** (caught a real KV-cache bug) |
| `src/model.rs`               |   5   | random-weights init is reproducible, different seeds differ, vocab table size, detokenize round-trip, empty prompt still yields a token |

### JavaScript · `npm test` · 75 tests

Drives the SmartField SDK, the hub, the tasks pipeline, and the real compiled `.wasm` end-to-end from Node using the built-in test runner. Zero dependencies.

| file                                        | tests | what it covers                                                                    |
|---------------------------------------------|:-----:|------------------------------------------------------------------------------------|
| `packages/sdk/test/tasks.test.js`           |  22   | city-to-state (exact, alias, case/punct, fuzzy, international, nonsense); spellcheck (misspelling, homophone, clean text, "teh"); paste-extract (email/phone/website, freemail company rules, empty); task registry; runTask |
| `packages/sdk/test/smart-field.test.js`     |   5   | resolves on construction, fires `smart-field:resolved` event, re-runs on every input, `dispose` stops listening, bad-arg rejection |
| `packages/sdk/test/smart-form.test.js`      |   5   | cross-field propagation (city → state/country/timezone), manual-edit locks, `unlock()` re-engages, `tasks` auto-attach, non-form rejection |
| `packages/sdk/test/chat.test.js`            |   6   | history accumulation, system prompt, streaming transcript, reset with/without system |
| `packages/sdk/test/hub-client.test.js`      |   5   | Node fallback mode, ping, get with mocked fetch (cache miss then hit), list + delete, unknown-model error |
| `packages/sdk/test/openai-shim.test.js`     |   3   | non-streaming ChatCompletion shape, streaming SSE with `[DONE]`, passthrough for non-matching URLs |
| `packages/runtime/test/factory.test.js`     |   7   | backend selection (auto / mock / wasm / window-ai), abstract `Engine` refuses instantiation, `WasmEngine` info + unreachable-url error |
| `packages/runtime/test/mock-engine.test.js` |   7   | load gating, streaming, `complete()`, determinism, `AbortSignal`, unload          |
| `packages/runtime/test/tokenizer.test.js`   |   8   | `split()` on words / punctuation / whitespace / empty, JSON `loadFromBytes`, encode/decode stubs |
| `packages/runtime/test/wasm-engine.test.js` |   4   | **loads the real compiled `.wasm`**, streams real Rust forward-pass tokens, deterministic across identical prompts, honors `AbortSignal` |
| `packages/hub/test/manifest.test.js`        |   5   | canonical manifest parses, model ids + required fields, sha256 format, default model exists, served hub manifest mirrors shape |

### end-to-end

The four `wasm-engine.test.js` tests are the moat. They stub `globalThis.fetch` to read the compiled `dhamaka-runtime.wasm` off disk, then drive the real ABI:

```
┌─ Node ────────────────────────────────────────────────────────────┐
│  WasmEngine                                                       │
│      │                                                            │
│      │  WebAssembly.instantiate(fs.readFile(.wasm))                │
│      ▼                                                            │
│  [ dhamaka_version   ==> 1                               ]        │
│  [ dhamaka_alloc     ==> ptr                             ]        │
│  [ write prompt bytes into WASM linear memory            ]        │
│  [ dhamaka_init      ==> ctx                             ]        │
│  [ dhamaka_feed_prompt(ctx, ptr, len)                    ]        │
│  [ loop { dhamaka_next_token(ctx, out, 64) ==> n bytes } ]        │
│  [ decode UTF-8, yield token                             ]        │
└───────────────────────────────────────────────────────────────────┘
```

These four pass in Node, so every token in the README's "real today" list is real. The same `WasmEngine` runs in the browser via `instantiateStreaming` — no fork.

### CI

`.github/workflows/ci.yml` runs on every push and pull request:

```
  ┌─────────────────────────┐
  │ job 1 · rust            │
  │   rustup target add     │
  │     wasm32-unknown-     │
  │     unknown             │
  │   cargo test            │─── 27 tests
  │   cargo build --release │
  │     --target wasm32-…   │─── stage .wasm artifact
  └───────────┬─────────────┘
              │
              ▼
  ┌─────────────────────────┐
  │ job 2 · js              │
  │   download wasm artifact│
  │   node --check **/*.js  │
  │   npm test              │─── 45 tests
  │   smoke-test dev server │─── curl every endpoint
  └─────────────────────────┘

          matrix: node 20, node 22
```

No green CI, no merge.

---

## ✦ philosophy

```
   ┌───────────────────────────────────────────────────────────┐
   │                                                           │
   │   nothing leaves the device.                              │
   │                                                           │
   │   no api keys. no accounts. no rate limits. no 429s.      │
   │   no "our servers are experiencing issues". no bill.      │
   │                                                           │
   │   your prompts are yours. your model is yours.            │
   │   your tab is the datacenter.                             │
   │                                                           │
   └───────────────────────────────────────────────────────────┘
```

---

## ✦ license

MIT. See [LICENSE](./LICENSE).

<div align="center">

```
      ✦ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ✦

                     built for the open web
                     runs on your machine
                     shared across every site

      ✦ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ✦
```

</div>
