import { getDb } from "@/db";

export function getSetting(key: string) {
  return (getDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined)?.value;
}

export function setSetting(key: string, value: string) {
  getDb().prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(key, value, Date.now());
}

export function publicSettings() {
  const header = getDb().prepare("SELECT value, updated_at FROM app_settings WHERE key = ?").get("header_file") as { value: string; updated_at: number } | undefined;
  return {
    audiologistName: getSetting("audiologist_name") || "",
    headerUrl: header ? `/api/settings/header?v=${header.updated_at}` : "/header.png",
    onboardingComplete: getSetting("onboarding_complete") === "true",
  };
}
