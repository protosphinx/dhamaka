// A zero-dependency dev server for the Locus stack.
//
// Starts two static file servers on two ports so the iframe + postMessage
// bridge can be exercised across origins during local development:
//
//   http://localhost:5174   →   the hub          (packages/hub/public)
//   http://localhost:5173   →   the playground   (packages/playground/public)
//
// The playground also serves the SDK and runtime sources directly so you can
// hack on them without any build step. Just run `npm run dev` and open
// http://localhost:5173.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function contentType(path) {
  return MIME[extname(path)] ?? "application/octet-stream";
}

/**
 * Build a static-file handler rooted at `base`, with optional extra
 * path-prefix mounts so we can expose sibling packages (sdk, runtime) through
 * a single origin without copying files.
 */
function staticHandler({ label, base, mounts = {} }) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/index.html";

      let filePath = null;
      for (const [prefix, target] of Object.entries(mounts)) {
        if (pathname === prefix || pathname.startsWith(prefix + "/")) {
          const rest = pathname.slice(prefix.length) || "/index.html";
          filePath = normalize(join(target, rest));
          if (!filePath.startsWith(target)) {
            return send(res, 403, "forbidden");
          }
          break;
        }
      }
      if (!filePath) {
        filePath = normalize(join(base, pathname));
        if (!filePath.startsWith(base)) return send(res, 403, "forbidden");
      }

      if (existsSync(filePath)) {
        const s = await stat(filePath);
        if (s.isDirectory()) filePath = join(filePath, "index.html");
      }

      const data = await readFile(filePath);
      res.writeHead(200, {
        "content-type": contentType(filePath),
        "cache-control": "no-store",
        // Allow the hub iframe to be embedded by the playground origin.
        "cross-origin-resource-policy": "cross-origin",
        // Allow cross-origin fetches (the SDK on :5173 pulls the .wasm
        // runtime from the hub origin on :5174). Without this,
        // WebAssembly.instantiateStreaming refuses to run the module.
        "access-control-allow-origin": "*",
      });
      res.end(data);
      log(label, req.method, pathname, 200);
    } catch (err) {
      if (err && err.code === "ENOENT") {
        send(res, 404, "not found");
        log(label, req.method, req.url, 404);
      } else {
        send(res, 500, String(err?.message || err));
        log(label, req.method, req.url, 500);
      }
    }
  };
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function log(label, method, url, status) {
  const color = status >= 500 ? "\x1b[31m" : status >= 400 ? "\x1b[33m" : "\x1b[32m";
  const reset = "\x1b[0m";
  process.stdout.write(`  ${color}${status}${reset} ${label.padEnd(10)} ${method} ${url}\n`);
}

// ─── Mounts ────────────────────────────────────────────────────────────────

const HUB_ROOT = join(ROOT, "packages", "hub", "public");
const PLAYGROUND_ROOT = join(ROOT, "packages", "playground", "public");
const SDK_SRC = join(ROOT, "packages", "sdk", "src");
const RUNTIME_SRC = join(ROOT, "packages", "runtime", "src");

const hubServer = createServer(
  staticHandler({ label: "hub", base: HUB_ROOT }),
);

const playgroundServer = createServer(
  staticHandler({
    label: "playground",
    base: PLAYGROUND_ROOT,
    mounts: {
      "/sdk": SDK_SRC,
      "/runtime": RUNTIME_SRC,
    },
  }),
);

const HUB_PORT = Number(process.env.LOCUS_HUB_PORT ?? 5174);
const PLAYGROUND_PORT = Number(process.env.LOCUS_PLAYGROUND_PORT ?? 5173);

hubServer.listen(HUB_PORT, () => {
  process.stdout.write(
    `\n  \x1b[35m✦\x1b[0m hub         http://localhost:${HUB_PORT}\n`,
  );
});
playgroundServer.listen(PLAYGROUND_PORT, () => {
  process.stdout.write(
    `  \x1b[36m✦\x1b[0m playground  http://localhost:${PLAYGROUND_PORT}\n\n`,
  );
  process.stdout.write(
    "  \x1b[2mLocus dev stack running. Ctrl+C to stop.\x1b[0m\n\n",
  );
});

process.on("SIGINT", () => {
  process.stdout.write("\n  \x1b[2mshutting down…\x1b[0m\n");
  hubServer.close();
  playgroundServer.close();
  process.exit(0);
});
