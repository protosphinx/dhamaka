# Goals

> The north-star document for this project. Written to keep me honest about
> what I'm building, what I'm *not* building, and what the winning shape of
> the product actually is.

## The one-liner

**A cross-browser JavaScript SDK that gives every `<input>` and `<textarea>`
on the web on-device AI reflexes. Zero network latency, zero API cost,
zero privacy exposure. Drop it in, every field gets smarter.**

## What this is (and why it's a pivot)

I started this thinking about "a small LLM that runs in a browser tab."
That framing is wrong. The browser-LLM runtime space is crowded:
Transformers.js, WebLLM, wllama, Candle, ONNX Runtime Web, Chrome's
`window.ai`. Those are *runtimes*. Runtimes are a commodity layer and
Hugging Face plus Google are going to keep winning them.

The interesting product isn't a runtime. It's the **reflex layer**: a
resident, keystroke-level AI service that lives in every tab, watches
every input, and makes the web feel predictive. Nobody ships that. Not
Hugging Face, not Google, not Apple. That's the gap I'm building into.

## The problem, in concrete terms

Web forms in 2026 are still dumb:

- I type "San Francisco" in a city field and the state field stays blank.
- I type "forest green" in a color field and nothing happens.
- I type "next Tuesday" in a date field and it doesn't parse.
- I paste a business card into a form and it drops as one blob instead of
  splitting into name / email / phone / company.
- My spellchecker underlines "recieve" but has no idea the sentence
  "I'll see you their" has a problem.
- Autocomplete shows me things I typed before, never things I *might*
  type.

Every one of these is something an on-device LLM can fix in under 50 ms
with no network, no API key, no rate limits, and no privacy exposure.
Nobody ships it because the economics of server-side inference kill the
use cases before they start. My product fixes the economics by running
locally, which makes the whole class of features trivially affordable.

## Why on-device wins (the real unlock)

When inference is local, five constraints disappear at once:

| constraint (server-side) | on-device |
|---|---|
| round-trip network latency (200–2000 ms) | 0 ms |
| per-call API cost | 0 ¢ |
| rate limits, 429s, per-user throttles | none |
| every keystroke uploaded | nothing leaves the device |
| dependent on uptime of a provider | always-on |

This isn't a "saves money" improvement. It's a different physics. Calls
are now effectively free function invocations, which means I can fire
them inside `oninput` at 40 Hz per field and nobody cares. That unlocks
features server-side products literally cannot build, no matter how much
money they spend:

- Per-keystroke tab completion on every field, not just search boxes.
- Live semantic spellcheck that explains why a word is wrong in context.
- Cross-field inference that updates state, country, timezone, and
  currency the moment the user types a city.
- Smart paste that splits a pasted blob into the right form fields
  synchronously, before the user blinks.
