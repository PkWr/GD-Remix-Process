# Deck style spec — Building-With-AI-Photo-Remix-Effects.pptx

Source of truth is `build_deck.js`. This doc is a readable mirror of its
constants block, kept in sync on every change so the design system can be
read without opening the code. If this doc and `build_deck.js` ever disagree,
the code wins — flag it and re-sync this file.

See also: `deck-layout-rules.md` for the layout-verification checklist (line
height formula, minimum buffers, required render checks before calling a
spacing change done).

## Fonts

- Headlines / labels / UI chrome: **IBM Plex Sans** (`FONT_HEAD`, `FONT_BODY`)
- Narrative prose, captions, citations: **IBM Plex Mono** (`FONT_MONO`)

## Type scale

Every text style in the deck maps to one of these — nothing hardcodes a size.

| Constant | Size | Use |
|---|---|---|
| `SIZE_HERO` | 54pt | Title-slide headline only — the one deliberate exception |
| `SIZE_HERO_SUB` | 19pt | Title-slide subtitle, paired with `SIZE_HERO` |
| `SIZE_TITLE` | 34pt | Every other slide's title/headline |
| `SIZE_EYEBROW` | 12pt | Small-caps section labels — bold, GREY, tracked (`TRACK_EYEBROW` 1.8). Two uses: page-level kicker above a title, and an in-body H2 subheading |
| `SIZE_BODY` | 13pt | Primary narrative/paragraph copy |
| `SIZE_CAPTION` | 11pt | Secondary/supporting text — hints, notes — italic, GREY |
| `SIZE_LINK` | 12.5pt | Inline "further reading" hyperlink label |
| `SIZE_LINK_CTA` | 20pt | Standalone CTA hyperlink (example slides) |

**H2 casing rule:** author H2 strings in natural case, call `.toUpperCase()`
at the render site. Every H2 instance does this so casing never depends on
someone remembering to type caps by hand. The page-level kicker is typed as
a literal caps string at each call site instead (it's never author-editable
copy — always a fixed slide label).

**Title casing rule:** `SIZE_TITLE` text is always natural Title Case, never
forced caps — including `exampleSlide`'s `tag`, which must match the
corresponding effect's `name` exactly (e.g. "Colour Conversion" appears
identically on both the effect slide and its example slide).

**Line-length rule:** no rendered line of copy exceeds **8 words**. Applies
to prose that wraps — headlines, narrative/hint/meaning paragraphs, notes,
bullets. If a string wraps past 8 words on a line, shorten the copy or force
an earlier break — don't widen the box to fit more words on one line.

**Going forward, this is checked by eye, not enforced in code.** Deriving a
width/maxWords formula per context (below) turned a simple rule into more
scaffolding than the rule was worth. For any new slide: write the copy,
render it, read the wrap, and hand-adjust (rewrite the sentence or insert a
manual break) if a line runs long or strands a word — the same as the
render-verification step in `deck-layout-rules.md` already does for
collisions. Don't add a new tuned width or a new `maxWords` override to
chase this automatically.

Scope note: this does **not** apply to single-line metadata/label rows
joined with " · " (task header times, the title slide's date/time line, the
last-8 country list, colour-swatch labels). Those are a different genre —
compact fact-strings, not prose — and forcing them under 8 words would mean
breaking a working, established pattern for no readability gain. The rule
targets lines a reader parses as a sentence, not a joined list of facts.

**No orphans/widows:** never leave a single word alone on the last line of a
wrapped paragraph (orphan), and never let just one line of a paragraph spill
onto its own page/box separate from the rest (widow). If a wrap produces
either, rewrite the copy or insert a manual break so the last line carries
at least two words and the paragraph doesn't split awkwardly. Check both
rules at the same render-verification step described in
`deck-layout-rules.md` — they're a copy-fit problem, not just a spacing one,
so they won't show up from the line-height formula alone.

### How the 8-word cap is actually enforced

Relying on box width plus the renderer's automatic word-wrap to land under a
specific word count doesn't work reliably — LibreOffice/PowerPoint wrap by
pixel width, not word count, and the exact wrap point shifts with font,
italics, and the specific letters in a word. Every prose paragraph in the
deck is instead pre-broken in code, and the renderer just displays the
result — it never decides where a line ends.

- `wrapWords(text, maxWords = 8)` splits a string into an array of lines,
  balancing the word count evenly across the number of lines needed
  (`Math.ceil(words / maxWords)` lines, words spread as evenly as possible)
  rather than greedily filling each line to the cap and dumping the
  remainder on the last line. Even balancing means the last line never ends
  up dangerously short by construction — a 17-word paragraph becomes three
  6/6/5-word lines, not 8/8/1.
- `noOrphan(text)` glues the final two words of a line with a non-breaking
  space, as a second guard in case hand-written lines bypass `wrapWords`.
- `prose(text, opts, trailingGap, maxWords)` runs a paragraph through
  `wrapWords`, turns each line into a run with `breakLine: true`, and
  applies `noOrphan` + the paragraph's trailing gap only to the last line.
  This is what every narrative/hint/meaning/note/bullet string in the deck
  is passed through — never a raw string relying on auto-wrap.
