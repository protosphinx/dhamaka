//! The tiny random-weights model used by v0.1 of the runtime.
//!
//! Real Dhamaka releases will load SmolLM2-360M-Instruct from a quantized
//! binary format. Until those weights are packaged, this module builds a
//! deterministic random model from a seed, which is enough to exercise the
//! full inference pipeline end-to-end: embedding lookup → N transformer
//! blocks → LM head → sampling → detokenization.
//!
//! Output from this model is not coherent English — it's whatever the random
//! weights say. But every step is real transformer math executed in WASM
//! compiled from Rust, which is the entire point of Dhamaka's runtime layer.

use crate::rng::Xorshift64;
use crate::transformer::{LayerWeights, ModelWeights, FFN_HIDDEN, HIDDEN, N_LAYERS, VOCAB};

/// A tiny character-level vocabulary built from a restricted alphabet. The
/// model samples token ids in `0..VOCAB`, and the ABI converts each id back
/// into one or more bytes using this table when it streams output to JS.
///
/// It is deliberately small (64 entries) so `VOCAB = 64` matches the
/// transformer's LM head.
pub const VOCAB_TABLE: [&str; 64] = [
    " the ", " a ", " of ", " to ", " and ", " in ", " that ", " it ",
    " is ", " for ", " on ", " with ", " as ", " was ", " are ", " be ",
    "Dhamaka ", "browser ", "WASM ", "Rust ", "model ", "tensor ", "token ",
    "weights ", "inference ", "cache ", "matrix ", "softmax ", "attention ",
    "transformer ", "fast ", "small ", "local ", "private ", "yours ",
    "run ", "ship ", "tab ", "site ", "share ", "download ", "once ",
    "forever ", "now ", "live ", ".", ",", "!", "?", "\n",
    " ", "-", ":", ";", "'", "\"", "(", ")", "[", "]",
    "→", "✦", "✓", "…",
];

fn random_vector(rng: &mut Xorshift64, len: usize, scale: f32) -> Vec<f32> {
    let mut out = Vec::with_capacity(len);
    for _ in 0..len {
        // Box–Muller-lite: two uniforms → one normal sample.
        let u1 = rng.next_f32().max(1e-7);
        let u2 = rng.next_f32();
        let r = (-2.0 * u1.ln()).sqrt();
        let theta = 2.0 * std::f32::consts::PI * u2;
        out.push(r * theta.cos() * scale);
    }
    out
}

fn random_layer(rng: &mut Xorshift64) -> LayerWeights {
    // Scale analogous to `1/sqrt(fan_in)` so activations stay near unit norm.
    let s_hidden = 1.0 / (HIDDEN as f32).sqrt();
    let s_ffn_in = 1.0 / (HIDDEN as f32).sqrt();
    let s_ffn_out = 1.0 / (FFN_HIDDEN as f32).sqrt();
    LayerWeights {
        attn_norm: random_vector(rng, HIDDEN, 0.1).into_iter().map(|v| 1.0 + v).collect(),
        wq: random_vector(rng, HIDDEN * HIDDEN, s_hidden),
        wk: random_vector(rng, HIDDEN * HIDDEN, s_hidden),
        wv: random_vector(rng, HIDDEN * HIDDEN, s_hidden),
        wo: random_vector(rng, HIDDEN * HIDDEN, s_hidden),
        ffn_norm: random_vector(rng, HIDDEN, 0.1).into_iter().map(|v| 1.0 + v).collect(),
        w_gate: random_vector(rng, HIDDEN * FFN_HIDDEN, s_ffn_in),
        w_up: random_vector(rng, HIDDEN * FFN_HIDDEN, s_ffn_in),
        w_down: random_vector(rng, FFN_HIDDEN * HIDDEN, s_ffn_out),
    }
}

/// Build a fresh random model from a seed.
pub fn random_model(seed: u64) -> ModelWeights {
    let mut rng = Xorshift64::new(seed);
    let s_embed = 1.0 / (HIDDEN as f32).sqrt();
    let token_embedding = random_vector(&mut rng, VOCAB * HIDDEN, s_embed);
    let mut layers = Vec::with_capacity(N_LAYERS);
    for _ in 0..N_LAYERS {
        layers.push(random_layer(&mut rng));
    }
    let final_norm: Vec<f32> = random_vector(&mut rng, HIDDEN, 0.1)
        .into_iter()
        .map(|v| 1.0 + v)
        .collect();
    let lm_head = random_vector(&mut rng, HIDDEN * VOCAB, 1.0 / (HIDDEN as f32).sqrt());
    ModelWeights {
        token_embedding,
        layers,
        final_norm,
        lm_head,
    }
}

/// Naive prompt tokenizer. Maps each input byte to a token id in `0..VOCAB`
/// by hashing it, so we always produce a valid starting context even when
/// the prompt contains characters outside the vocab. The real runtime will
/// use the SmolLM2 BPE tokenizer.
pub fn tokenize_prompt(prompt: &str) -> Vec<usize> {
    if prompt.is_empty() {
        return vec![0];
    }
    prompt
        .bytes()
        .map(|b| (b as usize) % VOCAB)
        .collect()
}

/// Look up a vocab entry for streaming back to JS.
pub fn detokenize(id: usize) -> &'static str {
    VOCAB_TABLE[id % VOCAB]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn random_model_is_deterministic() {
        let a = random_model(123);
        let b = random_model(123);
        assert_eq!(a.token_embedding, b.token_embedding);
        assert_eq!(a.layers.len(), b.layers.len());
        assert_eq!(a.layers[0].wq, b.layers[0].wq);
    }

    #[test]
    fn random_model_differs_across_seeds() {
        let a = random_model(1);
        let b = random_model(2);
        assert_ne!(a.token_embedding, b.token_embedding);
    }

    #[test]
    fn vocab_table_has_expected_size() {
        assert_eq!(VOCAB_TABLE.len(), VOCAB);
    }

    #[test]
    fn tokenize_then_detokenize_is_safe() {
        let ids = tokenize_prompt("hello world");
        assert!(!ids.is_empty());
        for id in ids {
            let _ = detokenize(id); // must not panic
        }
    }

    #[test]
    fn empty_prompt_still_yields_a_token() {
        let ids = tokenize_prompt("");
        assert_eq!(ids.len(), 1);
    }
}
