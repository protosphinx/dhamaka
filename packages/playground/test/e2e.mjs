#!/usr/bin/env node
// End-to-end browser test harness for the Dhamaka demo site.
//
// Why this exists: the demos are pure static HTML + ES modules + an
// importmap, so the only way to catch "broken in a real browser"
// regressions is to load them in a real browser and interact with them.
// Node's test runner covers the SDK unit surface; this covers the
// live-in-a-tab surface on top of it.
//
// What it does:
//
//   1. Runs `build-site.mjs` to assemble a fresh _site/ from the current
//      tree. This catches importmap-rewrite bugs and cache-busting bugs
//      that only appear in the built output.
//   2. Starts a zero-dependency static HTTP server on a free port to
//      serve _site/.
//   3. Launches headless chromium via the playwright bundled with the
//      sandbox (at /opt/node22/lib/node_modules/playwright, falling back
//      to the project's node_modules if present).
//   4. For each demo, intercepts the `@huggingface/transformers` esm.sh
//      import with a scripted mock pipeline — so tests are deterministic
//      and don't depend on network access to a 60MB model.
//   5. Drives the UI (clicks, typing, paste events) and asserts on the
//      resulting DOM + telemetry.
//
// Every assertion is a plain throw, caught by the per-test wrapper and
// reported as a pass/fail. There's no test framework dependency — this
// is a single-file harness we can run in CI or locally without npm-
// installing 200 MB of jest.
//
// Usage:
//
//   node packages/playground/test/e2e.mjs              # all demos
//   node packages/playground/test/e2e.mjs --only=spellcheck
//   node packages/playground/test/e2e.mjs --headed     # show the browser
//
// Exit code: 0 if all tests pass, 1 otherwise.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const SITE = resolve(__dirname, "..", "_site");
const BUILD_SCRIPT = resolve(__dirname, "..", "build-site.mjs");

// ─── CLI ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const opts = {
  only: argv.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? null,
  headed: argv.includes("--headed"),
  skipBuild: argv.includes("--no-build"),
  verbose: argv.includes("--verbose") || argv.includes("-v"),
};

// ─── ANSI helpers ─────────────────────────────────────────────────────

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  grn: (s) => `\x1b[32m${s}\x1b[0m`,
  ylw: (s) => `\x1b[33m${s}\x1b[0m`,
  cya: (s) => `\x1b[36m${s}\x1b[0m`,
  mag: (s) => `\x1b[35m${s}\x1b[0m`,
  bld: (s) => `\x1b[1m${s}\x1b[0m`,
};

// ─── build step ───────────────────────────────────────────────────────

async function buildSite() {
  if (opts.skipBuild) {
    if (!existsSync(SITE)) {
      throw new Error(`--no-build passed but ${SITE} does not exist`);
    }
    console.log(c.dim(`  skipping build (--no-build); using existing ${SITE}`));
    return;
  }
  console.log(c.cya("  building _site/…"));
  await runChild("node", [BUILD_SCRIPT], { cwd: ROOT });
  if (!existsSync(join(SITE, "demos", "spellcheck.html"))) {
    throw new Error(`build completed but ${SITE}/demos/spellcheck.html is missing`);
  }
}

function runChild(cmd, args, { cwd } = {}) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, args, { cwd, stdio: opts.verbose ? "inherit" : "pipe" });
    let stderr = "";
    if (!opts.verbose) child.stderr?.on("data", (d) => { stderr += String(d); });
    child.on("error", rejectP);
    child.on("exit", (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`${cmd} exited with ${code}\n${stderr}`));
    });
  });
}

// ─── static file server for _site/ ────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".wasm": "application/wasm",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
};

