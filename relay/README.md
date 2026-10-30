# Spot remote relay

A tiny Cloudflare Worker that lets a phone control a running Spot over the internet.
It passes control settings between the display and one phone and stores nothing.
Images and the camera never go through it.

## One-time setup (free Cloudflare account)

1. Make a free account at https://dash.cloudflare.com/sign-up (no card needed).
2. In Terminal:
   ```
   cd ~/Sites/spot/relay
   npx wrangler login
   npx wrangler deploy
   ```
   (needs Node.js; `npx` downloads wrangler the first time)
3. It prints an address like `https://spot-relay.<your-name>.workers.dev`.
4. Open `relay.js` in the Spot folder and set
   `const RELAY_URL = "wss://spot-relay.<your-name>.workers.dev";`
   (same address, but `wss://` instead of `https://`). Commit and push.
5. In Spot: Show tab > Phone remote. Scan the QR with a phone.

Spot Type uses the same relay: copy the same `RELAY_URL` into its `relay.js`.

## Rules
- One phone at a time per display. A second phone sees "already connected".
  The same phone can reconnect. "New code" on the display disconnects everyone.
- Only Spot's own sites (spot.pkwr.co, type.pkwr.co) and localhost may connect.
- Free-plan limits are far above workshop use.

## Test locally
`npx wrangler dev` runs it at `ws://localhost:8787`; set `RELAY_URL` to that while testing.
