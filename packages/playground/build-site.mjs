#!/usr/bin/env node
// Build a flat static site for GitHub Pages.
//
// The dev server mounts /sdk → packages/sdk/src and /runtime → packages/runtime/src.
// This script copies everything into packages/playground/_site so any static host
// (including GitHub Pages) can serve it without path rewriting.

import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const SITE = resolve(__dirname, "_site");

// Clean
if (existsSync(SITE)) rmSync(SITE, { recursive: true });
mkdirSync(SITE, { recursive: true });

// Playground public (index.html, demos, styles, etc.)
cpSync(resolve(ROOT, "packages/playground/public"), SITE, { recursive: true });

// SDK source → /sdk/
cpSync(resolve(ROOT, "packages/sdk/src"), resolve(SITE, "sdk"), { recursive: true });

// Runtime source → /runtime/
cpSync(resolve(ROOT, "packages/runtime/src"), resolve(SITE, "runtime"), { recursive: true });

// WASM runtime binary → /runtime/ (so WasmEngine can find it)
const wasmSrc = resolve(ROOT, "packages/hub/public/runtime/dhamaka-runtime.wasm");
if (existsSync(wasmSrc)) {
  cpSync(wasmSrc, resolve(SITE, "runtime/dhamaka-runtime.wasm"));
}

// Disable Jekyll processing (GitHub Pages default)
writeFileSync(resolve(SITE, ".nojekyll"), "");

console.log("  ✦ Built static site → packages/playground/_site/");
