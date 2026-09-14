import {
  uid,
  type Chapter,
  type Episode,
  type Notebook,
} from "../shared/model.ts";

const REVISION_SUFFIX = " · revision";
const MAX_TITLE_LENGTH = 180;
const REVISION_BASE_LENGTH = MAX_TITLE_LENGTH - REVISION_SUFFIX.length;

function revisionTitle(title: string) {
  const base =
    title.replace(/(?:\s*·\s*revision)+\s*$/iu, "").trim() ||
    "Untitled episode";
  return `${base.slice(0, REVISION_BASE_LENGTH).trimEnd()}${REVISION_SUFFIX}`;
}

function cloneChapter(chapter: Chapter): Chapter {
  return {
    id: uid(),
    title: chapter.title,
    minutes: chapter.minutes,
    objectiveIds: [...chapter.objectiveIds],
    summary: chapter.summary,
    context: chapter.context ? structuredClone(chapter.context) : undefined,
    turns: chapter.turns.map((turn) => ({
      speaker: turn.speaker,
      text: turn.text,
      sourceIds: [...turn.sourceIds],
    })),
  };
}

export function createEpisodeRevision(
  notebook: Notebook,
  episode: Episode,
): Episode {
  const sources = structuredClone(episode.sources ?? notebook.sources);
  const objectives = (episode.objectives ?? notebook.objectives).map(
    (objective) => ({ ...objective }),
  );

  return {
    id: uid(),
    title: revisionTitle(episode.title),
    createdAt: new Date().toISOString(),
    settings: { ...(episode.settings ?? notebook.settings) },
    sources,
    context: episode.context ? structuredClone(episode.context) : undefined,
    objectives,
    chapters: episode.chapters.map(cloneChapter),
    status: "draft",
    progress:
      "Copied script is editable; review it before generating new audio.",
  };
}
