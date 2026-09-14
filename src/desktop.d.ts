export {};
declare global {
  interface Window {
    sennibookDesktop?: {
      getInfo(): Promise<{
        version: string;
        platform: string;
        dataPath: string;
        configPath: string;
      }>;
      openDataFolder(): Promise<string>;
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
}
