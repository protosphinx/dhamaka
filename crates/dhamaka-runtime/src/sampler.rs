//! Token samplers. Operate on a logits slice and return a chosen token id.

use crate::rng::Xorshift64;
use crate::tensor::softmax;

#[derive(Debug, Clone, Copy)]
pub struct SampleOptions {
    pub temperature: f32,
    pub top_k: usize,
    pub top_p: f32,
}

impl Default for SampleOptions {
    fn default() -> Self {
        Self { temperature: 0.7, top_k: 40, top_p: 0.95 }
    }
}

/// Argmax. Used when temperature is 0.
pub fn greedy(logits: &[f32]) -> usize {
    let mut best = 0usize;
    let mut best_v = f32::NEG_INFINITY;
    for (i, &v) in logits.iter().enumerate() {
        if v > best_v {
            best_v = v;
            best = i;
        }
    }
    best
}

/// Temperature + top-k + top-p sampling in one pass.
///
/// Mutates `logits` as scratch space. Returns the chosen token id.
pub fn sample(logits: &mut [f32], opts: SampleOptions, rng: &mut Xorshift64) -> usize {
    if opts.temperature <= 0.0 {
        return greedy(logits);
    }

    // 1. Apply temperature.
    let inv_t = 1.0 / opts.temperature;
    for v in logits.iter_mut() {
        *v *= inv_t;
    }

    // 2. Build (id, score) pairs and sort by score desc. Small vocab → simple
    // approach is fine. This allocates, but only once per sampled token which
    // is dwarfed by the matmul cost.
    let mut indexed: Vec<(usize, f32)> =
        logits.iter().enumerate().map(|(i, &v)| (i, v)).collect();
    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // 3. Truncate to top-k.
    let k = opts.top_k.min(indexed.len()).max(1);
    indexed.truncate(k);

    // 4. Softmax over the survivors.
    let mut probs: Vec<f32> = indexed.iter().map(|(_, v)| *v).collect();
    softmax(&mut probs);

    // 5. Top-p (nucleus): keep the smallest prefix whose cumulative mass >= p.
    if opts.top_p < 1.0 {
        let mut cum = 0.0f32;
        let mut cut = probs.len();
        for (i, &p) in probs.iter().enumerate() {
            cum += p;
            if cum >= opts.top_p {
                cut = i + 1;
                break;
            }
        }
        probs.truncate(cut);
        indexed.truncate(cut);
        // Renormalize.
        let s: f32 = probs.iter().sum();
        if s > 0.0 {
            for p in probs.iter_mut() {
                *p /= s;
            }
        }
    }

    // 6. Multinomial draw.
    let r = rng.next_f32();
    let mut acc = 0.0f32;
    for (i, &p) in probs.iter().enumerate() {
        acc += p;
        if r < acc {
            return indexed[i].0;
        }
    }
    indexed[indexed.len() - 1].0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greedy_picks_max() {
        assert_eq!(greedy(&[0.1, 0.9, 0.5]), 1);
        assert_eq!(greedy(&[5.0, -1.0, 5.0]), 0);
    }

    #[test]
    fn sample_temp_zero_is_greedy() {
        let mut logits = [0.1f32, 0.9, 0.5];
        let mut rng = Xorshift64::new(1);
        let opts = SampleOptions { temperature: 0.0, top_k: 40, top_p: 0.95 };
        assert_eq!(sample(&mut logits, opts, &mut rng), 1);
    }

    #[test]
    fn sample_is_deterministic_for_same_seed() {
        let base = [0.2f32, 1.0, 0.5, 0.1, 0.8];
        let opts = SampleOptions::default();

        let mut ra = Xorshift64::new(12345);
        let mut rb = Xorshift64::new(12345);

        for _ in 0..50 {
            let mut a = base;
            let mut b = base;
            assert_eq!(sample(&mut a, opts, &mut ra), sample(&mut b, opts, &mut rb));
        }
    }

    #[test]
    fn sample_respects_top_k() {
        // With top_k=1 we should always pick the argmax regardless of
        // temperature and RNG.
        let mut rng = Xorshift64::new(7);
        let opts = SampleOptions { temperature: 1.0, top_k: 1, top_p: 1.0 };
        for _ in 0..20 {
            let mut logits = [0.1f32, 0.2, 5.0, 0.3];
            assert_eq!(sample(&mut logits, opts, &mut rng), 2);
        }
    }

    #[test]
    fn sample_respects_top_p() {
        // With top_p tiny, we should always hit the single most-probable
        // token.
        let mut rng = Xorshift64::new(42);
        let opts = SampleOptions { temperature: 1.0, top_k: 40, top_p: 0.01 };
        for _ in 0..20 {
            let mut logits = [0.1f32, 0.2, 5.0, 0.3];
            assert_eq!(sample(&mut logits, opts, &mut rng), 2);
        }
    }
}