- `proseH(text, fontSize, trailingGap, maxWords)` returns the exact box
  height (inches) for a `prose()` block, using the same line-height formula
  as `deck-layout-rules.md`, so boxes are stacked with computed gaps instead
  of guessed ones.
- Headlines (`SIZE_TITLE`) don't go through `prose()` — `taskSlide` and
  `uploadSlide` both accept `headline` as either a plain string (left to
  auto-wrap, fine for short headlines) or an array of manually-chosen lines,
  for the two cases where the plain string's natural wrap violated a rule:
  task 2 ("Draw a flag of a country / in the World Cup last 8." — the plain
  string put 10 words on line 1) and upload 1 ("Upload your feet photo /
  before you carry on." — the plain string stranded "on." alone).

### Container widths — not the enforcement mechanism, just clearance

A `prose()`-wrapped line is only as reliable as the box being wide enough to
display it without the renderer re-wrapping it a second time (which would
silently break the exact line control above). Widths are tuned empirically
per context, not derived from a single formula:

- `PROSE_W` = 7.0in — single-column prose (task/upload/tour/"designing to
  let go" bodies, example-slide notes). Wide enough for every paragraph in
  the deck at the default `maxWords = 8`. Deliberately kept wide rather than
  grid-snapped to a tighter value: a narrower column needs a lower per-box
  `maxWords` to stay reliable, which means shorter, choppier lines and more
  scaffolding to hand-tune — not worth it for a deck this size (see the
  by-eye rule above). `taskSlide` always stacks its content in a single
  column at this width; no slide currently needs a second column.
- Effect and blend-mode slide bodies keep the grid's `TEXT_W` (≈6.1in,
  shared with the diagram column) rather than `PROSE_W` — verified to hold
  an 8-word `SIZE_BODY` line, except Blend Modes' meaning paragraph (see
  below).
- `PROSE_COL_W` = 4.55in — narrow per-column width, used only where a single
  column doesn't have enough vertical room for a paragraph even at the
  8-word cap (currently only the title slide's intro paragraph, split into
  two side-by-side columns instead of one tall stack).
- Two paragraphs override `maxWords` down from the default 8 because their
  long words (proper nouns, "-ing" words) push an 8-word line past its
  column's width: the title slide's second intro column (`maxWords: 5`, in
  a `PROSE_COL_W` box — the parenthetical effect list "(Colour Conversion,
  Pixelation, Halftone, ASCII)" is long per-word) and the Blend Modes
  meaning paragraph (`maxWords: 6`, in a `TEXT_W` box — "overlapping" /
  "projectors" are long). Both are still well under the 8-word cap, just
  tuned tighter for their column.

## Colour

- Palette: pure black/white/grey only outside the brand system — `BLACK`
  #000000, `WHITE` #FFFFFF, `GREY` #595959, `LINE` #BFBFBF, `FILL_GREY`
  #D9D9D9, `MID_GREY` #8C8C8C (diagram fills only)
- Brand: `BRAND` #00FF66
  - `BG_TITLE` — full brand colour (title slide)
  - `BG_TASK` — #CCFFE0, 20% tint of brand over white (task slides)
  - `BG_EXPLAINER` — #E6FFF0, 10% tint of brand over white (effect/blend
    explainer slides)

## Margin

- `MARGIN` = 0.3in = **30px** @100dpi (28.8px @96dpi) — one uniform value on
  all four edges, every slide, no exceptions
- `CONTENT_BOTTOM` = `SLIDE_H - MARGIN` = 5.325in — nothing should render
  below this (this doc previously said 5.025in — that was a stale comment
  copied from an earlier draft; the code was always computing 5.325in
  correctly, only the comment/doc were wrong)
- `EYEBROW_Y` = `MARGIN` — every eyebrow/label sits at this exact y on every
  slide
- Demonstrated live on the style-reference slide (last slide) via a
  dimension-arrow callout in the top-left corner, using the real `MARGIN`
  constant, plus two solid cyan vertical guide lines at `x = MARGIN` and
  `x = SLIDE_W - MARGIN`, full slide height — these intentionally run right
  along the edge of the text columns, since that edge *is* the margin
  boundary

## Grid

- 12-column grid, `GRID_X = MARGIN`, `GRID_W = SLIDE_W - 2×MARGIN` (9.4in)
- `COL = GRID_W / 12` ≈ 0.7833in per column
- Effect/blend slides split the grid into two zones with a single `GUTTER`
  (0.3in) at the seam: `TEXT_COLS` = 8, `DIAG_COLS` = 4
  - `TEXT_X = GRID_X`, `TEXT_W = 8×COL − GUTTER/2`
  - `DIAG_X = ZONE_A_END + GUTTER/2`, `DIAG_W = 4×COL − GUTTER/2`
