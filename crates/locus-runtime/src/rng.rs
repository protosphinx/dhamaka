//! A tiny deterministic RNG. We don't need anything cryptographic — we just
//! want reproducible sampling for a given prompt so debugging and testing
//! behave predictably.

/// xorshift64*. Fast, small, and good enough for sampling.
pub struct Xorshift64 {
    state: u64,
}

impl Xorshift64 {
    pub fn new(seed: u64) -> Self {
        // Avoid the all-zero fixed point.
        let state = if seed == 0 { 0x9E37_79B9_7F4A_7C15 } else { seed };
        Self { state }
    }

    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Uniform f32 in [0, 1).
    #[inline]
    pub fn next_f32(&mut self) -> f32 {
        // Top 24 bits as a fraction.
        let bits = (self.next_u64() >> 40) as u32;
        (bits as f32) * (1.0 / (1u32 << 24) as f32)
    }
}

/// FNV-1a hash for seeding from a byte slice (e.g. the raw prompt).
pub fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x100_0000_01b3);
    }
    h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reproducible() {
        let mut a = Xorshift64::new(42);
        let mut b = Xorshift64::new(42);
        for _ in 0..100 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn next_f32_in_range() {
        let mut r = Xorshift64::new(1);
        for _ in 0..10_000 {
            let v = r.next_f32();
            assert!((0.0..1.0).contains(&v));
        }
    }

    #[test]
    fn fnv1a_distinct_prompts_yield_distinct_seeds() {
        assert_ne!(fnv1a64(b"hello"), fnv1a64(b"world"));
        assert_eq!(fnv1a64(b"hello"), fnv1a64(b"hello"));
    }

    #[test]
    fn fnv1a_empty_is_offset_basis() {
        assert_eq!(fnv1a64(b""), 0xcbf2_9ce4_8422_2325);
    }
}
