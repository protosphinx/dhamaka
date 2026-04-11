#!/usr/bin/env bash
# Build the Dhamaka runtime crate to WebAssembly and stage the resulting
# .wasm into packages/hub/public/runtime/ so the dev server picks it up.
#
# Usage: ./build.sh [--check]

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TARGET="wasm32-unknown-unknown"
STAGE="$ROOT/packages/hub/public/runtime/dhamaka-runtime.wasm"

if ! command -v cargo >/dev/null; then
  echo "error: cargo not found. Install Rust via https://rustup.rs" >&2
  exit 1
fi

if ! rustup target list --installed 2>/dev/null | grep -q "^$TARGET$"; then
  echo "installing rust target $TARGET…"
  rustup target add "$TARGET"
fi

echo "› cargo build --release --target $TARGET"
cargo build --release --target "$TARGET" --manifest-path "$HERE/Cargo.toml"

SRC="$HERE/target/$TARGET/release/dhamaka_runtime.wasm"
if [ ! -f "$SRC" ]; then
  echo "error: expected wasm at $SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$STAGE")"
cp "$SRC" "$STAGE"
SIZE=$(stat -c %s "$STAGE" 2>/dev/null || stat -f %z "$STAGE")
echo "› staged $STAGE ($(($SIZE / 1024)) KB)"

if [ "${1:-}" = "--check" ]; then
  echo "› cargo test"
  cargo test --manifest-path "$HERE/Cargo.toml"
fi

echo "✓ done"
