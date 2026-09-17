import type {
  LabNote,
  LabState,
  Message,
  Pair,
  Suggestion,
  ViewState,
} from "./types";

export const directions = [
  {
    id: 1,
    title: "Balanced studio",
    summary: "Stable material, work and context panes.",
    signature: "Evidence alignment",
  },
  {
    id: 2,
    title: "Focus first",
    summary: "A calm reading-first notebook with a parked thought.",
    signature: "Parked thought",
  },
  {
    id: 3,
    title: "Notebook tabs",
    summary: "Notes stay visible as a connected working set.",
    signature: "Handoff",
  },
  {
    id: 4,
    title: "Document first",
    summary: "Source text leads while proposals stay in the margin.",
    signature: "Margin draft",
  },
  {
    id: 5,
    title: "Study first",
    summary: "Practice and listening form a deliberate study loop.",
    signature: "Detour",
  },
  {
    id: 6,
    title: "Research first",
    summary: "Claims, passages and edits remain adjacent.",
    signature: "Claim workbench",
  },
  {
    id: 7,
    title: "Outline led",
    summary: "Questions and open branches shape the notebook.",
    signature: "Question lens",
  },
  {
    id: 8,
    title: "Workspace tabs",
    summary: "Reusable workspaces keep related tasks together.",
    signature: "Working set",
  },
  {
    id: 9,
    title: "Notebook overview",
    summary: "A welcoming route from goal to finished episode.",
    signature: "Changes lens",
  },
  {
    id: 10,
    title: "Reading and learning split",
    summary: "Reading and learning keep two deliberate positions.",
    signature: "Two reading positions",
  },
  {
    id: 11,
    title: "Your sketch · flexible workspace",
    summary:
      "Start with your three columns, then move tabs and split any pane in either direction.",
    signature: "Freely arranged tabs and splits",
  },
] as const;

const core: Array<[string, string, string, string, boolean]> = [
  [
    "question",
    "01 Questions/Research question.md",
    "Research question",
    "How did the reservoir change relocation decisions for participating households?",
    false,
  ],
  [
    "survey",
    "02 Methods/Pilot survey.md",
    "Pilot survey",
    "In the pilot survey, 12 of 40 participating households reported moving after the reservoir opened.",
    true,
  ],
  [
    "methods-definitions",
    "02 Methods/Definitions.md",
    "Definitions",
    "The pilot group includes participating households reached by the survey; it is not a census of every household near the reservoir. The survey did not establish why they moved, so this passage cannot establish causality.",
    false,
  ],
  [
    "relocation",
    "03 Findings/Relocation.md",
    "Relocation",
    "Relocation was reported by some participating households. The long reading record keeps responses, context and the limits of the pilot together.\n\nThe survey records what respondents said happened after the reservoir opened. It does not on its own establish where a household moved, when the decision was made, or which factors mattered most.",
    false,
  ],
  [
    "findings-definitions",
    "03 Findings/Definitions.md",
    "Definitions",
    "Reported moving means a respondent described a move. Displacement would require a stronger account of compulsion, alternatives and causation.",
    false,
  ],
  [
    "claim",
    "04 Discussion/Claim draft.md",
    "Claim draft",
    "The reservoir displaced 30% of all households.",
    false,
  ],
  [
    "open-questions",
    "04 Discussion/Open questions.md",
    "Open questions",
    "Which households were not reached, and what other reasons could explain reported moves?",
    false,
  ],
  [
    "study",
    "05 Learning/Study notes.md",
    "Study notes",
    "Remember to separate the sample proportion from a claim about all households, and to separate association from cause.",
    false,
  ],
];

function note(
  id: string,
  path: string,
  title: string,
  text: string,
  source: boolean,
): LabNote {
  return {
    id,
    path,
    title,
    text,
    revision: 1,
    topic: id === "claim" ? "claim" : id === "survey" ? "method" : "water",
    source,
  };
}

