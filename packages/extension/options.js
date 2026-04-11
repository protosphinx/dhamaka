// Simple options page that lists cached models and lets the user evict them.

function fmtBytes(n) {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDate(ms) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleDateString();
  } catch {
    return "—";
  }
}

async function refresh() {
  const list = document.getElementById("list");
  list.innerHTML = '<li class="empty">loading…</li>';
  chrome.runtime.sendMessage({ type: "dhamaka:list" }, (response) => {
    if (chrome.runtime.lastError) {
      list.innerHTML = `<li class="empty">error: ${chrome.runtime.lastError.message}</li>`;
      return;
    }
    const rows = response?.list ?? [];
    if (!rows.length) {
      list.innerHTML = '<li class="empty">no models cached yet</li>';
      return;
    }
    list.innerHTML = "";
    for (const row of rows) {
      const li = document.createElement("li");
      const left = document.createElement("div");
      const idEl = document.createElement("div");
      idEl.className = "id";
      idEl.textContent = row.id;
      const metaEl = document.createElement("div");
      metaEl.className = "meta";
      metaEl.textContent = `${fmtBytes(row.size)} · cached ${fmtDate(row.fetchedAt)}`;
      left.append(idEl, metaEl);

      const btn = document.createElement("button");
      btn.textContent = "evict";
      btn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "dhamaka:delete", id: row.id }, refresh);
      });
      li.append(left, btn);
      list.appendChild(li);
    }
  });
}

document.addEventListener("DOMContentLoaded", refresh);
