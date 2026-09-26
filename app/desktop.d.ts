export {};
declare global {
  interface Window {
    audiologyDesktop?: {
      isDesktop: true;
      getInfo(): Promise<{ version: string; dataDirectory: string; platform: string; arch: string }>;
      licenseStatus(): Promise<{ activated: boolean; username?: string; offlineUntil?: string; protection?: string }>;
      login(username: string, password: string): Promise<{ username: string; offlineUntil: string; protection: string }>;
      deactivate(): Promise<void>;
      chooseDataDirectory(): Promise<string | null>;
      moveDataDirectory(destination: string): Promise<void>;
      openDataDirectory(): Promise<string>;
      createBackup(reason?: string): Promise<{ path: string }>;
      chooseHeader(): Promise<{ path: string } | null>;
      removeHeader(): Promise<boolean>;
      checkForUpdates(): Promise<unknown>;
      installUpdate(): Promise<void>;
      onUpdateStatus(listener: (status: Record<string, unknown>) => void): () => void;
    };
  }
}
