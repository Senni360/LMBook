import type { Subject } from "./model.ts";

export type VaultLearningDestination =
  | {
      kind: "existing";
      notebookId: string;
    }
  | {
      kind: "new";
      title: string;
      subject: Subject;
      language: "en" | "nl";
      settingsFromNotebookId?: string;
    };

export type VaultLearningImportInput = {
  paths: string[];
  destination: VaultLearningDestination;
  kind: "course" | "supplement";
  /** Revisions captured by the review screen, keyed by vault-relative path. */
  revisions?: Record<string, string>;
};

export type VaultLearningNotePreview = {
  path: string;
  revision: string | null;
  words: number;
  bytes: number;
  ready: boolean;
  issue: string | null;
  existing: {
    sourceId: string;
    title: string;
    hash: string;
    revision: string | null;
  } | null;
};

export type VaultLearningPreview = {
  vaultId: string;
  destination?: VaultLearningDestination;
  notes: VaultLearningNotePreview[];
  counts: {
    requested: number;
    readable: number;
    ready: number;
    issues: number;
    duplicates: number;
    words: number;
    bytes: number;
  };
  issue: string | null;
};

export type VaultSourceChange = {
  sourceId: string;
  path: string;
  originalRevision: string;
  currentRevision: string | null;
  status: "unchanged" | "changed" | "missing";
  issue: string | null;
  references: {
    episodeSnapshots: number;
    flashcardSnapshots: number;
    chatSnapshots: number;
  };
};

export type VaultSourceChanges = {
  vaultId: string;
  notebookId: string;
  title: string;
  changes: VaultSourceChange[];
  counts: {
    unchanged: number;
    changed: number;
    missing: number;
  };
  tradeoff: string;
};

export type VaultLearningImportResult = {
  notebookId: string;
  title: string;
  added: number;
  unchanged: number;
};

export type VaultSourceRefreshResult = {
  notebookId: string;
  title: string;
  refreshed: number;
  unchanged: number;
  changes: VaultSourceChange[];
};

export type VaultSourceRefreshInput = {
  notebookId: string;
  sourceIds: string[];
  revisions?: Record<string, string>;
};

/** Kept as an alias for callers that use the shorter service name. */
export type VaultLearningInput = VaultLearningImportInput;
