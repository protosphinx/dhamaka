// Build a flat static site from the playground + SDK + runtime sources.
//
// The dev server mounts /sdk → packages/sdk/src and /runtime → packages/runtime/src.
// This script copies everything into dist/ so any static host can serve it.

import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

// Clean
if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

// Playground public (index.html, demos, styles, etc.)
cpSync(resolve(ROOT, "packages/playground/public"), DIST, { recursive: true });

// SDK source → /sdk/
cpSync(resolve(ROOT, "packages/sdk/src"), resolve(DIST, "sdk"), { recursive: true });

// Runtime source → /runtime/
cpSync(resolve(ROOT, "packages/runtime/src"), resolve(DIST, "runtime"), { recursive: true });

// Hub runtime (the .wasm) → /hub-runtime/ (for demos that reference it)
cpSync(resolve(ROOT, "packages/hub/public/runtime"), resolve(DIST, "hub-runtime"), { recursive: true });

console.log("  ✦ Built static site → dist/");
