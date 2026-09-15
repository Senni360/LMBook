import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./store.ts";
import { stopProcess as requestStopProcess } from "./process-lifecycle.ts";
import {
  transcriptSchema,
  type Transcript,
  type TranscriptionModel,
  type TranscriptionOptions,
  type TranscriptionStatus,
} from "../shared/transcription.ts";

type ModelConfig = {
  repoId: string;
  revision: string;
};

const modelConfigs: Record<TranscriptionModel, ModelConfig> = {
  "large-v3": {
    repoId: "Systran/faster-whisper-large-v3",
    revision: "53ecf83a5bedc5597eb8c8b34eac29e5345520ff",
  },
  "large-v3-turbo": {
    repoId: "dropbox-dash/faster-whisper-large-v3-turbo",
    revision: "0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf",
  },
};

const transcriptionRoot = path.join(dataDir, "local-transcription");
const runtimeRoot = path.join(transcriptionRoot, "runtime");
const modelsRoot = path.join(transcriptionRoot, "models");
const maxStdoutBytes = 32 * 1024 * 1024;
const maxStderrBytes = 256 * 1024;
// A complete multi-hour transcript can legitimately be larger than a couple
// of megabytes when word timestamps are included. Keep one record bounded by
// the same hard ceiling as the complete stdout stream.
const maxProtocolLineBytes = maxStdoutBytes;
const maxStatusMs = 8_000;
const maxStopMs = 6_000;

type ProtocolRecord = {
  type?: string;
  message?: string;
  transcript?: unknown;
  runtime?: boolean;
  cuda?: boolean;
  models?: Record<string, boolean>;
};

type ProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  records: ProtocolRecord[];
  stderr: string;
  stdout: string;
};

function modelNames(): Record<TranscriptionModel, boolean> {
  return { "large-v3": false, "large-v3-turbo": false };
}

function isSupportedModel(model: unknown): model is TranscriptionModel {
  return typeof model === "string" && Object.hasOwn(modelConfigs, model);
}

function systemPython() {
  return process.env.LMBOOK_PYTHON || process.env.SENNIBOOK_PYTHON || (process.platform === "win32" ? "python" : "python3");
}

function workerPath() {
  return path.resolve(process.env.SENNIBOOK_TRANSCRIBE_WORKER || "python/transcribe.py");
}

function requirementsPath() {
  return path.join(path.dirname(workerPath()), "requirements.txt");
}

function gpuRequirementsPath() {
  return path.join(path.dirname(workerPath()), "requirements-gpu.txt");
}

function runtimePython() {
  return process.platform === "win32"
    ? path.join(runtimeRoot, "Scripts", "python.exe")
    : path.join(runtimeRoot, "bin", "python");
}

function abortError() {
  const error = new Error("Transcription cancelled.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForClose(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null) return { code: child.exitCode, signal: child.signalCode };
  return await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ code: child.exitCode, signal: child.signalCode });
      }
    }, timeoutMs);
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

async function stopAndWait(child: ChildProcess) {
  requestStopProcess(child);
  const stopped = await waitForClose(child, maxStopMs);
  if (stopped.code === null && child.exitCode === null) {
    child.kill("SIGKILL");
    await waitForClose(child, 2_000);
  }
}

type RunOptions = {
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  protocol?: boolean;
  onRecord?: (record: ProtocolRecord) => void;
};

