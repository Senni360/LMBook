import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer from "multer";
import { z } from "zod";
import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { extractDocument } from "./document-import.ts";
import { registerFlashcardRoutes } from "./flashcard-routes.ts";
import { storeOriginal, verifyOriginal } from "./source-originals.ts";
import {
  transcriptionModelSchema,
  transcriptionOptionsSchema,
} from "../shared/transcription.ts";
import { getTranscriptionStatus } from "./transcription.ts";
import { correctTranscriptSegment } from "./transcript-corrections.ts";
import { startSourceOcr } from "./ocr-jobs.ts";
import { ocrOptionsSchema } from "../shared/ocr.ts";
import { assessCoverage } from "./coverage.ts";
import { buildRequestContext, recentConversation } from "./request-context.ts";
import {
  transcriptionActivity,
  prepareLocalTranscription,
  startSourceTranscription,
  cancelTranscription,
} from "./transcription-jobs.ts";
import { settingsSchema, uid, type Notebook } from "../shared/model.ts";
import {
  listNotebookSummaries,
  getNotebook,
  saveNotebook,
  trashNotebook,
  restoreNotebookFromTrash,
  newNotebook,
  audioDir,
  dataDir,
  originalsDir,
} from "./store.ts";
import {
  generate,
  codexAvailable,
  checkGoogleConnection,
} from "./providers.ts";
import { googleProject, savePreferences } from "./preferences.ts";
import { checkCodexConnection } from "./codex-app-server.ts";
import {
  cartesiaKey,
  cartesiaKeySchema,
  saveCartesiaKey,
  listCartesiaVoices,
} from "./cartesia.ts";
import { speechSettingsSchema, voiceSelectionError } from "../shared/speech.ts";
import { readCachedSegment } from "./audio-cache.ts";
import {
  beginActivity,
  updateActivity,
  listActivity,
  reconcileInterruptedActivities,
} from "./activity.ts";
import { createEpisodeRevision } from "./episode-revisions.ts";
import {
  createNotebookBundle,
  importNotebookBundle,
} from "./notebook-bundle.ts";
import { openCodeAvailable } from "./opencode.ts";
import {
  createMp3Stream,
  createWavStream,
  validateWavFiles,
  hasFfmpeg,
} from "./audio-export.ts";
import { exportMarkdown, parseJSON, validEvidence } from "./core.ts";
import {
  jobs,
  startJob,
  planEpisode,
  writeScript,
  createAudio,
  turnSchema,
} from "./jobs.ts";
import { withArtifactMutation } from "./artifact-lock.ts";
import {
  listTrash,
  purgeTrashNotebook,
} from "./notebook-trash.ts";

const app = express();
reconcileInterruptedActivities();
let port = Number(process.env.PORT || 4317);
const desktopToken = process.env.SENNIBOOK_DESKTOP_TOKEN;
const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
const ffmpegAvailable = hasFfmpeg(ffmpegPath);
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (desktopToken && req.headers["x-sennibook-desktop"] !== desktopToken)
    return res
      .status(403)
      .json({ error: "This workspace belongs to the desktop app." });
  const host = req.hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host))
    return res
      .status(403)
      .json({ error: "SenniBook only accepts local connections." });
  if (
    req.path.startsWith("/api") &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method)
  ) {
    const origin = req.headers.origin;
    if (
      origin &&
      ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)
    )
      return res
        .status(403)
        .json({ error: "Cross-origin writes are not permitted." });
    if (req.headers["x-sennibook"] !== "1")
      return res
        .status(403)
        .json({ error: "Missing local app request header." });
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.json({ limit: "15mb" }));
const route =
  (fn: (req: Request, res: Response) => unknown) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
const id = (req: Request) => z.string().uuid().parse(req.params.id);
const requestSignals = new WeakMap<Request, AbortSignal>();
const exclusive = (
  label: string,
  fn: (req: Request, res: Response) => Promise<unknown>,
) =>
  route(async (req, res) => {
    const nid = id(req);
    if (jobs.has(nid))
      throw Object.assign(
        new Error("This notebook already has work running."),
        { status: 409 },
      );
    const controller = new AbortController();
    const activityId =
      label === "Planning an episode"
        ? beginActivity({ notebookId: nid, episodeId: "", operation: "plan" })
        : undefined;
    jobs.set(nid, { label, controller, activityId });
    const started = Date.now();
    const progress = () => {
      const job = jobs.get(nid);
      const message = `${job?.stage || label} · ${Math.round((Date.now() - started) / 1000)} seconds elapsed`;
      if (job) job.label = message;
      if (activityId) {
        try {
          updateActivity(activityId, { progress: message });
        } catch {
          console.error("Planning progress could not be saved.");
        }
      }
    };
    const timer = activityId ? setInterval(progress, 5000) : undefined;
    if (activityId) progress();
    requestSignals.set(req, controller.signal);
    try {
      await fn(req, res);
      if (activityId)
        updateActivity(activityId, {
          state: "completed",
          progress: "Outline ready for review.",
        });
    } catch (error) {
      if (activityId)
        updateActivity(activityId, {
          state: controller.signal.aborted ? "cancelled" : "failed",
          error:
            error instanceof Error
              ? error.message
              : "Planning could not complete.",
        });
      throw error;
    } finally {
      if (timer) clearInterval(timer);
      requestSignals.delete(req);
      jobs.delete(nid);
    }
  });
