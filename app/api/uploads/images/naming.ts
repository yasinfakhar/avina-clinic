const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

export function safeNationalId(value: string) {
  return value
    .trim()
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

export function otoscopyImageName(
  nationalId: string,
  side: "left" | "right",
  variant: "current" | "original",
  extension: string,
  timestamp = Date.now(),
) {
  return `${safeNationalId(nationalId)}-${side}-${variant}-${timestamp}${extension}`;
}
