// A placeholder tokenizer.
//
// The real Locus tokenizer is the SentencePiece/BPE that ships with
// SmolLM2. It's compiled into the WASM module and loaded from the
// `tokenizer.json` artifact. This class is a stand-in that lets the
// MockEngine stream plausible token-sized chunks during development.

export class Tokenizer {
  constructor() {
    this.vocab = null; // populated once loadFromBytes is called with real data
  }

  async loadFromBytes(bytes) {
    try {
      const text = new TextDecoder().decode(bytes);
      this.vocab = JSON.parse(text);
    } catch {
      this.vocab = null;
    }
  }

  /**
   * Split a string into pseudo-tokens roughly the size a BPE tokenizer would
   * emit. Keeps punctuation and whitespace attached to the preceding word the
   * way real subword tokenizers do.
   */
  split(text) {
    const out = [];
    const re = /(\s+)?(\w+|[^\s\w]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const ws = m[1] ?? "";
      const word = m[2] ?? "";
      if (word.length <= 4) {
        out.push(ws + word);
      } else {
        // Break longer words into ~3-char chunks to look like BPE.
        let first = true;
        for (let i = 0; i < word.length; i += 3) {
          const piece = word.slice(i, i + 3);
          out.push((first ? ws : "") + piece);
          first = false;
        }
      }
    }
    return out;
  }

  encode(_text) {
    throw new Error("Tokenizer.encode() requires the real WASM tokenizer");
  }

  decode(_ids) {
    throw new Error("Tokenizer.decode() requires the real WASM tokenizer");
  }
}