function editable(req: Request) {
  const nid = id(req);
  if (jobs.has(nid) && !requestSignals.has(req))
    throw Object.assign(
      new Error(
        "Wait for generation to finish or cancel it before editing this notebook.",
      ),
      { status: 409 },
    );
  return getNotebook(nid);
}
const evidenceSchema = z.object({
  sourceId: z.string(),
  quote: z.string().max(3000),
});
registerFlashcardRoutes(app);

app.get(
  "/api/status",
  route(async (_req, res) => {
    let ollama = false;
    try {
      const base = new URL(
        process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
      );
      if (["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
        ollama = (
          await fetch(new URL("/api/tags", base), {
            signal: AbortSignal.timeout(700),
          })
        ).ok;
    } catch {}
    res.json({
      codex: codexAvailable(),
      opencode: !!process.env.OPENCODE_API_KEY || openCodeAvailable(),
      opencodeCli: openCodeAvailable(),
      googleProject: googleProject(),
      cartesia: !!cartesiaKey(),
      ollama,
      mp3: await ffmpegAvailable,
      activeJobs: Object.fromEntries([...jobs].map(([k, v]) => [k, v.label])),
    });
  }),
);
app.get(
  "/api/notebooks",
  route((_req, res) => res.json(listNotebookSummaries())),
);
app.get(
  "/api/trash",
  route((_req, res) => res.json(listTrash())),
);
app.post(
  "/api/trash/:id/restore",
  route(async (req, res) => {
    const trashId = z.string().uuid().parse(req.params.id);
    const notebook = await withArtifactMutation(() =>
      restoreNotebookFromTrash(trashId),
    );
    res.json(notebook);
  }),
);
app.delete(
  "/api/trash/:id",
  route(async (req, res) => {
    const trashId = z.string().uuid().parse(req.params.id);
    const result = await withArtifactMutation(() =>
      purgeTrashNotebook(trashId),
    );
    res.json({ ok: true, episodeIds: result.episodeIds });
  }),
);
app.post(
  "/api/connections/codex/check",
  route(async (_req, res) => res.json(await checkCodexConnection())),
);
app.post(
  "/api/connections/google",
  route((req, res) => {
    if (jobs.size)
      throw new Error(
        "Finish or cancel active generation before changing the speech connection.",
      );
    res.json(savePreferences({ googleProject: req.body.googleProject }));
  }),
);
app.post(
  "/api/connections/google/check",
  route(async (_req, res) => {
    res.json(await checkGoogleConnection());
  }),
);
app.get(
  "/api/transcription/status",
  route(async (_req, res) => {
    res.json({
      ...(await getTranscriptionStatus()),
      activity: transcriptionActivity(),
    });
  }),
);
app.post(
  "/api/connections/cartesia",
  route(async (req, res) => {
    if (jobs.size)
      throw new Error(
        "Finish or cancel generation before changing the speech connection.",
      );
    const key = cartesiaKeySchema.parse(req.body.apiKey);
    await listCartesiaVoices({}, key);
    // The connection check is asynchronous: recheck before replacing a live key.
    if (jobs.size)
      throw new Error(
        "Finish or cancel generation before changing the speech connection.",
      );
    saveCartesiaKey(key);
    res.json({
      ok: true,
      message:
        "Cartesia connected. Voice access checked; no speech credits used. Preview an episode to check audio generation.",
    });
  }),
);
app.delete(
  "/api/connections/cartesia",
  route((_req, res) => {
    if (jobs.size)
      throw new Error(
        "Finish or cancel generation before disconnecting Cartesia.",
      );
    saveCartesiaKey("");
    res.json({ ok: true });
  }),
);
app.get(
  "/api/cartesia/voices",
  route(async (req, res) => {
    const query = z
      .object({
        language: z.enum(["en", "nl"]).optional(),
        query: z.string().trim().max(150).optional(),
        cursor: z.string().uuid().optional(),
      })
      .parse(req.query);
    res.setHeader("Cache-Control", "no-store");
    res.json(await listCartesiaVoices(query));
  }),
);
app.post(
  "/api/transcription/prepare",
  route((req, res) => {
    const { model, gpu } = z
      .object({
        model: transcriptionModelSchema,
        gpu: z.boolean().default(false),
      })
      .parse(req.body);
    prepareLocalTranscription(model, gpu);
    res.status(202).json({ ok: true });
  }),
);
app.post(
  "/api/transcription/cancel",
  route((_req, res) => {
    cancelTranscription();
    res.json({ ok: true });
  }),
);
app.post(
  "/api/notebooks",
  route((req, res) => {
    const input = z
      .object({
        title: z.string().trim().min(1).max(150),
        example: z.boolean().optional(),
      })
      .parse(req.body);
    const n = newNotebook(input.title, !!input.example);
    if (input.example) {
      n.description =
        "An illustrative notebook to explore the workflow. Replace these short examples with your course material.";
      n.sources = [
        {
          id: uid(),
          title: "Coalitions: an introductory note",
          kind: "course",
          createdAt: new Date().toISOString(),
          text: "ILLUSTRATIVE MATERIAL — authored for the SenniBook demo, not an academic source.\n\nIn a parliamentary system, a coalition is an agreement between political parties to cooperate in government. When no single party holds a majority of seats, a coalition may assemble the parliamentary support needed to govern.\n\nA coalition agreement can specify policy priorities and distribute ministerial portfolios. Such an agreement does not eliminate differences between parties. Parties may value holding office, implementing policy, and maintaining electoral support differently.\n\nA minimum winning coalition has enough support to win a vote but would lose that majority if any member left. This concept describes parliamentary arithmetic; it does not on its own explain which parties will cooperate. Ideological compatibility, institutional rules, and strategic expectations also matter.",
        },
        {
          id: uid(),
          title: "Institutions and incentives",
          kind: "course",
          createdAt: new Date().toISOString(),
          text: "ILLUSTRATIVE MATERIAL — authored for the SenniBook demo, not an academic source.\n\nInstitutions shape the incentives available to political actors. Formal rules can determine how governments are appointed, how legislation passes, and how governments can be removed. Informal conventions can influence how those rules operate in practice.\n\nAn explanation based on incentives is an interpretation that requires evidence. Observing that a party joined a coalition does not by itself establish its motive. The same action can be consistent with several explanations. Comparing these explanations requires additional evidence, such as public commitments, negotiations, and subsequent decisions.",
        },
      ];
      n.objectives = [
        {
          id: uid(),
          kind: "goal",
          important: true,
          text: "Explain why parties form coalitions and how institutional rules shape their choices.",
        },
        {
          id: uid(),
          kind: "concept",
          important: true,
          text: "Minimum winning coalition",
        },
        {
          id: uid(),
          kind: "goal",
          important: true,
          text: "Evaluate competing explanations for a party joining a coalition.",
        },
      ];
      for (const source of n.sources)
        source.extractedSha256 = createHash("sha256")
          .update(source.text)
          .digest("hex");
    }
    res.status(201).json(saveNotebook(n));
  }),
);
app.get(
  "/api/notebooks/:id",
  route((req, res) => res.json(getNotebook(id(req)))),
);
const importDirectory = path.join(dataDir, "imports");
app.get(
  "/api/notebooks/:id/activity",
  route((req, res) => {
    getNotebook(id(req));
    res.json(listActivity(id(req)));
  }),
);
mkdirSync(importDirectory, { recursive: true });
const bundleUpload = multer({
  dest: importDirectory,
  limits: { files: 1, fileSize: 2 * 1024 * 1024 * 1024 },
}).single("file");
app.post(
  "/api/notebooks/import",
  (req, res, next) => {
    bundleUpload(req, res, (error) => {
      if (error?.code === "LIMIT_FILE_SIZE")
        return res
          .status(400)
          .json({ error: "Notebook bundle exceeds the 2 GB limit." });
      next(error);
    });
  },
  route(async (req, res) => {
    if (!req.file) throw new Error("Choose a SenniBook notebook ZIP backup.");
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    try {
      const saved = await withArtifactMutation(async () => {
        const imported = await importNotebookBundle(req.file!.path, audioDir, {
          signal: controller.signal,
          originalsDir,
        });
        try {
          controller.signal.throwIfAborted();
          return saveNotebook(imported.notebook);
        } catch (error) {
          await imported.cleanup();
          throw error;
        }
      });
      res.status(201).json(saved);
    } finally {
      rmSync(req.file.path, { force: true });
    }
  }),
);
app.get(
  "/api/notebooks/:id/bundle",
  exclusive("Backing up notebook", async (req, res) => {
    const n = editable(req);
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      requestSignals.get(req)!,
    ]);
    const stream = createNotebookBundle(n, audioDir, { signal, originalsDir });
    res.attachment("sennibook-notebook.zip").type("application/zip");
    await new Promise<void>((resolve) => {
      stream.on("error", (error) => {
        if (res.headersSent) res.destroy(error);
        else {
          res.removeHeader("Content-Disposition");
          res.status(400).json({ error: error.message });
        }
        resolve();
      });
      res.on("finish", resolve);
      res.on("close", () => {
        if (!res.writableFinished) controller.abort();
        resolve();
      });
      stream.pipe(res);
    });
  }),
);
app.patch(
  "/api/notebooks/:id",
  route((req, res) => {
    const n = editable(req);
    const input = z
      .object({
        title: z.string().trim().min(1).max(150).optional(),
        description: z.string().max(2000).optional(),
        settings: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);
    const { settings, ...details } = input;
    Object.assign(n, details);
    if (settings)
      n.settings = settingsSchema.parse({ ...n.settings, ...settings });
    res.json(saveNotebook(n));
  }),
);
app.delete(
  "/api/notebooks/:id",
  route(async (req, res) => {
    const result = await withArtifactMutation(() => {
      const n = editable(req);
      return trashNotebook(n);
    });
    res.json({ ok: true, ...result });
  }),
);
app.post(
  "/api/notebooks/:id/sources",
  route((req, res) => {
    const n = editable(req);
    const input = z
      .object({
        title: z.string().trim().min(1).max(200),
        text: z.string().trim().min(1).max(1000000),
        kind: z.enum(["course", "supplement"]).default("course"),
      })
      .parse(req.body);
    n.sources.push({
      ...input,
      extractedSha256: createHash("sha256").update(input.text).digest("hex"),
      extraction: "Pasted source text",
      id: uid(),
      createdAt: new Date().toISOString(),
    });
    n.coverage = [];
    res.json(saveNotebook(n));
  }),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});
