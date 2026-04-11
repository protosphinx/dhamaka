import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

// These tests don't pull in a full JSON Schema validator to stay dependency-
// free. They exercise the structural invariants we actually rely on at runtime.

async function loadJson(relPath) {
  const buf = await readFile(join(ROOT, relPath));
  return JSON.parse(buf.toString("utf8"));
}

const HEX64 = /^[0-9a-fA-F]{64}$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;

test("canonical manifest parses", async () => {
  const manifest = await loadJson("models/manifest.json");
  assert.equal(manifest.version, 1);
  assert.ok(Array.isArray(manifest.models));
  assert.ok(manifest.models.length > 0);
});

test("every model has a valid id and required fields", async () => {
  const manifest = await loadJson("models/manifest.json");
  for (const model of manifest.models) {
    assert.match(model.id, ID, `bad id: ${model.id}`);
    assert.ok(model.name, `${model.id}: missing name`);
    assert.ok(model.artifacts, `${model.id}: missing artifacts`);
    assert.ok(model.artifacts.weights, `${model.id}: missing weights artifact`);
  }
});

test("every artifact has url + sha256 in the right format", async () => {
  const manifest = await loadJson("models/manifest.json");
  for (const model of manifest.models) {
    for (const [name, artifact] of Object.entries(model.artifacts)) {
      assert.ok(artifact.url, `${model.id}/${name}: missing url`);
      assert.ok(artifact.sha256, `${model.id}/${name}: missing sha256`);
      assert.match(
        artifact.sha256,
        HEX64,
        `${model.id}/${name}: sha256 not 64 hex chars`,
      );
    }
  }
});

test("default model exists in the models list", async () => {
  const manifest = await loadJson("models/manifest.json");
  const def = manifest.default;
  assert.ok(def, "manifest.default is unset");
  const found = manifest.models.find((m) => m.id === def);
  assert.ok(found, `manifest.default=${def} not found in models`);
});

test("hub's served manifest mirrors the canonical model shape", async () => {
  const hub = await loadJson("packages/hub/public/manifest.json");
  assert.equal(hub.version, 1);
  assert.ok(hub.models.length > 0);
  for (const model of hub.models) {
    assert.match(model.id, ID);
    assert.ok(model.artifacts?.weights);
  }
});
