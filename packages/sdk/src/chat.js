// A minimal stateful chat wrapper on top of a loaded Dhamaka instance.
//
//   const chat = llm.chat({ system: "You are a helpful assistant." });
//   await chat.send("Hi!");
//   for await (const t of chat.stream("And again?")) process.stdout.write(t);

export class Chat {
  constructor(dhamaka, { system } = {}) {
    this.dhamaka = dhamaka;
    this.messages = [];
    if (system) this.messages.push({ role: "system", content: system });
  }

  _render() {
    // Minimal chat template. The real SmolLM2 template is applied inside the
    // WASM tokenizer; this one is here so MockEngine has something to hash.
    return this.messages
      .map((m) => `<|${m.role}|>\n${m.content}`)
      .concat(["<|assistant|>\n"])
      .join("\n");
  }

  async send(content, options) {
    this.messages.push({ role: "user", content });
    const reply = await this.dhamaka.complete(this._render(), options);
    this.messages.push({ role: "assistant", content: reply });
    return reply;
  }

  async *stream(content, options) {
    this.messages.push({ role: "user", content });
    let full = "";
    for await (const token of this.dhamaka.stream(this._render(), options)) {
      full += token;
      yield token;
    }
    this.messages.push({ role: "assistant", content: full });
  }

  reset({ keepSystem = true } = {}) {
    this.messages = keepSystem
      ? this.messages.filter((m) => m.role === "system")
      : [];
  }
}
