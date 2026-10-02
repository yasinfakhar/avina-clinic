import { getDb } from "@/db";
import { DEFAULT_PRINT_THEME_COLOR, normalizePrintThemeColor } from "@/app/theme-color";

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
    printThemeColor: normalizePrintThemeColor(getSetting("print_theme_color")) || DEFAULT_PRINT_THEME_COLOR,
    headerUrl: header ? `/api/settings/header?v=${header.updated_at}` : "/header.png",
    onboardingComplete: getSetting("onboarding_complete") === "true",
    testFees: parseTestFees(getSetting("test_fees")),
  };
}

export type TestFee = { id: string; name: string; price: number | null };

const defaultTestFees: TestFee[] = [
  { id: "tympanometry", name: "Tympanometry", price: null },
  { id: "audiometry", name: "Audiometry", price: null },
];

export function parseTestFees(value?: string): TestFee[] {
  if (!value) return defaultTestFees;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return defaultTestFees;
    const fees = parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as { id?: unknown; name?: unknown; price?: unknown };
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      const price = candidate.price === null || candidate.price === "" ? null : Number(candidate.price);
      if (!name || (price !== null && (!Number.isSafeInteger(price) || price < 0))) return [];
      return [{ id: typeof candidate.id === "string" && candidate.id ? candidate.id : crypto.randomUUID(), name, price }];
    });
    return fees.length ? fees : defaultTestFees;
  } catch {
    return defaultTestFees;
  }
}
