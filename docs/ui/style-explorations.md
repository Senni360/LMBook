# LMBook style explorations

Status: the owner selected Ink on 2026-09-15. The default app now uses the [refined Ink design](ink.md); DESIGN.md records the selected direction. Earlier experiments remain available in development at `?theme-lab=1`, with Ctrl+Alt+1 to 6. They are not shipped as production theme choices.

## Owner feedback that shaped round 2

- Glass has potential but must be more see-through, like liquid glass. Curves must match: the rail, window, inputs and tabs previously used different radii. Gradient colour blobs look AI-generated; a real image or something better belongs behind the glass.
- Brown is a good colour, but Walnut executed it badly.
- Bookcloth was too close to the original. Keep its bookmark on the active section, moved to the right side, and use it in every style.
- Signal and Riso looked awful. "Out there" should mean a simple, even plain base with one living, thoughtful element inside it, in the spirit of brutalism and the existing motion work, not loud colour.
- Original is the baseline for comparison. It only gained the matching title bar, slim scrollbars and the bookmark.

## Shared rules

- The earlier round shared a right-side bookmark ribbon. The owner's newer Ink decision removes it from Ink; the historical alternatives retain it.
- Living details respond to real interaction or real work, never idle loops, and respect reduced motion. This follows docs/ui/motion.md.
- The earlier alternatives use one surface/control radius. Refined Ink intentionally varies corners within narrow bounds, following the owner's request.

## 1. Glass

Two flush panes over a real landscape photograph: a clear, lightly frosted rail and a more frosted working pane for reading. Neither pane has an outer curve, so nothing fights the window corner. Everything inside uses one surface curve and one control curve, squircle-shaped where supported. Glass layers carry specular edge light, and system blue is the only action colour. Four photos are selectable to compare: Mist (Lake Bled sunrise), Silhouette, Forest and Lake. Darker photos get more frost so text stays readable.

## 2. Cocoa

Brown done cleanly: a flat dark-chocolate rail, a light warm page, white panels with soft brown hairlines, chocolate primary buttons and one caramel accent for the bookmark and audio. No wood grain and no dark beige mud.

## 3. Ink

A plain white notebook that a person is actively marking up. Its living detail is a blue pen that loops the selected notebook, underlines the active tab by hand, and swipes under the main button on hover. A highlighter sweeps across each section title as it appears, and annotation labels use handwriting.

## 4. Brutal

Honest brutalism with an exposed construction grid, 1px black rules, square corners, Arial for work and a huge Times title. Black inversion is the only emphasis, with one electric blue. Its living detail is the grid lighting up blue around the pointer, while rows, tabs and buttons fill black from the left as you point at them.

## 5. Studio

A quiet dark listening studio with mint actions and an amber bookmark. Its living detail is a waveform divider under the section tabs. It stays still at rest, drifts while you point at the tabs, and runs whenever LMBook is actually busy.

## Evaluation

Record the owner's reaction per style here. Deeper component screens such as audio import, OCR and Google setup may still show original colours until a direction is chosen. Background photos come from Pexels under its free license; see public/wallpapers/CREDITS.md.
