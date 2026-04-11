// Tiny fake-DOM used by the SmartField / SmartForm / SmartText tests.
//
// Node doesn't ship a DOM. We don't want jsdom as a dependency for 10
// tests. The SmartField API uses a narrow slice of the DOM — addEventListener,
// removeEventListener, dispatchEvent, CustomEvent, Event, value, name,
// elements.namedItem, tagName — and we implement just that slice here.
//
// Exported as a factory so each test gets a clean copy.

export function makeDom() {
  class FakeEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.bubbles = !!init.bubbles;
      this.detail = init.detail ?? null;
      this.target = null;
      this.currentTarget = null;
    }
  }
  class FakeCustomEvent extends FakeEvent {}

  class FakeNode {
    constructor() {
      this._listeners = new Map();
      this._parent = null;
    }
    addEventListener(type, fn, _opts) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    }
    removeEventListener(type, fn, _opts) {
      this._listeners.get(type)?.delete(fn);
    }
    dispatchEvent(event) {
      event.target = event.target ?? this;
      let node = this;
      while (node) {
        event.currentTarget = node;
        const set = node._listeners.get(event.type);
        if (set) for (const fn of [...set]) fn(event);
        if (!event.bubbles) break;
        node = node._parent;
      }
      return true;
    }
  }

  class FakeInput extends FakeNode {
    constructor({ name = "", value = "", type = "text" } = {}) {
      super();
      this.name = name;
      this.value = value;
      this.type = type;
      this.tagName = "INPUT";
    }
    setValue(v) {
      this.value = v;
      this.dispatchEvent(new FakeEvent("input", { bubbles: true }));
    }
  }

  class FakeTextarea extends FakeInput {
    constructor(opts) {
      super(opts);
      this.tagName = "TEXTAREA";
    }
  }

  class FakeForm extends FakeNode {
    constructor(fields = []) {
      super();
      this.tagName = "FORM";
      this._fields = fields;
      for (const f of fields) f._parent = this;
      this.elements = {
        namedItem: (name) => fields.find((f) => f.name === name) ?? null,
      };
    }
  }

  return {
    FakeEvent,
    FakeCustomEvent,
    FakeInput,
    FakeTextarea,
    FakeForm,
  };
}

// Install the fakes onto globalThis so SmartField's `new CustomEvent(...)`
// and `instanceof HTMLInputElement` checks pass in Node. Call this at the
// top of each test file and un-install in a teardown.
export function installDom() {
  const dom = makeDom();
  const prev = {
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
    HTMLInputElement: globalThis.HTMLInputElement,
    HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
    HTMLFormElement: globalThis.HTMLFormElement,
    HTMLSelectElement: globalThis.HTMLSelectElement,
  };
  globalThis.CustomEvent = dom.FakeCustomEvent;
  globalThis.Event = dom.FakeEvent;
  globalThis.HTMLInputElement = dom.FakeInput;
  globalThis.HTMLTextAreaElement = dom.FakeTextarea;
  globalThis.HTMLFormElement = dom.FakeForm;
  globalThis.HTMLSelectElement = dom.FakeInput; // close enough for our use
  return {
    dom,
    restore() {
      Object.assign(globalThis, prev);
    },
  };
}
