# SenniBook
<!-- impeccable:product-schema 1 -->
## Platform
web

Electron desktop app with a reusable web interface, chosen by the owner on 2026-09-14. Windows is the first desktop target. The local browser edition remains useful for development; phone-friendly listening remains a product requirement.
## Users
The owner and friends study in Dutch and English, from high school to advanced politics, biology and economics. English is the confirmed default for new notebooks. They listen while walking, sometimes ten hours in a week, sometimes none. The owner listens on an iPhone and does not currently use Obsidian. SenniBook must work independently; vault integration remains optional.
## Product Purpose
Turn course sources, begrippen and leerdoelen into detailed, engaging two-person conversations that address what the learner actually needs to understand or do. Objectives establish a minimum; deeper understanding is welcome. The primary audience is the owner and friends who will invest in preparation for a more useful learning experience.
## Operating Context
The current app accepts sources and objectives, offers source-coverage review, and generates audio for introductions, exploration or revision. The owner wants required preparation before generation and endorsed five starting areas: intended outcome, required coverage, treatment of the source, starting knowledge, and needed assistance. Follow with targeted questions when answers leave consequential ambiguity. Research must determine the wording, adaptation, and handling of previously established answers. This is a purposeful diagnostic check, not a request for an exhaustive long interview. Preserve source terminology and qualifications. Avoid forced metaphors and repetitive podcast formulas.

Politics is primarily a personal interest for the owner; history also serves school requirements. Required-learning documents should be distinguishable from supporting sources. In economics, the owner reports understanding concepts such as GDP and unemployment while struggling to select and perform the corresponding calculations. Their approximate 60% numerical / 40% written assessment split describes their course experience. Optional visual support during listening is a proposal to investigate. Biology guidance remains open pending other learners' perspectives.

The owner's past German-literature course illustrates an annotated reading: preserve the original wording and all requested material, with clearly distinguished explanatory pauses. Their Roman-Empire history course instead called for teaching specified concepts and ideas from a requirements document. Establish coverage, fidelity to original wording, and intended learning task separately; a general summary or a more detailed summary would not satisfy the annotated-reading example. This example does not establish a new implemented language capability.

Confirmed source formats include selectable and scanned PDFs, slides, audio recordings, Markdown, HTML and Word. Scans and photos are mostly printed course pages and slides, rather than handwriting (confirmed 2026-09-14). Keep original recordings alongside local transcripts with timestamps. Those transcripts provide searchable citation anchors; a later multimodal check can compare uncertain passages with the original audio. Transcription and podcast voice generation are separate features.
## Capabilities and Constraints
Open source and editable harness. Existing Codex/ChatGPT Pro, OpenCode Go and Google AI Pro subscriptions. Google Cloud credits must be activated and verified separately. RTX 3060/3080 local model options. API speech costs must be transparent. Obsidian integration is exploratory; portable Markdown is the first step.
## Evidence on Hand
Detailed user conversation; no actual course pack or audio samples provided. Example notebook content must be visibly labelled illustrative.
## Product Principles
- Prioritize interaction behavior and reliability over cosmetic redesign. The owner does not require matching another product's colors or appearance. Review relevant upstream UI issues and verified solutions to avoid repeating them; confirm applicability before changing SenniBook.
- Coverage must be inspectable, with evidence and unresolved gaps.
- Depth and assumed knowledge are independent of subject.
- Natural conversations preserve precision.
- Preparation should resolve meaningful uncertainty about the learner's needs. Evaluate the value of questions and the burden of repeated setup; ease of generating an episode is not the sole product goal.
- Keep original sources separate from generated interpretation.
## Open Decisions
Voice preferences and friends' exact GPU memory remain unknown. This machine has an RTX 3060 with 12 GB VRAM and Python 3.13. The owner has not set up a Google Cloud project and wants guided setup in the app. SenniBook is a working name from the workspace directory.

The first [learning-experience findings](docs/research/learning-experience-findings.md) recommend a [candidate five-area conversation](docs/research/learner-interview.md), consequential follow-ups, and a shared brief. This is a research recommendation, not an adopted or validated feature. Wording, readiness, brief reuse, and numerical/visual support still need evaluation with actual material and learners. The investigation and confirmed needs are recorded in [the research plan](docs/research/learning-experience-plan.md). Project collaboration and quality expectations live in [AGENTS.md](AGENTS.md).
