import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  settingsSchema,
  subjects,
  words,
  type Notebook,
  type Source,
} from "../shared/model.ts";
import type {
  VaultLearningDestination,
  VaultLearningImportInput,
  VaultLearningImportResult,
  VaultLearningNotePreview,
  VaultLearningPreview,
  VaultSourceChange,
  VaultSourceChanges,
  VaultSourceRefreshResult,
} from "../shared/vault-learning.ts";
import { getVault, readVaultNote, vaultError } from "./vault.ts";
import {
  getNotebook,
  newNotebook,
  originalsDir,
  saveNotebook,
} from "./store.ts";
import { withArtifactMutation } from "./artifact-lock.ts";
import { storeOriginal } from "./source-originals.ts";
import { jobs } from "./jobs.ts";

const MAX_PATHS = 150;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const REVISION = /^[a-f0-9]{64}$/u;
const UUID = z.string().uuid();

type LoadedNote = {
  path: string;
  revision: string;
  text: string;
  bytes: Buffer;
  hash: string;
  words: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The vault note could not be read.";
}

function validatePaths(paths: unknown) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_PATHS)
    throw vaultError(`Select between 1 and ${MAX_PATHS} notes.`);
  if (
    paths.some(
      (item) =>
        typeof item !== "string" || item.length < 1 || item.length > 500,
    )
  )
    throw vaultError("Each selected path must be a relative Markdown path.");
  return [...new Set(paths as string[])];
}

function validateDestination(destination: VaultLearningDestination) {
  if (
    !destination ||
    (destination.kind !== "existing" && destination.kind !== "new")
  )
    throw vaultError(
      "Choose an existing notebook or enter details for a new notebook.",
    );
  if (destination.kind === "existing") {
    UUID.parse(destination.notebookId);
    return;
  }
  if (typeof destination.title !== "string")
    throw vaultError("The new notebook title must contain 1–180 characters.");
  const title = destination.title.trim();
  if (!title || title.length > 180)
    throw vaultError("The new notebook title must contain 1–180 characters.");
  if (!subjects.includes(destination.subject))
    throw vaultError("Choose a valid notebook subject.");
  if (destination.language !== "en" && destination.language !== "nl")
    throw vaultError("Choose English or Dutch for the new notebook.");
  if (destination.settingsFromNotebookId !== undefined)
    UUID.parse(destination.settingsFromNotebookId);
}

function validateImportInput(input: VaultLearningImportInput) {
  const paths = validatePaths(input?.paths);
  validateDestination(input?.destination);
  if (input.kind !== "course" && input.kind !== "supplement")
    throw vaultError(
      "Choose whether these notes are required course material or supporting material.",
    );
  for (const [path, revision] of Object.entries(input.revisions || {})) {
    if (path.length < 1 || path.length > 500 || !REVISION.test(revision))
      throw vaultError(
        "A reviewed note revision is invalid. Refresh the review and try again.",
      );
  }
  return { ...input, paths };
}

async function loadNote(
  vaultId: string,
  path: string,
  expectedRevision?: string,
) {
  const result = await readVaultNote(vaultId, path);
  if (expectedRevision && result.note.revision !== expectedRevision)
    throw vaultError(
      `${path} changed outside LMBook after review. Refresh the review before importing it.`,
      409,
    );
  if (!result.note.text.trim())
    throw vaultError(`${path} is empty. Deselect it before adding sources.`);
  return {
    path: result.note.path,
    revision: result.note.revision,
    text: result.note.text,
    bytes: result.bytes,
    hash: createHash("sha256").update(result.bytes).digest("hex"),
    words: words(result.note.text),
  } satisfies LoadedNote;
}

async function loadSelection(
  vaultId: string,
  paths: string[],
  revisions?: Record<string, string>,
) {
  const loaded: LoadedNote[] = [];
  for (const path of paths)
    loaded.push(await loadNote(vaultId, path, revisions?.[path]));
  const bytes = loaded.reduce((sum, note) => sum + note.bytes.length, 0);
  if (bytes > MAX_TOTAL_BYTES)
    throw vaultError(
      "Select fewer notes; one import can contain up to 5 MB of exact source bytes.",
    );
  return loaded;
}

