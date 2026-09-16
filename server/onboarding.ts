import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { CodexConnection, checkCodexConnection } from "./codex-app-server.ts";
import { codexCommand } from "./codex-command.ts";
import { dataDir } from "./store.ts";
import type {
  CodexOnboardingModel,
  CodexOnboardingState,
  CodexOnboardingStatus,
} from "../shared/onboarding.ts";

const completionFile = path.join(dataDir, "codex-onboarding.json");
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

type Completion = {
  completedAt: string;
  checkedAt: string;
  planType: string | null;
  models: CodexOnboardingModel[];
  lunaAvailable: boolean;
};

let session:
  | {
      connection: CodexConnection;
      cwd: string;
      loginId: string;
      generation: number;
      status: CodexOnboardingStatus;
      timeout: ReturnType<typeof setTimeout>;
      onEvent: (event: any) => void;
    }
  | undefined;
let terminalStatus: CodexOnboardingStatus | undefined;
let starting: Promise<CodexOnboardingStatus> | undefined;
let loginGeneration = 0;

function safeCompletion(): Completion | undefined {
  if (!existsSync(completionFile)) return undefined;
  try {
    const value = JSON.parse(
      readFileSync(completionFile, "utf8"),
    ) as Completion;
    if (
      typeof value.checkedAt !== "string" ||
      !Array.isArray(value.models) ||
      typeof value.completedAt !== "string" ||
      typeof value.lunaAvailable !== "boolean"
    )
      return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function persistCompletion(result: Completion) {
  const temporary = `${completionFile}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(result, null, 2), { mode: 0o600 });
  renameSync(temporary, completionFile);
}

function statusFromCompletion(): CodexOnboardingStatus {
  const completion = safeCompletion();
  if (!completion)
    return {
      state: codexCommand() ? "idle" : "missing-cli",
      ok: false,
      message: codexCommand()
        ? "Connect a ChatGPT subscription to use Codex in LMBook."
        : "Codex CLI is not installed. Install it, then return to LMBook and try again.",
    };
  return {
    state: "connected",
    ok: true,
    accountType: "chatgpt",
    planType: completion.planType,
    models: completion.models,
    lunaAvailable: completion.lunaAvailable,
    checkedAt: completion.checkedAt,
    message:
      "Codex was connected previously. Check the connection before using it.",
  };
}

function allowedAuthUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    if (
      url.hostname !== "chatgpt.com" &&
      !url.hostname.endsWith(".chatgpt.com") &&
      url.hostname !== "auth.openai.com" &&
      !url.hostname.endsWith(".auth.openai.com")
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function updateSession(next: Partial<CodexOnboardingStatus>) {
  if (session) session.status = { ...session.status, ...next };
}

async function closeSession(expected?: typeof session) {
  const current = session;
  if (!current) return;
  if (expected && current !== expected) return;
  session = undefined;
  clearTimeout(current.timeout);
  current.connection.events.delete(current.onEvent);
  await current.connection.close().catch(() => {});
  rmSync(current.cwd, { recursive: true, force: true });
}

export function getCodexOnboardingStatus(): CodexOnboardingStatus {
  return session?.status ?? terminalStatus ?? statusFromCompletion();
}

export async function startCodexLogin(): Promise<CodexOnboardingStatus> {
  if (starting) return starting;
  starting = startCodexLoginImpl();
  try {
    return await starting;
  } finally {
    starting = undefined;
  }
}

async function startCodexLoginImpl(): Promise<CodexOnboardingStatus> {
  if (session) return { ...session.status };
  terminalStatus = undefined;
  if (!codexCommand()) return statusFromCompletion();

  const cwd = mkdtempSync(path.join(tmpdir(), "lmbook-codex-login-"));
  let connection: CodexConnection | undefined;
  try {
    connection = new CodexConnection(
      cwd,
      AbortSignal.timeout(LOGIN_TIMEOUT_MS),
    );
    await connection.initialize();
  } catch (error) {
    await connection?.close().catch(() => {});
    rmSync(cwd, { recursive: true, force: true });
    return {
      state: "failed",
      ok: false,
      message:
        error instanceof Error ? error.message : "Codex could not start.",
    };
  }

  let loginId = "";
  const generation = ++loginGeneration;
  let earlyCompletion: any;
  let onLoginEvent: (event: any) => void;
  const isCurrent = () => session?.generation === generation;
  onLoginEvent = (event: any) => {
    if (event.method === "lmbook/error") {
      if (!isCurrent()) return;
      updateSession({
        state: "failed",
        message: event.error?.message || "Codex sign-in failed.",
        authUrl: undefined,
      });
      if (session?.generation === generation)
        terminalStatus = { ...session.status };
      void closeSession(session);
      return;
    }
    if (event.method !== "account/login/completed") return;
    if (!loginId) {
      earlyCompletion = event;
      return;
    }
    if (event.params?.loginId !== loginId) return;
    if (!event.params.success) {
      if (!isCurrent()) return;
      updateSession({
        state: "failed",
        message:
          "ChatGPT sign-in did not complete. Try again when you are ready.",
        authUrl: undefined,
      });
      if (session?.generation === generation)
        terminalStatus = { ...session.status };
      void closeSession(session);
      return;
    }
    if (isCurrent()) void finishLogin(connection!, generation);
  };
  connection.events.add(onLoginEvent);
  let loginResult: any;
  try {
    loginResult = await connection.request("account/login/start", {
      type: "chatgpt",
      useHostedLoginSuccessPage: true,
    });
  } catch (error) {
    await connection.close();
    rmSync(cwd, { recursive: true, force: true });
    return {
      state: "failed",
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Codex sign-in could not start.",
    };
  }
  loginId = typeof loginResult?.loginId === "string" ? loginResult.loginId : "";
  const authUrl = allowedAuthUrl(loginResult?.authUrl);
  if (!loginId || !authUrl) {
    await connection.close();
    rmSync(cwd, { recursive: true, force: true });
    return {
      state: "failed",
      ok: false,
      message:
        "Codex returned an invalid sign-in link. Update the Codex CLI and try again.",
    };
  }

  const initial: CodexOnboardingStatus = {
    state: "login-pending",
    ok: false,
    loginId,
    authUrl,
    message: "Sign in with ChatGPT in your browser, then return to LMBook.",
  };
  const loginSession = {
    connection,
    cwd,
    loginId,
    generation,
    status: initial,
    timeout: undefined as unknown as ReturnType<typeof setTimeout>,
    onEvent: onLoginEvent,
  };
  const timeout = setTimeout(() => {
    if (!isCurrent()) return;
    updateSession({
      state: "failed",
      message: "The sign-in session expired. Start sign-in again.",
      authUrl: undefined,
    });
    if (session?.generation === generation)
      terminalStatus = { ...session.status };
    void closeSession(loginSession);
  }, LOGIN_TIMEOUT_MS);
  loginSession.timeout = timeout;
  session = loginSession;
  if (earlyCompletion) onLoginEvent(earlyCompletion);
  return { ...initial };
}

async function finishLogin(connection: CodexConnection, generation: number) {
  const isCurrent = () =>
    session?.generation === generation && session.connection === connection;
  const expected = session;
  try {
    const result = await connection.request("account/read", {
      refreshToken: false,
    });
    if (!isCurrent()) return;
    if (result?.account?.type !== "chatgpt")
      throw new Error(
        "ChatGPT sign-in completed, but Codex did not report a ChatGPT account.",
      );
    const models = await connection.request("model/list", {
      limit: 100,
      includeHidden: false,
    });
    if (!isCurrent()) return;
    const listed = Array.isArray(models?.data)
      ? models.data
          .filter(
            (model: any) =>
              typeof model?.id === "string" || typeof model?.model === "string",
          )
          .map((model: any) => ({
            id: typeof model.id === "string" ? model.id : model.model,
            displayName:
              typeof model.displayName === "string" ? model.displayName : null,
          }))
      : [];
    const lunaAvailable = listed.some(
      (model: CodexOnboardingModel) =>
        model.id.toLowerCase() === "gpt-5.6-luna",
    );
    if (!lunaAvailable)
      throw new Error(
        "Your ChatGPT account is connected, but the Luna model is not available.",
      );
    const checkedAt = new Date().toISOString();
    updateSession({
      state: "connected",
      ok: true,
      accountType: "chatgpt",
      planType: result.account.planType ?? null,
      models: listed,
      lunaAvailable,
      checkedAt,
      authUrl: undefined,
      message: "Codex is connected with your ChatGPT subscription.",
    });
  } catch (error) {
    if (!isCurrent()) return;
    updateSession({
      state: "failed",
      message:
        error instanceof Error
          ? error.message
          : "Codex sign-in could not be verified.",
      authUrl: undefined,
    });
  } finally {
    if (isCurrent() && expected) terminalStatus = { ...expected.status };
    setTimeout(() => void closeSession(expected), 250);
  }
}

export async function cancelCodexLogin(): Promise<CodexOnboardingStatus> {
  const current = session;
  if (!current) return getCodexOnboardingStatus();
  await current.connection
    .request("account/login/cancel", { loginId: current.loginId })
    .catch(() => {});
  if (session !== current) return getCodexOnboardingStatus();
  updateSession({
    state: "cancelled",
    ok: false,
    authUrl: undefined,
    message: "Sign-in cancelled.",
  });
  terminalStatus = {
    state: "cancelled",
    ok: false,
    message: "Sign-in cancelled.",
  };
  await closeSession(current);
  return {
    state: "cancelled",
    ok: false,
    message: "Sign-in cancelled.",
  };
}

export async function checkCodexOnboarding(): Promise<CodexOnboardingStatus> {
  if (session) return getCodexOnboardingStatus();
  const result = await checkCodexConnection();
  if (!result.ok) {
    const failed: CodexOnboardingStatus = {
      state: codexCommand() ? "failed" : "missing-cli",
      ok: false,
      message: result.message,
    };
    terminalStatus = failed;
    return failed;
  }
  const checkedAt = new Date().toISOString();
  const models = result.models ?? [];
  const lunaAvailable = models.some(
    (model: CodexOnboardingModel) => model.id.toLowerCase() === "gpt-5.6-luna",
  );
  if (!lunaAvailable) {
    const failed: CodexOnboardingStatus = {
      state: "failed",
      ok: false,
      message:
        "Your ChatGPT account is connected, but the Luna model is not available.",
    };
    terminalStatus = failed;
    return failed;
  }
  const checked: CodexOnboardingStatus = {
    state: "connected",
    ok: true,
    accountType: "chatgpt",
    planType: result.planType ?? null,
    models,
    lunaAvailable,
    checkedAt,
    message: result.message,
  };
  terminalStatus = checked;
  return checked;
}

/** A completed empty-library gate is durable; connection checks remain repeatable. */
export function hasCompletedCodexOnboarding() {
  return !!safeCompletion();
}

/** Persist only a successful, recent ChatGPT + Luna availability check. */
export function completeCodexOnboarding(status: CodexOnboardingStatus) {
  if (!status.ok || status.accountType !== "chatgpt" || !status.lunaAvailable)
    throw new Error(
      "Codex onboarding cannot be completed until the ChatGPT subscription check succeeds.",
    );
  const checkedAt = status.checkedAt ?? new Date().toISOString();
  if (Date.now() - Date.parse(checkedAt) > 24 * 60 * 60 * 1000)
    throw new Error(
      "The Codex connection check is out of date. Check it again before continuing.",
    );
  const models = status.models ?? [];
  if (!models.some((model) => model.id.toLowerCase() === "gpt-5.6-luna"))
    throw new Error(
      "The Luna model is not available for this ChatGPT account.",
    );
  persistCompletion({
    completedAt: new Date().toISOString(),
    checkedAt,
    planType: status.planType ?? null,
    models,
    lunaAvailable: true,
  });
  return statusFromCompletion();
}

export const beginCodexOnboarding = startCodexLogin;
export const getCodexConnectionStatus = getCodexOnboardingStatus;
export const cancelCodexOnboarding = cancelCodexLogin;