async function runProcess(command: string, args: string[], options: RunOptions = {}): Promise<ProcessResult> {
  throwIfAborted(options.signal);
  const child = spawn(command, args, {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      ...options.env,
    },
  });
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutBuffer = "";
  let plainStdout = "";
  let stderr = "";
  const records: ProtocolRecord[] = [];
  let protocolError: Error | undefined;
  let stopPromise: Promise<void> | undefined;
  let timedOut = false;
  let cancelled = false;
  const stop = () => {
    stopPromise ??= stopAndWait(child);
    return stopPromise;
  };
  const abortHandler = () => {
    cancelled = true;
    void stop();
  };
  options.signal?.addEventListener("abort", abortHandler, { once: true });
  if (options.signal?.aborted) abortHandler();

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");

  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    if (Buffer.byteLength(line, "utf8") > maxProtocolLineBytes) {
      protocolError ??= new Error("Transcription worker protocol line exceeded the safety limit.");
      void stop();
      return;
    }
    try {
      const record = JSON.parse(line) as ProtocolRecord;
      records.push(record);
      options.onRecord?.(record);
    } catch {
      protocolError ??= new Error("Transcription worker returned invalid JSON.");
      void stop();
    }
  };

  child.stdout?.on("data", (chunk: string) => {
    stdoutBytes += Buffer.byteLength(chunk, "utf8");
    if (stdoutBytes > maxStdoutBytes) {
      protocolError ??= new Error("Transcription worker output exceeded the safety limit.");
      void stop();
      return;
    }
    if (options.protocol === false) {
      plainStdout += chunk;
      return;
    }
    stdoutBuffer += chunk;
    let newline = stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      consumeLine(stdoutBuffer.slice(0, newline).replace(/\r$/, ""));
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      newline = stdoutBuffer.indexOf("\n");
    }
    if (Buffer.byteLength(stdoutBuffer, "utf8") > maxProtocolLineBytes) {
      protocolError ??= new Error("Transcription worker protocol line exceeded the safety limit.");
      void stop();
    }
  });
  child.stderr?.on("data", (chunk: string) => {
    if (stderrBytes >= maxStderrBytes) return;
    stderrBytes += Buffer.byteLength(chunk, "utf8");
    stderr += chunk.slice(0, maxStderrBytes - stderr.length);
  });

  const timeout = options.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        void stop();
      }, options.timeoutMs)
    : undefined;
  const close = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => {
    if (timeout) clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortHandler);
  });
  if (options.protocol !== false && stdoutBuffer.trim()) consumeLine(stdoutBuffer);
  if (stopPromise) await stopPromise;
  if (cancelled || options.signal?.aborted) throw abortError();
  if (timedOut) throw new Error("The transcription worker timed out.");
  if (protocolError) throw protocolError;
  return { ...close, records, stderr, stdout: plainStdout };
}

async function modelReady(model: TranscriptionModel, requireWorker = false) {
  const config = modelConfigs[model];
  const directory = path.join(modelsRoot, model);
  try {
    const marker = JSON.parse(await readFile(path.join(directory, ".download-complete"), "utf8")) as {
      complete?: boolean;
      repo_id?: string;
      revision?: string;
    };
    if (marker.complete !== true || marker.repo_id !== config.repoId || marker.revision !== config.revision) return false;
    const provenance = JSON.parse(await readFile(path.join(directory, "provenance.json"), "utf8")) as {
      model?: string;
      repo_id?: string;
      revision?: string;
      files?: Array<{ path?: string; bytes?: number }>;
    };
    if (provenance.model !== model || provenance.repo_id !== config.repoId || provenance.revision !== config.revision) return false;
    const required = ["config.json", "model.bin", "preprocessor_config.json", "tokenizer.json", "vocabulary.json"];
    const recorded = new Map((provenance.files || []).map((entry) => [entry.path, entry.bytes]));
    for (const name of required) {
      const filePath = path.join(directory, name);
      const fileStat = await stat(filePath);
      if (!fileStat.isFile() || recorded.get(name) !== fileStat.size) return false;
    }
    // The Python worker performs the expensive hash check immediately before
    // preparation/transcription. Status only checks recorded sizes so it
    // remains bounded and never reads model weights.
    if (requireWorker && !(await exists(workerPath()))) return false;
    return true;
  } catch {
    return false;
  }
}

