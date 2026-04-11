//! A minimal transformer forward-pass kernel built out of the primitives in
//! [`crate::tensor`]. This is deliberately small — single head, no KV cache,
//! no flash attention, no grouped-query attention. It's the "hello world"
//! of transformer inference, not a state-of-the-art one.
//!
//! The goal for v0.1 is to prove that real f32 math runs end-to-end inside
//! WebAssembly compiled from Rust. Phase-2 work replaces this kernel with a
//! faster, batched, KV-cached version that matches what real models need.

use crate::tensor::{add_inplace, matmul, mul_inplace, rmsnorm, rope_apply, silu, softmax};

/// Fixed architectural constants for the tiny v0.1 model.
pub const HIDDEN: usize = 32;
pub const FFN_HIDDEN: usize = 64;
pub const VOCAB: usize = 64;
pub const N_LAYERS: usize = 2;
pub const N_HEADS: usize = 1;
pub const HEAD_DIM: usize = HIDDEN / N_HEADS;
pub const ROPE_BASE: f32 = 10000.0;
pub const RMS_EPS: f32 = 1e-5;
/// Maximum supported context length. Controls KV cache allocation.
pub const MAX_CTX: usize = 512;

/// A single transformer block's weights.
#[derive(Debug, Clone)]
pub struct LayerWeights {
    pub attn_norm: Vec<f32>, // [HIDDEN]
    pub wq: Vec<f32>,        // [HIDDEN, HIDDEN]
    pub wk: Vec<f32>,        // [HIDDEN, HIDDEN]
    pub wv: Vec<f32>,        // [HIDDEN, HIDDEN]
    pub wo: Vec<f32>,        // [HIDDEN, HIDDEN]
    pub ffn_norm: Vec<f32>,  // [HIDDEN]
    pub w_gate: Vec<f32>,    // [HIDDEN, FFN_HIDDEN]
    pub w_up: Vec<f32>,      // [HIDDEN, FFN_HIDDEN]
    pub w_down: Vec<f32>,    // [FFN_HIDDEN, HIDDEN]
}

/// Whole-model weights.
#[derive(Debug, Clone)]
pub struct ModelWeights {
    pub token_embedding: Vec<f32>, // [VOCAB, HIDDEN]
    pub layers: Vec<LayerWeights>,
    pub final_norm: Vec<f32>,      // [HIDDEN]
    pub lm_head: Vec<f32>,         // [HIDDEN, VOCAB]
}

/// Scratch buffers reused across forward passes to avoid per-token allocation.
/// Includes a KV cache so self-attention covers every prior token position
/// instead of collapsing to a single-element softmax.
pub struct Scratch {
    pub x: Vec<f32>,          // [HIDDEN]
    pub x_norm: Vec<f32>,     // [HIDDEN]
    pub q: Vec<f32>,          // [HIDDEN]
    pub k: Vec<f32>,          // [HIDDEN]
    pub v: Vec<f32>,          // [HIDDEN]
    pub attn_out: Vec<f32>,   // [HIDDEN]
    pub attn_scores: Vec<f32>,// [MAX_CTX]
    pub ffn_gate: Vec<f32>,   // [FFN_HIDDEN]
    pub ffn_up: Vec<f32>,     // [FFN_HIDDEN]
    pub ffn_out: Vec<f32>,    // [HIDDEN]
    pub proj: Vec<f32>,       // [HIDDEN]
    pub logits: Vec<f32>,     // [VOCAB]
    /// K and V cache per layer: `k_cache[layer]` is `[MAX_CTX * HIDDEN]`.
    pub k_cache: Vec<Vec<f32>>,
    pub v_cache: Vec<Vec<f32>>,
}

impl Scratch {
    pub fn new() -> Self {
        Self {
            x: vec![0.0; HIDDEN],
            x_norm: vec![0.0; HIDDEN],
            q: vec![0.0; HIDDEN],
            k: vec![0.0; HIDDEN],
            v: vec![0.0; HIDDEN],
            attn_out: vec![0.0; HIDDEN],
            attn_scores: vec![0.0; MAX_CTX],
            ffn_gate: vec![0.0; FFN_HIDDEN],
            ffn_up: vec![0.0; FFN_HIDDEN],
            ffn_out: vec![0.0; HIDDEN],
            proj: vec![0.0; HIDDEN],
            logits: vec![0.0; VOCAB],
            k_cache: (0..N_LAYERS).map(|_| vec![0.0; MAX_CTX * HIDDEN]).collect(),
            v_cache: (0..N_LAYERS).map(|_| vec![0.0; MAX_CTX * HIDDEN]).collect(),
        }
    }

    /// Zero out the KV cache. Called on reset.
    pub fn clear_cache(&mut self) {
        for cache in self.k_cache.iter_mut() {
            for v in cache.iter_mut() {
                *v = 0.0;
            }
        }
        for cache in self.v_cache.iter_mut() {
            for v in cache.iter_mut() {
                *v = 0.0;
            }
        }
    }
}

impl Default for Scratch {
    fn default() -> Self {
        Self::new()
    }
}