app.post(
  "/api/notebooks/:id/upload",
  upload.single("file"),
  exclusive("Importing source", async (req, res) => {
    const n = editable(req);
    if (!req.file) throw new Error("Choose a document to import.");
    const ext = path.extname(req.file.originalname).toLowerCase();
    const signal = requestSignals.get(req);
    const { text, extraction, warnings, ocrCandidate } = await extractDocument(
      req.file.buffer,
      req.file.originalname,
      signal,
    );
    const mediaTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".pptx":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ".html": "text/html",
      ".htm": "text/html",
      ".md": "text/markdown",
      ".markdown": "text/markdown",
      ".csv": "text/csv",
      ".txt": "text/plain",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
    };
    const saved = await withArtifactMutation(async () => {
      signal?.throwIfAborted();
      const attachment = await storeOriginal(
        originalsDir,
        req.file!.buffer,
        req.file!.originalname,
        mediaTypes[ext] || "application/octet-stream",
        signal,
      );
      requestSignals.get(req)?.throwIfAborted();
      // Preserve any state saved before this import acquired the notebook lock.
      const latest = getNotebook(n.id);
      latest.sources.push({
        id: uid(),
        title: req.file!.originalname,
        text,
        filename: req.file!.originalname,
        originalSha256: createHash("sha256")
          .update(req.file!.buffer)
          .digest("hex"),
        extractedSha256: createHash("sha256").update(text).digest("hex"),
        extraction,
        ...(warnings.length ? { extractionWarnings: warnings } : {}),
        ...(ocrCandidate ? { ocrCandidate: true } : {}),
        ...(ocrCandidate && !text.trim()
          ? { processing: { task: "ocr" as const, status: "pending" as const } }
          : {}),
        attachment,
        kind: req.body.kind === "supplement" ? "supplement" : "course",
        createdAt: new Date().toISOString(),
      });
      latest.coverage = [];
      return saveNotebook(latest);
    });
    res.json(saved);
  }),
);
app.delete(
  "/api/notebooks/:id/sources/:sourceId",
  route(async (req, res) => {
    const saved = await withArtifactMutation(() => {
      const n = editable(req);
      n.sources = n.sources.filter((s) => s.id !== req.params.sourceId);
      n.coverage = [];
      return saveNotebook(n);
    });
    res.json(saved);
  }),
);
app.get(
  "/api/notebooks/:id/sources/:sourceId/original",
  route(async (req, res) => {
    const n = getNotebook(id(req));
    const sourceId = z.string().uuid().parse(req.params.sourceId);
    const episodeId = z.string().uuid().optional().parse(req.query.episode);
    const sources = episodeId
      ? n.episodes.find((episode) => episode.id === episodeId)?.sources || []
      : n.sources;
    const source = sources.find((item) => item.id === sourceId);
    if (!source?.attachment)
      throw new Error("An original file is not saved for this source.");
    const filename = await verifyOriginal(originalsDir, source.attachment);
    res.download(path.basename(filename), source.attachment.filename, {
      root: originalsDir,
    });
  }),
);
const mediaUpload = multer({
  dest: importDirectory,
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
}).single("file");
app.get(
  "/api/notebooks/:id/sources/:sourceId/image",
  route(async (req, res) => {
    const n = getNotebook(id(req));
    const sourceId = z.string().uuid().parse(req.params.sourceId);
    const episodeId = z.string().uuid().optional().parse(req.query.episode);
    const sources = episodeId
      ? n.episodes.find((episode) => episode.id === episodeId)?.sources || []
      : n.sources;
    const attachment = sources.find((item) => item.id === sourceId)?.attachment;
    if (
      !attachment ||
      !["image/png", "image/jpeg"].includes(attachment.mediaType)
    )
      throw new Error(
        "An original page image is not available for this source.",
      );
    const filename = await verifyOriginal(originalsDir, attachment);
    res
      .type(attachment.mediaType)
      .sendFile(path.basename(filename), { root: originalsDir });
  }),
);
app.post(
  "/api/notebooks/:id/audio-source",
  (req, res, next) =>
    mediaUpload(req, res, (error) =>
      next(
        error?.code === "LIMIT_FILE_SIZE"
          ? new Error(
              "Audio recordings can be up to 500 MB. Split larger recordings before importing.",
            )
          : error,
      ),
    ),
  route(async (req, res) => {
    const temporary = req.file?.path;
    try {
      if (!req.file) throw new Error("Choose an audio recording to import.");
      const ext = path.extname(req.file.originalname).toLowerCase();
      const types: Record<string, string> = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".mp4": "audio/mp4",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
        ".opus": "audio/ogg",
        ".aac": "audio/aac",
        ".webm": "audio/webm",
      };
      if (!types[ext])
        throw new Error(
          "Supported recordings: MP3, WAV, M4A, MP4, FLAC, OGG, Opus, AAC and WebM.",
        );
      const saved = await withArtifactMutation(async () => {
        // Hold the artifact lock before reading/publishing the original so a
        // concurrent notebook trash/purge cannot invalidate this publication.
        editable(req);
        const attachment = await storeOriginal(
          originalsDir,
          req.file!.path,
          req.file!.originalname,
          types[ext],
        );
        // Recheck the notebook lock after the asynchronous original-file write.
        const latest = editable(req);
        latest.sources.push({
          id: uid(),
          title: req.file!.originalname,
          filename: req.file!.originalname,
          text: "",
          kind: req.body.kind === "supplement" ? "supplement" : "course",
          createdAt: new Date().toISOString(),
          attachment,
          originalSha256: attachment.sha256,
          processing: {
            status: "pending",
            progress:
              "Recording saved. Transcribe it locally to use it as evidence.",
          },
        });
        latest.coverage = [];
        return saveNotebook(latest);
      });
      res.status(201).json(saved);
    } finally {
      if (
        temporary &&
        path.dirname(path.resolve(temporary)) === path.resolve(importDirectory)
      )
        rmSync(temporary, { force: true });
    }
  }),
);
app.post(
  "/api/notebooks/:id/sources/:sourceId/transcribe",
  route((req, res) => {
    const n = editable(req);
    const sid = z.string().uuid().parse(req.params.sourceId);
    startSourceTranscription(
      n.id,
      sid,
      transcriptionOptionsSchema.parse(req.body),
    );
    res.status(202).json({ ok: true });
  }),
);
app.get(
  "/api/notebooks/:id/sources/:sourceId/media",
  route(async (req, res) => {
    const n = getNotebook(id(req));
    const sid = z.string().uuid().parse(req.params.sourceId);
    const episodeId = z.string().uuid().optional().parse(req.query.episode);
    const sources = episodeId
      ? n.episodes.find((episode) => episode.id === episodeId)?.sources || []
      : n.sources;
    const attachment = sources.find((source) => source.id === sid)?.attachment;
    if (!attachment?.mediaType.startsWith("audio/"))
      throw new Error("An audio recording is not available for this source.");
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    // Playback must honor the same saved source identity as downloads and
    // transcription. A same-size corruption used to pass this endpoint.
    const filename = await verifyOriginal(
      originalsDir,
      attachment,
      controller.signal,
    );
    res
      .type(attachment.mediaType)
      .sendFile(path.basename(filename), { root: originalsDir });
  }),
);
app.put(
  "/api/notebooks/:id/sources/:sourceId/transcript/segments/:index",
  route((req, res) => {
    const n = editable(req);
    const sid = z.string().uuid().parse(req.params.sourceId);
    const index = z.coerce
      .number()
      .int()
      .min(0)
      .max(49999)
      .parse(req.params.index);
    const { text, expectedText } = z
      .object({
        text: z.string().trim().min(1).max(12000),
        expectedText: z.string().min(1).max(12000),
      })
      .strict()
      .parse(req.body);
    const source = n.sources.find((item) => item.id === sid);
    if (!source)
      throw Object.assign(new Error("Source not found."), { status: 404 });
    if (correctTranscriptSegment(source, index, text, expectedText)) {
      n.coverage = [];
      saveNotebook(n);
    }
    res.json(n);
  }),
);
app.post(
  "/api/notebooks/:id/sources/:sourceId/ocr",
  route((req, res) => {
    const n = editable(req);
    startSourceOcr(
      n.id,
      z.string().uuid().parse(req.params.sourceId),
      ocrOptionsSchema.parse(req.body),
    );
    res.status(202).json({ ok: true });
  }),
);
app.put(
  "/api/notebooks/:id/objectives",
  route((req, res) => {
    const n = editable(req);
    n.objectives = z
      .array(
        z.object({
          id: z.string().uuid(),
          text: z.string().trim().min(1).max(2000),
          kind: z.enum(["goal", "concept"]),
          important: z.boolean(),
        }),
      )
      .max(150)
      .parse(req.body);
    n.coverage = [];
    res.json(saveNotebook(n));
  }),
);
app.post(
  "/api/notebooks/:id/extract-objectives",
  exclusive("Extracting learning goals", async (req, res) => {
    const n = editable(req);
    const input = z
      .object({ text: z.string().min(1).max(60000) })
      .parse(req.body);
    const result = z
      .object({
        items: z
          .array(
            z.object({
              text: z.string().min(1).max(2000),
              kind: z.enum(["goal", "concept"]),
            }),
          )
          .max(100),
      })
      .parse(
        parseJSON(
          await generate(
            n.settings,
            `Extract explicitly stated learning objectives and terms from this uploaded list. Preserve their wording and language. Do not invent additional goals. Return JSON {"items":[{"text":"...","kind":"goal or concept"}]}.\nUntrusted list: ${JSON.stringify(input.text)}`,
            requestSignals.get(req),
          ),
        ),
      );
    const latest = getNotebook(n.id);
    const seen = new Set(latest.objectives.map((o) => o.text.toLowerCase()));
    for (const item of result.items)
      if (!seen.has(item.text.toLowerCase())) {
        latest.objectives.push({ ...item, id: uid(), important: true });
        seen.add(item.text.toLowerCase());
      }
    if (latest.objectives.length > 150)
      throw new Error(
        "This notebook would exceed 150 goals. Split it into smaller topics.",
      );
    latest.coverage = [];
    res.json(saveNotebook(latest));
  }),
);
app.post(
  "/api/notebooks/:id/coverage",
  exclusive("Mapping source coverage", async (req, res) => {
    const n = editable(req);
    if (!n.sources.length || !n.objectives.length)
      throw new Error(
        "Add sources and learning objectives before mapping coverage.",
      );
    const coverage = await assessCoverage(
      n,
      requestSignals.get(req),
      (message) => {
        const job = jobs.get(n.id);
        if (job) {
          job.label = message;
          job.stage = message;
        }
      },
    );
    const latest = getNotebook(n.id);
    if (
      JSON.stringify(latest.sources) !== JSON.stringify(n.sources) ||
      JSON.stringify(latest.objectives) !== JSON.stringify(n.objectives)
    )
      throw new Error(
        "Sources or goals changed during analysis. Run the coverage map again.",
      );
    latest.coverage = coverage;
    res.json(saveNotebook(latest));
  }),
);
app.post(
  "/api/notebooks/:id/chat",
  exclusive("Reading your sources", async (req, res) => {
    const n = editable(req);
    const { message } = z
      .object({ message: z.string().trim().min(1).max(6000) })
      .parse(req.body);
    if (!n.sources.length)
      throw new Error("Add a source before asking a question.");
    const context = buildRequestContext(n.sources, n.settings, [
      { id: "question", text: message },
      ...n.messages
        .filter((item) => item.role === "user")
        .slice(-2)
        .map((item) => ({ id: item.id, text: item.text })),
    ]);
    const result = z
      .object({
        answer: z.string().min(1).max(30000),
        evidence: z.array(evidenceSchema).max(12),
      })
      .parse(
        parseJSON(
          await generate(
            n.settings,
            `Answer the user's question using the sources. Separate inference from source claims. Admit gaps. Return JSON {"answer":"plain text answer","evidence":[{"sourceId":"exact id","quote":"verbatim passage"}]}.\nRecent complete messages (older conversation may be omitted; ask for clarification if a necessary reference is absent): ${JSON.stringify(recentConversation(n.messages))}\nQuestion: ${JSON.stringify(message)}\n${context.prompt}`,
            requestSignals.get(req),
          ),
        ),
      );
    const latest = getNotebook(n.id);
    latest.messages.push(
      { id: uid(), role: "user", text: message },
      {
        id: uid(),
        role: "assistant",
        text: result.answer,
        evidence: validEvidence(result.evidence, n, context.selection),
        context: context.summary,
      },
    );
    res.json(saveNotebook(latest));
  }),
);
app.post(
  "/api/notebooks/:id/episodes",
  exclusive("Planning an episode", async (req, res) => {
    const n = editable(req);
    if (!n.sources.length || !n.objectives.length)
      throw new Error(
        "Add sources and learning goals before planning an episode.",
      );
    const e = await planEpisode(n, requestSignals.get(req), (message) => {
      const job = jobs.get(n.id);
      if (job) {
        job.stage = message;
        job.label = message;
      }
      if (job?.activityId)
        updateActivity(job.activityId, { progress: message });
    });
    const latest = getNotebook(n.id);
    latest.episodes.unshift(e);
    res.json(saveNotebook(latest));
  }),
);
app.post(
  "/api/notebooks/:id/episodes/:eid/revision",
  route((req, res) => {
    const n = editable(req);
    const original = n.episodes.find((e) => e.id === req.params.eid);
    if (!original) throw new Error("Episode not found.");
    const revision = createEpisodeRevision(n, original);
    n.episodes.unshift(revision);
    saveNotebook(n);
    res.status(201).json({ episodeId: revision.id });
  }),
);
app.post(
  "/api/notebooks/:id/episodes/:eid/script",
  route((req, res) => {
    const n = editable(req);
    const e = n.episodes.find((e) => e.id === req.params.eid);
    if (!e) throw new Error("Episode not found.");
    startJob(
      n.id,
      "Writing script",
      (signal) => writeScript(n.id, e.id, signal),
      { episodeId: e.id, operation: "script" },
    );
    res.status(202).json({ ok: true });
  }),
);
app.put(
  "/api/notebooks/:id/episodes/:eid/speech",
  route((req, res) => {
    const n = editable(req);
    const original = n.episodes.find((e) => e.id === req.params.eid);
    if (!original) throw new Error("Episode not found.");
    const speech = speechSettingsSchema.parse(req.body);
    const settings = settingsSchema.parse({ ...original.settings, ...speech });
    const error = voiceSelectionError(settings);
    if (error) throw new Error(error);
    const hasAudio =
      !!original.previewFile ||
      original.chapters.some((chapter) => {
        if (chapter.audioFile || chapter.audioLocked) return true;
        const dir = path.join(audioDir, chapter.id);
        return (
          existsSync(dir) &&
          readdirSync(dir).some((file) => /^\d+\.wav$/.test(file))
        );
      });
    const episode = hasAudio ? createEpisodeRevision(n, original) : original;
    episode.settings = settings;
    delete episode.error;
    episode.status = "draft";
    episode.progress =
      "Voice settings saved. Preview the voices before generating audio.";
    if (hasAudio) n.episodes.unshift(episode);
    saveNotebook(n);
    res.json({ episodeId: episode.id, copied: hasAudio });
  }),
);
app.put(
  "/api/notebooks/:id/episodes/:eid/chapters/:cid",
  route((req, res) => {
    const n = editable(req);
    const e = n.episodes.find((e) => e.id === req.params.eid);
    const c = e?.chapters.find((c) => c.id === req.params.cid);
    if (!c || !e) throw new Error("Chapter not found.");
    const cacheDirectory = path.join(audioDir, c.id);
    const hasCachedSpeech =
      existsSync(cacheDirectory) &&
      readdirSync(cacheDirectory).some(
        (filename) =>
          /^\d+\.wav$/.test(filename) &&
          !!readCachedSegment(cacheDirectory, Number(filename.slice(0, -4))),
      );
    if (c.audioFile || c.audioLocked || hasCachedSpeech)
      throw new Error(
        "This chapter already has generated audio. Make an editable copy under Revise this episode to change its script.",
      );
    c.turns = z.array(turnSchema).min(2).max(100).parse(req.body);
    const validIds = new Set((e.sources || n.sources).map((s) => s.id));
    c.turns = c.turns.map((t) => ({
      ...t,
      sourceIds: t.sourceIds.filter((id) => validIds.has(id)),
    }));
    res.json(saveNotebook(n));
  }),
);
app.post(
  "/api/notebooks/:id/episodes/:eid/audio",
  route((req, res) => {
    const n = editable(req);
    const e = n.episodes.find((e) => e.id === req.params.eid);
    if (!e) throw new Error("Episode not found.");
    if (e.settings.ttsProvider === "cartesia") {
      if (!cartesiaKey())
        throw new Error("Connect Cartesia in Settings first.");
    } else if (!googleProject()) {
      throw new Error("Configure Google Cloud in Settings first.");
    }
    const selectionError = voiceSelectionError(e.settings);
    if (selectionError) throw new Error(selectionError);
    const { preview } = z
      .object({ preview: z.boolean().default(false) })
      .parse(req.body);
    if (
      !(preview ? e.chapters.slice(0, 1) : e.chapters).every(
        (c) => c.turns.length,
      )
    )
      throw new Error("Finish the script before creating audio.");
    startJob(
      n.id,
      preview ? "Creating voice preview" : "Creating audio",
      (signal) => createAudio(n.id, e.id, preview, signal),
      { episodeId: e.id, operation: preview ? "preview" : "audio" },
    );
    res.status(202).json({ ok: true });
  }),
);
app.post(
  "/api/notebooks/:id/cancel",
  route((req, res) => {
    jobs.get(id(req))?.controller.abort();
    res.json({ ok: true });
  }),
);
app.get(
  "/api/notebooks/:id/episodes/:eid/download",
  route(async (req, res) => {
    const n = getNotebook(id(req));
    const e = n.episodes.find((e) => e.id === req.params.eid);
    if (!e || !e.chapters.every((c) => c.audioFile))
      throw new Error(
        "Generate all chapters before downloading the complete episode.",
      );
    const format = z.enum(["wav", "mp3"]).parse(req.query.format || "wav");
    const audio = await validateWavFiles(
      e.chapters.map((c) => path.join(audioDir, c.audioFile!)),
    );
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    const stream =
      format === "mp3"
        ? await createMp3Stream(audio, {
            signal: controller.signal,
            ffmpegPath,
            title: e.title,
            artist: "SenniBook",
            album: n.title,
          })
        : createWavStream(audio, { signal: controller.signal });
    if (format === "wav")
      res.setHeader("Content-Length", String(audio.contentLength));
    const filename =
      e.title
        .normalize("NFKC")
        .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120)
        .replace(/[. ]+$/, "") || "SenniBook episode";
    res.attachment(`${filename}.${format}`);
    res.type(format === "mp3" ? "audio/mpeg" : "audio/wav");
    stream.on("error", (error) => res.destroy(error));
    stream.pipe(res);
  }),
);
app.get(
  "/api/notebooks/:id/export",
  route((req, res) => {
    const n = getNotebook(id(req));
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="sennibook-notebook.md"',
    );
    res.type("text/markdown").send(exportMarkdown(n));
  }),
);
app.use(
  "/api/audio",
  express.static(audioDir, { index: false, dotfiles: "deny" }),
);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API route not found." }),
);
app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  res.status(error.status || 400).json({
    error:
      error instanceof z.ZodError
        ? "Some fields are invalid. Check the form and try again."
        : error.code === "LIMIT_FILE_SIZE"
          ? "File exceeds the 20 MB limit. Split the file or paste its text."
          : error.message || "Something went wrong.",
  });
});
if (process.argv.includes("--production")) {
  const assets = process.env.SENNIBOOK_ASSETS || path.resolve("dist");
  app.use(express.static(assets));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(assets, "index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, "127.0.0.1", () => {
  port = (server.address() as import("node:net").AddressInfo).port;
  console.log(`SenniBook is ready at http://127.0.0.1:${port}`);
  // Electron utility processes expose a parent message port instead of process.send.
  (process as any).parentPort?.postMessage({ type: "ready", port });
});
server.on("error", (error) => {
  (process as any).parentPort?.postMessage({
    type: "error",
    message: error.message,
  });
  console.error(error.message);
  process.exitCode = 1;
});
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const job of jobs.values()) job.controller.abort();
  server.close();
  const deadline = Date.now() + 12000;
  while (jobs.size && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 100));
  server.closeAllConnections();
  process.exit(0);
}
(process as any).parentPort?.on(
  "message",
  (event: { data: { type: string } }) => {
    if (event.data?.type === "shutdown") void shutdown();
  },
);
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