async function systemPythonAvailable() {
  try {
    const result = await runProcess(systemPython(), ["-c", "import sys; print(sys.version_info[:2])"], {
      timeoutMs: 3_000,
      protocol: false,
    });
    return result.code === 0;
  } catch {
    return false;
  }
}

async function requireDirectories() {
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(modelsRoot, { recursive: true });
}

export async function getTranscriptionStatus(): Promise<TranscriptionStatus> {
  const models = modelNames();
  await requireDirectories();
  for (const model of Object.keys(models) as TranscriptionModel[]) models[model] = await modelReady(model);
  const python = await systemPythonAvailable();
  if (!python) {
    return {
      python: false,
      runtime: false,
      cuda: false,
      models,
      message: "Python was not found. Install Python 3.10–3.13 or set LMBOOK_PYTHON to its executable.",
    };
  }
  if (!(await exists(workerPath()))) {
    return { python, runtime: false, cuda: false, models, message: "The local transcription worker is unavailable." };
  }
  if (!(await exists(runtimePython()))) {
    return {
      python,
      runtime: false,
      cuda: false,
      models,
      message: "The local transcription runtime is not prepared. Open transcription setup to install it.",
    };
  }
  try {
    const result = await runProcess(runtimePython(), ["-u", workerPath(), "status", "--models-root", modelsRoot], {
      timeoutMs: maxStatusMs,
      env: { PYTHONNOUSERSITE: "1", PYTHONUNBUFFERED: "1" },
    });
    const record = [...result.records].reverse().find((entry) => entry.type === "status");
    const runtime = result.code === 0 && record?.runtime === true;
    const cuda = runtime && record?.cuda === true;
    const workerModels = record?.models;
    if (workerModels) {
      for (const model of Object.keys(models) as TranscriptionModel[]) models[model] = models[model] && workerModels[model] === true;
    }
    const message = typeof record?.message === "string"
      ? record.message
      : result.stderr.trim() || "The local transcription runtime could not be checked.";
    return { python, runtime, cuda, models, message };
  } catch (error) {
    return {
      python,
      runtime: false,
      cuda: false,
      models,
      message: error instanceof Error ? error.message : "The local transcription runtime could not be checked.",
    };
  }
}

async function ensureRuntime(signal: AbortSignal, onProgress: (message: string) => void) {
  await requireDirectories();
  throwIfAborted(signal);
  if (!(await exists(runtimePython()))) {
    onProgress("Creating the isolated transcription runtime…");
    const venvResult = await runProcess(systemPython(), ["-m", "venv", runtimeRoot], {
      signal,
      timeoutMs: 120_000,
      protocol: false,
      env: { PYTHONUNBUFFERED: "1" },
    });
    if (venvResult.code !== 0 || !(await exists(runtimePython()))) {
      throw new Error(venvResult.stderr.trim() || "The isolated Python runtime could not be created.");
    }
  }
  if (!(await exists(requirementsPath()))) throw new Error("The local transcription requirements file is unavailable.");
  onProgress("Installing the pinned transcription runtime (this may take a few minutes)…");
  const result = await runProcess(runtimePython(), [
    "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "-r", requirementsPath(),
  ], {
    signal,
    timeoutMs: 20 * 60_000,
    protocol: false,
    env: { PYTHONNOUSERSITE: "1", PYTHONUNBUFFERED: "1" },
  });
  if (result.code !== 0) throw new Error(result.stderr.trim() || "The pinned transcription runtime could not be installed.");
}

