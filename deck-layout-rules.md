# Deck layout rules — build_deck.js

Why this exists: the style reference slide overflowed (note text collided with
`SIZE_HERO · 54pt` below it) even though a full-slide render at 120–150dpi looked
fine. The overlap only showed up on a 300dpi crop of that specific boundary.
Low-res full-slide renders hide sub-0.1in collisions — don't trust them alone.

## Vertical rhythm formula

For any stacked text box in this deck, estimate the height a paragraph will
occupy before laying out the next element:

```
line height (pt) ≈ fontSize × 1.2 × lineSpacingMultiple
block height (pt) = (line height + paraSpaceAfter) × number of lines
                     (paraSpaceAfter only applies once, after the last line
                     of that run — not between wrapped lines within it)
```

Convert to inches by dividing by 72. This is an estimate, not exact — always
verify with a render (see below).

## Rule: minimum clear buffer

Leave at least **0.1in of calculated clear space** between the estimated
bottom of one text block and the y-position of the next. If a box's text can
wrap to more lines than expected (long strings, narrow boxes), budget for one
extra line.

## Mandatory verification step

Before calling a layout change done, for any slide where text boxes are
stacked close together:

1. Rebuild (`node build_deck.js`), validate, convert to PDF.
2. Render the affected slide at **300dpi**, not the usual 120–150dpi QA pass.
3. Crop tightly around each boundary between stacked text blocks and inspect
   at full resolution — check for glyph-level collision, not just "looks like
   there's a gap" at a glance.
4. Check copy-fit rules from `deck-style-spec.md` on any wrapped text: no
   line over 8 words, no orphan (single word alone on the last line), no
   widow (a lone line separated from the rest of its paragraph). These won't
   show up from the line-height formula — they need eyes on the actual
   rendered wrap.
5. Only then treat the change as confirmed.

A full-slide screenshot at normal QA resolution is a first pass, not proof —
it has repeatedly missed sub-0.1in overlaps that are obvious once cropped and
zoomed.
