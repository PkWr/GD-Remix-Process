// Spot remote relay — a tiny Cloudflare Worker + Durable Object.
//
// One "room" per session code. The display page and ONE phone connect to the
// same room over WebSocket and the room passes messages between them. It
// stores nothing: messages are forwarded and forgotten. Only control
// settings travel through it (never images, never the camera).
//
//   wss://<worker>/s/<code>?role=display|remote&t=<device token>
//
// - display: always welcome; a new display connection replaces an older one.
// - remote:  only one at a time. A second, different device is told "busy"
//            (close code 4001). The same device (same token) may reconnect
//            and replaces its own stale connection.

const CODE_RE = /^[A-Za-z0-9]{16,64}$/;
const MAX_MESSAGE = 65536; // bytes of text per message
const DEFAULT_ORIGINS = ["https://spot.pkwr.co", "https://type.pkwr.co", "https://pkwr.github.io"];

function originAllowed(origin, env) {
  if (!origin) return false;
  const extra = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if ([...DEFAULT_ORIGINS, ...extra].includes(origin)) return true;
  try {
    const u = new URL(origin);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1"; // local testing
  } catch (e) {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/s\/([A-Za-z0-9]+)$/);
    if (!m || !CODE_RE.test(m[1])) return new Response("Not found", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a websocket", { status: 426 });
    if (!originAllowed(request.headers.get("Origin"), env)) return new Response("Forbidden", { status: 403 });
    const room = env.ROOM.get(env.ROOM.idFromName(m[1]));
    return room.fetch(request);
  },
};

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // Keep-alive pings are answered by the platform without waking this object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  tags(ws) {
    return this.ctx.getTags(ws);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get("role") === "display" ? "display" : "remote";
    const token = (url.searchParams.get("t") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const sockets = this.ctx.getWebSockets();
    if (role === "display") {
      // A reloaded display replaces its stale predecessor.
      for (const s of sockets) if (this.tags(s).includes("display")) this.drop(s, 4000, "replaced");
    } else {
      const existing = sockets.find((s) => this.tags(s).includes("remote"));
      if (existing) {
        if (token && this.tags(existing).includes("t:" + token)) {
          this.drop(existing, 4000, "replaced"); // same phone reconnecting
        } else {
          this.ctx.acceptWebSocket(server, ["busy"]);
          server.send(JSON.stringify({ type: "busy" }));
          server.close(4001, "busy");
          return new Response(null, { status: 101, webSocket: client });
        }
      }
    }

    this.ctx.acceptWebSocket(server, [role, "t:" + token]);
    this.presence();
    return new Response(null, { status: 101, webSocket: client });
  }

  drop(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch (e) {
      /* already closed */
    }
  }

  presence(exclude) {
    const live = this.ctx.getWebSockets().filter((s) => s !== exclude && !this.tags(s).includes("busy"));
    const msg = JSON.stringify({
      type: "presence",
      display: live.filter((s) => this.tags(s).includes("display")).length,
      remote: live.filter((s) => this.tags(s).includes("remote")).length,
    });
    for (const s of live) {
      try {
        s.send(msg);
      } catch (e) {
        /* socket going away */
      }
    }
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > MAX_MESSAGE) return;
    if (this.tags(ws).includes("busy")) return;
    for (const s of this.ctx.getWebSockets()) {
      if (s === ws || this.tags(s).includes("busy")) continue;
      try {
        s.send(message);
      } catch (e) {
        /* socket going away */
      }
    }
  }

  async webSocketClose(ws) {
    this.drop(ws, 1000, "bye");
    this.presence(ws);
  }

  async webSocketError(ws) {
    this.presence(ws);
  }
}
