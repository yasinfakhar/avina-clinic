export {};

declare global {
  interface Window {
    desktop?: {
      appVersion(): Promise<string>;
      licenseStatus(): Promise<{ active: boolean; licenseId?: string; deviceId?: string; fingerprint: string }>;
      checkForUpdates(): Promise<void>;
      releaseNotes(): Promise<{ version: string; changelog: string; update_date: string; url: string } | null>;
      acknowledgeRelease(version: string): Promise<boolean>;
      installUpdate(): void;
      generateReport(recordId: string): Promise<{ url: string; fileName: string }>;
      generateAndOpenReport(recordId: string): Promise<{ url: string; fileName: string }>;
      saveInvoicePdf(recordId: string): Promise<{ fileName: string }>;
      importLegacyData(): Promise<{ imported: boolean; message?: string }>;
      onUpdateStatus(callback: (status: { state: string; message?: string; percent?: number; currentVersion?: string; latest?: { version: string; changelog: string; update_date: string; url: string }; releases?: Array<{ version: string; changelog: string; update_date: string; url: string }> }) => void): () => void;
    };
  }
}
