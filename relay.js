/* Spot — link between the display page and a remote control page.
 *
 * Same-device tabs talk over BroadcastChannel (as before). A phone, or any
 * other device, talks through a tiny relay (relay/worker.js on Cloudflare):
 * the display makes a random session code, shows it as a QR, and the phone
 * opens controls.html?s=<code>. Only control settings travel; no images.
 *
 * window.SpotLink.open({ role, code, local, onMessage, onStatus, onPresence, onOpen })
 *   -> { post(msg), setCode(code), close() }
 * status: "local" | "connecting" | "online" | "busy" | "offline"
 */
(function () {
  "use strict";

  // Set this to your deployed relay, e.g. "wss://spot-relay.yourname.workers.dev"
  // (see relay/README.md). Empty = same-device remote only.
  const RELAY_URL = "wss://spot-relay.pkwr.workers.dev";

  const CODE_KEY = "spotRemoteCode";
  const TOKEN_KEY = "spotRemoteToken";
  const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // 32 characters, no look-alikes

  function random(n) {
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  }

  let memoryCode = "";
  // One code per running instance (per browser tab). Survives a reload.
  function code(fresh) {
    try {
      let c = sessionStorage.getItem(CODE_KEY);
      if (!c || fresh) {
        c = random(20);
        sessionStorage.setItem(CODE_KEY, c);
      }
      return c;
    } catch (e) {
      if (!memoryCode || fresh) memoryCode = random(20);
      return memoryCode;
    }
  }

  // Identifies this device to the relay so it can reconnect after a drop.
  function deviceToken() {
    try {
      let t = localStorage.getItem(TOKEN_KEY);
      if (!t) {
        t = random(16);
        localStorage.setItem(TOKEN_KEY, t);
      }
      return t;
    } catch (e) {
      return random(16);
    }
  }

  function open(o) {
    const bc = o.local !== false && "BroadcastChannel" in window ? new BroadcastChannel("photoRemixControls") : null;
    if (bc) bc.onmessage = (e) => o.onMessage && o.onMessage(e.data);

    let ws = null;
    let session = o.code || "";
    let closed = false;
    let tries = 0;
    let retryTimer = 0;
    let pingTimer = 0;
    let queue = [];
    let status = "";

    function setStatus(s) {
      if (s === status) return;
      status = s;
      if (o.onStatus) o.onStatus(s);
    }

    function connect() {
      clearTimeout(retryTimer);
      if (!RELAY_URL || !session) {
        setStatus("local");
        return;
      }
      setStatus("connecting");
      const url = `${RELAY_URL.replace(/\/$/, "")}/s/${session}?role=${o.role}&t=${encodeURIComponent(deviceToken())}`;
      const sock = new WebSocket(url);
      ws = sock;
      sock.onopen = () => {
        if (ws !== sock) return;
        tries = 0;
        setStatus("online");
        queue.splice(0).forEach((m) => sock.send(m));
        clearInterval(pingTimer);
        pingTimer = setInterval(() => {
          try {
            sock.send("ping");
          } catch (e) {
            /* closing */
          }
        }, 25000);
        if (o.onOpen) o.onOpen();
      };
      sock.onmessage = (e) => {
        if (ws !== sock) return;
        let m;
        try {
          m = JSON.parse(e.data);
        } catch (err) {
          return; // "pong"
        }
        if (m.type === "presence") {
          if (o.onPresence) o.onPresence(m);
        } else if (m.type === "busy") {
          closed = true;
          setStatus("busy");
        } else if (o.onMessage) {
          o.onMessage(m);
        }
      };
      sock.onclose = () => {
        if (ws !== sock) return;
        clearInterval(pingTimer);
        if (closed) return;
        setStatus("offline");
        tries++;
        retryTimer = setTimeout(connect, Math.min(10000, 500 * 2 ** tries));
      };
      sock.onerror = () => {};
    }

    connect();

    return {
      post(msg) {
        if (bc) bc.postMessage(msg);
        if (!RELAY_URL || !session) return;
        const text = JSON.stringify(msg);
        if (ws && ws.readyState === 1) ws.send(text);
        else if (queue.length < 50) queue.push(text);
      },
      setCode(next) {
        session = next;
        closed = false;
        tries = 0;
        queue = [];
        clearInterval(pingTimer);
        if (ws) {
          const old = ws;
          ws = null;
          try {
            old.close();
          } catch (e) {
            /* already closed */
          }
        }
        connect();
      },
      close() {
        closed = true;
        clearTimeout(retryTimer);
        clearInterval(pingTimer);
        if (ws) ws.close();
        if (bc) bc.close();
      },
    };
  }

  window.SpotLink = { open, code, relayUrl: RELAY_URL, enabled: !!RELAY_URL };
})();
