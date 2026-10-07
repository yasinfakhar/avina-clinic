export {};

declare global {
  interface Window {
    desktop?: {
      listBackups(): Promise<Array<{ id: string; path: string; name: string; createdAt: string; size: number; kind: string; available: boolean }>>;
      createBackup(): Promise<{ canceled: boolean; backup?: { path: string } }>;
      restoreBackup(): Promise<{ canceled: boolean; restored?: boolean }>;
      appVersion(): Promise<string>;
      licenseStatus(): Promise<{ active: boolean; licenseId?: string; deviceId?: string; fingerprint: string }>;
      checkForUpdates(): Promise<void>;
      releaseNotes(): Promise<{ version: string; changelog: string; update_date: string; url: string } | null>;
      acknowledgeRelease(version: string): Promise<boolean>;
      installUpdate(): void;
      generateReport(recordId: string): Promise<{ url: string; fileName: string }>;
      generateAndOpenReport(recordId: string): Promise<{ url: string; fileName: string }>;
      saveInvoicePdf(recordId: string, invoice: { honorific: "سرکار خانم" | "جناب آقای"; patientName: string; date: string; items: Array<{ id: string; name: string; price: number | null }> }): Promise<{ fileName: string }>;
      saveInvoicePdfAs(recordId: string, invoice: { honorific: "سرکار خانم" | "جناب آقای"; patientName: string; date: string; items: Array<{ id: string; name: string; price: number | null }> }): Promise<{ fileName?: string; canceled: boolean }>;
      importLegacyData(): Promise<{ imported: boolean; message?: string }>;
      onUpdateStatus(callback: (status: { state: string; message?: string; percent?: number; currentVersion?: string; latest?: { version: string; changelog: string; update_date: string; url: string }; releases?: Array<{ version: string; changelog: string; update_date: string; url: string }> }) => void): () => void;
    };
  }
}
