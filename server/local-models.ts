import { execFile, spawn, type ChildProcess } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  stat,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dataDir } from "./store.ts";
import { stopProcess } from "./process-lifecycle.ts";
import {
  LOCAL_EMBEDDING_MODEL,
  LOCAL_EMBEDDING_REVISION,
  type EmbeddingResult,
  type LocalModelFit,
  type LocalModelHardware,
  type LocalModelProgress,
  type LocalModelStatus,
} from "../shared/local-models.ts";
import type { VaultEmbeddingProvider } from "../shared/vault-semantic.ts";

const runtimeRoot = path.join(dataDir, "local-models", "runtime");
const modelsRoot = path.join(dataDir, "local-models");
const workerPath = path.resolve(
  process.env.LMBOOK_LOCAL_EMBEDDING_WORKER ||
    path.join(
      path.dirname(
        path.resolve(
          process.env.SENNIBOOK_TRANSCRIBE_WORKER || "python/transcribe.py",
        ),
      ),
      "local_embeddings.py",
    ),
);
const runtimePython =
  process.platform === "win32"
    ? path.join(runtimeRoot, "Scripts", "python.exe")
    : path.join(runtimeRoot, "bin", "python");
const systemPython =
  process.env.LMBOOK_PYTHON ||
  process.env.SENNIBOOK_PYTHON ||
  (process.platform === "win32" ? "python" : "python3");
const modelDir = path.join(modelsRoot, "multilingual-e5-small");
const statePath = path.join(modelsRoot, "state.json");
type InstallState = {
  running: boolean;
  cancelling: boolean;
  progress: LocalModelProgress | null;
  error: string | null;
};
let install:
  { controller: AbortController; promise: Promise<void> } | undefined;
