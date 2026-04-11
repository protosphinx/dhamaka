//! The C ABI Dhamaka exports to WebAssembly.
//!
//! JavaScript calls these functions directly by name via
//! `instance.exports.dhamaka_*`. All data crosses the JS/WASM boundary as
//! raw pointers into WASM linear memory, which JS writes and reads through
//! `Uint8Array(instance.exports.memory.buffer)`.
//!
//! Ownership rules:
//!
//! - `dhamaka_alloc(len)` gives JS a pointer it owns until it passes the
//!   buffer back to a consumer function or calls `dhamaka_free(ptr, len)`.
//! - `dhamaka_init` returns a `*mut Context`. That pointer is opaque to JS
//!   and is passed back into every subsequent call. JS must call
//!   `dhamaka_destroy` when done.
//! - Strings are UTF-8 byte slices with an explicit length. No NUL sentinels.

use crate::model::{detokenize, random_model, tokenize_prompt};
use crate::rng::{fnv1a64, Xorshift64};
use crate::sampler::{sample, SampleOptions};
use crate::transformer::{forward, ModelWeights, Scratch};
use crate::ABI_VERSION;

/// Everything a single inference session owns.
pub struct Context {
    model: ModelWeights,
    scratch: Scratch,
    rng: Xorshift64,
    tokens: Vec<usize>, // full token history (prompt + generated)
    pos: usize,         // position counter for RoPE
    opts: SampleOptions,
    max_tokens: usize,
    emitted: usize,
    eos: bool,
}

impl Context {
    fn new(seed: u64) -> Self {
        Self {
            model: random_model(seed),
            scratch: Scratch::new(),
            rng: Xorshift64::new(seed ^ 0xA5A5_A5A5_A5A5_A5A5),
            tokens: Vec::new(),
            pos: 0,
            opts: SampleOptions::default(),
            max_tokens: 256,
            emitted: 0,
            eos: false,
        }
    }
}

// ─── Memory management ─────────────────────────────────────────────────────

/// Allocate `len` bytes of WASM linear memory. The returned pointer is
/// aligned the same way `Vec<u8>` allocates.
#[no_mangle]
pub extern "C" fn dhamaka_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Free a buffer previously returned by `dhamaka_alloc`. `len` must match
/// the original allocation length.
#[no_mangle]
pub extern "C" fn dhamaka_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    unsafe {
        let _ = Vec::from_raw_parts(ptr, 0, len);
    }
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────

/// Return the ABI version this runtime speaks. JS uses this to refuse to
/// load mismatched builds.
#[no_mangle]
pub extern "C" fn dhamaka_version() -> u32 {
    ABI_VERSION
}

/// Build a fresh inference context.
///
/// For v0.1, `weights_ptr`/`weights_len` are ignored and the context uses a
/// deterministic random model seeded from the config bytes (or a fixed seed
/// if no config is provided). Real weight loading lands alongside the
/// quantized SmolLM2 artifacts.
#[no_mangle]
pub extern "C" fn dhamaka_init(
    _weights_ptr: *const u8,
    _weights_len: usize,
    config_ptr: *const u8,
    config_len: usize,
) -> *mut Context {
    let seed = if !config_ptr.is_null() && config_len > 0 {
        let bytes = unsafe { std::slice::from_raw_parts(config_ptr, config_len) };
        fnv1a64(bytes)
    } else {
        DEFAULT_SEED
    };
    let ctx = Box::new(Context::new(seed));
    Box::into_raw(ctx)
}

/// Destroy an inference context previously returned by `dhamaka_init`.
#[no_mangle]
pub extern "C" fn dhamaka_destroy(ctx: *mut Context) {
    if ctx.is_null() {
        return;
    }
    unsafe {
        drop(Box::from_raw(ctx));
    }
}

