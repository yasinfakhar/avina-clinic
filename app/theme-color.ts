export const DEFAULT_PRINT_THEME_COLOR = "#5F7DC9";

export function normalizePrintThemeColor(value: unknown) {
  if (typeof value !== "string") return null;
  const color = value.trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) return null;
  return color.toUpperCase();
}
