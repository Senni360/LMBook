# LMBook design

## Overview
Operate mode: Ink, selected by the owner on 2026-09-15. A quiet notebook with precise typography and alignment, individually drawn controls, blue pen marks and restrained yellow highlighting. The source → learning goals → audio progression remains the signature interaction. The owner wants a cohesive human-created feeling: slight imperfections throughout controls, balanced by orderly reading surfaces.

## Colors
Charcoal #1d1f24 for text, white paper, #fbfbf9 canvas, #f2f2ee rail, #5a5e68 secondary text, and #2346d8 pen blue for selection and focus. Yellow #ffe465 identifies audio actions; a small #ffe966 highlighter mark supports section headings. Error and source-review colors retain their semantic roles. No background photographs or decorative gradients in the selected design.

## Typography
Segoe UI Variable/Segoe UI handles precise reading and controls, with a system sans-serif fallback. Page titles scale from 28–36px, leaving room for the learning workspace. Ink Free/Segoe Print is reserved for short notebook annotations, never buttons or study text. Main supporting descriptions are 14px; mobile inputs are 16px. Sentence-case labels and readable source excerpts remain.

## Layout
A 232px fixed notebook rail, flexible working page, source ledger and objective evidence rows. Desktop audio studio pairs a 294px configuration panel with chapters and transcript. Mobile navigation becomes a compact header. Once an episode exists, its listening workspace precedes configuration on small screens. Advanced voice settings are disclosed on demand.

## Elevation & Depth
Primarily flat with fine borders. Shadows are limited to the welcome book/record illustration, toast and modal.

## Shapes
Controls use unique, stable pen contours with slightly bowed edges and independently varied corners. Shared SVG geometry keeps stroke thickness consistent across sizes. Fine asymmetric radii on fields and panels connect them to the same world without drawing a heavy frame around everything. Text, icons, baselines and hit targets stay precise. No turbulence filters, random repainting, whole-control rotations or decorative sketch scenes.

## Components
Every application button uses InkButton; button-like download links use InkLink. These retain native button/anchor semantics, refs and events. Their decorative SVG is hidden from assistive technology and cannot receive pointer events. Tab and text-action contours are underlines; other controls have light outlines. Primary actions remain charcoal, audio yellow, and selection blue. Empty, disabled, loading, error and recovery states remain functional. InkInput, InkTextarea and InkSelect retain native editing, selection, labels and refs inside a shared decorative contour. Chat owns a single writing-surface contour.

## Motion
Hover, editing focus, selection and section arrival have distinct jobs in one pen-and-paper vocabulary. Interruptible traces, consistent heading marks and stateful icons follow [the authoritative interaction rules and evaluation](docs/ui/ink-interactions.md). Existing directional movement and single-face practice remain; reduced motion and forced colors preserve clear feedback. Viewport observation defers field geometry in long lists. Earlier visual decisions are in [the Ink history](docs/ui/ink.md).

## Do's and Don'ts
Keep examples explicitly illustrative. Never fake audio or source verification. Distinguish provider configuration from tested authentication. Maintain desktop and phone readability, reduced motion support, and keyboard access.
