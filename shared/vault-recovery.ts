import type { VaultNote } from "./vault.ts";

/** The editor payload persisted by LMBook for one unfinished vault note. */
export type VaultRecoveryDraft = {
  path: string;
  text: string;
  base: VaultNote | null;
  generated?: string;
};

/** Metadata used to list recovery drafts without returning note contents. */
export type VaultRecoveryDraftSummary = {
  path: string;
  updatedAt: string;
  bytes: number;
  version: number;
  generated?: string;
};

export type VaultRecoveryDraftRecord = VaultRecoveryDraftSummary &
  VaultRecoveryDraft;

export type VaultStorageCategory = "history" | "generated" | "index";

export type VaultStorageStat = { count: number; bytes: number };

export type VaultStorageInventory = {
  history: VaultStorageStat;
  generations: VaultStorageStat;
  recovery: VaultStorageStat;
  index: VaultStorageStat;
};