let installState: InstallState = {
  running: false,
  cancelling: false,
  progress: null,
  error: null,
};
let stateWrite: Promise<void> = Promise.resolve();
function persistInstallState(nextEnabled?: boolean) {
  const nextInstall = structuredClone(installState);
  const write = stateWrite.then(async () => {
    let current: { enabled?: boolean } = {};
    try {
      current = JSON.parse(await readFile(statePath, "utf8"));
    } catch {
      /* first run */
    }
    await mkdir(modelsRoot, { recursive: true });
    const temp = `${statePath}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(
        temp,
        JSON.stringify({
          enabled: nextEnabled ?? current.enabled === true,
          install: nextInstall,
        }),
        { encoding: "utf8", mode: 0o600 },
      );
      await rename(temp, statePath);
    } finally {
      await rm(temp, { force: true });
    }
  });
  stateWrite = write.catch(() => undefined);
  return write;
}

const exists = async (p: string) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};
const platform = (): LocalModelHardware["platform"] =>
  process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "macos"
      : process.platform === "linux"
        ? "linux"
        : "other";
function fitFor(h: LocalModelHardware): {
  fit: LocalModelFit;
  explanation: string;
} {
  if (!h.memoryBytes || h.memoryBytes < 4 * 1024 ** 3)
    return {
      fit: "not-recommended",
      explanation:
        "This computer reports less than 4 GB RAM; local indexing may be unstable. Lexical search remains available.",
    };
  if (h.freeMemoryBytes && h.freeMemoryBytes < 2 * 1024 ** 3)
    return {
      fit: "possible",
      explanation:
        "Little memory is free right now. Close memory-heavy apps before indexing; this model uses the CPU and needs space for its runtime as well as its weights.",
    };
  if (h.memoryBytes >= 16 * 1024 ** 3 && h.logicalCores >= 4)
    return {
      fit: "good",
      explanation:
        "Your memory and processor make local search a reasonable choice. It uses up to four CPU threads. Building the first index takes longer than later searches; other apps affect the speed.",
    };
  return {
    fit: "possible",
    explanation:
      "The model can run on CPU, but indexing may be slow and should be allowed to run in the background.",
  };
}

function nvidiaSmi(): Promise<LocalModelHardware["gpu"]> {
  return new Promise((resolve) => {
    const child = execFile(
      "nvidia-smi",
      [
        "--query-gpu=name,memory.total,memory.free",
        "--format=csv,noheader,nounits",
      ],
      { windowsHide: true, timeout: 1_500 },
      (error, stdout) => {
        if (error) return resolve(null);
        const [name, total, free] = stdout
          .trim()
          .split(",")
          .map((x) => x.trim());
        const totalMiB = Number(total),
          freeMiB = Number(free);
        resolve(
          name && Number.isFinite(totalMiB)
            ? {
                name,
                memoryBytes: totalMiB * 1024 ** 2,
                freeBytes: Number.isFinite(freeMiB)
                  ? freeMiB * 1024 ** 2
                  : null,
              }
            : null,
        );
      },
    );
    child.once("error", () => resolve(null));
  });
}

export async function detectLocalModelHardware(): Promise<LocalModelHardware> {
  const gpu = await nvidiaSmi();
  return {
    platform: platform(),
    cpuModel: os.cpus()[0]?.model || "Unknown CPU",
    logicalCores: os.cpus().length,
    memoryBytes: os.totalmem() || null,
    freeMemoryBytes: os.freemem() || null,
    gpu,
    checkedAt: new Date().toISOString(),
  };
}

async function prepared() {
  try {
    const marker = JSON.parse(
      await readFile(path.join(modelDir, ".download-complete"), "utf8"),
    ) as { complete?: boolean; revision?: string };
    return (
      marker.complete === true &&
      marker.revision === LOCAL_EMBEDDING_REVISION &&
      (
        await Promise.all(
          [
            "config.json",
            "tokenizer.json",
            "tokenizer_config.json",
            "model.safetensors",
          ].map(async (file) => {
            const s = await stat(path.join(modelDir, file));
            return s.isFile() && s.size > 0;
          }),
        )
      ).every(Boolean)
    );
  } catch {
    return false;
  }
}
async function verified() {
  try {
    return (
      (
        JSON.parse(
          await readFile(path.join(modelDir, ".verified.json"), "utf8"),
        ) as { revision: string }
      ).revision === LOCAL_EMBEDDING_REVISION
    );
  } catch {
    return false;
  }
}
async function enabled() {
  try {
    return (
      (JSON.parse(await readFile(statePath, "utf8")) as { enabled?: boolean })
        .enabled === true
    );
  } catch {
    return false;
  }
}
export async function getLocalModelEnabled() {
  return enabled();
}
export async function setLocalModelEnabled(value: boolean) {
  if (value && !(await getLocalModelStatus()).ready)
    throw new Error("Set up local multilingual search before enabling it.");
  await persistInstallState(value);
  if (!value) unloadLocalModel();
}

type ProcessOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  onLine?: (r: Record<string, unknown>) => void;
  onText?: (line: string) => void;
};
async function run(
  command: string,
  args: string[],
  options: ProcessOptions = {},
) {
  if (options.signal?.aborted) throw new Error("Local model setup cancelled.");
  const safeEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL)/iu.test(key),
    ),
  );
  const child = spawn(command, args, {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...safeEnv,
      PIP_PROGRESS_BAR: "off",
      PIP_NO_INPUT: "1",
      HF_HUB_DISABLE_XET: "1",
      PYTHONUTF8: "1",
      PYTHONUNBUFFERED: "1",
      PYTHONNOUSERSITE: "1",
      HF_HOME: path.join(modelsRoot, ".hf-cache"),
      HF_HUB_DISABLE_TELEMETRY: "1",
      HF_HUB_DISABLE_IMPLICIT_TOKEN: "1",
    },
  });
  let output = "",
    stderr = "",
    buffer = "",
    stopping: Promise<void> | undefined;
  let timedOut = false;
  let processError = "";
  const stop = () => {
    stopping ??= (async () => {
      stopProcess(child);
      await new Promise((r) => setTimeout(r, 300));
    })();
    return stopping;
  };
  const abort = () => void stop();
  options.signal?.addEventListener("abort", abort, { once: true });
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    output = (output + chunk).slice(-2 * 1024 * 1024);
    buffer += chunk;
    if (Buffer.byteLength(buffer, "utf8") > 256 * 1024) {
      void stop();
      return;
    }
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      try {
        const record = JSON.parse(line);
        if (record.type === "error")
          processError = String(record.message || "").slice(0, 1200);
        options.onLine?.(record);
      } catch {
        options.onText?.(line);
      }
    }
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-8_000);
  });
  const timer = options.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        void stop();
      }, options.timeoutMs)
    : undefined;
  let result: { code: number | null };
  try {
    result = await new Promise<{ code: number | null }>((resolve, reject) => {
      child.once("error", () =>
        reject(
          new Error(
            "The local Python process could not start. Install Python and recheck the runtime.",
          ),
        ),
      );
      child.once("close", (code) => resolve({ code }));
    });
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
  if (stopping) await stopping;
  if (options.signal?.aborted) throw new Error("Local model setup cancelled.");
  if (timedOut)
    throw new Error(
      "Local model setup timed out. Check your connection and retry; downloaded files are kept.",
    );
  if (result.code !== 0) throw new Error(setupFailure(processError || stderr));
  return output;
}

function setupFailure(diagnostic: string) {
  if (/No module named pip/i.test(diagnostic))
    return "Python's package installer is missing. Retry setup to repair the local runtime.";
  if (/no space left|disk.*full|Errno 28/i.test(diagnostic))
    return "There is not enough disk space for local AI. Free some space and retry.";
  if (
    /SSL|CERTIFICATE|connection|timed out|proxy|resolve|network|HTTP/i.test(
      diagnostic,
    )
  )
    return "The model download could not connect. Check your internet connection, proxy or firewall, then retry. Completed downloads are kept.";
  if (
    /No matching distribution|requires.*Python|UnsupportedPython/i.test(
      diagnostic,
    )
  )
    return "These local AI packages need Python 3.10–3.13. Install a supported version and retry.";
  const detail = diagnostic
    .split(/\r?\n/)
    .filter((line) => /error|exception|denied|failed/i.test(line))
    .at(-1)
    ?.trim();
  const safe = (detail || diagnostic.trim())
    .replace(/https?:\/\/\S+|Bearer\s+\S+|(?:sk-|hf_)[\w-]+/g, "[redacted]")
    .slice(0, 350);
  return `Local AI setup failed.${safe ? ` ${safe}` : " Retry setup to continue."}`;
}

let runtimeCheck: { at: number; worker: boolean; message: string } | undefined;
let runtimeProbe: Promise<{ worker: boolean; message: string }> | undefined;
async function probeRuntime() {
  if (runtimeCheck && Date.now() - runtimeCheck.at < 30000) return runtimeCheck;
  if (runtimeProbe) return runtimeProbe;
  runtimeProbe = (async () => {
    let worker = false,
      message = "The local runtime needs setup.";
    await run(
      runtimePython,
      ["-u", workerPath, "status", "--models-root", modelsRoot],
      {
        timeoutMs: 15000,
        onLine: (r) => {
          if (r.type === "status") worker = r.runtime === true;
        },
      },
    ).catch(() => {});
    if (worker) message = "Local embedding runtime is available.";
    runtimeCheck = { at: Date.now(), worker, message };
    return runtimeCheck;
  })().finally(() => {
    runtimeProbe = undefined;
  });
  return runtimeProbe;
}
export async function getLocalModelStatus(): Promise<LocalModelStatus> {
  const hardware = await detectLocalModelHardware();
  const assessment = fitFor(hardware);
  const ready = (await prepared()) && (await verified());
  const python = await run(
    systemPython,
    ["-c", "import sys; print(sys.version_info[:2])"],
    { timeoutMs: 2_000 },
  )
    .then(() => true)
    .catch(() => false);
  const runtime = (await exists(runtimePython)) && (await exists(workerPath));
  let worker = false,
    message = ready
      ? "Local multilingual search is ready."
      : "Set up local multilingual search to download the pinned model.";
  if (runtime && !installState.running)
    ({ worker, message } = await probeRuntime());
  const currentEnabled = await enabled();
  return {
    model: LOCAL_EMBEDDING_MODEL,
    revision: LOCAL_EMBEDDING_REVISION,
    ready: ready && runtime && worker,
    runtime,
    python,
    worker,
    enabled: currentEnabled,
    downloading: installState.running,
    progress: installState.progress?.progress ?? null,
    message: currentEnabled
      ? message
      : "Local multilingual search is disabled until you enable it.",
    hardware,
    fit: assessment.fit,
    fitExplanation: assessment.explanation,
    activity: {
      running: installState.running,
      cancelling: installState.cancelling,
      progress: installState.progress?.progress ?? null,
      message: installState.progress?.message || message,
      error: installState.error,
    },
  };
}

export async function prepareLocalModel(
  signal: AbortSignal,
  onProgress: (progress: LocalModelProgress) => void = () => {},
) {
  await mkdir(modelsRoot, { recursive: true });
  await mkdir(runtimeRoot, { recursive: true });
  if (!(await exists(runtimePython))) {
    onProgress({
      phase: "runtime",
      progress: 0,
      message: "Creating the isolated local AI runtime…",
    });
    await run(systemPython, ["-m", "venv", runtimeRoot], {
      signal,
      timeoutMs: 120_000,
    });
  }
  // Cancelling venv creation can leave python.exe behind without pip.
  await run(runtimePython, ["-m", "ensurepip", "--upgrade"], {
    signal,
    timeoutMs: 120000,
  });
  const requirements = path.resolve(
    process.env.LMBOOK_LOCAL_MODEL_REQUIREMENTS ||
      path.join(path.dirname(workerPath), "requirements-local-models.txt"),
  );
  onProgress({
    phase: "runtime",
    progress: null,
    message: "Installing local AI dependencies into the app runtime…",
  });
  await run(
    runtimePython,
    [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "--no-input",
      "-r",
      requirements,
    ],
    {
      signal,
      timeoutMs: 30 * 60_000,
      onText: (line) => {
        const item = line.match(
          /^(Collecting|Downloading|Installing collected packages|Successfully installed|Using cached)\s*:?[ ]*([a-zA-Z0-9_.+-]*)/,
        );
        if (item)
          onProgress({
            phase: "runtime",
            progress: null,
            message:
              item[1] === "Installing collected packages"
                ? "Installing downloaded libraries…"
                : `${item[1]}${item[2] ? ` ${item[2]}` : " libraries"}…`,
          });
      },
    },
  );
  if (!(await prepared())) {
    onProgress({
      phase: "download",
      progress: 0,
      message: "Downloading the pinned multilingual-e5-small checkpoint…",
    });
    await run(
      runtimePython,
      ["-u", workerPath, "prepare", "--models-root", modelsRoot],
      {
        signal,
        timeoutMs: 45 * 60_000,
        onLine: (r) => {
          if (r.type === "progress")
            onProgress({
              phase: "download",
              progress: typeof r.progress === "number" ? r.progress : null,
              message: String(r.message || "Downloading model…"),
            });
        },
      },
    );
  }
  onProgress({
    phase: "loading",
    progress: null,
    message: "Loading the checkpoint for an offline smoke query…",
  });
  await run(
    runtimePython,
    ["-u", workerPath, "smoke", "--models-root", modelsRoot],
    { signal, timeoutMs: 5 * 60_000 },
  );
  signal.throwIfAborted();
  await writeFile(
    path.join(modelDir, ".verified.json"),
    JSON.stringify({
      revision: LOCAL_EMBEDDING_REVISION,
      checkedAt: new Date().toISOString(),
    }),
    "utf8",
  );
  runtimeCheck = {
    at: Date.now(),
    worker: true,
    message: "Local embedding runtime is available.",
  };
  onProgress({
    phase: "complete",
    progress: 1,
    message: "Local multilingual search is ready.",
  });
}

export function getLocalModelInstallStatus() {
  return {
    ...installState,
    progress: installState.progress ? { ...installState.progress } : null,
  };
}
export function startLocalModelInstall(
  onProgress: (progress: LocalModelProgress) => void = () => {},
) {
  if (install) return install.promise;
  const controller = new AbortController();
  unloadLocalModel();
  installState = {
    running: true,
    cancelling: false,
    progress: {
      phase: "runtime",
      progress: null,
      message: "Preparing local AI setup…",
    },
    error: null,
  };
  void persistInstallState().catch(() => {});
  const report = (p: LocalModelProgress) => {
    if (controller.signal.aborted) return;
    installState.progress = p;
    void persistInstallState().catch(() => {});
    onProgress(p);
  };
  const promise = prepareLocalModel(controller.signal, report)
    .catch((error) => {
      if (controller.signal.aborted) {
        installState.error = null;
        installState.progress = {
          phase: "runtime",
          progress: null,
          message:
            "Setup cancelled. Downloaded files are kept; retry when you’re ready.",
        };
      } else
        installState.error =
          error instanceof Error ? error.message : "Local model setup failed.";
      throw error;
    })
    .finally(() => {
      installState.running = false;
      installState.cancelling = false;
      runtimeCheck = undefined;
      void persistInstallState().catch(() => {});
      install = undefined;
    });
  install = { controller, promise };
  return promise;
}
export async function cancelLocalModelInstall() {
  const current = install;
  if (!current) return;
  installState.cancelling = true;
  installState.progress = {
    phase: "runtime",
    progress: null,
    message: "Stopping setup…",
  };
  current.controller.abort();
  await current.promise.catch(() => {});
}
export const startLocalModelSetup = startLocalModelInstall;
export const cancelLocalModelSetup = cancelLocalModelInstall;

type Pending = { resolve: (v: number[][]) => void; reject: (e: Error) => void };
let embeddingWorker:
  | {
      child: ChildProcess;
      pending: Map<string, Pending>;
      buffer: string;
      fail: (error: Error) => void;
    }
  | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
async function workerFor() {
  if (!(await enabled()))
    throw new Error("Local multilingual search is disabled.");
  if (installState.running)
    throw new Error("Wait for local model setup to finish before searching.");
  if (embeddingWorker) return embeddingWorker;
  if (
    !(await prepared()) ||
    !(await verified()) ||
    !(await exists(runtimePython))
  )
    throw new Error(
      "Local multilingual search is not prepared. Run setup in Settings.",
    );
  const safeEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL)/iu.test(key),
    ),
  );
  const child = spawn(
    runtimePython,
    ["-u", workerPath, "worker", "--models-root", modelsRoot],
    {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...safeEnv,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1",
        PYTHONNOUSERSITE: "1",
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        HF_HOME: path.join(modelsRoot, ".hf-cache"),
        HF_HUB_DISABLE_IMPLICIT_TOKEN: "1",
      },
    },
  );
  const state = {
    child,
    pending: new Map<string, Pending>(),
    buffer: "",
    ready: null as Promise<void> | null,
    readyResolve: null as (() => void) | null,
    readyReject: null as ((e: Error) => void) | null,
    closed: false,
    fail: (_error: Error) => {},
  };
  embeddingWorker = state;
  state.ready = new Promise<void>((resolve, reject) => {
    state.readyResolve = resolve;
    state.readyReject = reject;
  });
  const fail = (e: Error) => {
    if (state.closed) return;
    state.closed = true;
    state.readyReject?.(e);
    for (const p of state.pending.values()) p.reject(e);
    state.pending.clear();
    if (embeddingWorker === state) embeddingWorker = undefined;
    stopProcess(child);
  };
  state.fail = fail;
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    state.buffer += chunk;
    if (Buffer.byteLength(state.buffer, "utf8") > 2 * 1024 * 1024) {
      fail(new Error("Embedding worker output exceeded the safety limit."));
      stopProcess(child);
      return;
    }
    let i;
    while ((i = state.buffer.indexOf("\n")) >= 0) {
      const line = state.buffer.slice(0, i);
      state.buffer = state.buffer.slice(i + 1);
      try {
        const r = JSON.parse(line);
        if (r.type === "ready") state.readyResolve?.();
        else if (r.id && state.pending.has(r.id)) {
          const p = state.pending.get(r.id)!;
          state.pending.delete(r.id);
          r.type === "result" && Array.isArray(r.vectors)
            ? p.resolve(r.vectors)
            : p.reject(new Error("Embedding worker request failed."));
        }
      } catch {
        fail(new Error("Embedding worker returned invalid output."));
      }
    }
  });
  child.stderr?.resume();
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    if (Buffer.byteLength(chunk, "utf8") > 64 * 1024)
      fail(
        new Error("Embedding worker diagnostics exceeded the safety limit."),
      );
  });
  child.stdin?.on("error", () =>
    fail(new Error("Embedding worker input closed.")),
  );
  child.once("error", () =>
    fail(new Error("Embedding worker could not start.")),
  );
  child.once("close", (code, signal) =>
    fail(new Error(`Embedding worker stopped (${code ?? "signal"}).`)),
  );
  const timer = setTimeout(() => {
    fail(new Error("Embedding worker startup timed out."));
  }, 60000);
  try {
    await state.ready;
  } finally {
    clearTimeout(timer);
  }
  return state;
}

let queue = Promise.resolve();
export async function embedLocal(
  texts: string[],
  kind: "query" | "passage" = "query",
  signal?: AbortSignal,
): Promise<EmbeddingResult> {
  if (!texts.length) return { vectors: [], model: LOCAL_EMBEDDING_MODEL };
  if (
    texts.length > 32 ||
    texts.some((text) => !text || text.length > 16000) ||
    texts.reduce((n, text) => n + text.length, 0) > 64000
  )
    throw new Error("Embedding request is too large.");
  const task = queue.then(async () => {
    signal?.throwIfAborted();
    if (idleTimer) clearTimeout(idleTimer);
    const abort = () => unloadLocalModel();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const state = await workerFor();
      signal?.throwIfAborted();
      const id = crypto.randomUUID();
      const vectors = await new Promise<number[][]>((resolve, reject) => {
        const timer = setTimeout(
          () => state.fail(new Error("Embedding request timed out.")),
          120000,
        );
        state.pending.set(id, {
          resolve: (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        try {
          state.child.stdin?.write(
            JSON.stringify({ id, op: "embed", kind, texts }) + "\n",
          );
        } catch {
          state.fail(new Error("Embedding worker input failed."));
        }
      });
      return { vectors, model: LOCAL_EMBEDDING_MODEL };
    } finally {
      signal?.removeEventListener("abort", abort);
      idleTimer = setTimeout(unloadLocalModel, 60000);
      idleTimer.unref();
    }
  });
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

/** Adapter used by the vault semantic index; all requests stay in the local worker. */
export function createLocalEmbeddingProvider(): VaultEmbeddingProvider {
  return {
    provider: "lmbook-local",
    model: LOCAL_EMBEDDING_MODEL,
    version: `${LOCAL_EMBEDDING_REVISION}:window-mean-utf8-v2`,
    kind: "local",
    async embed({ texts, signal, kind }) {
      if (signal?.aborted)
        throw new DOMException("Embedding cancelled", "AbortError");
      const result = await embedLocal(texts, kind || "passage", signal);
      if (signal?.aborted)
        throw new DOMException("Embedding cancelled", "AbortError");
      return result.vectors;
    },
  };
}

export function unloadLocalModel() {
  if (idleTimer) clearTimeout(idleTimer);
  if (embeddingWorker) {
    const state = embeddingWorker;
    embeddingWorker = undefined;
    state.fail(new Error("Local embedding worker unloaded."));
  }
}
