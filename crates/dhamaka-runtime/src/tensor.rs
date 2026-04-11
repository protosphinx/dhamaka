//! Tensor primitives used by the forward pass.
//!
//! These are the hot kernels. Everything here operates on flat `&[f32]`
//! slices so the caller controls allocation. The real runtime gets its speed
//! from running these loops in WebAssembly compiled from Rust, and
//! optionally from SIMD (`-C target-feature=+simd128`, wired in the crate's
//! build config) and WebGPU (future work).
//!
//! Every primitive is covered by native `cargo test`.

/// `out = a @ b` where `a` is `[m, k]` and `b` is `[k, n]`, both row-major.
///
/// Chosen shape because transformer projection matrices multiply a single
/// token's hidden state (`[1, k]`) by a weight matrix (`[k, n]`). For single-
/// token generation m is 1 almost always, but we keep it general so the
/// function is testable against known references.
pub fn matmul(a: &[f32], b: &[f32], out: &mut [f32], m: usize, k: usize, n: usize) {
    assert_eq!(a.len(), m * k, "matmul: a has wrong length");
    assert_eq!(b.len(), k * n, "matmul: b has wrong length");
    assert_eq!(out.len(), m * n, "matmul: out has wrong length");

    for i in 0..m {
        for j in 0..n {
            let mut acc = 0.0f32;
            for p in 0..k {
                acc += a[i * k + p] * b[p * n + j];
            }
            out[i * n + j] = acc;
        }
    }
}

/// Root-mean-square normalization (the normalization used by Llama and
/// SmolLM2). `weight` is a learned scale vector broadcast across the feature
/// dimension.
pub fn rmsnorm(x: &[f32], weight: &[f32], out: &mut [f32], eps: f32) {
    assert_eq!(x.len(), weight.len());
    assert_eq!(x.len(), out.len());

    let n = x.len() as f32;
    let mut sumsq = 0.0f32;
    for &v in x {
        sumsq += v * v;
    }
    let rms = (sumsq / n + eps).sqrt();
    let scale = 1.0 / rms;
    for i in 0..x.len() {
        out[i] = x[i] * scale * weight[i];
    }
}

/// Numerically stable softmax, in-place.
pub fn softmax(x: &mut [f32]) {
    if x.is_empty() {
        return;
    }
    let mut max = x[0];
    for &v in x.iter() {
        if v > max {
            max = v;
        }
    }
    let mut sum = 0.0f32;
    for v in x.iter_mut() {
        *v = (*v - max).exp();
        sum += *v;
    }
    if sum == 0.0 {
        // All -inf: uniform.
        let u = 1.0 / x.len() as f32;
        for v in x.iter_mut() {
            *v = u;
        }
    } else {
        let inv = 1.0 / sum;
        for v in x.iter_mut() {
            *v *= inv;
        }
    }
}

/// SiLU (Swish) activation: `x * sigmoid(x)`. Used by Llama-style FFN blocks
/// inside the SwiGLU gate.
pub fn silu(x: &mut [f32]) {
    for v in x.iter_mut() {
        *v *= 1.0 / (1.0 + (-*v).exp());
    }
}

/// In-place elementwise add: `a += b`.
pub fn add_inplace(a: &mut [f32], b: &[f32]) {
    assert_eq!(a.len(), b.len());
    for i in 0..a.len() {
        a[i] += b[i];
    }
}

/// In-place elementwise multiply: `a *= b`. Used by SwiGLU.
pub fn mul_inplace(a: &mut [f32], b: &[f32]) {
    assert_eq!(a.len(), b.len());
    for i in 0..a.len() {
        a[i] *= b[i];
    }
}

