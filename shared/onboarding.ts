export type CodexOnboardingState =
  | "missing-cli"
  | "idle"
  | "login-pending"
  | "connected"
  | "failed"
  | "cancelled";

export type CodexOnboardingModel = {
  id: string;
  displayName: string | null;
};

export type CodexOnboardingStatus = {
  state: CodexOnboardingState;
  ok: boolean;
  message: string;
  authUrl?: string;
  loginId?: string;
  accountType?: "chatgpt";
  planType?: string | null;
  checkedAt?: string;
  models?: CodexOnboardingModel[];
  lunaAvailable?: boolean;
};
