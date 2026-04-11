#!/usr/bin/env node
// Stage the `locus` npm package.
//
// The SDK imports `@locus/runtime` during development via npm workspaces.
// When we publish to npm we don't want consumers to have to install two
// packages, and we don't want to fight the `@locus` scope, so this script
// bundles the runtime source + the compiled wasm into the SDK package as
// a vendored subtree and rewrites the one `@locus/runtime` import.
//
// Output: packages/sdk/_staging/, a fully self-contained npm package.
//
// Usage:
//   node scripts/prepare-publish.mjs           # build + stage
//   node scripts/prepare-publish.mjs --check   # also run the test suite
//
// The release workflow runs this and then `npm publish ./packages/sdk/_staging`.
// For a manual release, do the same thing locally with your npm credentials.

import { readFile, writeFile, mkdir, rm, cp, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SDK_SRC = join(ROOT, "packages", "sdk");
const RUNTIME_SRC = join(ROOT, "packages", "runtime", "src");
const WASM_SRC = join(ROOT, "packages", "hub", "public", "runtime", "locus-runtime.wasm");
const STAGING = join(SDK_SRC, "_staging");

const check = process.argv.includes("--check");

async function main() {
  console.log("› preparing locus publish staging");

  // 0. Sanity check: wasm must exist.
  if (!existsSync(WASM_SRC)) {
    console.error(
      `\n  ✗ compiled wasm not found at ${WASM_SRC}\n    run crates/locus-runtime/build.sh first\n`,
    );
    process.exit(1);
  }

  // 1. Wipe any previous staging output.
  if (existsSync(STAGING)) {
    await rm(STAGING, { recursive: true, force: true });
  }
  await mkdir(STAGING, { recursive: true });

  // 2. Copy the SDK src/ tree into staging/src/.
  await cp(join(SDK_SRC, "src"), join(STAGING, "src"), { recursive: true });

  // 3. Vendor the runtime adapter into staging/src/_runtime/.
  await cp(RUNTIME_SRC, join(STAGING, "src", "_runtime"), { recursive: true });

  // 4. Copy the compiled wasm next to the runtime adapter.
  await cp(
    WASM_SRC,
    join(STAGING, "src", "_runtime", "locus-runtime.wasm"),
  );

  // 5. Rewrite the one `@locus/runtime` import in the SDK entry point.
  const indexPath = join(STAGING, "src", "index.js");
  let index = await readFile(indexPath, "utf8");
  const before = index;
  index = index.replaceAll(
    'from "@locus/runtime"',
    'from "./_runtime/index.js"',
  );
  index = index.replaceAll(
    "from '@locus/runtime'",
    "from './_runtime/index.js'",
  );
  if (index === before) {
    console.warn(
      "  ! no @locus/runtime import found to rewrite — " +
        "make sure packages/sdk/src/index.js still imports the runtime",
    );
  }
  await writeFile(indexPath, index);

  // 6. Rewrite the default wasm URL in the vendored WasmEngine so it points
  //    at the bundled .wasm sitting next to it (instead of the hub's
  //    /runtime/ path the browser normally uses).
  const wasmEnginePath = join(STAGING, "src", "_runtime", "wasm-engine.js");
  let wasmEngine = await readFile(wasmEnginePath, "utf8");
  wasmEngine = wasmEngine.replace(
    'const DEFAULT_WASM_URL = "/runtime/locus-runtime.wasm";',
    'const DEFAULT_WASM_URL = new URL("./locus-runtime.wasm", import.meta.url).href;',
  );
  await writeFile(wasmEnginePath, wasmEngine);

  // 7. Write a standalone package.json. No workspace refs, no devDeps.
  const sdkPkg = JSON.parse(
    await readFile(join(SDK_SRC, "package.json"), "utf8"),
  );
  const rootPkg = JSON.parse(
    await readFile(join(ROOT, "package.json"), "utf8"),
  );

  const publishedPkg = {
    name: sdkPkg.name,
    version: sdkPkg.version,
    description: sdkPkg.description,
    type: "module",
    main: "src/index.js",
    module: "src/index.js",
    exports: {
      ".": "./src/index.js",
      "./hub-client": "./src/hub-client.js",
      "./chat": "./src/chat.js",
      "./openai": "./src/openai-shim.js",
    },
    files: ["src", "README.md", "LICENSE", "CHANGELOG.md"],
    keywords: [
      "llm",
      "wasm",
      "webassembly",
      "rust",
      "browser",
      "ai",
      "on-device",
      "local-first",
      "privacy",
      "transformer",
    ],
    author: "protosphinx",
    license: rootPkg.license || "MIT",
    repository: rootPkg.repository,
    bugs: {
      url: "https://github.com/protosphinx/locus/issues",
    },
    homepage: "https://github.com/protosphinx/locus#readme",
    engines: {
      node: ">=18",
    },
    // Deliberately no `dependencies` — the runtime is vendored above.
  };
  await writeFile(
    join(STAGING, "package.json"),
    JSON.stringify(publishedPkg, null, 2) + "\n",
  );

  // 8. Copy README, LICENSE, CHANGELOG so the published package has them.
  const maybeCopy = async (src, dest) => {
    if (existsSync(src)) await cp(src, dest);
  };
  await maybeCopy(join(ROOT, "README.md"), join(STAGING, "README.md"));
  await maybeCopy(join(ROOT, "LICENSE"), join(STAGING, "LICENSE"));
  await maybeCopy(join(ROOT, "CHANGELOG.md"), join(STAGING, "CHANGELOG.md"));

  // 9. Sanity check: the staged package must pass a basic import smoke test.
  const probe = `
    import { Locus, Chat, HubClient } from "${join(STAGING, "src", "index.js")}";
    if (typeof Locus !== "function") process.exit(1);
    if (typeof Chat !== "function") process.exit(1);
    if (typeof HubClient !== "function") process.exit(1);
    console.log("✓ staged package imports cleanly");
  `;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error("  ✗ staged package failed smoke import");
    process.exit(1);
  }

  // 10. Optional: also run the full test suite.
  if (check) {
    console.log("\n› running full test suite");
    const tr = spawnSync("npm", ["test"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
    });
    if (tr.status !== 0) {
      console.error("  ✗ tests failed");
      process.exit(1);
    }
  }

  // 11. Report.
  const wasmStat = await stat(
    join(STAGING, "src", "_runtime", "locus-runtime.wasm"),
  );
  console.log(`
  ✓ staged at ${STAGING}
    package:  ${publishedPkg.name}@${publishedPkg.version}
    runtime:  ${Math.round(wasmStat.size / 1024)} KB wasm bundled

  publish it with:
    npm publish ${STAGING} --access public
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
