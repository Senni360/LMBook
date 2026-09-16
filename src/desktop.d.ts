export {};
declare global {
  interface Window {
    sennibookDesktop?: {
      windowState(): Promise<DesktopWindowState>;
      windowAction(
        action:
          | "minimize"
          | "maximize"
          | "close"
          | "quit"
          | "fullscreen"
          | "zoom-in"
          | "zoom-out"
          | "zoom-reset"
          | "data-folder",
      ): Promise<void>;
      onWindowState(callback: (state: DesktopWindowState) => void): () => void;
      onQuitRequest(callback: (id: number) => void): () => void;
      quitResponse(
        id: number,
        choice: "stay" | "background" | "quit",
      ): Promise<void>;
      getInfo(): Promise<{
        version: string;
        platform: string;
        dataPath: string;
        configPath: string;
      }>;
      openDataFolder(): Promise<string>;
      chooseVault(): Promise<import("../shared/vault").Vault | null>;
      openVaultInObsidian(vaultId: string, notePath: string): Promise<void>;
      copyText(text: string): Promise<void>;
      download(
        id: string,
        path: string,
        suggestedName: string,
      ): Promise<{
        status: "completed" | "cancelled";
        filename?: string;
      }>;
      cancelDownload(id: string): Promise<void>;
      onDownloadProgress(
        callback: (info: {
          id: string;
          received: number;
          total?: number;
        }) => void,
      ): () => void;
    };
  }
  interface DesktopWindowState {
    maximized: boolean;
    fullscreen: boolean;
    focused: boolean;
    platform: string;
  }
}
