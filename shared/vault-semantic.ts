/** Public contract for the optional, explicit semantic vault index. */
export type VaultEmbeddingProviderKind = "local" | "cloud";

export type VaultEmbeddingIdentity = {
  provider: string;
  model: string;
  version: string;
  kind: VaultEmbeddingProviderKind;
};

export type VaultSemanticChunk = {
  path: string;
  title: string;
  text: string;
  start: number;
  end: number;
  revision: string;
  score?: number;
};

export type VaultSemanticStatus = {
  running: boolean;
  cancelling: boolean;
  completed: number;
  total: number;
  updatedAt: string | null;
  identity: VaultEmbeddingIdentity | null;
  error: string | null;
};
export type VaultSemanticPreference = "lexical" | "local" | "openrouter";

export type VaultSemanticIndex = {
  status: VaultSemanticStatus;
  chunkCount: number;
};

export type VaultSemanticSearchResult = VaultSemanticChunk & {
  score: number;
};

export type VaultSemanticEmbeddingRequest = {
  texts: string[];
  /** E5 models distinguish query and passage prefixes. Providers may ignore this. */
  kind?: "query" | "passage";
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
};

export type VaultEmbeddingProvider = VaultEmbeddingIdentity & {
  embed: (request: VaultSemanticEmbeddingRequest) => Promise<number[][]>;
};

export type VaultSemanticSearchResponse = {
  rankingNotice?: string;
  results: VaultSemanticSearchResult[];
  status: VaultSemanticStatus;
  more: boolean;
};
