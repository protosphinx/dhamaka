#!/usr/bin/env node
// Assemble the static Dhamaka demo site that GitHub Pages serves.
//
// The dev server normally serves the playground on :5173 and the hub on
// :5174, with sdk/ and runtime/ mounted from sibling package src dirs.
// For Pages we need a single static tree with everything flattened
// under one origin, so this script copies:
//
//   packages/playground/public/*        →  _site/
//   packages/sdk/src/                   →  _site/sdk/
//   packages/runtime/src/               →  _site/runtime/
//   packages/hub/public/runtime/*.wasm  →  _site/runtime/
//
// And rewrites the importmaps in every HTML page so `dhamaka` and
// `@dhamaka/runtime` resolve to the correct relative paths under a
// single origin (no more localhost:5174 / localhost:5173 split).
//
// Run this after `crates/dhamaka-runtime/build.sh` so the wasm is fresh.
// The Pages workflow runs both, in order, on every push to main.

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const SITE = join(__dirname, "_site");

const WASM_SRC = join(ROOT, "packages", "hub", "public", "runtime", "dhamaka-runtime.wasm");
const SDK_SRC = join(ROOT, "packages", "sdk", "src");
const RUNTIME_SRC = join(ROOT, "packages", "runtime", "src");
const PLAYGROUND_SRC = join(ROOT, "packages", "playground", "public");

const log = (msg) => process.stdout.write(`  ${msg}\n`);

async function main() {
  log(`\x1b[35m✦\x1b[0m building dhamaka demo site`);

  // 0. Sanity check: wasm must exist
  if (!existsSync(WASM_SRC)) {
    console.error(
      `\n  ✗ compiled wasm not found at ${WASM_SRC}` +
      `\n    run crates/dhamaka-runtime/build.sh first\n`,
    );
    process.exit(1);
  }

  // 1. Fresh output directory
  if (existsSync(SITE)) {
    await rm(SITE, { recursive: true, force: true });
  }
  await mkdir(SITE, { recursive: true });

  // 2. Copy the playground tree (index.html, chat.html, styles.css, demos/)
  await cp(PLAYGROUND_SRC, SITE, { recursive: true });
  log(`copied playground → ${relPath(SITE)}`);

  // 3. Copy the SDK src tree into _site/sdk/
  await cp(SDK_SRC, join(SITE, "sdk"), { recursive: true });
  log(`copied SDK → ${relPath(join(SITE, "sdk"))}`);

  // 4. Copy the runtime src tree into _site/runtime/
  await cp(RUNTIME_SRC, join(SITE, "runtime"), { recursive: true });
  log(`copied runtime → ${relPath(join(SITE, "runtime"))}`);

  // 5. Copy the compiled wasm into _site/runtime/ so WasmEngine's default
  //    URL (/runtime/dhamaka-runtime.wasm) resolves correctly
  await cp(WASM_SRC, join(SITE, "runtime", "dhamaka-runtime.wasm"));
  log(`copied wasm → ${relPath(join(SITE, "runtime", "dhamaka-runtime.wasm"))}`);

  // 6. Copy the animated banner from docs/banner.svg so the README
  //    reference and the site can share the same asset
  const banner = join(ROOT, "docs", "banner.svg");
  if (existsSync(banner)) {
    await mkdir(join(SITE, "docs"), { recursive: true });
    await cp(banner, join(SITE, "docs", "banner.svg"));
    log(`copied banner → ${relPath(join(SITE, "docs", "banner.svg"))}`);
  }

  // 7. Drop a .nojekyll file so GitHub Pages doesn't try to process
  //    files starting with underscores as Jekyll templates
  await writeFile(join(SITE, ".nojekyll"), "");

  // 8. Rewrite importmaps in every HTML page. The dev server's importmap
  //    points at dev mount paths; the Pages site uses the same paths (we
  //    matched the layout in step 3-5), so the importmaps should already
  //    be correct — but we sanity-check and rewrite absolute `/sdk/…`
  //    and `/runtime/…` to relative paths that survive being served from
  //    a subdirectory like protosphinx.github.io/dhamaka/.
  //
  //    We also append a cache-busting ?v=<short commit SHA> query string
  //    to every /sdk/ and /runtime/ URL. GitHub Pages serves static files
  //    with Cache-Control: max-age=600, which means the browser will
  //    happily pair brand-new HTML with 10-minute-stale JS after every
  //    deploy — exactly the failure mode we hit on the previous commit.
  //    A per-deploy query string forces the browser to treat each build
  //    as a distinct resource, so cache can never serve last-commit's
  //    factory.js against this-commit's spellcheck.html.
  const fullSha =
    process.env.GITHUB_SHA ||
    (await readGitHeadSha()) ||
    String(Date.now());
  const shortSha = fullSha.slice(0, 7);

  const htmlFiles = await collect(SITE, ".html");
  for (const file of htmlFiles) {
    const depth = relDepth(file, SITE);
    const prefix = depth === 0 ? "./" : "../".repeat(depth);
    let content = await readFile(file, "utf8");
    const before = content;

    // Rewrite absolute-path imports in the importmap to subdir-safe relative
    // paths + a cache-busting query string.
    content = content.replace(
      /"\/sdk\/([^"]+)"/g,
      `"${prefix}sdk/$1?v=${shortSha}"`,
    );
    content = content.replace(
      /"\/runtime\/([^"]+)"/g,
      `"${prefix}runtime/$1?v=${shortSha}"`,
    );

    // Cache-bust the build-badge script tag too. The badge exists
    // specifically so stale HTML is visible, so it would be ironic to
    // let the badge itself get served from cache across deploys.
    content = content.replace(
      /src="(\.\.?\/)build-badge\.js"/g,
      `src="$1build-badge.js?v=${shortSha}"`,
    );

    if (content !== before) {
      await writeFile(file, content);
    }
  }
  log(`rewrote importmaps in ${htmlFiles.length} html files (cache-bust v=${shortSha})`);

  // 8b. Cache-bust the relative imports INSIDE the SDK and runtime JS files
  //     themselves. The importmap rewrite above only cache-busts the module
  //     entry points the browser loads via importmap ("dhamaka" →
  //     ./sdk/index.js?v=SHA). But once that module is fetched, its own
  //     `import "./foo.js"` statements resolve to `./foo.js` WITHOUT a
  //     query string — and the browser happily serves those from cache
  //     across deploys, producing the "new index.js, old tasks.js"
  //     failure mode that was still breaking the spellcheck demo.
  //
  //     Fix: walk every .js file under _site/sdk/ and _site/runtime/ and
  //     rewrite every RELATIVE (./ or ../) .js import to append ?v=SHA.
  //     Bare specifiers ("@dhamaka/runtime", "dhamaka") are not touched
  //     because they resolve through the importmap, which we already
  //     cache-busted above.
  const jsFiles = [
    ...(await collect(join(SITE, "sdk"), ".js")),
    ...(await collect(join(SITE, "runtime"), ".js")),
  ];
  let rewroteImports = 0;
  const importRe = /(["'])(\.\.?\/[^"'?\s]+?\.js)(["'])/g;
  for (const file of jsFiles) {
    const content = await readFile(file, "utf8");
    const rewritten = content.replace(
      importRe,
      (_match, q1, path, q2) => `${q1}${path}?v=${shortSha}${q2}`,
    );
    if (rewritten !== content) {
      await writeFile(file, rewritten);
      rewroteImports++;
    }
  }
  log(`cache-bust: rewrote relative imports in ${rewroteImports} / ${jsFiles.length} js files`);

  // 9. Write a tiny deploy-marker so we can verify what landed where
  const marker = {
    builtAt: new Date().toISOString(),
    commit: fullSha,
    shortCommit: shortSha,
    runId: process.env.GITHUB_RUN_ID || null,
  };
  await writeFile(join(SITE, "build.json"), JSON.stringify(marker, null, 2));

  // 10. Summary
  const wasmStat = await stat(join(SITE, "runtime", "dhamaka-runtime.wasm"));
  log("");
  log(`\x1b[32m✓\x1b[0m site assembled at ${relPath(SITE)}`);
  log(`  wasm:  ${Math.round(wasmStat.size / 1024)} KB`);
  log(`  html:  ${htmlFiles.length} files`);
  log(`  run:   npx http-server ${SITE} -p 8080  (or similar)`);
}

