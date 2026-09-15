# Ink refinement

The owner rejected the consistency of the earlier interaction treatment. The current rules and evaluation are in [Ink interactions](ink-interactions.md); the entries below preserve the earlier implementation history.

The owner chose Ink on 2026-09-15 and requested small, individual imperfections across every button, with a coherent balance between drawn details and precise content. They rejected the bookmark motif for this direction. This decision replaces the earlier exploration's perfect rounded controls and selected-bookmark treatment.

## Visual treatment

- Native buttons retain their text, icons, geometry, refs, events and focus behavior. `InkButton` adds a decorative SVG contour; `InkLink` gives download actions the same treatment. SVG paths cannot receive input and are hidden from assistive technology.
- A stable React identity seeds each contour. Corners vary independently; edges bend by fractions of a pixel to about one pixel. There is no random movement during typing or polling. Shared observers update geometry when a visible control resizes, and stop measuring controls outside the viewport.
- Thin graphite outlines distinguish ordinary actions. Blue identifies selection and gently retraces the contour over 280ms on hover or keyboard focus. The resting contour remains visible throughout. Primary actions use charcoal, audio actions yellow, and disabled/error states retain their meaning.
- Tabs and text actions use restrained underlines. The bookmark ribbon and traveling selection marker are hidden in Ink. Existing directional page movement and single-face flashcards remain.
- Inputs and panels have small corner asymmetries; typography, reading columns and icons stay aligned. Handwriting appears only in short notebook annotations. Highlighting is quiet and static; there are no decorative idle loops or text distortions.
- Operating-system and local reduced motion remove the retrace animation and retain immediate focus/hover feedback. Native window controls remain platform-owned.

Ink is loaded in production and declared on the document before rendering. The development comparison lab remains available explicitly at `?theme-lab=1`; alternative themes and their photographs are not included in the production build. Existing comparison files are preserved.

## Evaluation

The owner's follow-up requested a vision-led refinement. Screenshot comparison exposed oversized notebook headings, repeated full-width source underlines, excessive space before the first editable pair, a cramped teaching-instructions button, and mobile header text overriding its icon-only layout. Reduced page titles to 28–36px, raised main supporting descriptions to 14px, tightened flashcard setup spacing, placed language controls and search alongside one another on desktop, shortened source pen marks, and centered the study card/actions within a 960px reading area. Native language disclosures, filtering, review text and study behavior remain. On the 1440×1000 authored fixture, the first pair moved from about y=973 to y=782. Mobile stacks the tools and keeps the settings/back control at 44px with its accessible name intact. Visual evidence is in `.work/ink-vision/`; this refinement is packaged separately under `release/0.3.6-vision/`.

The production browser build was inspected on sources, empty states, saved flashcards, practice and settings. All rendered application buttons on sampled pages use the ink control; 24 settings/download contours were all distinct. A contour captured before and after typing remained identical. At 390, 768 and 1440 pixels the checked views had no document-level horizontal overflow.

Observed checks passed: 150-entry autosave, wrong typed-answer rejection, direction switching, reveal/next retaining a single question face, native form submission, keyboard navigation with a solid blue focus outline, disabled controls, and OS reduced motion with no trace animation. Hover tracing settled at zero dash offset. No browser page errors were recorded.

The same heavy authored chat fixture used in the cleanup (20 citations, 280,079 source characters) remained within 16 ms from input to the next animation frame in all 22 samples. This is a local diagnostic, not a universal performance claim. The SVG geometry does not rescan source content and adds no continuous animation or new dependency.

All 38 existing application tests and production/TypeScript build pass. No new repository tests or paid generation were added. Isolated fixtures, screenshots and measurements are under `.work/ink-refinement/`. The one requested Impeccable detector pass found the existing transcript-reference side stripe; Ink overrides it with a highlighter surface and blue focus outline while preserving the reference label and scroll target. Other experiment styles remain historical.

The packaged 0.3.6 executable passed the existing desktop startup, sandbox, private-backend, persistence and restart check. A separate isolated native launch confirmed the default Ink theme, nine contours for nine buttons, and no experiment toolbar. Package and handoff results are recorded in WORKLOG.md. The visual inspection is implementation evidence; the owner's reaction to this refinement is still to come.
