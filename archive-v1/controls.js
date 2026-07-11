// Remote control page — relays every input in this panel to the display
// page (index.html) over BroadcastChannel. Same-device only: this does NOT
// reach a phone or another computer, only another tab/window open in the
// same browser profile on this machine. It also requires both pages be
// served over http(s) — opening either file directly via file:// gives it
// an opaque origin in most browsers, which silently breaks the channel.
//
// This page holds no state of its own and runs no render loop — it's a
// thin relay. The display page (app.js) is what actually applies each
// change and reports back the resulting formatted value, so this page's
// text always matches the real thing rather than reimplementing app.js's
// formatting logic a second time.
(function () {
  "use strict";

  const CHANNEL_NAME = "photoRemixControls";
  const statusEl = document.getElementById("remoteStatus");
  const panel = document.getElementById("controls");

  if (!("BroadcastChannel" in window)) {
    if (statusEl) {
      statusEl.textContent =
        "This browser doesn't support BroadcastChannel, so remote control isn't available here. Try Chrome, Firefox, or Edge.";
    }
    return;
  }

  const channel = new BroadcastChannel(CHANNEL_NAME);
  let connected = false;

  function markConnected() {
    if (connected) return;
    connected = true;
    if (statusEl) {
      statusEl.textContent = "Connected — mirroring the display page live.";
      statusEl.classList.add("connected");
    }
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
  }

  channel.onmessage = (evt) => {
    const msg = evt.data;
    if (msg.type !== "state") return; // this page only ever consumes "state" messages
    markConnected();
    applyState(msg.values);
  };

  // Every input here just relays to the display page — it never applies
  // its own change locally first, since app.js's dispatched event (and the
  // "state" broadcast that follows it) is what updates this page's value
  // and display text. Delegated on the panel rather than wired per-control,
  // so adding a new control later needs no new JS here.
  function relay(evt) {
    const el = evt.target;
    if (!el.id || !el.id.startsWith("ctrl")) return;
    channel.postMessage({
      type: "input",
      id: el.id,
      value: el.value,
      checked: el.type === "checkbox" ? el.checked : undefined,
    });
  }
  panel.addEventListener("input", relay);
  panel.addEventListener("change", relay);

  // Ask whatever display page is open (if any) to send its current state,
  // so this page reflects reality on load instead of sitting on whatever
  // defaults are baked into this page's own HTML.
  channel.postMessage({ type: "requestState" });

  setTimeout(() => {
    if (!connected && statusEl) {
      statusEl.textContent =
        "No display page found yet. Open index.html in another tab/window on THIS device, then reload this page.";
    }
  }, 2500);
})();