/// Rotary position embedding (RoPE), applied to a single `head_dim`-sized
/// vector at position `pos`. Operates in pairs: `(x[2i], x[2i+1])` rotates by
/// angle `pos * theta_i` where `theta_i = base^(-2i/head_dim)`.
///
/// This matches the convention used by Llama, Mistral, and SmolLM2.
pub fn rope_apply(x: &mut [f32], pos: usize, base: f32) {
    let dim = x.len();
    assert!(dim % 2 == 0, "rope: head_dim must be even");
    let half = dim / 2;
    for i in 0..half {
        let theta = (pos as f32) * base.powf(-2.0 * (i as f32) / (dim as f32));
        let (sin, cos) = theta.sin_cos();
        let x0 = x[2 * i];
        let x1 = x[2 * i + 1];
        x[2 * i] = x0 * cos - x1 * sin;
        x[2 * i + 1] = x0 * sin + x1 * cos;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matmul_identity() {
        // [1 2] @ I2 = [1 2]
        let a = [1.0, 2.0];
        let b = [1.0, 0.0, 0.0, 1.0];
        let mut out = [0.0; 2];
        matmul(&a, &b, &mut out, 1, 2, 2);
        assert_eq!(out, [1.0, 2.0]);
    }

    #[test]
    fn matmul_2x2() {
        // [[1, 2], [3, 4]] @ [[5, 6], [7, 8]] = [[19, 22], [43, 50]]
        let a = [1.0, 2.0, 3.0, 4.0];
        let b = [5.0, 6.0, 7.0, 8.0];
        let mut out = [0.0; 4];
        matmul(&a, &b, &mut out, 2, 2, 2);
        assert_eq!(out, [19.0, 22.0, 43.0, 50.0]);
    }

    #[test]
    fn rmsnorm_uniform_vector() {
        // Uniform input with unit weights should renormalize to (roughly) 1s.
        let x = [1.0f32; 8];
        let w = [1.0f32; 8];
        let mut out = [0.0f32; 8];
        rmsnorm(&x, &w, &mut out, 1e-6);
        for v in out {
            assert!((v - 1.0).abs() < 1e-4, "got {}", v);
        }
    }

    #[test]
    fn softmax_sums_to_one() {
        let mut x = [1.0f32, 2.0, 3.0, 4.0];
        softmax(&mut x);
        let s: f32 = x.iter().sum();
        assert!((s - 1.0).abs() < 1e-5);
        // Monotone: bigger input, bigger probability.
        assert!(x[3] > x[2] && x[2] > x[1] && x[1] > x[0]);
    }

    #[test]
    fn softmax_is_translation_invariant() {
        let mut a = [1.0f32, 2.0, 3.0];
        let mut b = [101.0f32, 102.0, 103.0];
        softmax(&mut a);
        softmax(&mut b);
        for i in 0..3 {
            assert!((a[i] - b[i]).abs() < 1e-5);
        }
    }

    #[test]
    fn silu_zero_is_zero() {
        let mut x = [0.0f32];
        silu(&mut x);
        assert!(x[0].abs() < 1e-6);
    }

    #[test]
    fn silu_large_positive_is_identity() {
        let mut x = [20.0f32];
        silu(&mut x);
        assert!((x[0] - 20.0).abs() < 1e-3);
    }

    #[test]
    fn add_and_mul_inplace() {
        let mut a = [1.0f32, 2.0, 3.0];
        let b = [4.0f32, 5.0, 6.0];
        add_inplace(&mut a, &b);
        assert_eq!(a, [5.0, 7.0, 9.0]);
        mul_inplace(&mut a, &b);
        assert_eq!(a, [20.0, 35.0, 54.0]);
    }

    #[test]
    fn rope_pos_zero_is_identity() {
        let mut x = [1.0f32, 2.0, 3.0, 4.0];
        let original = x;
        rope_apply(&mut x, 0, 10000.0);
        for i in 0..4 {
            assert!((x[i] - original[i]).abs() < 1e-5);
        }
    }

    #[test]
    fn rope_preserves_norm() {
        // Rotations preserve the L2 norm of each pair.
        let mut x = [0.3f32, 0.4, -0.6, 0.8];
        let n_before: f32 = x.iter().map(|v| v * v).sum();
        rope_apply(&mut x, 7, 10000.0);
        let n_after: f32 = x.iter().map(|v| v * v).sum();
        assert!((n_before - n_after).abs() < 1e-5);
    }
}
