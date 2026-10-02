export function sanitizeEnglishName(value: string) {
  return value.replace(/[^A-Za-z\s.'’-]/g, "");
}

export function sanitizePersianName(value: string) {
  return value.replace(/[^\p{Script=Arabic}\p{Mark}\s\u200c.'’-]/gu, "");
}