function sourceHash(source: Source) {
  return source.originalSha256 || source.attachment?.sha256 || "";
}

function existingDuplicate(
  notebook: Notebook | undefined,
  vaultId: string,
  path: string,
  hash: string,
) {
  return notebook?.sources.find(
    (source) =>
      source.vault?.vaultId === vaultId &&
      source.vault.path === path &&
      sourceHash(source) === hash,
  );
}

function duplicateInfo(source: Source | undefined) {
  return source
    ? {
        sourceId: source.id,
        title: source.title,
        hash: sourceHash(source),
        revision: source.vault?.revision || null,
      }
    : null;
}

function previewNote(
  path: string,
  notebook: Notebook | undefined,
  vaultId: string,
  loaded?: LoadedNote,
  issue: string | null = null,
): VaultLearningNotePreview {
  const existing = loaded
    ? existingDuplicate(notebook, vaultId, path, loaded.hash)
    : undefined;
  return {
    path,
    revision: loaded?.revision || null,
    words: loaded?.words || 0,
    bytes: loaded?.bytes.length || 0,
    ready: !issue,
    issue,
    existing: duplicateInfo(existing),
  };
}

/** Read a selection for review without changing a notebook or the originals store. */
export async function previewVaultLearning(
  vaultId: string,
  paths: string[],
  destination?: VaultLearningDestination,
): Promise<VaultLearningPreview> {
  const vault = getVault(vaultId);
  const selected = validatePaths(paths);
  let notebook: Notebook | undefined;
  if (destination) {
    validateDestination(destination);
    if (destination.kind === "existing")
      notebook = getNotebook(destination.notebookId);
  }
  const notes: VaultLearningNotePreview[] = [];
  for (const path of selected) {
    try {
      const loaded = await loadNote(vault.id, path);
      notes.push(previewNote(path, notebook, vault.id, loaded));
    } catch (error) {
      notes.push(
        previewNote(path, notebook, vault.id, undefined, errorMessage(error)),
      );
    }
  }
  const counts = {
    requested: notes.length,
    readable: notes.filter((note) => note.revision !== null).length,
    ready: notes.filter((note) => note.ready).length,
    issues: notes.filter((note) => !!note.issue).length,
    duplicates: notes.filter((note) => !!note.existing).length,
    words: notes.reduce((sum, note) => sum + note.words, 0),
    bytes: notes.reduce((sum, note) => sum + note.bytes, 0),
  };
  let issue: string | null = null;
  if (counts.bytes > MAX_TOTAL_BYTES)
    issue =
      "Select fewer notes; one import can contain up to 5 MB of exact source bytes.";
  if (
    notebook &&
    notebook.sources.length +
      notes.filter((note) => note.ready && !note.existing).length >
      MAX_PATHS
  )
    issue =
      "This notebook can contain at most 150 current sources. Choose fewer notes or create a new notebook.";
  return {
    vaultId: vault.id,
    ...(destination ? { destination } : {}),
    notes,
    counts,
    issue,
  };
}

function assertNoGeneration(notebookId: string) {
  if (jobs.has(notebookId))
    throw vaultError(
      "Wait for this notebook's generation to finish before changing its sources.",
      409,
    );
}

function makeSource(
  vault: { id: string; name: string },
  note: LoadedNote,
  kind: "course" | "supplement",
  attachment: Source["attachment"],
) {
  if (!attachment)
    throw new Error("The imported source attachment was not stored.");
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: note.path,
    text: note.text,
    filename: note.path,
    kind,
    createdAt: now,
    attachment,
    originalSha256: attachment.sha256,
    extractedSha256: createHash("sha256").update(note.text).digest("hex"),
    extraction: `Snapshot from vault ${vault.name}: ${note.path} (${note.revision})`,
    vault: {
      vaultId: vault.id,
      vaultName: vault.name,
      path: note.path,
      revision: note.revision,
      importedAt: now,
    },
  } satisfies Source;
}

