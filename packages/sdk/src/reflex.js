// The reflex service.
//
// A module-level singleton that holds the "resident" inference engine for
// the page and routes all task calls through it. The first SmartField that
// needs a model kicks off the load; subsequent calls reuse the same warm
// engine with no cold start.
//
// v0.1 scope: a plain module singleton. v0.2 upgrades this to a
// SharedWorker so every tab on the same origin shares one engine instance.
// The public API is deliberately the same either way, so the upgrade is
// drop-in for consumers.

import { createEngine } from "@locus/runtime";
import { runTask } from "./tasks.js";

let _state = {
  engine: null,
  loading: null,
  options: null,
  loaded: false,
};

/**
 * Configure the reflex service. Safe to call multiple times — each call
 * overrides the config for the next `ensure()` invocation.
 *
 * @param {object} options
 * @param {"auto"|"mock"|"wasm"|"window-ai"} [options.backend]
 * @param {string} [options.wasmUrl]
 * @param {string} [options.systemPrompt]
 * @param {object} [options.entry]    Model manifest entry hint
 */
export function configure(options = {}) {
  _state.options = options;
}

/**
 * Lazily instantiate and load the engine. Subsequent calls return the same
 * promise (so concurrent SmartFields on a page share one load).
 */
export function ensure() {
  if (_state.loaded) return Promise.resolve(_state.engine);
  if (_state.loading) return _state.loading;

  _state.loading = (async () => {
    const engine = createEngine(_state.options ?? {});
    try {
      await engine.load({ entry: _state.options?.entry ?? null });
      _state.engine = engine;
      _state.loaded = true;
      return engine;
    } catch (err) {
      _state.loading = null;
      throw err;
    }
  })();

  return _state.loading;
}

/**
 * Run a task against the resident engine.
 *
 * If `eager` is true we await the engine and always run through the full
 * task pipeline (fast → slow). If false (default) we run the rules-only
 * fast path synchronously and only defer to the model when the fast path
 * is uncertain *and* the engine is already warm.
 *
 * @param {string} taskId
 * @param {string} input
 * @param {object} [options]
 * @param {boolean} [options.eager=false]
 * @param {number} [options.threshold=0.8]
 * @param {object} [options.context]
 */
export async function run(taskId, input, options = {}) {
  const eager = options.eager ?? false;
  const threshold = options.threshold ?? 0.8;

  if (eager) {
    const engine = await ensure();
    return runTask(taskId, input, { ...options, engine, threshold });
  }

  // Non-eager path: rules-only unless the engine is already loaded.
  const engine = _state.loaded ? _state.engine : null;
  return runTask(taskId, input, { ...options, engine, threshold });
}

/** For tests and demos that want to reach past the singleton. */
export function __reset() {
  _state = { engine: null, loading: null, options: null, loaded: false };
}

/** Inspect the current reflex state (for telemetry + debugging). */
export function info() {
  return {
    loaded: _state.loaded,
    loading: !!_state.loading && !_state.loaded,
    backend: _state.engine?.info?.()?.backend ?? null,
    options: _state.options ?? null,
  };
}

export const reflex = { configure, ensure, run, info, __reset };