// ─── helpers ──────────────────────────────────────────────────────

function relPath(p) {
  return p.replace(ROOT + "/", "");
}

function relDepth(file, root) {
  const rel = file.slice(root.length + 1);
  return rel.split("/").length - 1;
}

/**
 * Read the current HEAD commit SHA from the repo's .git dir without
 * shelling out to `git`. Handles both packed and loose refs.
 */
async function readGitHeadSha() {
  try {
    const gitDir = join(ROOT, ".git");
    const headPath = join(gitDir, "HEAD");
    const head = (await readFile(headPath, "utf8")).trim();
    if (head.startsWith("ref: ")) {
      const ref = head.slice(5).trim();
      // Try loose ref first (.git/refs/heads/main)
      try {
        return (await readFile(join(gitDir, ref), "utf8")).trim();
      } catch {}
      // Fall back to packed-refs
      try {
        const packed = await readFile(join(gitDir, "packed-refs"), "utf8");
        for (const line of packed.split("\n")) {
          if (line.endsWith(" " + ref)) return line.split(" ")[0].trim();
        }
      } catch {}
      return null;
    }
    // Detached HEAD: the file itself is the SHA.
    return /^[0-9a-f]{40}$/i.test(head) ? head : null;
  } catch {
    return null;
  }
}

async function collect(dir, ext) {
  const out = [];
  async function walk(d) {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        await walk(p);
      } else if (extname(e.name) === ext) {
        out.push(p);
      }
    }
  }
  await walk(dir);
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