export async function prepareTranscription(
  model: TranscriptionModel,
  signal: AbortSignal,
  onProgress: (message: string) => void,
  includeGpu = false,
): Promise<void> {
  if (!isSupportedModel(model)) throw new Error("Unsupported transcription model.");
  if (includeGpu && process.platform !== "win32") {
    throw new Error("The optional NVIDIA GPU runtime is currently supported only on Windows.");
  }
  throwIfAborted(signal);
  await ensureRuntime(signal, onProgress);
  if (includeGpu) {
    if (!(await exists(gpuRequirementsPath()))) throw new Error("The optional Windows GPU requirements file is unavailable.");
    throwIfAborted(signal);
    onProgress("Installing the optional Windows CUDA/cuBLAS/cuDNN runtime in the isolated venv (about 1.5 GB)…");
    const gpuResult = await runProcess(runtimePython(), [
      "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "-r", gpuRequirementsPath(),
    ], {
      signal,
      timeoutMs: 30 * 60_000,
      protocol: false,
      env: { PYTHONNOUSERSITE: "1", PYTHONUNBUFFERED: "1" },
    });
    if (gpuResult.code !== 0) {
      throw new Error(gpuResult.stderr.trim() || gpuResult.stdout.trim() || "The optional Windows GPU runtime could not be installed.");
    }
  }
  throwIfAborted(signal);
  onProgress(`Preparing the pinned ${model} model for offline use…`);
  const result = await runProcess(runtimePython(), [
    "-u", workerPath(), "prepare", "--model", model, "--models-root", modelsRoot,
  ], {
    signal,
    timeoutMs: 45 * 60_000,
    env: {
      PYTHONNOUSERSITE: "1",
      PYTHONUNBUFFERED: "1",
      HF_HOME: path.join(modelsRoot, ".hf-cache"),
      HF_HUB_DISABLE_TELEMETRY: "1",
    },
    onRecord: (record) => {
      if (record.type === "progress" && typeof record.message === "string") onProgress(record.message);
    },
  });
  if (result.code !== 0) {
    const workerError = [...result.records].reverse().find((record) => record.type === "error");
    throw new Error(workerError?.message || result.stderr.trim() || "The transcription model could not be prepared.");
  }
  if (!(await modelReady(model, true))) throw new Error("The model preparation finished without a complete model marker.");
}

export async function transcribeAudio(
  audioPath: string,
  options: TranscriptionOptions,
  signal: AbortSignal,
  onProgress: (message: string) => void,
): Promise<Transcript> {
  if (!isSupportedModel(options.model)) throw new Error("Unsupported transcription model.");
  throwIfAborted(signal);
  if (!(await exists(runtimePython()))) throw new Error("The local transcription runtime is not prepared.");
  if (!(await exists(workerPath()))) throw new Error("The local transcription worker is unavailable.");
  if (!(await modelReady(options.model, true))) throw new Error(`The ${options.model} model is not prepared for offline use.`);
  const source = path.resolve(audioPath);
  try {
    const audioStat = await stat(source);
    if (!audioStat.isFile()) throw new Error("The source audio path is not a file.");
  } catch (error) {
    if (error instanceof Error && error.message === "The source audio path is not a file.") throw error;
    throw new Error("The source audio file does not exist.");
  }
  onProgress("Starting local transcription…");
  let transcript: unknown;
  const result = await runProcess(runtimePython(), [
    "-u", workerPath(), "transcribe",
    "--model", options.model,
    "--models-root", modelsRoot,
    "--audio-path", source,
    "--language", options.language,
    "--device", options.device,
  ], {
    signal,
    timeoutMs: 24 * 60 * 60_000,
    env: {
      PYTHONNOUSERSITE: "1",
      PYTHONUNBUFFERED: "1",
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      HF_DATASETS_OFFLINE: "1",
      SENNIBOOK_TRANSCRIBE_OFFLINE: "1",
      HF_HOME: path.join(modelsRoot, ".hf-cache"),
    },
    onRecord: (record) => {
      if (record.type === "progress" && typeof record.message === "string") onProgress(record.message);
      if (record.type === "result") transcript = record.transcript;
    },
  });
  if (result.code !== 0) {
    const workerError = [...result.records].reverse().find((record) => record.type === "error");
    throw new Error(workerError?.message || result.stderr.trim() || "The local transcription failed.");
  }
  if (transcript === undefined) throw new Error("The transcription worker returned no transcript.");
  return transcriptSchema.parse(transcript);
}
