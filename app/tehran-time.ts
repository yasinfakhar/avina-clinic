const tehranDateTimeFormatter = new Intl.DateTimeFormat(
  "en-US-u-ca-persian",
  {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
);

const toPersianDigits = (value: string) =>
  value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);

export function currentTimestamp() {
  return new Date().toISOString();
}

export function tehranDateFilePart(value = currentTimestamp()) {
  const parts = Object.fromEntries(
    tehranDateTimeFormatter
      .formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatTehranDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";

  const parts = Object.fromEntries(
    tehranDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return toPersianDigits(
    `${parts.year}/${parts.month}/${parts.day}، ${parts.hour}:${parts.minute}`,
  );
}