- Real-time form validation in natural language ("94103 is in California
  but you selected Texas").
- Tone rewriting on any `<textarea>` with zero round trip.
- Context-aware placeholders and help text that adapt to what the user
  has already filled in.
- Privacy-preserving form analytics — the site owner learns where users
  hesitate, without a single keystroke ever leaving the device.

None of these need a 7B chat model. They need a tiny, warm, resident
inference service and a thin SDK on top.

## Who's actually in this space (the short list)

Every competitor I'm willing to take seriously runs on-device. Cloud AI
products aren't competitors — the latency kills them for everything I
care about. This is the real list:

### Platform built-ins (the biggest threat)

- **Chrome `window.ai` / Gemini Nano.** Chrome 138+ ships a resident
  ~3–4 GB Gemini Nano, accessible from every origin via the Prompt,
  Translator, Summarizer, Writer, Rewriter, and Proofreader APIs. This
  literally addresses the use case — for Chrome users only, with one
  huge general model Google controls, and with no SDK layer above it.
- **Apple Intelligence Writing Tools.** On-device 3B model wired into
  every native text control in Safari 18+ / macOS 15+. Not callable
  from JavaScript, not available as a developer API. Apple-only.
- **Edge / Microsoft.** Sidebar-level integration, no developer surface.
  Not a competitor for an SDK.

### Runtimes (one layer below me)

- **Transformers.js** (HuggingFace) — the default general-purpose
  in-browser inference today. A runtime, not a product. No cross-site
  cache, no SharedWorker story, no task-SDK.
- **WebLLM** (MLC) — bigger models via WebGPU. Runtime only.
- **wllama** — llama.cpp in pure WASM. Runtime only.
- **ONNX Runtime Web**, **Candle**, **TensorFlow.js** — lower-level
  primitives.

None of these ship a `<smart-field>` component or a cross-site cache.
They are not competitors. They are dependencies.

### The actual gap

```
                  SOLVES THE USE CASE?
                   yes                          no
                    │                            │
   ┌────────────────┼────────────────────────────┼───────────┐
   │ platform       │ Chrome window.ai           │           │
   │ built-in       │ Apple Writing Tools        │           │
   │ (single-vendor)│                            │           │
   └────────────────┼────────────────────────────┼───────────┘
                    │                            │
   ┌────────────────┼────────────────────────────┼───────────┐
   │ runtime        │                            │ Transformers.js
   │                │         ← HERE             │ WebLLM
   │                │      (empty box)           │ wllama
   │                │                            │ ONNX RT Web
   └────────────────┴────────────────────────────┴───────────┘

    cross-browser?      yes                             n/a
```

I'm building the top-left box. Cross-browser, developer-facing,
on-device, form-intelligent. Nobody lives there.

## Non-goals (important for staying focused)

This list matters more than the goals list. Every hour spent on a
non-goal is an hour not spent on the real product.

- **Not a chat SDK.** `Dhamaka.load().complete("hello")` is not the
  product. If a developer wants to ship a chatbot, they should use
  Transformers.js directly.
- **Not a general-purpose browser LLM runtime.** Transformers.js already
  is that. I'm using it, not replacing it.
- **Not competing on raw model size or tok/s.** WebLLM will beat me on
  both for years. I don't care.
- **Not a new inference engine.** The Rust crate in this repo is a
  learning exercise and a possible v2 swap target. It is not the
  critical path. Real releases build on Transformers.js (and `window.ai`
  where available).
- **Not a server product.** Nothing I ship touches a server I run.
- **Not a commercial SaaS yet.** The first job is proving the category
  works in the open-source tier. Monetization is a v2 question.
- **Not fighting Chrome's `window.ai`.** I use it as a fast path on
  Chrome. I don't pretend my own runtime is faster than Google's.

## Technical principles

These are the rules I hold myself to when making architecture choices.

1. **The SDK is the product, the runtime is a dependency.** The thing
   developers touch is `<smart-field>` / `SmartForm` / `SmartText`. The
   runtime underneath can be Transformers.js, `window.ai`, wllama, or my
   own Rust crate — the SDK surface doesn't move when the runtime swaps.

2. **Calls are free; call often.** Design every feature assuming I can
   fire the model inside `oninput`. If a feature doesn't get better
   because of that, it's probably not the right feature.

3. **Task-specific beats general.** A 20 MB MiniLM embedding model plus a
   100 KB gazetteer beats a 360 MB general chat model for 70% of smart-
   field tasks. The SDK decides which micro-model (or lookup table) each
   task uses. Developers think in tasks, not in models.

4. **Rules first, model second.** Deterministic cases (phone format,
   ZIP validation, ISO country codes) short-circuit around the model.
   The model handles the semantic long tail the tables can't anticipate.

5. **Resident, not on-demand.** The model lives in a SharedWorker,
   warm, KV-cached, primed with the page's form context. Cold starts
   are a design failure.

6. **Shared across tabs, shared across sites.** One model instance per
   user, not per tab. One downloaded copy per user, not per origin.
   Shared-across-tabs is a SharedWorker. Shared-across-sites is the
   browser extension (v1) or the hub iframe (legacy fallback).

7. **Cross-browser is a hard constraint.** If it doesn't work on
   Firefox and Safari it doesn't ship. That's my entire differentiation
   from Chrome built-ins.

8. **The browser extension is v1, not phase 2.** Storage partitioning
   is killing the iframe hub and will only get stricter. The extension
   is the only long-term-robust way to share a model cache across
   origins. The moat weakens every month it isn't shipped.

9. **Demos over docs.** Every feature ships with a working playground
   demo before it ships a single word of documentation. If I can't make
   a 30-second screencast of it feeling magical, it isn't ready.

## v0.1 scope — the spike that proves the idea

The smallest thing I can ship that proves the architecture works and the
UX is as good as I think it is.

- [ ] SharedWorker that loads a small model via Transformers.js
  (SmolLM2-135M-Instruct or Phi-3-mini-q4, whichever runs faster in
  pure WASM without WebGPU)
- [ ] KV cache persists across `oninput` calls on the same page
- [ ] Page context pre-warmed on `DOMContentLoaded` with the form's
  field labels and any `aria-label` / `placeholder` hints
- [ ] `SmartField` web component that wraps an `<input>` and takes a
  `task` attribute: `city-to-state`, `freeform-completion`,
  `spellcheck`, `format-validate`
- [ ] Three working demos in the playground:
  1. **Address autofill.** Type "San Francisco" → state, country,
     timezone, currency, ZIP pattern fill in live, <50 ms.
  2. **Contextual spellcheck.** Type "i'll see you their" in a textarea
     → "their" underlined, hover shows "did you mean there?".
  3. **Smart paste.** Paste a contact blob into a form → name, email,
     phone, company split into the right fields, synchronously.
- [ ] `window.ai` detect-and-delegate adapter. When Chrome's Prompt API
  is available, use it. Otherwise use the Transformers.js backend.
  Same SDK surface either way.
- [ ] `TransformersJSCacheAdapter` that routes the Transformers.js cache
  through my hub origin, so consuming sites share the downloaded model.
- [ ] Manifest V3 browser extension that owns the model cache at the
  OS level, sidestepping storage partitioning entirely. The existing
  extension skeleton is a starting point but needs real inference
  wiring and a published listing on the Chrome Web Store.

No Rust runtime in v0.1. The crate stays in the repo as reference code.

## v0.2 — making it a product

- A proper task registry (`dhamaka-autofill`, `dhamaka-spellcheck`,
  `dhamaka-complete`, `dhamaka-rewrite`, `dhamaka-paste-extract`)
- Per-task micro-models, each loaded lazily the first time the task is
  used on the page
- React / Vue / Svelte bindings (`useSmartField`) so framework devs
  don't have to think about web components
- Benchmark harness: cold-start ms, warm tok/s, memory per tab
- A real README that positions the product as the smart-field SDK, not
  the browser LLM runtime

## v2+ — the long-term bets

- Speculative decoding: cheap static matcher (n-gram, trie) proposes,
  LLM verifies. Gets tok/s into the 500+ range for autocomplete.
- WebGPU fast path for users who have it.
- A revisit of the Rust runtime once Transformers.js's overhead becomes
  the bottleneck on very small task-specific models.
- Opt-in federated learning: sites can feed back "the user accepted /
  rejected this suggestion" signals to improve the shipped models
  without uploading keystrokes.

## Success criteria

How I'll know v0.1 worked:

1. **The demo makes people say "wait, that's local?"** — the UX feels
   server-quality but the network tab shows nothing after page load.
2. **A developer can integrate it in <5 minutes.** `npm install`, drop
   in a `<smart-field>`, done. No ML background required.
3. **At least one other developer ships something I didn't anticipate.**
   That's the signal that the SDK is generic enough to be a platform.
4. **Transformers.js cache adapter is actually adopted** — either by me,
   by a HF example, or by another on-device product — proving the
   cross-site cache idea has legs.

## Open questions

Things I don't know the answer to yet and should resolve before v0.1:

- Is SmolLM2-135M fast enough in pure WASM (no WebGPU) for a 50 ms
  per-keystroke budget? I need to benchmark this before committing to
  it as the default.
- Is Transformers.js's `env.customCache` hook actually sufficient to
  route all model loads through a custom provider, or does it leak
  around the adapter for some asset types?
- Will the Chrome `window.ai` Prompt API be stable enough to depend on
  by the time I ship, or is it still moving too fast?
- How much of the "smart paste" demo can actually be done with regex
  and a gazetteer alone, without any model call? I suspect more than
  half. That informs how much model I actually need to load up front.
- What's the right default task set to ship in v0.1? Autofill +
  spellcheck + paste-extract is my current bet, but I haven't validated
  any of these with real users.

## Why now

Three things make this the right moment:

1. **The runtimes finally work.** Transformers.js + SmolLM2 is the
   first combination where a small LLM runs fast enough in pure WASM
   to be called per keystroke. That wasn't true 18 months ago.
2. **Chrome is signalling the category.** `window.ai` shipping in
   Chrome is Google saying "on-device AI in the browser is where this
   is going." But Chrome's single-vendor solution leaves 40% of the
   web on Safari and Firefox with nothing, and even Chrome users get
   a general-purpose 4 GB model when they'd often rather have a 50 MB
   task-specific one.
3. **The cross-site cache window is still open.** Storage partitioning
   is tightening but the browser-extension workaround is legal, robust,
   and nobody has shipped the "model cache extension" play yet. Two
   years from now that space will be taken. It isn't today.

## Naming

The current name is **Dhamaka**. Dhamaka means "explosion / blast" in
Hindi, which is the opposite of what this product is: small, quiet,
local, tucked into a tab. The name is wrong for the product and will be
replaced before the first public release.

Candidates I'm considering, all framed around "small, intuitive, always
on, helps you without getting in the way":

- **Hunch** — "I have a hunch you meant California." Matches the
  semantic-autofill framing perfectly. 5 letters, one syllable, under-
  used in tech. Current top pick.
- **Mote** — "a mote of an LLM in every tab." Matches the size story
  (tiny, ambient, everywhere). 4 letters.
- **Reflex** — literal: keystroke-level reflexes for every input.
- **Pith** — essence, distilled. Under-used, zero collisions.
- **Wit** — quick, clever, small.

Name lock-in is a v0.1 blocker but not a v0.0 blocker. I can ship the
spike under the current name and rename on the release commit.

## The one thing to remember

**I am not building a browser LLM. I am building a reflex layer for
every input field on the web, using on-device inference as the physical
substrate that makes it affordable.**

When in doubt, optimize for that sentence.