export function fixtureNotes(): LabNote[] {
  const notes = core.map(([id, path, title, text, source]) =>
    note(id, path, title, text, source),
  );
  for (let i = 1; i <= 283; i++) {
    const area =
      i % 3 === 0
        ? "06 Archive"
        : i % 3 === 1
          ? "07 Sources"
          : "08 Working notes";
    notes.push(
      note(
        `illustrative-${String(i).padStart(3, "0")}`,
        `${area}/Illustrative note ${String(i).padStart(3, "0")}.md`,
        `Illustrative note ${i}: reservoir and society`,
        `Illustrative fixture note ${i}. This deterministic material is available to exercise search, long lists and opening behaviour.`,
        i % 4 === 0,
      ),
    );
  }
  return notes;
}

export const fixturePairs: Pair[] = [
  ["die Entscheidung", "de beslissing"],
  ["die Erfahrung", "de ervaring"],
  ["der Unterschied", "het verschil"],
  ["die Voraussetzung", "de voorwaarde"],
  ["der Zusammenhang", "het verband"],
  ["die Entwicklung", "de ontwikkeling"],
  ["die Ursache", "de oorzaak"],
  ["die Folge", "het gevolg"],
  ["die Maßnahme", "de maatregel"],
  ["die Möglichkeit", "de mogelijkheid"],
  ["der Vergleich", "de vergelijking"],
  ["die Auswirkung", "het effect"],
].map(([german, dutch], i) => ({
  id: `pair-${i + 1}`,
  german,
  dutch,
  generated: i === 11,
  reviewed: i !== 7,
}));

export const fixtureMessages: Message[] = [
  {
    id: "message-relocation",
    question: "What does the pilot survey actually establish?",
    answer:
      "It reports that 12 of 40 participating households said they moved after the reservoir opened. The separate qualification means this does not establish why they moved or support a population-wide causal claim.",
    sources: [
      { id: "survey", title: "Pilot survey", text: core[1][3], revision: 1 },
      {
        id: "methods-definitions",
        title: "Survey qualification",
        text: "The survey did not establish why participating households moved.",
        revision: 1,
      },
    ],
  },
];

export function fixtureSuggestions(): Suggestion[] {
  return [
    {
      id: "A",
      title: "Link the sample limitation",
      noteId: "claim",
      detail: "Connect the claim to the method definition before revising it.",
      quote: "participating households",
      addition: "\n\nThe pilot sample does not represent all households.",
      baseRevision: 2,
      status: "pending",
    },
    {
      id: "B",
      title: "Possible causal wording",
      noteId: "claim",
      detail:
        "The evidence may support a reported association, but the causal reading is uncertain.",
      quote: "displaced",
      addition: "\n\nThe evidence does not establish why households moved.",
      baseRevision: 2,
      status: "pending",
      uncertain: true,
    },
    {
      id: "C",
      title: "Duplicate topic label",
      noteId: "relocation",
      detail: "This suggestion was dismissed during an earlier review.",
      quote: "Relocation",
      addition: "",
      baseRevision: 1,
      status: "dismissed",
    },
    {
      id: "D",
      title: "Add the sample boundary",
      noteId: "claim",
      detail:
        "The source names participating households, rather than all households.",
      quote: "all households",
      addition:
        "\n\nThe available figure describes participating households only.",
      baseRevision: 1,
      status: "applied",
      before: "The reservoir displaced 30% of all households.",
    },
    {
      id: "E",
      title: "Refresh an old claim link",
      noteId: "claim",
      detail: "The source changed after this proposal was prepared.",
      quote: "30%",
      addition: "\n\nRecheck the denominator before keeping this wording.",
      baseRevision: 0,
      status: "stale",
    },
  ];
}

export function blankView(task: ViewState["task"], noteId: string): ViewState {
  return {
    task,
    noteId,
    tabs: [noteId],
    closedTabs: [],
    pinned: [],
    filter: "",
    focus: false,
    panel: "work",
    signatureOpen: false,
    scroll: 0,
    questionLens: false,
    selectedQuestion: "",
    compare: false,
    contextTab: "suggestions",
  };
}

