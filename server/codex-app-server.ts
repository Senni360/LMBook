import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { codexCommand, codexFailure } from "./codex-command.ts";
import { stopProcess } from "./process-lifecycle.ts";
import { baseInstructions } from "../shared/model.ts";
import packageInfo from "../package.json" with { type: "json" };

function providerError(value: unknown) {
  const message = String(value || "The provider did not return an explanation.")
    .replace(
      /Bearer\s+\S+|sk-[a-zA-Z0-9_-]+|eyJ[a-zA-Z0-9_.-]{30,}/g,
      "[redacted]",
    )
    .slice(0, 1200);
  return new Error(`Codex: ${message}`);
}

class CodexConnection {
  private pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  private nextId = 0;
  private diagnostic = "";
  private failure?: Error;
  readonly events = new Set<(event: any) => void>();
  readonly child;
  readonly closed: Promise<void>;
  constructor(cwd: string, signal: AbortSignal) {
    const command = codexCommand();
    if (!command)
      throw new Error(
        "Codex is not installed. Install the Codex CLI and sign in, then restart LMBook.",
      );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|CODEX_HOME|LANG|LC_ALL)$/i.test(
          key,
        ),
      ),
    );
    this.child = spawn(command.file, [...command.prefix, "app-server"], {
      cwd,
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...env,
        ...(command.prefix.length && process.env.SENNIBOOK_NODE_EXEC
          ? { ELECTRON_RUN_AS_NODE: "1" }
          : {}),
      },
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      if (line.length > 2000000) {
        this.fail(
          new Error("Codex returned too much output. Use a smaller chapter."),
        );
        return;
      }
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.method && event.id !== undefined) {
        // This adapter has no authority to grant tool execution or account changes.
        this.send({
          id: event.id,
          error: {
            code: -32601,
            message:
              "LMBook only supports source-grounded writing; this tool request is unavailable.",
          },
        });
      } else if (event.id !== undefined) {
        const waiting = this.pending.get(event.id);
        this.pending.delete(event.id);
        if (event.error) waiting?.reject(providerError(event.error.message));
        else waiting?.resolve(event.result);
      } else for (const listener of this.events) listener(event);
    });
    this.child.stderr.on("data", (data) => {
      this.diagnostic = (this.diagnostic + String(data)).slice(-16000);
    });
    this.child.stdin.on("error", () => {});
    this.child.on("error", () =>
      this.fail(
        new Error(
          "Codex could not start. Check its installation and restart LMBook.",
        ),
      ),
    );
    const abort = () =>
      this.fail(
        new Error(
          signal.reason?.name === "TimeoutError"
            ? "Codex timed out. Retry with a smaller chapter."
            : "Generation cancelled. Completed work is saved.",
        ),
      );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    this.closed = new Promise((resolve) =>
      this.child.once("close", (code) => {
        lines.close();
        signal.removeEventListener("abort", abort);
        this.fail(
          this.failure || new Error(codexFailure(this.diagnostic, code)),
          false,
        );
        resolve();
      }),
    );
  }
  private send(value: unknown) {
    if (!this.child.stdin.destroyed)
      this.child.stdin.write(JSON.stringify(value) + "\n");
  }
  private fail(error: Error, terminate = true) {
    if (!this.failure) {
      this.failure = error;
      for (const waiting of this.pending.values()) waiting.reject(error);
      this.pending.clear();
      for (const listener of this.events)
        listener({ method: "lmbook/error", error });
    }
    if (terminate) stopProcess(this.child);
  }
  request(method: string, params: unknown = {}): Promise<any> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.send({ id, method, params });
    });
  }
  async initialize() {
    await this.request("initialize", {
      clientInfo: {
        name: "lmbook",
        title: "LMBook",
        version: packageInfo.version,
      },
    });
    this.send({ method: "initialized", params: {} });
  }
  async close() {
    stopProcess(this.child);
    await this.closed;
  }
}

