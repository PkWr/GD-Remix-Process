# Build Your Own Halftone Tool

A takeaway from today's session. This is a prompt — paste it into Claude (or any AI coding assistant) and it'll write you a small web page that turns your own photos into halftone dot images, the same technique from the workshop demo.

**How to use it:**

1. Copy the prompt below.
2. Paste it into Claude (or ChatGPT, or whatever you've got).
3. Save what it gives you as a single file called `index.html`.
4. Double-click that file — it opens straight in your browser. No installing anything.
5. Choose a photo, drag the slider, download the result.

---

## The prompt

```
Build me a single HTML file (index.html) that turns a photo into a
halftone image — like an old newspaper photo, made of dots.

What it needs to do:
- Let me choose an image from my computer using a normal file picker.
- Draw the image onto a canvas as a halftone dot pattern: divide the
  image into a grid, sample the average brightness of each cell, then
  draw one black circle per cell — bigger circles for darker areas,
  smaller circles for lighter ones.
- Show the halftone result on screen.
- Give me one slider that controls the dot/grid size, so I can make
  the dots bigger or smaller and see it update live.
- Add a "Download" button that saves the result as a PNG.

Keep it simple:
- One HTML file only — inline CSS and JavaScript, no external
  libraries, no build tools, no frameworks.
- Plain HTML, CSS and canvas/JavaScript I can open by double-clicking
  the file — no server needed.
- Comment the halftone code so I can see exactly what each part is
  doing.
- Keep the interface minimal: file picker, one labelled slider, a
  download button. Nothing else.
```

---

## Once it's working

Try asking follow-up questions in the same chat — this is the actual skill, not just the output:

- "Add a second slider for how dark/light the dots are."
- "Make the dots red instead of black."
- "Can you make it pixelate instead of halftone?"
- "Why did you use `context.arc()` there?" — if you don't understand a line, ask. That's how you actually learn to build with this stuff instead of just running it.