- `LOGO_W = 2×COL` (title-slide logo, top-left)
- **Style-reference slide grid overlay** (demo-only, doesn't feed the values
  above): dotted cyan boxes, **12 columns × 3 rows** (`GRID_ROWS = 3`), each
  axis drawn with the same real **15px** gutter between boxes
  (`GRID_GUTTER_PX = 15`, i.e. 0.15in @100dpi) — columns span full slide
  height edge to edge, rows span full slide width edge to edge, so the two
  sets cross to form one grid. This is a separate, illustrative constant
  from the deck-wide `GUTTER` — it exists to show what a 12-col/3-row grid
  with equal gutters looks like, not to resize `TEXT_W`/`DIAG_W`.

## Spacing

- `PARA_GAP` = 12pt between paragraphs — one consistent "return," used
  everywhere via `paraSpaceAfter`
- `BODY_LINE_SPACING` = 1.25 — line-height multiple for body copy
- `TITLE_GAP` = 0.15in — the one consistent gap between any title's box
  bottom (`y + h`) and the content box that follows it, applied on every
  slide type
- Title box heights:
  - `TITLE_H_1LINE` = 0.6in — every `SIZE_TITLE` heading that's always one
    short line (tour, "designing to let go," example, effect, blend, style
    reference)
  - `TASK_HEAD_H` = 1.2in — wrap-safe two-line slot, shared by task and
    upload slides (headlines that can run long)

**Body content is stacked boxes, not one shared box.** `taskSlide`,
`uploadSlide`, `tourSlide`, and the "designing to let go" block each build
their body as multiple independently-positioned `addText` calls (narrative,
then hint, then footer/strapline, etc.) stacked with `proseH`-computed
heights, rather than one box holding every run. This is a direct consequence
of the 8-word-cap work: prose needs `PROSE_W`, but a couple of slides also
carry an exempt full-width metadata row in the same body (the title slide's
date line, task 2's last-8 country list) — a single shared box can't be both
widths at once, so metadata rows got their own full-width box and prose got
its own `PROSE_W` box, positioned with a computed y instead of relying on
`paraSpaceAfter` to flow one box into the next.

## Style-reference slide

The last slide of the deck (slide 21) is a live rendering of part of this
spec — every value shown on it is pulled from the actual constants above,
not retyped. It shows: the full type scale with live samples, the colour
swatches with hex values, a margin dimension callout with vertical guide
lines, and the 12-column × 3-row grid overlay with equal 15px gutters.

The type scale samples (`specRow`/`colA`/`colB`/`colC`) were briefly removed
on the assumption this document was the reference for them now, then
restored — the live samples are worth keeping in the deck even though this
doc also documents them. What stayed removed: the "Type Scale" title and
its descriptive note paragraph, which were redundant once this doc existed.

The columns are snapped to the grid on **both axes**, not just horizontally:

- Horizontal: three columns of 4 grid-columns each (`COLS_PER_GROUP =
  GRID_COLS / 3`), `COL_W = 4×gridColW + 3×GRID_GUTTER`. `colA` occupies
  grid columns 1–4, `colB` 5–8, `colC` 9–12, each meeting the next at a real
  gutter — a correction from an earlier 6+6 (12/2) split, which wasted the
  available width; 12/3 gives a more useful column measure for this content.
- Vertical: `COL_Y` snaps to row B's real top edge (`gridRowH + GRID_GUTTER`),
  not an arbitrary value — the block starts exactly where the grid overlay's
  row B begins.
- Height: `COL_H = gridRowH`, i.e. the block is sized to fit *inside* row B,
  not spill past its bottom edge into row C.

Fitting inside one row height (1.775in) forced the 9 samples to be grouped
by actual rendered height, not an even 3/3/3 split — `SIZE_HERO` (54pt) and
`SIZE_TITLE` (34pt) alone already consume most of a row's height once their
spec-label captions are included, so they're paired alone in `colA` (2
items); the remaining 7 split 3/4 by height budget, not by count:
`colB` = Hero subtitle, Eyebrow · Kicker, Eyebrow · H2 (3 items); `colC` =
Caption, Body, Link, Link CTA (4 items). All three groups were checked
against the vertical-rhythm formula in `deck-layout-rules.md` before being
called done, each landing with ≥0.2in of clear buffer under row B's height.
`lineSpacingMultiple` for these three text boxes is `SAMPLE_LS = 0.85`
(tighter than the deck-wide default) specifically to buy that buffer —
scoped to this block only, not a deck-wide spacing change.

The colour swatches are snapped to the grid overlay: each swatch is exactly
1 grid column wide (`SW_COLS = 1`), using the same `gridColW` the overlay
draws with. 6 swatches occupy the first 6 of 12 columns; the rest of the row
is visibly empty rather than stretched to fill the width.

The grid overlay is labelled: columns 1–12 numbered in the bottom outer
margin (centred under each column), rows **A–C** lettered in the right outer
margin (centred beside each row — letters, not numbers, so a cell reference
like "column 4, row B" can't be misread as two numbers), both in the same
cyan as the grid lines. The descriptive "12-COL × 3-ROW GRID..." caption
lives in the top-right corner, mirroring the margin callout's top-left
placement — this frees the bottom margin band for the column numbers
instead of competing with them.

## Maintenance

Update this doc whenever a constant in the block above changes in
`build_deck.js` — same commit/session, not a follow-up. Keep the table
values and prose in sync; don't let this drift into a stale snapshot.
