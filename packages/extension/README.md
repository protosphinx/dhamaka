# @locus/extension

The Locus browser extension. Ships the cross-site model cache as a native browser extension, which sidesteps third-party storage partitioning entirely.

## Why

Modern browsers partition third-party iframe storage by top-level site. That means the shared-hub iframe trick degrades to per-site caching in strict modes. A browser extension doesn't have this problem: its origin (`chrome-extension://…`) is the same everywhere it's installed, so an IndexedDB stored there is genuinely shared across every tab.

## Architecture

```
  ┌──────────────┐    postMessage     ┌────────────────┐    chrome.runtime   ┌────────────────┐
  │  page JS     │ ◀─────────────────▶ │ content.js     │ ◀────────────────▶ │ background.js  │
  │  (SDK)       │                     │ (bridge)       │                    │ (service       │
  │              │                     │                │                    │  worker)       │
  └──────────────┘                     └────────────────┘                    └────┬───────────┘
                                                                                  │
                                                                                  ▼
                                                                           ┌─────────────┐
                                                                           │ IndexedDB   │
                                                                           │ (extension  │
                                                                           │  origin)    │
                                                                           └─────────────┘
```

1. `content.js` injects a tiny marker (`window.__locus_extension__`) so the SDK can detect the extension is installed.
2. When `Locus.load()` runs, `HubClient._install()` sees the marker and switches to extension mode instead of injecting the hub iframe.
3. Messages flow page → content script → background worker. The worker handles storage in its own IndexedDB and responds with the cached bytes.
4. The SDK's `hub.mode()` reports `"extension"` so apps can display "shared across every site" confidently.

## Install (dev)

1. Open `chrome://extensions` in Chrome or Edge.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `packages/extension/`.
4. Visit any Locus-powered site — `Locus.hub.mode()` should now return `"extension"`.

## Status

This is the **phase-2 skeleton**. It covers:

- Manifest V3 background service worker
- Content script bridge on every origin
- IndexedDB storage + SHA-256 integrity verification
- `get` / `list` / `delete` / `ping` over the same protocol as the hub iframe
- A tiny options page that lists cached models and lets you evict them
- SDK auto-detection via the injected marker

Not yet covered:

- Signed manifest pinning
- Progress events during download (Chrome's message channel can't stream)
- Firefox port (Manifest V3 in Firefox is still shifting)
- An actual published listing on the Chrome Web Store
