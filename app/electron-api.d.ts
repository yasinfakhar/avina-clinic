export {};

declare global {
  interface Window {
    desktop?: {
      appVersion(): Promise<string>;
      licenseStatus(): Promise<{ active: boolean; licenseId?: string; deviceId?: string; fingerprint: string }>;
      checkForUpdates(): Promise<void>;
      installUpdate(): void;
      generateReport(recordId: string): Promise<{ url: string; fileName: string }>;
      importLegacyData(): Promise<{ imported: boolean; message?: string }>;
      onUpdateStatus(callback: (status: { state: string; message?: string; percent?: number }) => void): () => void;
    };
  }
}