function startStaticServer(root) {
  return new Promise((resolveP, rejectP) => {
    const server = createServer(async (req, res) => {
      try {
        // Strip query string so ?v=cachebust still resolves to the file.
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        let filePath = join(root, urlPath);
        // Directory → index.html
        try {
          const s = await stat(filePath);
          if (s.isDirectory()) filePath = join(filePath, "index.html");
        } catch {}
        const data = await readFile(filePath);
        const ext = extname(filePath).toLowerCase();
        res.writeHead(200, {
          "content-type": MIME[ext] || "application/octet-stream",
          "cache-control": "no-store",
        });
        res.end(data);
      } catch (err) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end(`404 ${req.url}\n${err.message}`);
      }
    });
    server.on("error", rejectP);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveP({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

// ─── playwright loader ────────────────────────────────────────────────

async function loadPlaywright() {
  const candidates = [
    // Sandbox global install — what CI and the local sandbox have.
    "/opt/node22/lib/node_modules/playwright/index.mjs",
    // Project-local install (fallback when someone `npm i -D playwright`).
    join(ROOT, "node_modules", "playwright", "index.mjs"),
  ];
  let lastErr;
  for (const p of candidates) {
    try {
      if (existsSync(p)) return await import(p);
    } catch (err) { lastErr = err; }
  }
  throw new Error(
    "playwright not found. Install with `npm i -D playwright` or run in a " +
      "sandbox that has it pre-installed at /opt/node22/lib/node_modules/playwright. " +
      `Last error: ${lastErr?.message ?? "none"}`,
  );
}

// ─── mock Transformers.js module ──────────────────────────────────────
//
// Every demo that loads `@huggingface/transformers` gets this module.
// It provides the parts of the API the demos touch (`pipeline()` and the
// progress_callback shape) and nothing else. Tests can layer per-demo
// MOCK_TOP_K behaviour on top by passing a `maskReplies` record, keyed
// by the full masked string the spellcheck task sends.

function mockTransformersBody({ maskReplies = {} } = {}) {
  return `
    const MOCK_MASK_REPLIES = ${JSON.stringify(maskReplies)};
    export async function pipeline(task, model, opts) {
      if (opts && typeof opts.progress_callback === "function") {
        try {
          opts.progress_callback({ status: "initiate", file: "mock" });
          opts.progress_callback({ status: "download", file: "mock" });
          opts.progress_callback({ status: "progress", progress: 50, loaded: 500, total: 1000, file: "mock" });
          opts.progress_callback({ status: "progress", progress: 100, loaded: 1000, total: 1000, file: "mock" });
          opts.progress_callback({ status: "ready" });
        } catch {}
      }
      const fn = async (input, _popts) => {
        // Normalise: the task sends "Prefix [MASK] suffix" as a string.
        // Keys in MOCK_MASK_REPLIES are exact matches.
        if (Object.prototype.hasOwnProperty.call(MOCK_MASK_REPLIES, input)) {
          const list = MOCK_MASK_REPLIES[input];
          return list.map((r) => ({
            score: r.score ?? 0.1,
            token: 0,
            token_str: r.token,
            sequence: "",
          }));
        }
        // Fallback: pretend every mask position predicts "the / a / it".
        // The filter in spellcheckTask will reject 1-2 char tokens, so this
        // means unscripted words get flagged with no suggestions.
        return [
          { score: 0.3, token: 0, token_str: "the", sequence: "" },
          { score: 0.2, token: 0, token_str: "a",   sequence: "" },
          { score: 0.1, token: 0, token_str: "it",  sequence: "" },
        ];
      };
      fn.tokenizer = { mask_token: "[MASK]" };
      return fn;
    }
  `;
}

async function routeTransformers(page, maskReplies) {
  await page.route("https://esm.sh/@huggingface/transformers@3", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      headers: { "access-control-allow-origin": "*" },
      body: mockTransformersBody({ maskReplies }),
    });
  });
}

// ─── test runner ──────────────────────────────────────────────────────

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      `${msg ? msg + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertContains(haystack, needle, msg) {
  if (!String(haystack).includes(needle)) {
    throw new Error(
      `${msg ? msg + ": " : ""}expected to find ${JSON.stringify(needle)} in ${JSON.stringify(String(haystack).slice(0, 400))}`,
    );
  }
}

// ─── test cases ───────────────────────────────────────────────────────
//
// Each test gets an already-open page. Helpers below capture console
// errors so pageerrors fail the run automatically.

function withErrorCapture(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  return {
    errors,
    assertClean() {
      // Ignore benign dev-server / transformers warnings if they ever appear.
      const real = errors.filter((e) => !/favicon|DevTools/i.test(e));
      if (real.length) {
        throw new Error(`page logged errors:\n  ${real.join("\n  ")}`);
      }
    },
  };
}

// ─── demo: autofill (city-to-state) ───────────────────────────────────

test("autofill: city→state resolves synchronously via rules", async ({ page, base }) => {
  const capture = withErrorCapture(page);
  await page.goto(`${base}/demos/autofill.html`, { waitUntil: "domcontentloaded" });

  await page.fill("#city", "San Francisco");
  // SmartField runs synchronously on input for rule-matched cities.
  await page.waitForFunction(
    () => document.getElementById("state")?.value !== "",
    { timeout: 2000 },
  );
  assertEq(await page.locator("#state").inputValue(), "California");
  assertEq(await page.locator("#country").inputValue(), "United States");
  assertEq((await page.locator("#t-source").textContent())?.trim(), "rule");

  // Fuzzy fallback
  await page.fill("#city", "");
  await page.fill("#city", "San Francsico");
  await page.waitForFunction(
    () => document.getElementById("state")?.value === "California",
    { timeout: 2000 },
  );
  assertEq((await page.locator("#t-source").textContent())?.trim(), "fuzzy");

  capture.assertClean();
});

// ─── demo: paste-extract ──────────────────────────────────────────────

test("paste: extracts email/phone/website/name from pasted blob", async ({ page, base }) => {
  const capture = withErrorCapture(page);
  await page.goto(`${base}/demos/paste.html`, { waitUntil: "domcontentloaded" });

  // Simulate a paste by dispatching a clipboard event. Playwright can't
  // talk to the system clipboard headlessly, but attachSmartPaste
  // listens for the `paste` DOM event and reads clipboardData, so we
  // construct one directly.
  await page.evaluate(() => {
    const text = [
      "Jane Doe",
      "Senior Engineer",
      "Acme Corp",
      "jane.doe@acme.com",
      "+1 (415) 555-1234",
      "https://acme.com",
      "@janedoe",
    ].join("\n");
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const ev = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    // Fire the event at the drop zone where attachSmartPaste is listening.
    document.getElementById("drop-zone").dispatchEvent(ev);
  });

  // Wait for the form to populate.
  await page.waitForFunction(
    () => document.querySelector("input[name=email]")?.value === "jane.doe@acme.com",
    { timeout: 2000 },
  );

  assertEq(await page.locator("input[name=email]").inputValue(), "jane.doe@acme.com");
  assertEq(await page.locator("input[name=name]").inputValue(), "Jane Doe");
  assertEq(await page.locator("input[name=company]").inputValue(), "Acme");
  assertEq(await page.locator("input[name=website]").inputValue(), "https://acme.com");
  const phone = await page.locator("input[name=phone]").inputValue();
  assertContains(phone, "14155551234", "phone field should contain the digits");

  capture.assertClean();
});

// ─── demo: formula (Transform.formula) ────────────────────────────────

test("formula: 'apply 8% tax' chip rewrites the selected cell's formula", async ({ page, base }) => {
  const capture = withErrorCapture(page);
  await page.goto(`${base}/demos/formula.html`, { waitUntil: "domcontentloaded" });

  // D2 has =B2 + C2 and is already pre-selected.
  assertEq((await page.locator("#cell-addr").textContent())?.trim(), "D2");
  assertEq(await page.locator("#formula-input").inputValue(), "=B2 + C2");

  // Click the 8% tax chip.
  await page.locator('.chip[data-inst="apply 8% sales tax"]').click();

  await page.waitForFunction(
    () => {
      const input = document.getElementById("formula-input");
      return input && input.value !== "=B2 + C2" && /1\.08/.test(input.value);
    },
    { timeout: 2000 },
  );

  const after = await page.locator("#formula-input").inputValue();
  assertContains(after, "1.08", "formula should include a 1.08 tax multiplier");
  assertContains(
    (await page.locator("#ba-new").textContent()) || "",
    "1.08",
    "before/after panel should show the rewritten formula",
  );

  capture.assertClean();
});

test("formula: 'round to 2 decimals' wraps the formula in ROUND", async ({ page, base }) => {
  const capture = withErrorCapture(page);
  await page.goto(`${base}/demos/formula.html`, { waitUntil: "domcontentloaded" });

  await page.locator('.chip[data-inst="round to 2 decimals"]').click();
  await page.waitForFunction(
    () => /ROUND/i.test(document.getElementById("formula-input")?.value || ""),
    { timeout: 2000 },
  );
  const after = await page.locator("#formula-input").inputValue();
  assertContains(after.toUpperCase(), "ROUND", "formula should be wrapped in ROUND()");
  assertContains(after, ", 2", "formula should round to 2 decimals");

  capture.assertClean();
});

// ─── demo: spellcheck (Transformers.js fill-mask) ─────────────────────

test("spellcheck: model loads, Try chip populates textarea, and suggestions come back", async ({ page, base }) => {
  const capture = withErrorCapture(page);
  await routeTransformers(page, {
    // The actual masks the task builds for "I recieve the package tommorow
    // and it will seperate our stuff". We scripted replies for a handful
    // of interesting positions; everything else falls through to the
    // default "the / a / it" which is rejected by the MIN_SUGGESTION_LEN
    // filter, and those words get flagged with `to: null`.
    "I [MASK] the package tommorow and it will seperate our stuff": [
      { token: "receive", score: 0.6 },
      { token: "got", score: 0.1 },
      { token: "have", score: 0.05 },
    ],
    "I recieve the package [MASK] and it will seperate our stuff": [
      { token: "tomorrow", score: 0.5 },
      { token: "today", score: 0.1 },
    ],
    "I recieve the package tommorow and it will [MASK] our stuff": [
      { token: "separate", score: 0.5 },
      { token: "keep", score: 0.1 },
    ],
    "I recieve the [MASK] tommorow and it will seperate our stuff": [
      { token: "package", score: 0.8 },
    ],
    "I recieve the package tommorow and it will seperate our [MASK]": [
      { token: "stuff", score: 0.8 },
    ],
  });

  await page.goto(`${base}/demos/spellcheck.html`, { waitUntil: "domcontentloaded" });

  // The page eagerly warms the engine. Wait for the status card to flip
  // to "ready" — our mock pipeline() returns instantly so this should
  // happen in well under a second.
  await page.waitForFunction(
    () => document.getElementById("status-title-text")?.textContent?.includes("ready"),
    { timeout: 10000 },
  );
  const title = (await page.locator("#status-title-text").textContent())?.trim() ?? "";
  assertContains(title, "ready", "engine should report ready");

  // Click the first Try chip — populates the textarea and dispatches input.
  await page.locator(".try-chip").first().click();
  const draftValue = await page.locator("#draft").inputValue();
  assertContains(draftValue, "recieve", "Try chip should populate textarea");

  // SmartText debounces by 400ms — wait for suggestions to arrive.
  await page.waitForFunction(
    () => (document.getElementById("t-count")?.textContent || "0") !== "0",
    { timeout: 5000 },
  );

  const count = parseInt((await page.locator("#t-count").textContent()) || "0", 10);
  assert(count >= 3, `expected at least 3 suggestions, got ${count}`);
  assertEq((await page.locator("#t-source").textContent())?.trim(), "model");

  // The words we scripted replies for MUST surface with the right corrections.
  const chipsHtml = await page.locator("#suggestions-out").innerHTML();
  assertContains(chipsHtml, "recieve", "should flag recieve");
  assertContains(chipsHtml, "receive", "should suggest receive");
  assertContains(chipsHtml, "tommorow", "should flag tommorow");
  assertContains(chipsHtml, "tomorrow", "should suggest tomorrow");
  assertContains(chipsHtml, "seperate", "should flag seperate");
  assertContains(chipsHtml, "separate", "should suggest separate");

  capture.assertClean();
});

test("spellcheck: filter rejects 1-2 char and consonant-only predictions", async ({ page, base }) => {
  const capture = withErrorCapture(page);
  await routeTransformers(page, {
    // Mask for "foobar" in "hello foobar" — junk predictions only
    "hello [MASK]": [
      { token: "xx", score: 0.5 },      // too short
      { token: "cd", score: 0.3 },      // too short
      { token: "ght", score: 0.2 },     // no vowel
      { token: "world", score: 0.1 },   // plausible ✓
      { token: "there", score: 0.05 },  // plausible ✓
    ],
  });

  await page.goto(`${base}/demos/spellcheck.html`, { waitUntil: "domcontentloaded" });

  await page.waitForFunction(
    () => document.getElementById("status-title-text")?.textContent?.includes("ready"),
    { timeout: 10000 },
  );

  // Type "hello foobar" directly. `hello` is in the STOPLIST-free but
  // short enough path; it will be checked but no reply is scripted for
  // its mask so it falls through to the default [the/a/it] — all three
  // of which are <3 chars so `hello` gets flagged with alternatives=[].
  // The interesting assertion is on `foobar`: it should be flagged and
  // the suggestion should be `world`, NOT `xx` / `cd` / `ght`.
  await page.fill("#draft", "hello foobar");
  await page.waitForFunction(
    () => {
      const out = document.getElementById("suggestions-out");
      return out && out.innerHTML.includes("foobar");
    },
    { timeout: 5000 },
  );
  const chipsHtml = await page.locator("#suggestions-out").innerHTML();
  assertContains(chipsHtml, "foobar", "should flag foobar");
  assertContains(chipsHtml, "world", "should suggest world (the first plausible alt)");
  assert(!chipsHtml.includes(">xx<"), "must NOT suggest 'xx' (too short)");
  assert(!chipsHtml.includes(">cd<"), "must NOT suggest 'cd' (too short)");
  assert(!chipsHtml.includes(">ght<"), "must NOT suggest 'ght' (no vowel)");

  capture.assertClean();
});

test("spellcheck: gibberish with no plausible alternatives is still flagged with '?'", async ({ page, base }) => {
  const capture = withErrorCapture(page);
  // Script every plausible mask for "asdfgh qwerty zzzzz" with a reply
  // that's exclusively filter-rejected tokens: 2-char (xx, cd), no-vowel
  // (ght, xxx), or subword fragment (##s). The task's isPlausibleWord
  // filter must reject all of them → word flagged with to:null.
  const junkReplies = {
    score: 0.5,
    tokens: [
      { token: "xx", score: 0.5 },
      { token: "cd", score: 0.3 },
      { token: "ght", score: 0.2 },
      { token: "xxx", score: 0.15 },
      { token: "##s", score: 0.1 },
    ],
  };
  await routeTransformers(page, {
    "[MASK] qwerty zzzzz":  junkReplies.tokens,
    "asdfgh [MASK] zzzzz":  junkReplies.tokens,
    "asdfgh qwerty [MASK]": junkReplies.tokens,
  });

  await page.goto(`${base}/demos/spellcheck.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.getElementById("status-title-text")?.textContent?.includes("ready"),
    { timeout: 10000 },
  );

  await page.fill("#draft", "asdfgh qwerty zzzzz");
  await page.waitForFunction(
    () => (document.getElementById("t-count")?.textContent || "0") !== "0",
    { timeout: 5000 },
  );
  const chipsHtml = await page.locator("#suggestions-out").innerHTML();
  assertContains(chipsHtml, "asdfgh", "gibberish word should be flagged");
  // The "no plausible alternative" chips render `?` in place of the suggestion.
  assertContains(chipsHtml, "no-alts", "chip should have no-alts class");
  assertContains(chipsHtml, ">?<", "no-alt chip should render ?");

  capture.assertClean();
});

