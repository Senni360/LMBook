export type Vault = { id: string; name: string; root: string };
export type VaultFile = {
  path: string;
  bytes: number;
  modified: number;
  title?: string;
  aliases?: string[];
  tags?: string[];
  revision?: string;
  issue?: string;
};
export type VaultIndexStatus = {
  running: boolean;
  completed: number;
  total: number;
  updatedAt: string | null;
  warnings: string[];
};
export type VaultIndex = {
  files: VaultFile[];
  folders: string[];
  assets: { path: string; bytes: number; modified: number }[];
  status: VaultIndexStatus;
};
export type VaultSearchResult = { path: string; snippet: string };
export type VaultNote = {
  path: string;
  text: string;
  revision: string;
  modified: number;
};
export type VaultDraft = {
  id: string;
  title: string;
  markdown: string;
  createdAt: string;
  sources: { path: string; revision: string; text: string }[];
};
