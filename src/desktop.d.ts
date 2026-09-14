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
    };
  }
}
