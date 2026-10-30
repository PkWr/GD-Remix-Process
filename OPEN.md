# Open review points

- **Echo trail** — card hidden from the Motion tab on 30 Oct 2026 (settings, engine and saved scenes untouched; scenes T8 and T9 still switch it on). Come back to it: candidate to collapse Style (even / ragged / smear) into one "Steps ↔ Smear" slider. Re-enable by restoring the card in `settings.js` (search "Echo trail").
- **Strip layers** — should they use the Blend overlay card too?
- **Single-slider merges** (like Geometric ↔ Organic): Roam done (Together ↔ Wandering replaces Direction + Spread). Min/max pairs done for Pixelate, Halftone, ASCII, hold time and shimmer coverage (Random switch removed: handles apart = random, together = fixed). Random move strength left as is (its switch gates the whole move, not just the range). 3D forms Geometric ↔ Organic is now a range (replaces Organic + Mix of forms). Looked at and left as selects: ASCII Characters (Blocks are different glyphs, not just fewer tone levels), Strip "Layers move" (recipes mixing axis, direction and speed, not one scale), 3D forms Photo/Glass (two render paths). Move card also left as is (Random move rolls either direction at a strength between the two handles, a gap around zero that one signed range cannot express).
- **Igloo test** of the Type layer — now belongs to Spot Type.

## To do
- **Port to Spot Type** (not started): the slider merges (Roam, ranges replacing the Random switches, 3D forms range, Lens ↔ Liquid), Roam live updates, and the phone remote (relay.js, Live view, QR). Use `tools/sync-from-spot.sh --diff` in `spot-type`; set the same `RELAY_URL` in its `relay.js`.
- **Test the phone Live view** on a real phone (pad size, Next image timing, scene highlight).
- **Test the relay on the Igloo machine's network.**
- **Mitigate the third-party exposure later** (noted in About > Privacy as of 30 Oct 2026): (1) Google Drive sees the display's IP when Live student photos is on — could serve the photos from our own storage or through the relay instead; (2) the Cloudflare relay sees the IPs of the display and phone. Revisit before wider use, and when writing the SoTL/ethics notes. Also re-read the About text whenever a feature adds a new service.