export function createFixtureState(): LabState {
  const notes = fixtureNotes();
  notes[5].text +=
    "\n\nThe available figure describes participating households only.";
  notes[5].revision = 2;
  const views: Record<number, ViewState> = {};
  for (let i = 1; i <= 10; i++)
    views[i] = blankView(i === 5 || i === 9 ? "home" : "notes", "question");
  views[1] = blankView("notes", "claim");
  views[2] = blankView("notes", "relocation");
  views[4] = blankView("notes", "claim");
  views[6] = blankView("notes", "claim");
  views[8] = {
    ...blankView("notes", "claim"),
    tabs: ["survey", "claim", "methods-definitions"],
  };
  views[10] = blankView("ask", "survey");
  views[11] = { ...blankView("ask", "question"), tabs: [] };
  notes.find((n) => n.id === "relocation")!.text += `

## Reading the survey carefully

The useful starting point is a small observation. Twelve of the forty participating households reported moving after the reservoir opened. That is thirty percent of the participating group. The denominator matters: these forty participants are not automatically a representative sample of every household in the area.

The timing is also different from an explanation. An event that happens after another event may have several causes. A household could move because of employment, family circumstances, housing costs or a direct effect of the reservoir. The supplied survey does not distinguish these possibilities. The research question therefore remains open.

## A claim we can inspect

“Thirty percent of all households were displaced” combines three decisions: the size of a group, the meaning of moving, and an explanation for the move. The source supports a count in the participating group. It does not establish the larger population or the reason for each move. Keeping those decisions separate makes the argument easier to revise.

When reading a draft, ask which part of a sentence each passage supports. A source can support a number while leaving its interpretation uncertain. This does not make the source useless. It tells us where the research needs another method, an additional source or more cautious wording.

## Questions to carry forward

Which households were invited to participate? Were people who had already moved easier or harder to contact? Did the questionnaire ask about reasons, dates and alternatives? Could residents give more than one reason? Each question changes what conclusions the study could justify.

These notes are fictional demonstration material. They illustrate a source-review workflow; they do not describe a real reservoir project or report measured educational results.

## Working note

For the next writing session, keep the original survey statement beside the proposed argument. Draft one sentence about the participants and a separate sentence about what remains unknown. Save a question about the sampling method instead of letting the uncertainty disappear into a smooth summary.
`;
  return {
    version: 1,
    direction: 1,
    notebook: "water",
    theme: "light",
    accent: "cobalt",
    notes,
    drafts: {},
    views,
    sourceIds: ["survey", "methods-definitions"],
    pairs: fixturePairs,
    practice: {
      index: 0,
      reverse: false,
      typing: false,
      revealed: false,
      answer: "",
      feedback: "",
      editing: false,
    },
    audio: { seconds: 462, playing: false, speed: 1 },
    question: fixtureMessages[0].question,
    messages: fixtureMessages,
    suggestions: fixtureSuggestions(),
    jobs: [],
    history: [
      { id: "history-seed", text: "Demo material loaded", time: "just now" },
    ],
    thoughts: [],
    workingSets: [],
    claim: {
      text: notes[5].text,
      supports: ["survey", "relocation"],
      limits: ["methods-definitions", "findings-definitions"],
      unresolved: "What explains reported moves?",
      noteRevision: 2,
    },
    controlMode: "ask",
    model: {
      downloaded: false,
      checked: false,
      enabled: false,
      indexed: false,
    },
    seenAt: "2026-09-17T09:00:00.000Z",
    changedIds: [],
    saveFailure: false,
    providerFailure: false,
    imported: false,
  };
}

export const initialView = (
  state: LabState,
  direction = state.direction,
): ViewState => state.views[direction] ?? blankView("notes", "question");