async function withConnection<T>(
  work: (connection: CodexConnection, cwd: string) => Promise<T>,
  signal?: AbortSignal,
  timeout = 600000,
) {
  signal?.throwIfAborted();
  const cwd = mkdtempSync(path.join(tmpdir(), "lmbook-codex-"));
  let connection: CodexConnection | undefined;
  try {
    const timeoutSignal = AbortSignal.timeout(timeout);
    connection = new CodexConnection(
      cwd,
      signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    );
    await connection.initialize();
    return await work(connection, cwd);
  } finally {
    await connection?.close();
    rmSync(cwd, { recursive: true, force: true });
  }
}

export async function checkCodexConnection() {
  try {
    return await withConnection(
      async (connection) => {
        const result = await connection.request("account/read", {
          refreshToken: false,
        });
        if (!result.account)
          return {
            ok: false,
            message:
              "Codex is installed but signed out. Run codex login, then check again.",
          };
        const auth =
          result.account.type === "chatgpt"
            ? "ChatGPT subscription"
            : result.account.type === "apiKey"
              ? "API key"
              : "configured account";
        return {
          ok: true,
          message: `Codex is connected using your ${auth}. No lesson was generated. Provider usage limits apply.`,
        };
      },
      undefined,
      20000,
    );
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Codex could not be checked.",
    };
  }
}

export async function generateWithCodex(
  prompt: string,
  model: string,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
  instructions = baseInstructions,
) {
  return withConnection(async (connection, cwd) => {
    onProgress?.("Checking Codex connection");
    const account = await connection.request("account/read", {
      refreshToken: false,
    });
    if (!account.account)
      throw new Error(
        "Codex is signed out. Run codex login and check the connection in Settings.",
      );
    // Disable configured integrations only for this thread; leave the user's settings and login intact.
    const effective = await connection.request("config/read", {
      includeLayers: false,
    });
    const config: Record<string, unknown> = {
      "features.shell_tool": false,
      "features.exec_tool": false,
      "features.apply_patch_freeform": false,
      "features.apps": false,
      "features.plugins": false,
      "features.multi_agent": false,
      web_search: "disabled",
      project_doc_max_bytes: 0,
    };
    for (const name of Object.keys(effective.config?.mcp_servers || {}))
      config[`mcp_servers.${name}.enabled`] = false;
    const started = await connection.request("thread/start", {
      cwd,
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: "read-only",
      baseInstructions: instructions,
      developerInstructions: instructions,
      config,
      ...(model ? { model } : {}),
    });
    const threadId = started.thread.id;
    onProgress?.(
      `Writing with Codex${started.model ? ` · ${started.model}` : ""}`,
    );
    const completed = new Promise<string>((resolve, reject) => {
      const messages = new Map<string, { text: string; phase?: string }>();
      let received = 0;
      const listener = (event: any) => {
        if (event.method === "lmbook/error") {
          connection.events.delete(listener);
          reject(event.error);
          return;
        }
        const params = event.params;
        if (!params || params.threadId !== threadId) return;
        if (
          event.method === "item/completed" &&
          params.item?.type === "agentMessage"
        ) {
          received += params.item.text.length;
          if (received > 1000000) {
            connection.events.delete(listener);
            reject(
              new Error("Codex returned too much text. Try a smaller chapter."),
            );
            return;
          }
          messages.set(params.item.id, {
            text: params.item.text,
            phase: params.item.phase,
          });
        }
        if (event.method === "turn/completed") {
          connection.events.delete(listener);
          if (params.turn.status !== "completed") {
            reject(
              providerError(
                params.turn.error?.message ||
                  `Generation ${params.turn.status}.`,
              ),
            );
            return;
          }
          const items = [...messages.values()];
          const answer =
            items
              .filter((item) => item.phase === "final_answer")
              .map((item) => item.text)
              .join("\n") || items.at(-1)?.text;
          answer?.trim()
            ? resolve(answer)
            : reject(
                new Error(
                  "Codex completed without a written answer. Retry the request.",
                ),
              );
        }
      };
      connection.events.add(listener);
    });
    // Attach the rejection handler before starting the turn, including early process failures.
    completed.catch(() => {});
    await connection.request("turn/start", {
      threadId,
      input: [{ type: "text", text: prompt }],
    });
    return completed;
  }, signal);
}
