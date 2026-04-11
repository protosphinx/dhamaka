//! # dhamaka-runtime
//!
//! The Dhamaka inference runtime, written in Rust and compiled to WebAssembly.
//!
//! ## Why Rust
//!
//! Transformer inference is a lot of hot f32 math — matmul, RMSNorm, softmax,
//! rotary embeddings, residual adds — repeated once per generated token.
//! JavaScript can do this, but Rust compiled to WebAssembly runs it at
//! roughly native speed, inside any modern browser tab, with zero runtime
//! dependencies. That's the entire point of Dhamaka.
//!
//! ## What's in here
//!
//! - [`tensor`] — matmul, RMSNorm, softmax, rotary, SiLU, residual
//! - [`sampler`] — temperature + top-k + top-p + greedy
//! - [`transformer`] — a minimal forward-pass kernel using the primitives
//! - [`model`] — a tiny tied-weights model that the ABI drives end-to-end
//! - [`rng`] — deterministic xorshift RNG, seeded from the prompt
//! - [`abi`] — the `#[no_mangle] extern "C"` surface exposed to WebAssembly
//!
//! ## ABI (see `abi.rs` for the full list)
//!
//! ```text
//! dhamaka_version()              -> u32
//! dhamaka_alloc(len)             -> *mut u8
//! dhamaka_free(ptr, len)         -> void
//! dhamaka_init(w, wl, c, cl)     -> *mut Context
//! dhamaka_destroy(ctx)           -> void
//! dhamaka_feed_prompt(ctx, p, l) -> void
//! dhamaka_next_token(ctx, o, ol) -> i32   (bytes written, or -1 on EOS)
//! dhamaka_reset(ctx)             -> void
//! ```
//!
//! JS calls `dhamaka_alloc` to get a pointer into wasm linear memory, writes
//! the prompt bytes there, hands the pointer to `dhamaka_feed_prompt`, and
//! then loops on `dhamaka_next_token` to stream UTF-8 token bytes back.

pub mod abi;
pub mod model;
pub mod rng;
pub mod sampler;
pub mod tensor;
pub mod transformer;

/// The ABI version this build of the runtime speaks.
pub const ABI_VERSION: u32 = 1;