function newNotebookFromDestination(
  destination: Extract<VaultLearningDestination, { kind: "new" }>,
) {
  const notebook = newNotebook(destination.title.trim());
  const base = destination.settingsFromNotebookId
    ? structuredClone(getNotebook(destination.settingsFromNotebookId).settings)
    : settingsSchema.parse({});
  notebook.settings = settingsSchema.parse({
    ...base,
    subject: destination.subject,
    language: destination.language,
  });
  return notebook;
}

/** Import reviewed notes into an existing notebook or atomically create a new one. */
export async function importVaultLearning(
  vaultId: string,
  input: VaultLearningImportInput,
): Promise<VaultLearningImportResult> {
  const validated = validateImportInput(input);
  return withArtifactMutation(async () => {
    const vault = getVault(vaultId);
    if (validated.destination.kind === "existing")
      assertNoGeneration(validated.destination.notebookId);
    const loaded = await loadSelection(
      vault.id,
      validated.paths,
      validated.revisions,
    );
    let notebook =
      validated.destination.kind === "new"
        ? newNotebookFromDestination(validated.destination)
        : getNotebook(validated.destination.notebookId);
    const initialFresh = loaded.filter(
      (note) => !existingDuplicate(notebook, vault.id, note.path, note.hash),
    );
    if (notebook.sources.length + initialFresh.length > MAX_PATHS)
      throw vaultError(
        "This notebook can contain at most 150 current sources. Choose fewer notes or create a new notebook.",
      );
    const built: Source[] = [];
    for (const note of initialFresh) {
      const attachment = await storeOriginal(
        originalsDir,
        note.bytes,
        note.path,
        "text/markdown",
      );
      if (attachment.sha256 !== note.hash)
        throw new Error("The stored source changed while importing.");
      built.push(makeSource(vault, note, validated.kind, attachment));
    }
    if (validated.destination.kind === "existing") {
      assertNoGeneration(validated.destination.notebookId);
      notebook = getNotebook(validated.destination.notebookId);
    }
    const fresh = built.filter(
      (source) =>
        !existingDuplicate(
          notebook,
          vault.id,
          source.vault!.path,
          sourceHash(source),
        ),
    );
    if (notebook.sources.length + fresh.length > MAX_PATHS)
      throw vaultError(
        "This notebook can contain at most 150 current sources. Choose fewer notes or create a new notebook.",
      );
    if (fresh.length) {
      for (const note of loaded) {
        if (
          (await readVaultNote(vault.id, note.path)).note.revision !==
          note.revision
        )
          throw vaultError(
            `${note.path} changed during import. Review the selection again; no notebook sources were changed.`,
            409,
          );
      }
      notebook.sources.push(...fresh);
      notebook.coverage = [];
      saveNotebook(notebook);
    }
    return {
      notebookId: notebook.id,
      title: notebook.title,
      added: fresh.length,
      unchanged: loaded.length - fresh.length,
    };
  });
}

function references(notebook: Notebook, sourceId: string) {
  return {
    episodeSnapshots: notebook.episodes.filter((episode) =>
      (episode.sources || []).some((source) => source.id === sourceId),
    ).length,
    flashcardSnapshots: (notebook.flashcards || []).filter((deck) =>
      deck.sources.some((source) => source.id === sourceId),
    ).length,
    chatSnapshots: notebook.messages.filter((message) =>
      (message.sources || []).some((source) => source.id === sourceId),
    ).length,
  };
}

/**
 * Preserve only the source copies that historical assistant messages actually
 * cite or received as context. Legacy messages are backfilled only when their
 * context carries a matching source hash and every cited quote still occurs
 * in the current source. Evidence without a reliable hash is insufficient to
 * prove that the full source predates the refresh, so it remains unsnapshotted.
 * Existing message snapshots are immutable and remain in place across later
 * refreshes.
 */
