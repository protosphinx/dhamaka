// Visible "built from commit XXXXXX" badge.
//
// Why: GitHub Pages serves static files with Cache-Control: max-age=600,
// which means a browser can happily pair brand-new HTML with 10-minute-
// stale JS after a deploy. The build-site.mjs script cache-busts JS,
// but it can't stop a browser from serving a STALE HTML file from cache
// — and stale HTML is exactly the failure mode that makes debugging
// demos feel like whack-a-mole. This badge lets anyone (user, CI,
// reviewers) see at a glance which commit the page they're looking at
// was actually built from, so "refresh the page" becomes obviously-
// needed instead of voodoo.
//
// The badge reads /build.json (written by build-site.mjs), falls back
// gracefully if it's missing, and links back to the commit on GitHub so
// a single click takes you to the source-of-truth diff.

(function mountBuildBadge() {
  const baseForBuildJson = (() => {
    // Figure out the correct path back to /build.json from any depth.
    // `demos/spellcheck.html` is two levels deep under _site/, the root
    // pages are one level.
    const parts = location.pathname.split("/").filter(Boolean);
    // Drop the filename (last segment) if it looks like a file.
    if (parts.length && /\.\w+$/.test(parts[parts.length - 1])) parts.pop();
    return "../".repeat(parts.length) + "build.json";
  })();

  fetch(baseForBuildJson, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then(render)
    .catch(() => render(null));

  function render(build) {
    if (document.getElementById("dhamaka-build-badge")) return;

    const short = build?.shortCommit || "?";
    const full  = build?.commit      || null;
    const at    = build?.builtAt     || null;
    const href  = full ? `https://github.com/protosphinx/dhamaka/commit/${full}` : "https://github.com/protosphinx/dhamaka";
    const title = at
      ? `built ${at} · commit ${full ?? "unknown"} · click to view on GitHub`
      : "build info unavailable — this page may be served from cache";

    const badge = document.createElement("a");
    badge.id = "dhamaka-build-badge";
    badge.href = href;
    badge.target = "_blank";
    badge.rel   = "noopener";
    badge.title = title;
    badge.textContent = `▲ build ${short}`;

    Object.assign(badge.style, {
      position: "fixed",
      bottom: "0.75rem",
      right:  "0.75rem",
      padding: "0.3rem 0.6rem",
      background: "rgba(23, 23, 35, 0.9)",
      border: "1px solid #30303e",
      borderRadius: "999px",
      color: build ? "#8a8a99" : "#facc15",
      fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace",
      fontSize: "10px",
      letterSpacing: "0.04em",
      textDecoration: "none",
      zIndex: "9999",
      backdropFilter: "blur(6px)",
    });

    document.body.appendChild(badge);
  }
})();
