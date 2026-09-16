export type Vault = { id: string; name: string; root: string };
export type VaultFile = { path: string; bytes: number; modified: number };
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
