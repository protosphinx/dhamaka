// Locus extension content script.
//
// Runs at document_start on every page and acts as a bridge between:
//
//   page JS  ←postMessage→  content script  ←chrome.runtime→  background
//
// It also plants a tiny marker on window so the Locus SDK can detect that
// the extension is installed and prefer it over the iframe hub.

const MARKER = "__locus_extension__";

// Announce presence to the page. The SDK's HubClient checks for this on
// startup and, if it finds it, routes all hub messages through here instead
// of through an iframe.
const script = document.createElement("script");
script.textContent = `
  window.${MARKER} = {
    version: ${JSON.stringify(chrome.runtime.getManifest().version)},
    tier: "extension"
  };
  window.dispatchEvent(new CustomEvent("locus:extension-ready"));
`;
(document.documentElement || document.head || document.body).appendChild(script);
script.remove();

// Listen for requests from the page and forward them to the background.
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (typeof msg.type !== "string" || !msg.type.startsWith("locus:")) return;
  if (msg.__locusFromExtension) return; // our own echoes

  chrome.runtime.sendMessage(msg, (response) => {
    if (chrome.runtime.lastError) {
      window.postMessage(
        {
          type: "locus:error",
          requestId: msg.requestId,
          error: chrome.runtime.lastError.message,
          __locusFromExtension: true,
        },
        "*",
      );
      return;
    }
    window.postMessage(
      { ...response, requestId: msg.requestId, __locusFromExtension: true },
      "*",
    );
  });
});