/// Single-token forward pass with a KV cache. `pos` is the absolute token
/// position (used for rotary embeddings and cache offsets). Writes final
/// logits into `scratch.logits`. Panics if `pos >= MAX_CTX`.
///
/// This is O(HIDDEN² · N_LAYERS + HIDDEN · pos · N_LAYERS) per token. For
/// (HIDDEN=32, LAYERS=2, MAX_CTX=512) it's comfortably real-time in pure
/// scalar WebAssembly compiled from Rust.
pub fn forward(model: &ModelWeights, token_id: usize, pos: usize, scratch: &mut Scratch) {
    assert!(pos < MAX_CTX, "forward: pos {} exceeds MAX_CTX {}", pos, MAX_CTX);

    // Token embedding lookup: x = token_embedding[token_id]
    let start = token_id * HIDDEN;
    let end = start + HIDDEN;
    scratch.x.copy_from_slice(&model.token_embedding[start..end]);

    let inv_sqrt = 1.0 / (HEAD_DIM as f32).sqrt();

    for (layer_idx, layer) in model.layers.iter().enumerate() {
        // ---- Attention ----
        rmsnorm(&scratch.x, &layer.attn_norm, &mut scratch.x_norm, RMS_EPS);

        // Q, K, V projections.
        matmul(&scratch.x_norm, &layer.wq, &mut scratch.q, 1, HIDDEN, HIDDEN);
        matmul(&scratch.x_norm, &layer.wk, &mut scratch.k, 1, HIDDEN, HIDDEN);
        matmul(&scratch.x_norm, &layer.wv, &mut scratch.v, 1, HIDDEN, HIDDEN);

        // Rotary position embeddings on Q and K (not V).
        rope_apply(&mut scratch.q, pos, ROPE_BASE);
        rope_apply(&mut scratch.k, pos, ROPE_BASE);

        // Write this step's K and V into the cache at `pos`.
        let offset = pos * HIDDEN;
        scratch.k_cache[layer_idx][offset..offset + HIDDEN]
            .copy_from_slice(&scratch.k);
        scratch.v_cache[layer_idx][offset..offset + HIDDEN]
            .copy_from_slice(&scratch.v);

        // Attention scores: q · k_i for every cached i in 0..=pos.
        let ctx_len = pos + 1;
        for i in 0..ctx_len {
            let ko = i * HIDDEN;
            let mut s = 0.0f32;
            for d in 0..HIDDEN {
                s += scratch.q[d] * scratch.k_cache[layer_idx][ko + d];
            }
            scratch.attn_scores[i] = s * inv_sqrt;
        }
        softmax(&mut scratch.attn_scores[0..ctx_len]);

        // Weighted sum of V.
        for v in scratch.attn_out.iter_mut() {
            *v = 0.0;
        }
        for i in 0..ctx_len {
            let vo = i * HIDDEN;
            let w = scratch.attn_scores[i];
            for d in 0..HIDDEN {
                scratch.attn_out[d] += w * scratch.v_cache[layer_idx][vo + d];
            }
        }

        // Output projection + residual.
        matmul(&scratch.attn_out, &layer.wo, &mut scratch.proj, 1, HIDDEN, HIDDEN);
        add_inplace(&mut scratch.x, &scratch.proj);

        // ---- Feed-forward (SwiGLU) ----
        rmsnorm(&scratch.x, &layer.ffn_norm, &mut scratch.x_norm, RMS_EPS);
        matmul(&scratch.x_norm, &layer.w_gate, &mut scratch.ffn_gate, 1, HIDDEN, FFN_HIDDEN);
        matmul(&scratch.x_norm, &layer.w_up, &mut scratch.ffn_up, 1, HIDDEN, FFN_HIDDEN);
        silu(&mut scratch.ffn_gate);
        mul_inplace(&mut scratch.ffn_gate, &scratch.ffn_up);
        matmul(&scratch.ffn_gate, &layer.w_down, &mut scratch.ffn_out, 1, FFN_HIDDEN, HIDDEN);
        add_inplace(&mut scratch.x, &scratch.ffn_out);
    }

    // Final norm + LM head.
    rmsnorm(&scratch.x, &model.final_norm, &mut scratch.x_norm, RMS_EPS);
    matmul(&scratch.x_norm, &model.lm_head, &mut scratch.logits, 1, HIDDEN, VOCAB);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::random_model;

    #[test]
    fn forward_produces_finite_logits() {
        let model = random_model(0xC0FFEE);
        let mut scratch = Scratch::new();
        forward(&model, 7, 3, &mut scratch);
        assert_eq!(scratch.logits.len(), VOCAB);
        for &v in &scratch.logits {
            assert!(v.is_finite(), "logit is not finite: {}", v);
        }
    }

    #[test]
    fn forward_is_deterministic_for_same_seed() {
        let a = random_model(0xDEAD);
        let b = random_model(0xDEAD);
        let mut sa = Scratch::new();
        let mut sb = Scratch::new();
        forward(&a, 5, 0, &mut sa);
        forward(&b, 5, 0, &mut sb);
        for i in 0..VOCAB {
            assert!((sa.logits[i] - sb.logits[i]).abs() < 1e-6);
        }
    }

    #[test]
    fn different_positions_yield_different_logits() {
        // RoPE should make position matter.
        let m = random_model(0xBEEF);
        let mut s0 = Scratch::new();
        let mut s1 = Scratch::new();
        forward(&m, 5, 0, &mut s0);
        forward(&m, 5, 7, &mut s1);
        let mut diff = 0.0f32;
        for i in 0..VOCAB {
            diff += (s0.logits[i] - s1.logits[i]).abs();
        }
        assert!(diff > 1e-3, "logits at pos 0 and pos 7 were identical");
    }
}
