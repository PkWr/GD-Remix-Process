// Remote control page — relays every input in this panel to the display
// page (index.html). Two routes (see relay.js): another tab on this device
// (BroadcastChannel), or — with ?s=<code> from the display's QR — a phone
// or any other device through the relay (relay/worker.js). Both pages must
// be served over http(s); file:// breaks the channel.
//
// This page holds no state of its own and runs no render loop — it's a
// thin relay. The display page (app.js) is what actually applies each
// change and reports back the resulting formatted value, so this page's
// text always matches the real thing rather than reimplementing app.js's
// formatting logic a second time.
(function () {
  "use strict";

  const statusEl = document.getElementById("remoteStatus");
  const panel = document.getElementById("controls");
  const code = new URLSearchParams(location.search).get("s") || "";
  let connected = false;

  function setStatus(text, cls) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = cls || "";
  }

  // What the phone shows about the connection. With a relay code, the page is
  // only usable when the relay is up AND the display is there; otherwise the
  // controls dim and a red banner stays at the top.
  let net = code ? "connecting" : "local";
  let hasDisplay = true;
  function render() {
    if (!code) return; // same-device mode keeps the simple messages below
    const bad = net !== "online" || !hasDisplay;
    document.body.classList.toggle("is-offline", bad);
    if (net === "connecting") setStatus("Connecting to the display…", "bad");
    else if (net === "offline") setStatus("Connection lost — trying again…", "bad");
    else if (net === "busy") setStatus("Another phone is already controlling this display. Close it there, or press New code on the display and scan again.", "bad");
    else if (net === "local") setStatus("The phone remote isn't set up on this site yet (no relay address).", "bad");
    else if (!hasDisplay) setStatus("The display isn't connected — waiting for it…", "bad");
    else if (connected) setStatus("Connected — mirroring the display live.", "connected");
    else setStatus("Connected — waiting for the display…");
  }

  function markConnected() {
    if (connected) return;
    connected = true;
    if (code) render();
    else setStatus("Connected — mirroring the display live.", "connected");
  }

  function applyState(values) {
    for (const [id, info] of Object.entries(values)) {
      const el = document.getElementById(id);
      if (!el) continue; // panel drifted out of sync with index.html — ignore rather than throw
      if (info.checked !== undefined) {
        el.checked = info.checked;
      } else {
        el.value = info.value;
      }
      if (info.display !== undefined) {
        const span = document.querySelector(`.val[data-for="${id}"]`);
        if (span) span.textContent = info.display;
      }
    }
    // Values were set directly (no events), so refresh the panel's chip
    // highlights and slider fills to match.
    if (window.PhotoRemixSettings) window.PhotoRemixSettings.syncPanel(panel);
    if (window.SpotLive) window.SpotLive.refresh();
  }

  const link = window.SpotLink.open({
    role: "remote",
    code,
    local: !code, // a phone with a code talks only through the relay
    onMessage(msg) {
      if (msg.type === "scenes") {
        if (window.SpotLive) window.SpotLive.setScenes(msg);
        return;
      }
      if (msg.type !== "state") return; // otherwise this page only consumes "state" messages
      markConnected();
      applyState(msg.values); // may be a partial update
    },
    onStatus(st) {
      const was = net;
      net = st;
      if (st === "offline" || st === "connecting") {
        connected = false;
        hasDisplay = true; // unknown until the relay tells us
      }
      if (was === "online" && st !== "online" && navigator.vibrate) navigator.vibrate([120, 60, 120]);
      render();
    },
    onPresence(p) {
      const had = hasDisplay;
      hasDisplay = p.display > 0;
      if (!hasDisplay) connected = false;
      if (had && !hasDisplay && navigator.vibrate) navigator.vibrate([120, 60, 120]);
      render();
    },
    onOpen() {
      link.post({ type: "requestState" });
    },
  });

  window.SpotRemote = { post: (m) => link.post(m) };

  // Every input here just relays to the display page — it never applies
  // its own change locally first, since app.js's dispatched event (and the
  // "state" broadcast that follows it) is what updates this page's value
  // and display text. Delegated on the panel rather than wired per-control,
  // so adding a new control later needs no new JS here. Drag events are
  // coalesced (about 25 a second) so a phone doesn't flood the relay.
  const pending = new Map();
  let flushTimer = 0;
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = 0;
    pending.forEach((m) => link.post(m));
    pending.clear();
  }
  function relay(evt) {
    const el = evt.target;
    if (!el.id || !el.id.startsWith("ctrl")) return;
    pending.set(el.id, {
      type: "input",
      id: el.id,
      value: el.value,
      checked: el.type === "checkbox" ? el.checked : undefined,
    });
    if (evt.type === "change") flush();
    else if (!flushTimer) flushTimer = setTimeout(flush, 40);
  }
  panel.addEventListener("input", relay);
  panel.addEventListener("change", relay);

  // Ask whatever display is open (if any) to send its current state,
  // so this page reflects reality on load instead of sitting on whatever
  // defaults are baked into this page's own HTML.
  link.post({ type: "requestState" });

  if (!code) {
    setTimeout(() => {
      if (!connected) {
        setStatus("No display page found yet. Open index.html in another tab/window on THIS device, then reload this page.");
      }
    }, 2500);
  }
})();