/// Reset an inference context's token history and KV cache without
/// destroying its model weights.
#[no_mangle]
pub extern "C" fn dhamaka_reset(ctx: *mut Context) {
    if ctx.is_null() {
        return;
    }
    let ctx = unsafe { &mut *ctx };
    ctx.tokens.clear();
    ctx.pos = 0;
    ctx.emitted = 0;
    ctx.eos = false;
    ctx.scratch.clear_cache();
}

// ─── Configuration ─────────────────────────────────────────────────────────

/// Configure sampling parameters. `temperature` ≤ 0 means greedy.
#[no_mangle]
pub extern "C" fn dhamaka_set_sampling(
    ctx: *mut Context,
    temperature: f32,
    top_k: u32,
    top_p: f32,
    max_tokens: u32,
) {
    if ctx.is_null() {
        return;
    }
    let ctx = unsafe { &mut *ctx };
    ctx.opts = SampleOptions {
        temperature,
        top_k: top_k.max(1) as usize,
        top_p: top_p.clamp(0.0, 1.0),
    };
    ctx.max_tokens = max_tokens.max(1) as usize;
}

// ─── Generation ────────────────────────────────────────────────────────────

/// Feed a prompt (UTF-8 bytes) into the context. Runs one forward pass per
/// prompt token to prime the model state.
#[no_mangle]
pub extern "C" fn dhamaka_feed_prompt(
    ctx: *mut Context,
    prompt_ptr: *const u8,
    prompt_len: usize,
) {
    if ctx.is_null() {
        return;
    }
    let ctx = unsafe { &mut *ctx };
    ctx.eos = false;
    ctx.emitted = 0;

    let bytes = if prompt_ptr.is_null() || prompt_len == 0 {
        &[][..]
    } else {
        unsafe { std::slice::from_raw_parts(prompt_ptr, prompt_len) }
    };

    // Seed the RNG from the prompt so each unique prompt has reproducible
    // sampling while different prompts feel different.
    ctx.rng = Xorshift64::new(fnv1a64(bytes).wrapping_mul(0x9E37_79B9_7F4A_7C15));

    let prompt = std::str::from_utf8(bytes).unwrap_or("");
    let tokens = tokenize_prompt(prompt);
    for &t in &tokens {
        forward(&ctx.model, t, ctx.pos, &mut ctx.scratch);
        ctx.pos += 1;
        ctx.tokens.push(t);
    }
}

/// Generate the next token and write its UTF-8 bytes into `out_ptr`. Returns
/// the number of bytes written, or `-1` when the stream is done (either EOS
/// or `max_tokens` has been hit).
#[no_mangle]
pub extern "C" fn dhamaka_next_token(
    ctx: *mut Context,
    out_ptr: *mut u8,
    out_cap: usize,
) -> i32 {
    if ctx.is_null() || out_ptr.is_null() || out_cap == 0 {
        return -1;
    }
    let ctx = unsafe { &mut *ctx };
    if ctx.eos || ctx.emitted >= ctx.max_tokens {
        return -1;
    }

    // Use the most-recent forward pass's logits (written by either
    // `dhamaka_feed_prompt` or the previous `dhamaka_next_token`) to sample
    // the next token.
    let mut logits = ctx.scratch.logits.clone();
    let next_id = sample(&mut logits, ctx.opts, &mut ctx.rng);

    // Feed the sampled token back through the model so next time's logits
    // reflect it.
    forward(&ctx.model, next_id, ctx.pos, &mut ctx.scratch);
    ctx.pos += 1;
    ctx.tokens.push(next_id);
    ctx.emitted += 1;

    // Detokenize and copy out.
    let piece = detokenize(next_id).as_bytes();
    let n = piece.len().min(out_cap);
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, n) };
    out.copy_from_slice(&piece[..n]);
    n as i32
}

/// Default RNG seed used when `dhamaka_init` is called with no config bytes.
const DEFAULT_SEED: u64 = 0x0D4A_D4AD_4AD4_AD4A;
