import { buildRequestContext } from "./request-context.ts";
import { z } from "zod";
import path from "node:path";
import { uid, type Notebook, type Episode } from "../shared/model.ts";
import { audioDir, getNotebook, saveNotebook } from "./store.ts";
import { generate, synthesize } from "./providers.ts";
import { beginActivity, updateActivity } from "./activity.ts";
import { combineWavs, parseJSON, speechChunks } from "./core.ts";
import {
  chapterFingerprint,
  ensureAudioCache,
  finalAudioPath,
  readCachedFinal,
  readManifest,
  readCachedSegment,
  writeCachedFinal,
  writeCachedSegment,
} from "./audio-cache.ts";

export const jobs = new Map<
  string,
  { label: string; controller: AbortController; activityId?: string }
>();
function recordActivity(
  id: string,
  update: Parameters<typeof updateActivity>[1],
) {
  try {
    updateActivity(id, update);
  } catch {
    // An auxiliary history write must not discard completed chapter work.
    console.error("Generation history could not be updated.");
  }
}
export function startJob(
  notebookId: string,
  label: string,
  work: (signal: AbortSignal) => Promise<void>,
  metadata?: { episodeId: string; operation: "script" | "audio" | "preview" },
) {
  if (jobs.has(notebookId))
    throw Object.assign(
      new Error("This notebook already has a generation running."),
      { status: 409 },
    );
  const controller = new AbortController();
  const activityId = metadata
    ? beginActivity({ notebookId, ...metadata })
    : undefined;
  jobs.set(notebookId, { label, controller, activityId });
  void Promise.resolve()
    .then(() => work(controller.signal))
    .then(() => {
      if (!activityId || !metadata) return;
      const episode = getNotebook(notebookId).episodes.find(
        (e) => e.id === metadata.episodeId,
      );
      recordActivity(activityId, {
        state: controller.signal.aborted
          ? "cancelled"
          : episode?.status === "error"
            ? "failed"
            : "completed",
        progress: episode?.progress || label,
        error: episode?.status === "error" ? episode.error : undefined,
      });
    })
    .catch((error) => {
      if (activityId)
        recordActivity(activityId, {
          state: controller.signal.aborted ? "cancelled" : "failed",
          error:
            error instanceof Error
              ? error.message
              : "Generation could not complete.",
        });
    })
    .finally(() => jobs.delete(notebookId));
}
export function patchEpisode(
  nid: string,
  eid: string,
  change: (e: Episode, n: Notebook) => void,
) {
  const n = getNotebook(nid);
  const e = n.episodes.find((e) => e.id === eid);
  if (!e) throw new Error("Episode not found.");
  change(e, n);
  saveNotebook(n);
  const activityId = jobs.get(nid)?.activityId;
  if (activityId) recordActivity(activityId, { progress: e.progress });
}
export const turnSchema = z.object({
  speaker: z.enum(["A", "B"]),
  text: z.string().min(1).max(12000),
  sourceIds: z.array(z.string()).max(30),
});
export const planSchema = z.object({
  title: z.string().min(1).max(180),
  chapters: z
    .array(
      z.object({
        title: z.string().min(1).max(180),
        summary: z.string().max(3000),
        objectiveIds: z.array(z.string()),
      }),
    )
    .min(1)
    .max(24),
});
export async function planEpisode(n: Notebook, signal?: AbortSignal) {
  const context = buildRequestContext(n.sources, n.settings, n.objectives);
  const count = Math.ceil(n.settings.minutes / 8);
  const result = planSchema.parse(
    parseJSON(
      await generate(
        n.settings,
        `Plan a ${n.settings.minutes}-minute two-person learning podcast in about ${count} chapters. Cover EVERY learning objective. Give important=true objectives extra depth. Group related goals. Be honest about source gaps; do not invent missing facts. The transcript will be generated separately. Return JSON {"title":"...","chapters":[{"title":"...","summary":"what this chapter will teach, including qualifications","objectiveIds":["exact ID"]}]}.\nGoals: ${JSON.stringify(n.objectives)}\nPrevious coverage checks (advisory, not proof of complete source coverage): ${JSON.stringify(n.coverage.map(({ objectiveId, status }) => ({ objectiveId, status: status === "missing" ? "not-established" : status })))}\n${context.prompt}`,
        signal,
      ),
    ),
  );
  const validIds = new Set(n.objectives.map((o) => o.id));
  const covered = new Set(
    result.chapters.flatMap((c) =>
      c.objectiveIds.filter((id) => validIds.has(id)),
    ),
  );
  const missing = n.objectives.filter((o) => !covered.has(o.id));
  if (missing.length)
    throw new Error(
      `The model omitted ${missing.length} learning objective(s) from the outline. Try again; no incomplete outline was saved.`,
    );
  const episode: Episode = {
    id: uid(),
    title: result.title,
    createdAt: new Date().toISOString(),
    settings: structuredClone(n.settings),
    sources: structuredClone(n.sources),
    context: context.summary,
    objectives: structuredClone(n.objectives),
    status: "draft",
    progress: "Outline ready for review",
    chapters: result.chapters.map((c) => ({
      ...c,
      id: uid(),
      minutes: n.settings.minutes / result.chapters.length,
      objectiveIds: c.objectiveIds.filter((id) => validIds.has(id)),
      turns: [],
    })),
  };
  return episode;
}
export async function writeScript(
  nid: string,
  eid: string,
  signal: AbortSignal,
) {
  try {
    const n = getNotebook(nid);
    const e = n.episodes.find((e) => e.id === eid)!;
    const sources = e.sources ?? n.sources;
    const objectives = e.objectives ?? n.objectives;
    for (let i = 0; i < e.chapters.length; i++) {
      if (signal.aborted)
        throw new Error("Generation cancelled. Completed chapters are saved.");
      const chapter = e.chapters[i];
      if (chapter.turns.length) continue;
      patchEpisode(nid, eid, (ep) => {
        ep.status = "script";
        ep.progress = `Writing chapter ${i + 1} of ${e.chapters.length}: ${chapter.title}`;
        delete ep.error;
      });
      const context = buildRequestContext(sources, e.settings, [
        ...objectives.filter((goal) => chapter.objectiveIds.includes(goal.id)),
        { id: chapter.id, text: `${chapter.title} ${chapter.summary}` },
      ]);
      const validIds = new Set(
        context.selection.passages.map((passage) => passage.sourceId),
      );
      const result = z
        .object({ turns: z.array(turnSchema).min(2).max(100) })
        .parse(
          parseJSON(
            await generate(
              e.settings,
              `Write chapter ${i + 1} of ${e.chapters.length}: ${chapter.title}. Target ${Math.round(chapter.minutes * 145)} spoken words. This is one chapter of a continuous podcast, so do not repeat introductions or endings. Both speakers are knowledgeable. Vary exchanges organically; no fixed Q&A template. Preserve detail, explain mechanisms. Cover the chapter's goals, flag gaps. Source IDs attach to factual turns and are not spoken. Return JSON {"turns":[{"speaker":"A","text":"spoken text","sourceIds":["exact source ID"]},{"speaker":"B","text":"...","sourceIds":[]}]}.\nChapter brief: ${chapter.summary}\nEpisode outline: ${JSON.stringify(e.chapters.map((c) => ({ title: c.title, summary: c.summary })))}\nGoals: ${JSON.stringify(objectives.filter((o) => chapter.objectiveIds.includes(o.id)))}\nPrevious ending: ${JSON.stringify(e.chapters[i - 1]?.turns.slice(-2) || [])}\n${context.prompt}`,
              signal,
            ),
          ),
        );
      if (
        !result.turns.some((t) => t.speaker === "A") ||
        !result.turns.some((t) => t.speaker === "B")
      )
        throw new Error(
          "The model did not produce two speakers. Retry this chapter.",
        );
      chapter.turns = result.turns.map((t) => ({
        ...t,
        sourceIds: t.sourceIds.filter((id) => validIds.has(id)),
      }));
      patchEpisode(nid, eid, (ep) => {
        ep.chapters[i].turns = chapter.turns;
        ep.chapters[i].context = context.summary;
      });
    }
    patchEpisode(nid, eid, (ep) => {
      ep.status = "draft";
      ep.progress = "Script ready. Review before generating paid audio.";
      delete ep.error;
    });
  } catch (error) {
    patchEpisode(nid, eid, (ep) => {
      ep.status = "error";
      ep.error = signal.aborted
        ? "Generation cancelled. Completed chapters are saved."
        : (error as Error).message;
    });
  }
}
export async function createAudio(
  nid: string,
  eid: string,
  preview: boolean,
  signal: AbortSignal,
  synthesizeAudio: typeof synthesize = synthesize,
) {
  try {
    const n = getNotebook(nid);
    const e = n.episodes.find((e) => e.id === eid)!;
    const chapters = preview ? e.chapters.slice(0, 1) : e.chapters;
    for (const [i, c] of chapters.entries()) {
      const fingerprint = chapterFingerprint(c, e.settings);
      const filename = `${c.id}${preview ? "-preview" : ""}.wav`;
      const finalPath = finalAudioPath(audioDir, filename);
      if (c.audioFile && !preview) {
        const final = readCachedFinal(finalAudioPath(audioDir, c.audioFile));
        const cacheDir = path.join(audioDir, c.id);
        const previousManifest = readManifest(cacheDir);
        const fingerprintMismatch =
          !!previousManifest && previousManifest.fingerprint !== fingerprint;
        const manifest = ensureAudioCache(cacheDir, fingerprint, 0, true);
        if (
          final &&
          c.audioFile === filename &&
          !fingerprintMismatch &&
          manifest.fingerprint === fingerprint
        )
          continue;
        patchEpisode(nid, eid, (ep) => {
          const chapter = ep.chapters.find((ch) => ch.id === c.id)!;
          delete chapter.audioFile;
          delete chapter.audioSeconds;
        });
      }
      if (!c.turns.length)
        throw new Error("Generate the script before creating audio.");
      const cartesia = e.settings.ttsProvider === "cartesia";
      const chunks = cartesia
        ? c.turns.flatMap((turn) => speechChunks([turn]))
        : speechChunks(c.turns);
      const selected = preview ? chunks.slice(0, cartesia ? 2 : 1) : chunks;
      const cacheDir = path.join(audioDir, c.id);
      ensureAudioCache(
        cacheDir,
        fingerprint,
        selected.length,
        !!c.audioLocked || !!c.audioFile || !!e.previewFile,
      );
      const buffers: Buffer[] = [];
      for (const [j, text] of selected.entries()) {
        if (signal.aborted)
          throw new Error(
            "Audio generation cancelled. Completed segments are cached.",
          );
        patchEpisode(nid, eid, (ep) => {
          ep.status = "audio";
          ep.progress = `${preview ? "Preview" : "Audio"} · chapter ${i + 1}/${chapters.length} · segment ${j + 1}/${selected.length}`;
          delete ep.error;
        });
        const cached = readCachedSegment(cacheDir, j);
        let buffer: Buffer;
        if (cached) {
          buffer = cached;
        } else {
          buffer = Buffer.from(await synthesizeAudio(text, e.settings, signal));
          if (signal.aborted)
            throw new Error(
              "Audio generation cancelled. Completed segments are cached.",
            );
          writeCachedSegment(cacheDir, j, buffer);
        }
        if (signal.aborted)
          throw new Error(
            "Audio generation cancelled. Completed segments are cached.",
          );
        patchEpisode(nid, eid, (ep) => {
          ep.chapters.find((ch) => ch.id === c.id)!.audioLocked = true;
        });
        buffers.push(buffer);
      }
      if (signal.aborted)
        throw new Error(
          "Audio generation cancelled. Completed segments are cached.",
        );
      const wav = combineWavs(buffers);
      writeCachedFinal(finalPath, wav.buffer);
      if (preview)
        patchEpisode(nid, eid, (ep) => {
          ep.previewFile = filename;
        });
      if (!preview)
        patchEpisode(nid, eid, (ep) => {
          ep.chapters.find((ch) => ch.id === c.id)!.audioFile = filename;
          ep.chapters.find((ch) => ch.id === c.id)!.audioSeconds = wav.seconds;
        });
    }
    if (signal.aborted)
      throw new Error(
        "Audio generation cancelled. Completed segments are cached.",
      );
    patchEpisode(nid, eid, (ep) => {
      ep.status = ep.chapters.every((c) => c.audioFile) ? "complete" : "draft";
      ep.progress = preview ? "Voice preview ready" : "Audio ready";
      delete ep.error;
    });
  } catch (error) {
    patchEpisode(nid, eid, (ep) => {
      ep.status = "error";
      ep.error = signal.aborted
        ? "Audio generation cancelled. Completed segments are cached; retry to continue."
        : (error as Error).message;
    });
  }
}