function normalizedQuote(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function canBackfillMessageSource(
  message: Notebook["messages"][number],
  source: Source,
) {
  const passages = (message.context?.passages || []).filter(
    (passage) => passage.sourceId === source.id,
  );
  if (!passages.length || passages.some((passage) => !passage.sourceSha256))
    return false;
  const currentHash = createHash("sha256").update(source.text).digest("hex");
  if (source.extractedSha256 && source.extractedSha256 !== currentHash)
    return false;
  if (passages.some((passage) => passage.sourceSha256 !== currentHash))
    return false;
  const cited = (message.evidence || []).filter(
    (evidence) => evidence.sourceId === source.id,
  );
  const currentText = normalizedQuote(source.text);
  return cited.every((evidence) => {
    const quote = normalizedQuote(evidence.quote);
    return quote.length >= 12 && currentText.includes(quote);
  });
}

function captureHistoricalChatSources(
  notebook: Notebook,
  changedSourceIds: Set<string>,
) {
  let messagesChanged = 0;
  for (const message of notebook.messages) {
    if (message.role !== "assistant") continue;
    const usedSourceIds = new Set([
      ...(message.evidence || []).map((evidence) => evidence.sourceId),
      ...(message.context?.passages || []).map((passage) => passage.sourceId),
    ]);
    const existing = message.sources || [];
    const existingIds = new Set(existing.map((source) => source.id));
    const additions = [...changedSourceIds]
      .filter((sourceId) => usedSourceIds.has(sourceId))
      .map((sourceId) =>
        notebook.sources.find((source) => source.id === sourceId),
      )
      .filter((source): source is Source => !!source)
      .filter((source) => !existingIds.has(source.id))
      .filter((source) => canBackfillMessageSource(message, source))
      .map((source) => structuredClone(source));
    if (!additions.length) continue;
    message.sources = [...existing, ...additions];
    messagesChanged++;
  }
  return messagesChanged;
}

/** Compare the current vault files with the revisions saved in a notebook. */
export async function inspectVaultSourceChanges(
  vaultId: string,
  notebookId: string,
): Promise<VaultSourceChanges> {
  const vault = getVault(vaultId);
  UUID.parse(notebookId);
  const notebook = getNotebook(notebookId);
  const changes: VaultSourceChange[] = [];
  for (const source of notebook.sources) {
    if (source.vault?.vaultId !== vault.id) continue;
    const originalRevision = source.vault.revision;
    try {
      const note = await readVaultNote(vault.id, source.vault.path);
      changes.push({
        sourceId: source.id,
        path: source.vault.path,
        originalRevision,
        currentRevision: note.note.revision,
        status:
          note.note.revision === originalRevision ? "unchanged" : "changed",
        issue: note.note.text.trim() ? null : "The current note is empty.",
        references: references(notebook, source.id),
      });
    } catch (error) {
      changes.push({
        sourceId: source.id,
        path: source.vault.path,
        originalRevision,
        currentRevision: null,
        status: "missing",
        issue: errorMessage(error),
        references: references(notebook, source.id),
      });
    }
  }
  return {
    vaultId: vault.id,
    notebookId: notebook.id,
    title: notebook.title,
    changes,
    counts: {
      unchanged: changes.filter((change) => change.status === "unchanged")
        .length,
      changed: changes.filter((change) => change.status === "changed").length,
      missing: changes.filter((change) => change.status === "missing").length,
    },
    tradeoff:
      "Refreshing keeps each current source ID, so current notebook references continue to work. Episode, flashcard and cited chat snapshots retain their original text for historical fidelity and are not rewritten. Legacy chat messages are backfilled only when their context hash and cited quotes still prove the current source is the same; hash-less evidence stays unsnapshotted rather than being mislabeled as historical.",
  };
}

/** Refresh reviewed vault sources in place, preserving source IDs and snapshots. */
export async function refreshVaultSources(
  vaultId: string,
  notebookId: string,
  sourceIds: string[],
  revisions?: Record<string, string>,
): Promise<VaultSourceRefreshResult> {
  if (
    !Array.isArray(sourceIds) ||
    sourceIds.length < 1 ||
    sourceIds.length > MAX_PATHS
  )
    throw vaultError(
      `Choose between 1 and ${MAX_PATHS} vault sources to refresh.`,
    );
  const ids = [...new Set(sourceIds)];
  if (ids.some((sourceId) => !UUID.safeParse(sourceId).success))
    throw vaultError("A selected source ID is invalid.");
  if (revisions !== undefined) {
    if (!revisions || typeof revisions !== "object")
      throw vaultError("Reviewed source revisions are invalid.");
    const revisionIds = Object.keys(revisions);
    if (
      revisionIds.length !== ids.length ||
      revisionIds.some((sourceId) => !ids.includes(sourceId)) ||
      ids.some((sourceId) => !REVISION.test(revisions[sourceId] || ""))
    )
      throw vaultError(
        "Review every selected vault source again before refreshing it.",
        409,
      );
  }
  return withArtifactMutation(async () => {
    const vault = getVault(vaultId);
    assertNoGeneration(notebookId);
    const notebook = getNotebook(notebookId);
    const selected = ids.map((sourceId) => {
      const source = notebook.sources.find(
        (candidate) => candidate.id === sourceId,
      );
      if (!source || source.vault?.vaultId !== vault.id)
        throw vaultError(
          "One selected source is not a current source from this vault.",
          400,
        );
      return source;
    });
    const loaded: { source: Source; note: LoadedNote }[] = [];
    for (const source of selected) {
      const provenance = source.vault!;
      const note = await loadNote(
        vault.id,
        provenance.path,
        revisions?.[source.id],
      );
      if (note.revision === provenance.revision) continue;
      loaded.push({ source, note });
    }
    const bytes = loaded.reduce((sum, item) => sum + item.note.bytes.length, 0);
    if (bytes > MAX_TOTAL_BYTES)
      throw vaultError(
        "Select fewer notes; one refresh can contain up to 5 MB of exact source bytes.",
      );
    const attachments = new Map<string, Source["attachment"]>();
    for (const { source, note } of loaded) {
      const attachment = await storeOriginal(
        originalsDir,
        note.bytes,
        note.path,
        "text/markdown",
      );
      if (attachment.sha256 !== note.hash)
        throw new Error("The stored source changed while refreshing.");
      attachments.set(source.id, attachment);
    }
    for (const { note } of loaded) {
      if (
        (await readVaultNote(vault.id, note.path)).note.revision !==
        note.revision
      )
        throw vaultError(
          `${note.path} changed during refresh. Check the source changes again; no notebook sources were replaced.`,
          409,
        );
    }
    assertNoGeneration(notebookId);
    const latest = getNotebook(notebookId);
    for (const source of selected) {
      const current = latest.sources.find(
        (candidate) => candidate.id === source.id,
      );
      if (!current || current.vault?.revision !== source.vault!.revision)
        throw vaultError(
          "A source changed while it was being reviewed. Inspect the notebook again.",
          409,
        );
    }
    captureHistoricalChatSources(
      latest,
      new Set(loaded.map(({ source }) => source.id)),
    );
    let refreshed = 0;
    for (const { source, note } of loaded) {
      const current = latest.sources.find(
        (candidate) => candidate.id === source.id,
      )!;
      const attachment = attachments.get(source.id)!;
      const now = new Date().toISOString();
      Object.assign(current, {
        title: note.path,
        text: note.text,
        filename: note.path,
        attachment,
        originalSha256: attachment!.sha256,
        extractedSha256: createHash("sha256").update(note.text).digest("hex"),
        extraction: `Snapshot from vault ${vault.name}: ${note.path} (${note.revision})`,
        vault: {
          ...current.vault,
          vaultName: vault.name,
          revision: note.revision,
          importedAt: now,
        },
      });
      refreshed++;
    }
    if (refreshed) {
      latest.coverage = [];
      saveNotebook(latest);
    }
    const changes = selected.map((source) => {
      const refreshedNote = loaded.find(
        (item) => item.source.id === source.id,
      )?.note;
      return {
        sourceId: source.id,
        path: source.vault!.path,
        originalRevision: source.vault!.revision,
        currentRevision: refreshedNote?.revision || source.vault!.revision,
        status: refreshedNote ? ("changed" as const) : ("unchanged" as const),
        issue: null,
        references: references(latest, source.id),
      };
    });
    return {
      notebookId: latest.id,
      title: latest.title,
      refreshed,
      unchanged: selected.length - refreshed,
      changes,
    };
  });
}
