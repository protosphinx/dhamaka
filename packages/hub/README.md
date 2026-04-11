# @dhamaka/hub

The tiny static origin that makes "download once" possible.

The hub is a single HTML page plus a single JS file. It's meant to live at
`https://hub.dhamaka.dev` (or any single origin you control). Consumer sites
inject it as a hidden iframe and talk to it over `postMessage`. Because the
iframe is always loaded from the same origin, its IndexedDB store is shared
across every Dhamaka-powered site the user visits — which is the whole point.

## Message protocol

All messages are plain objects with a `type` starting with `dhamaka:`.

### From parent → hub

| type              | fields                                | description                           |
|-------------------|---------------------------------------|---------------------------------------|
| `dhamaka:ping`    | `requestId`                           | health check                          |
| `dhamaka:get`     | `requestId`, `id`, `manifestUrl?`     | get a model, downloading if missing   |
| `dhamaka:list`    | `requestId`                           | list locally cached models            |
| `dhamaka:delete`  | `requestId`, `id`                     | evict a model from local storage      |

### From hub → parent

| type                 | fields                                                  |
|----------------------|---------------------------------------------------------|
| `dhamaka:ready`      | `version`, `origin`                                     |
| `dhamaka:progress`   | `requestId`, `stage`, `artifact`, `received`, `total`   |
| `dhamaka:response`   | `requestId`, plus result-specific fields                |
| `dhamaka:error`      | `requestId`, `error`                                    |

Model bytes are transferred as `ArrayBuffer`s using `postMessage` transferables,
so parent ↔ hub hand-off is zero-copy.

## Storage partitioning (the honest caveat)

Modern browsers partition third-party iframe storage by the top-level site
they're embedded in. That means the "shared IndexedDB" trick is weakening. The
hub handles this by degrading gracefully:

1. **First try** – cross-site shared storage via the hub iframe. Works on
   browsers without full partitioning, same-site subdomains, and any origin
   that has been granted unpartitioned access via the
   [Storage Access API](https://developer.mozilla.org/docs/Web/API/Storage_Access_API).
2. **Fallback** – per-origin IndexedDB in the consumer site. Still works,
   still private, still offline — just not shared across sites.
3. **Phase 2** – an optional Dhamaka browser extension, which sidesteps
   partitioning entirely and can serve every site on the user's machine from
   a single local model cache.

The SDK exposes `Dhamaka.storage()` so an app can report to the user whether
they got a shared-cache hit or a site-local one.