// ─── build badge: every page advertises the build it was served from ──

test("build-badge: every demo page mounts the version badge", async ({ page, base }) => {
  const capture = withErrorCapture(page);
  for (const path of ["/", "/demos/autofill.html", "/demos/paste.html", "/demos/formula.html"]) {
    await page.goto(base + path, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#dhamaka-build-badge", { timeout: 2000 });
    const text = (await page.locator("#dhamaka-build-badge").textContent())?.trim() ?? "";
    assertContains(text, "build ", `badge should read 'build …' on ${path}, got ${JSON.stringify(text)}`);
    // The short SHA rendered in the badge must match build.json's shortCommit.
    const build = await page.evaluate(() => fetch("/build.json", { cache: "no-store" }).then((r) => r.json()));
    assertContains(text, build.shortCommit, `badge on ${path} should show shortCommit ${build.shortCommit}`);
  }
  capture.assertClean();
});

// ─── module-graph sanity: every demo loads without any page errors ─────

test("module-graph: every demo HTML loads without pageerror", async ({ page, base }) => {
  const capture = withErrorCapture(page);
  for (const demo of ["autofill", "paste", "formula", "spellcheck"]) {
    // Route the transformers CDN so the spellcheck demo's warm-up
    // doesn't try to fetch 60MB.
    await routeTransformers(page, {});
    await page.goto(`${base}/demos/${demo}.html`, { waitUntil: "domcontentloaded" });
    // Give each page a moment for top-level module evaluation to settle.
    await page.waitForTimeout(250);
  }
  capture.assertClean();
});

// ─── runner ───────────────────────────────────────────────────────────

async function main() {
  console.log(c.mag("\n  ═══ dhamaka e2e harness ═══\n"));

  await buildSite();

  const { server, url } = await startStaticServer(SITE);
  console.log(c.dim(`  static server → ${url}`));

  let playwright;
  try {
    playwright = await loadPlaywright();
  } catch (err) {
    server.close();
    console.error(c.red(`\n  ✗ ${err.message}\n`));
    process.exit(1);
  }

  const browser = await playwright.chromium.launch({ headless: !opts.headed });
  const context = await browser.newContext();

  const filtered = opts.only
    ? tests.filter((t) => t.name.toLowerCase().includes(opts.only.toLowerCase()))
    : tests;
  if (opts.only && !filtered.length) {
    console.error(c.red(`  no tests match --only=${opts.only}`));
    await browser.close();
    server.close();
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const t0 = Date.now();
  for (const { name, fn } of filtered) {
    const page = await context.newPage();
    const ts = Date.now();
    try {
      await fn({ page, base: url });
      const ms = Date.now() - ts;
      console.log(`  ${c.grn("✓")} ${name} ${c.dim(`(${ms} ms)`)}`);
      passed++;
    } catch (err) {
      const ms = Date.now() - ts;
      console.log(`  ${c.red("✗")} ${name} ${c.dim(`(${ms} ms)`)}`);
      console.log(c.red(`      ${err.stack || err.message}`));
      failed++;
    } finally {
      await page.close();
    }
  }

  const totalMs = Date.now() - t0;
  console.log("");
  const summary = `  ${passed} passed, ${failed} failed (${totalMs} ms)`;
  console.log(failed ? c.red(summary) : c.grn(summary));

  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(c.red(`\n  ✗ harness crashed: ${err.stack || err.message}\n`));
  process.exit(1);
});
