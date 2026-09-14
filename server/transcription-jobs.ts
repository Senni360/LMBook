import { createHash } from "node:crypto";
import { getNotebook, saveNotebook, originalsDir } from "./store.ts";
import { jobs, startJob } from "./jobs.ts";
import { verifyOriginal } from "./source-originals.ts";
import { prepareTranscription, transcribeAudio } from "./transcription.ts";
import {
  transcriptSchema,
  transcriptText,
  type TranscriptionModel,
  type TranscriptionOptions,
} from "../shared/transcription.ts";

type LocalActivity = {
  running: boolean;
  progress: string;
  error?: string;
  notebookId?: string;
  sourceId?: string;
};
let activity: LocalActivity | undefined;
let jobKey: string | undefined;
export function transcriptionActivity() {
  return activity;
}
function assertAvailable() {
  if (activity?.running)
    throw Object.assign(
      new Error(
        "Local transcription is already busy. Wait for it to finish or cancel it in Settings.",
      ),
      { status: 409 },
    );
}
export function cancelTranscription() {
  if (!activity?.running || !jobKey) return;
  activity.progress = "Cancelling local transcription…";
  jobs.get(jobKey)?.controller.abort();
}
export function prepareLocalTranscription(
  model: TranscriptionModel,
  gpu = false,
) {
  assertAvailable();
  jobKey = "local-transcription-setup";
  activity = { running: true, progress: "Preparing local transcription…" };
  startJob(jobKey, activity.progress, async (signal) => {
    try {
      await prepareTranscription(
        model,
        signal,
        (message) => {
          activity!.progress = message.slice(0, 500);
          const job = jobs.get(jobKey!);
          if (job) job.label = activity!.progress;
        },
        gpu,
      );
      activity!.progress = "Local transcription is ready.";
    } catch (error) {
      activity!.error = signal.aborted
        ? "Setup cancelled. Run setup again to continue."
        : (error as Error).message;
      activity!.progress = "Setup stopped.";
    } finally {
      activity!.running = false;
    }
  });
}

export function startSourceTranscription(
  nid: string,
  sid: string,
  options: TranscriptionOptions,
) {
  assertAvailable();
  if (jobs.has(nid))
    throw Object.assign(new Error("This notebook already has work running."), {
      status: 409,
    });
  const notebook = getNotebook(nid);
  const source = notebook.sources.find((item) => item.id === sid);
  if (!source?.attachment || !source.attachment.mediaType.startsWith("audio/"))
    throw new Error("Choose an imported audio recording to transcribe.");
  const attachment = source.attachment;
  source.processing = {
    status: "transcribing",
    progress: "Starting local transcription…",
  };
  saveNotebook(notebook);
  jobKey = nid;
  activity = {
    running: true,
    progress: source.processing.progress!,
    notebookId: nid,
    sourceId: sid,
  };
  startJob(nid, activity.progress, async (signal) => {
    let lastSave = 0;
    try {
      const filename = await verifyOriginal(originalsDir, attachment, signal);
      const transcript = transcriptSchema.parse(
        await transcribeAudio(filename, options, signal, (message) => {
          activity!.progress = message.slice(0, 500);
          const job = jobs.get(nid);
          if (job) job.label = activity!.progress;
          if (Date.now() - lastSave < 2500) return;
          lastSave = Date.now();
          const latest = getNotebook(nid);
          const target = latest.sources.find((item) => item.id === sid);
          if (target?.processing) {
            target.processing.progress = activity!.progress;
            saveNotebook(latest);
          }
        }),
      );
      signal.throwIfAborted();
      const extracted = transcriptText(transcript);
      if (extracted.length > 1_000_000)
        throw new Error(
          "This transcript exceeds the source text limit. Split the recording into shorter parts and import them separately.",
        );
      const latest = getNotebook(nid);
      const target = latest.sources.find((item) => item.id === sid);
      if (!target || target.attachment?.sha256 !== attachment.sha256)
        throw new Error(
          "The source changed during transcription. Start again from the current recording.",
        );
      target.transcript = transcript;
      target.text = extracted;
      target.extraction = `Local faster-whisper ${transcript.model}; ${transcript.language}; timestamped machine transcript`;
      target.extractionWarnings = [
        "Machine transcription may mishear names, numbers and technical terms. Use the timestamps to check important passages against the recording.",
      ];
      target.extractedSha256 = createHash("sha256")
        .update(target.text)
        .digest("hex");
      delete target.processing;
      latest.coverage = [];
      saveNotebook(latest);
      activity!.progress = "Transcript saved with timestamps.";
    } catch (error) {
      const message = signal.aborted
        ? "Transcription cancelled. The original recording is saved; start again when ready."
        : (error as Error).message;
      activity!.error = message;
      activity!.progress = "Transcription stopped.";
      const latest = getNotebook(nid);
      const target = latest.sources.find((item) => item.id === sid);
      if (target) {
        target.processing = { status: "failed", error: message };
        saveNotebook(latest);
      }
    } finally {
      activity!.running = false;
    }
  });
}
