export const LOCAL_EMBEDDING_MODEL = "intfloat/multilingual-e5-small" as const;
export const LOCAL_EMBEDDING_REVISION =
  "614241f622f53c4eeff9890bdc4f31cfecc418b3" as const;

export type LocalModelPlatform = "windows" | "macos" | "linux" | "other";
export type LocalModelFit =
  "good" | "possible" | "not-recommended" | "unavailable";

export type LocalModelHardware = {
  platform: LocalModelPlatform;
  cpuModel: string;
  logicalCores: number;
  memoryBytes: number | null;
  freeMemoryBytes: number | null;
  gpu: { name: string; memoryBytes: number; freeBytes: number | null } | null;
  checkedAt: string;
};

export type LocalModelStatus = {
  model: typeof LOCAL_EMBEDDING_MODEL;
  revision: typeof LOCAL_EMBEDDING_REVISION;
  ready: boolean;
  downloaded: boolean;
  runtimeChecked: boolean;
  runtimeReady: boolean;
  probeError: string | null;
  lastCheckedAt: string | null;
  runtime: boolean;
  python: boolean;
  worker: boolean;
  enabled: boolean;
  downloading: boolean;
  progress: number | null;
  message: string;
  hardware: LocalModelHardware;
  fit: LocalModelFit;
  fitExplanation: string;
  activity: {
    running: boolean;
    cancelling: boolean;
    progress: number | null;
    message: string;
    error: string | null;
  };
};

export type LocalModelCheckResult = {
  ok: boolean;
  status: "ready" | "downloaded" | "missing" | "error";
  elapsedMs: number;
  dimensions: number | null;
  error: string | null;
};

export type LocalModelProgress = {
  phase:
    "runtime" | "download" | "loading" | "embedding" | "complete" | "error";
  progress: number | null;
  message: string;
};

export type EmbeddingResult = {
  vectors: number[][];
  model: typeof LOCAL_EMBEDDING_MODEL;
};
