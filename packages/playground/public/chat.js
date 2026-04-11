// Playground app.
//
// Imports the SDK directly from source via the dev server's /sdk mount so you
// can hack on it without any build step. In production you'd
// `import { Locus } from "locus"`.

import { Locus } from "locus";

const HUB_URL = `http://localhost:${location.port === "5173" ? 5174 : 5174}/`;

const els = {
  statusDot: document.getElementById("status-dot"),
  statusText: document.getElementById("status-text"),
  status: document.getElementById("status"),
  modelSelect: document.getElementById("model-select"),
  loadBtn: document.getElementById("load-btn"),
  evictBtn: document.getElementById("evict-btn"),
  tCache: document.getElementById("t-cache"),
  tMode: document.getElementById("t-mode"),
  tLoad: document.getElementById("t-load"),
  tTps: document.getElementById("t-tps"),
  tMem: document.getElementById("t-mem"),
  tBackend: document.getElementById("t-backend"),
  localList: document.getElementById("local-models"),
  messages: document.getElementById("messages"),
  progress: document.getElementById("progress"),
  progressBar: document.getElementById("progress-bar"),
  progressLabel: document.getElementById("progress-label"),
  composer: document.getElementById("composer"),
  prompt: document.getElementById("prompt"),
  sendBtn: document.getElementById("send-btn"),
  stopBtn: document.getElementById("stop-btn"),
  resetBtn: document.getElementById("reset-btn"),
};

/** @type {import("/sdk/index.js").Locus | null} */
let llm = null;
let chat = null;
let abortController = null;

function setStatus(state, text) {
  els.status.classList.remove("ok", "err");
  if (state === "ok") els.status.classList.add("ok");
  if (state === "err") els.status.classList.add("err");
  els.statusText.textContent = text;
}

function fmtBytes(n) {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function appendMessage(role, content = "") {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  const who = document.createElement("div");
  who.className = "who";
  who.textContent = role;
  const body = document.createElement("div");
  body.className = "content";
  body.textContent = content;
  wrap.append(who, body);
  els.messages.appendChild(wrap);
  els.messages.scrollTop = els.messages.scrollHeight;
  return body;
}

function showProgress(active, pct, label) {
  els.progress.classList.toggle("active", !!active);
  if (pct != null) els.progressBar.style.setProperty("--w", `${pct}%`);
  if (label != null) els.progressLabel.textContent = label;
}

async function refreshLocalList() {
  if (!llm) return;
  try {
    const { list = [] } = await llm.localModels();
    if (!list.length) {
      els.localList.innerHTML = '<li class="muted">nothing cached yet</li>';
      return;
    }
    els.localList.innerHTML = list
      .map(
        (m) =>
          `<li><b>${m.id}</b> <span class="muted">${fmtBytes(m.size)}</span></li>`,
      )
      .join("");
  } catch {
    // non-fatal
  }
}

async function loadModel() {
  const modelId = els.modelSelect.value;
  els.loadBtn.disabled = true;
  setStatus("", `loading ${modelId}…`);
  showProgress(true, 0, "contacting hub…");

  try {
    llm = await Locus.load(modelId, {
      hubUrl: HUB_URL,
      onProgress: (p) => {
        if (p.total) {
          const pct = Math.min(100, Math.round((p.received / p.total) * 100));
          showProgress(true, pct, `${p.stage ?? "download"} · ${fmtBytes(p.received)} / ${fmtBytes(p.total)}`);
        } else {
          showProgress(true, null, `${p.stage ?? "…"}`);
        }
      },
    });

    const info = llm.info();
    const mode = await llm.hub.mode();

    els.tCache.textContent = info.cached ? "hit ✓" : "miss (just downloaded)";
    els.tMode.textContent = mode;
    els.tLoad.textContent = `${info.loadMs} ms`;
    els.tTps.textContent = info.engine?.tokensPerSecond
      ? `${info.engine.tokensPerSecond}`
      : "—";
    els.tBackend.textContent = info.engine?.backend ?? "—";
    if (performance.memory) {
      els.tMem.textContent = fmtBytes(performance.memory.usedJSHeapSize);
    }

    setStatus("ok", info.cached ? "cache hit · ready" : "ready");
    showProgress(false);
    els.prompt.disabled = false;
    els.sendBtn.disabled = false;
    els.prompt.focus();
    appendMessage(
      "system",
      info.cached
        ? `Loaded ${modelId} from local cache in ${info.loadMs} ms (${mode}). No network hit.`
        : `Downloaded and cached ${modelId} in ${info.loadMs} ms (${mode}). Next visit will be instant.`,
    );
    await refreshLocalList();
  } catch (err) {
    console.error(err);
    setStatus("err", `error: ${err.message}`);
    showProgress(false);
    appendMessage("system", `load failed: ${err.message}`);
  } finally {
    els.loadBtn.disabled = false;
  }
}

async function evictCache() {
  if (!llm) return;
  const id = els.modelSelect.value;
  try {
    await llm.evict(id);
    appendMessage("system", `evicted ${id} from local cache.`);
    await refreshLocalList();
  } catch (err) {
    appendMessage("system", `evict failed: ${err.message}`);
  }
}

function setStreaming(on) {
  els.sendBtn.hidden = on;
  els.sendBtn.disabled = on;
  els.stopBtn.hidden = !on;
  els.stopBtn.disabled = !on;
  els.prompt.disabled = on;
}

async function sendPrompt(e) {
  e.preventDefault();
  if (!llm || !chat) return;
  const text = els.prompt.value.trim();
  if (!text) return;
  els.prompt.value = "";
  appendMessage("user", text);
  const body = appendMessage("assistant", "");
  body.classList.add("cursor");

  abortController = new AbortController();
  setStreaming(true);

  const started = performance.now();
  let tokens = 0;
  let aborted = false;
  try {
    for await (const token of chat.stream(text, {
      temperature: 0.7,
      maxTokens: 256,
      signal: abortController.signal,
    })) {
      body.textContent += token;
      tokens++;
      els.messages.scrollTop = els.messages.scrollHeight;
    }
    const elapsed = (performance.now() - started) / 1000;
    const tps = tokens / Math.max(0.01, elapsed);
    els.tTps.textContent = tps.toFixed(1);
  } catch (err) {
    if (err?.name === "AbortError" || abortController?.signal.aborted) {
      aborted = true;
      body.textContent += " [stopped]";
    } else {
      body.textContent += `\n\n[error: ${err.message}]`;
    }
  } finally {
    body.classList.remove("cursor");
    if (aborted) body.classList.add("aborted");
    setStreaming(false);
    abortController = null;
    els.prompt.focus();
  }
}

function stopStreaming() {
  abortController?.abort();
}

function resetChat() {
  if (!llm) return;
  chat = llm.chat();
  els.messages
    .querySelectorAll(".msg:not(.system:first-child)")
    .forEach((el) => el.remove());
  appendMessage("system", "chat history cleared.");
  els.prompt.focus();
}

els.loadBtn.addEventListener("click", async () => {
  await loadModel();
  // After a successful load, set up a fresh stateful chat session.
  if (llm) {
    chat = llm.chat();
    els.resetBtn.disabled = false;
  }
});
els.evictBtn.addEventListener("click", evictCache);
els.stopBtn.addEventListener("click", stopStreaming);
els.resetBtn.addEventListener("click", resetChat);
els.composer.addEventListener("submit", sendPrompt);
els.prompt.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    els.composer.requestSubmit();
  }
});

setStatus("", "idle · click load");
