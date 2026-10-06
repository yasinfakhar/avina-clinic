"use client";

import React, {
  startTransition,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AudiometrySuggestion } from "./components/AudiometrySuggestion";
import { BirthDatePicker } from "./components/BirthDatePicker";
import { jalaliDateTimeToIso } from "./jalali-date";
import { AutocompleteInput } from "./components/AutocompleteInput";
import { ImageAnnotator } from "./components/ImageAnnotator";
import { dataUrlToBlob } from "./image-data";
import { toEnglishDigits } from "./digits";
import { sanitizeEnglishName, sanitizePersianName } from "./name-input";
import {
  currentTimestamp,
  formatTehranDate,
  formatTehranDateTime,
  formatTehranLiveDateTime,
} from "./tehran-time";

type Arrow = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  normalized?: boolean;
};

function HeaderClock() {
  const [timestamp, setTimestamp] = useState("");

  useEffect(() => {
    const update = () => setTimestamp(currentTimestamp());
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <time
      className="header-clock"
      dateTime={timestamp || undefined}
      aria-label="تاریخ و ساعت فعلی"
      suppressHydrationWarning
    >
      {timestamp ? formatTehranLiveDateTime(timestamp) : "در حال دریافت زمان…"}
    </time>
  );
}
type TympanometryPoint = { pressure: number; compliance: number };
type ReflexValues = { hz500: string; hz1k: string; hz2k: string; hz4k: string };
type Tympanometry = {
  canalVolume: string;
  staticCompliance: string;
  middleEarPressure: string;
  gradient: string;
  type: string;
  points: TympanometryPoint[];
  ipsi: ReflexValues;
  contra: ReflexValues;
  dearDoctor: string;
  comment: string;
};
type AudiometryModifier = "" | "M" | "NR" | "MD";
type AudiometryCell = { value: string; modifier: AudiometryModifier };
type AudiometryRow = Record<string, AudiometryCell>;
type Audiometry = { ac: AudiometryRow; bc: AudiometryRow };
type SpeechAudiometry = {
  srt: string;
  mcl: string;
  ucl: string;
  srtNoise: string;
  mclNoise: string;
  uclNoise: string;
};
type SpeechAudiometryField = keyof SpeechAudiometry;
type RinneResult = "" | "positive" | "negative";
type WeberResult = "" | "left" | "right" | "both";
type AudiometricTests = {
  rinne: Record<"right" | "left", RinneResult>;
  weber: Record<string, WeberResult>;
  dearDoctor: string;
  comments: Record<"right" | "left", string>;
};
type Gender = "" | "male" | "female";
type Ear = {
  result: string;
  imageName: string;
  imageDataUrl?: string;
  originalImageDataUrl?: string;
  arrows?: Arrow[];
  tympanometry?: Tympanometry;
  audiometry?: Audiometry;
  speechAudiometry?: SpeechAudiometry;
};
type RecordItem = {
  id: string;
  doctorName: string;
  fullName: string;
  persianFullName: string;
  nationalId: string;
  phoneNumber: string;
  gender: Gender;
  birthDate: string;
  visitDate: string;
  right: Ear;
  left: Ear;
  audiometricTests?: AudiometricTests;
  status: "draft" | "completed";
  updatedAt: string;
};

type TestFee = { id: string; name: string; price: number | null };
type AppSettings = { audiologistName: string; printThemeColor: string; headerUrl: string; onboardingComplete: boolean; testFees: TestFee[] };
type InvoiceDraft = { honorific: "سرکار خانم" | "جناب آقای"; patientName: string; date: string; items: TestFee[] };
type PatientReminder = { id: string; text: string; remindAt: string; read: boolean };
type PatientNote = { recordId: string; note: string; reminders: PatientReminder[]; updatedAt: string };
type ReminderDraft = { id: string; text: string; date: string; time: string };
type NoteDraft = { note: string; reminders: ReminderDraft[] };
type ReleaseNotes = { version: string; changelog: string; update_date: string; url: string };

const PATIENTS_PER_PAGE = 5;

function MarkdownChangelog({ value }: { value: string }) {
  return <div className="release-changelog">{value.split(/\r?\n/).map((line, index) => {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) return <h3 key={index}>{heading[2]}</h3>;
    const listItem = line.match(/^[-*]\s+(.+)$/);
    if (listItem) return <div className="release-list-item" key={index}><span>•</span><p>{listItem[1]}</p></div>;
    return line.trim() ? <p key={index}>{line}</p> : <br key={index} />;
  })}</div>;
}

const emptyRecord = (): RecordItem => ({
  id: `A-${Date.now().toString().slice(-6)}`,
  doctorName: "",
  fullName: "",
  persianFullName: "",
  nationalId: "",
  phoneNumber: "",
  gender: "",
  birthDate: "",
  visitDate: formatTehranDate(),
  right: {
    result: "",
    imageName: "",
    imageDataUrl: "",
    originalImageDataUrl: "",
    arrows: [],
  },
  left: {
    result: "",
    imageName: "",
    imageDataUrl: "",
    originalImageDataUrl: "",
    arrows: [],
  },
  audiometricTests: emptyAudiometricTests(),
  status: "draft",
  updatedAt: currentTimestamp(),
});
const normalizeRecord = (record: RecordItem): RecordItem => ({
  ...record,
  persianFullName: record.persianFullName || "",
  phoneNumber: record.phoneNumber || "",
  visitDate: record.visitDate || formatTehranDate(record.updatedAt),
});
const emptyReflex = (): ReflexValues => ({
  hz500: "",
  hz1k: "",
  hz2k: "",
  hz4k: "",
});
const emptyTympanometry = (): Tympanometry => ({
  canalVolume: "",
  staticCompliance: "",
  middleEarPressure: "",
  gradient: "",
  type: "",
  points: [],
  ipsi: emptyReflex(),
  contra: emptyReflex(),
  dearDoctor: "",
  comment: "",
});
const audiometryFrequencies = [
  125, 250, 500, 1000, 2000, 3000, 4000, 6000, 8000,
] as const;
const weberFrequencies = [250, 500, 1000, 2000, 4000] as const;
const emptyAudiometryRow = (): AudiometryRow =>
  Object.fromEntries(
    audiometryFrequencies.map((frequency) => [
      frequency,
      { value: "", modifier: "" },
    ]),
  );
const emptySpeechAudiometry = (): SpeechAudiometry => ({
  srt: "",
  mcl: "",
  ucl: "",
  srtNoise: "",
  mclNoise: "",
  uclNoise: "",
});
const normalizeSpeechAudiometry = (
  value?: SpeechAudiometry,
): SpeechAudiometry => {
  const normalized = { ...emptySpeechAudiometry(), ...value };
  const srt = normalized.srt;
  const threshold = Number(srt);
  const automaticMcl =
    srt.trim() && Number.isFinite(threshold) ? String(threshold + 30) : "";
  const noiseThreshold = Number(normalized.srtNoise);
  const automaticNoiseMcl =
    normalized.srtNoise.trim() && Number.isFinite(noiseThreshold)
      ? String(noiseThreshold + 30)
      : "";
  return {
    ...normalized,
    mcl: normalized.mcl.trim() ? normalized.mcl : automaticMcl,
    mclNoise: normalized.mclNoise.trim()
      ? normalized.mclNoise
      : automaticNoiseMcl,
  };
};
const emptyAudiometricTests = (): AudiometricTests => ({
  rinne: { right: "", left: "" },
  weber: Object.fromEntries(
    weberFrequencies.map((frequency) => [frequency, ""]),
  ),
  dearDoctor: "",
  comments: { right: "", left: "" },
});
function mergeDoctorComments(right?: string, left?: string) {
  if (!hasText(right)) return left || "";
  if (!hasText(left) || right === left) return right || "";
  return `${right}<br>${left}`;
}
const normalizeAudiometricTests = (
  value?: AudiometricTests,
): AudiometricTests => {
  const comment = mergeDoctorComments(
    value?.comments?.right,
    value?.comments?.left,
  );
  return {
    rinne: { ...emptyAudiometricTests().rinne, ...value?.rinne },
    weber: { ...emptyAudiometricTests().weber, ...value?.weber },
    dearDoctor: value?.dearDoctor || "",
    comments: { right: comment, left: comment },
  };
};
const AUDIOMETRY_MIN = -10;
const AUDIOMETRY_MAX = 120;
const AUDIOMETRY_STEP = 5;

async function persistRecord(record: RecordItem) {
  const response = await fetch("/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  if (!response.ok) throw new Error("ذخیره پرونده ناموفق بود");
}

async function generateAndOpenPdf(recordId: string) {
  if (window.desktop) {
    return window.desktop.generateAndOpenReport(recordId);
  }
  const response = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recordId }),
  });
  const report = (await response.json()) as { url?: string; fileName?: string };
  if (!response.ok || !report.url) throw new Error("PDF generation failed");
  const link = document.createElement("a");
  link.href = report.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.click();
  return { url: report.url, fileName: report.fileName || "report.pdf" };
}

async function uploadPatientImage(
  recordId: string,
  side: "right" | "left",
  variant: "current" | "original",
  file: Blob,
  name: string,
) {
  const form = new FormData();
  form.set("recordId", recordId);
  form.set("side", side);
  form.set("variant", variant);
  form.set("file", file, name);
  const response = await fetch("/api/uploads/images", {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error("ذخیره تصویر ناموفق بود");
  return (await response.json()) as { url: string };
}

async function migrateBrowserRecord(record: RecordItem) {
  const migrated: RecordItem = normalizeRecord(JSON.parse(JSON.stringify(record)));
  const sources = {
    right: {
      original: migrated.right.originalImageDataUrl,
      current: migrated.right.imageDataUrl,
    },
    left: {
      original: migrated.left.originalImageDataUrl,
      current: migrated.left.imageDataUrl,
    },
  };
  migrated.right.originalImageDataUrl = "";
  migrated.right.imageDataUrl = "";
  migrated.left.originalImageDataUrl = "";
  migrated.left.imageDataUrl = "";
  await persistRecord(migrated);
  for (const side of ["right", "left"] as const) {
    const originalData = sources[side].original;
    const currentData = sources[side].current;
    if (originalData?.startsWith("data:image/")) {
      const blob = await (await fetch(originalData)).blob();
      migrated[side].originalImageDataUrl = (
        await uploadPatientImage(
          migrated.id,
          side,
          "original",
          blob,
          migrated[side].imageName || `${side}.jpg`,
        )
      ).url;
    }
    if (currentData?.startsWith("data:image/")) {
      const blob = await (await fetch(currentData)).blob();
      migrated[side].imageDataUrl = (
        await uploadPatientImage(
          migrated.id,
          side,
          "current",
          blob,
          migrated[side].imageName || `${side}.jpg`,
        )
      ).url;
    }
  }
  await persistRecord(migrated);
  return migrated;
}

function tehranTodayJalali() {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { jy: get("year"), jm: get("month"), jd: get("day") };
}

function calculateAge(birthDate: string) {
  const toEnglishDigits = (value: string) =>
    value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  const parts = toEnglishDigits(birthDate.trim()).split("/");
  if (parts.length !== 3 || parts.some((part) => !part)) return "";
  const [jy, jm, jd] = parts.map(Number);
  if (![jy, jm, jd].every(Number.isFinite)) return "";
  const today = tehranTodayJalali();
  const age =
    today.jy -
    jy -
    (today.jm < jm || (today.jm === jm && today.jd < jd) ? 1 : 0);
  return age >= 0 ? String(age) : "";
}

function genderLabel(gender: Gender) {
  return gender === "male" ? "Male" : gender === "female" ? "Female" : "";
}

function localTimeInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: "hour" | "minute") => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

const persianClockPart = (value: number) =>
  String(value).padStart(2, "0").replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);

function ReminderTimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [hour = "09", minute = "00"] = value.split(":");
  return <div className="reminder-time-picker" role="group" aria-label="انتخاب ساعت یادآوری">
    <Icon name="clock" />
    <select aria-label="دقیقه" value={minute} onChange={(event) => onChange(`${hour}:${event.target.value}`)}>
      {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((item) => <option key={item} value={item}>{persianClockPart(Number(item))}</option>)}
    </select>
    <span aria-hidden="true">:</span>
    <select aria-label="ساعت" value={hour} onChange={(event) => onChange(`${event.target.value}:${minute}`)}>
      {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map((item) => <option key={item} value={item}>{persianClockPart(Number(item))}</option>)}
    </select>
  </div>;
}

function isValidAudiometryThreshold(value: string) {
  if (value.trim() === "") return true;
  const threshold = Number(value);
  return (
    Number.isFinite(threshold) &&
    threshold >= AUDIOMETRY_MIN &&
    threshold <= AUDIOMETRY_MAX &&
    threshold % AUDIOMETRY_STEP === 0
  );
}

function isInvalidBoneConductionGap(value: Audiometry, frequency: number) {
  const acValue = value.ac[frequency]?.value.trim() || "";
  const bcValue = value.bc[frequency]?.value.trim() || "";
  return acValue !== "" && bcValue !== "" && Number(bcValue) > Number(acValue);
}

function copyAudiometry(value?: Audiometry): Audiometry {
  const copied: Audiometry = {
    ac: Object.fromEntries(
      audiometryFrequencies.map((frequency) => [
        frequency,
        { ...(value?.ac[frequency] || { value: "", modifier: "" }) },
      ]),
    ),
    bc: Object.fromEntries(
      audiometryFrequencies.map((frequency) => [
        frequency,
        { ...(value?.bc[frequency] || { value: "", modifier: "" }) },
      ]),
    ),
  };
  for (const frequency of audiometryFrequencies) {
    const acValue = copied.ac[frequency].value;
    const bcValue = copied.bc[frequency].value;
    if (!isValidAudiometryThreshold(acValue)) copied.ac[frequency].value = "";
    if (
      !isValidAudiometryThreshold(bcValue) ||
      (acValue.trim() && Number(bcValue) > Number(acValue))
    )
      copied.bc[frequency].value = "";
  }
  return copied;
}

function audiometryMarkerAsset(
  side: "right" | "left",
  row: "ac" | "bc",
  modifier: AudiometryModifier = "",
) {
  if (row === "ac") {
    if (modifier === "NR")
      return side === "right"
        ? "/audiometry/05_RE_AC_triangle_no_response.svg"
        : "/audiometry/07_LE_AC_square_no_response.svg";
    if (modifier === "")
      return side === "right"
        ? "/audiometry/01_RE_AC_circle.svg"
        : "/audiometry/03_LE_AC_multiply.svg";
    return side === "right"
      ? "/audiometry/01_RE_AC_triangle.svg"
      : "/audiometry/03_LE_AC_square.svg";
  }
  if (modifier === "NR")
    return side === "right"
      ? "/audiometry/06_RE_BC_left_bracket_no_response.svg"
      : "/audiometry/08_LE_BC_right_bracket_no_response.svg";
  if (modifier === "")
    return side === "right"
      ? "/audiometry/09_RE_BC_unmasked_less_than.svg"
      : "/audiometry/10_LE_BC_unmasked_greater_than.svg";
  if (modifier === "MD")
    return side === "right"
      ? "/audiometry/less_than_MD.svg"
      : "/audiometry/greater_than_MD.svg";
  return side === "right"
    ? "/audiometry/02_RE_BC_left_bracket.svg"
    : "/audiometry/04_LE_BC_right_bracket.svg";
}

function AudiometryMarker({
  side,
  row,
  modifier,
  x,
  y,
  verticalScale = 1,
}: {
  side: "right" | "left";
  row: "ac" | "bc";
  modifier: AudiometryModifier;
  x: number;
  y: number;
  verticalScale?: number;
}) {
  const size = modifier === "MD" ? 58 : 48;
  const frequencyIndex = Math.round(
    ((x - 85) / (790 - 85)) * (audiometryFrequencies.length - 1),
  );
  const frequency = audiometryFrequencies[frequencyIndex];
  const threshold = Math.round(
    ((y / verticalScale - 34) / (424 - 34)) * 130 - 10,
  );
  const label = `${row.toUpperCase()}، ${frequency} هرتز، ${threshold} دسی‌بل`;
  return (
    <g className="audiometry-marker" role="img" aria-label={label} tabIndex={0}>
      <title>{label}</title>
      <circle
        cx={x}
        cy={y}
        r="11"
        style={{ fill: "transparent", stroke: "none" }}
      />
      <image
        href={audiometryMarkerAsset(side, row, modifier)}
        x={x - size / 2}
        y={y - size / 2}
        width={size}
        height={size}
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  );
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    ear: (
      <>
        <path d="M6 10a6 6 0 1 1 12 0c0 5-4 4-4 8a3 3 0 0 1-6 0" />
        <path d="M9.5 10a2.5 2.5 0 1 1 4.5 1.5c-1 1.5-2.5 1.5-2.5 3.5" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    person: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </>
    ),
    print: (
      <>
        <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v8H6z" />
      </>
    ),
    dollar: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M16 8.5c-.8-.9-2-1.5-3.5-1.5-2 0-3.5 1.1-3.5 2.6 0 1.7 1.6 2.3 3.5 2.7 1.9.4 3.5 1 3.5 2.7 0 1.6-1.6 2.8-3.7 2.8-1.7 0-3.2-.7-4.3-1.9M12 5v14" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 16H6L5 6M10 11v6M14 11v6" />
      </>
    ),
    upload: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 19 19 5" />
        <path d="M10 5h9v9" />
      </>
    ),
    sms: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3v-15a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </>
    ),
    tympanometry: (
      <>
        <path d="M3 12h3l2-7 4 14 3-10 2 3h4" />
        <path d="M4 21h16" />
      </>
    ),
    audiometry: (
      <>
        <path d="M4 14v-4M8 17V7M12 20V4M16 17V7M20 14v-4" />
      </>
    ),
    arrowLeft: (
      <>
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </>
    ),
    arrowRight: (
      <>
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </>
    ),
    back: <path d="m9 18 6-6-6-6" />,
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.36.7.64.96.3.27.68.42 1.08.44H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    close: <path d="m7 7 10 10M17 7 7 17" />,
    note: (
      <>
        <path d="M4 4h16v16H4z" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className="icon-btn"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState<"loading" | "login" | "onboarding" | "app">("loading");
  const [settings, setSettings] = useState<AppSettings>({ audiologistName: "", printThemeColor: "#5F7DC9", headerUrl: "/header.png", onboardingComplete: false, testFees: [] });
  const [view, setView] = useState<"dashboard" | "wizard" | "settings">("dashboard");
  const [step, setStep] = useState(1);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [current, setCurrent] = useState<RecordItem>(emptyRecord);
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [patientPage, setPatientPage] = useState(1);
  const [toast, setToast] = useState("");
  const [printRecord, setPrintRecord] = useState<RecordItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [otoscopyResults, setOtoscopyResults] = useState<string[]>([]);
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNotes | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecordItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [invoiceRecord, setInvoiceRecord] = useState<RecordItem | null>(null);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft | null>(null);
  const [invoiceToPrint, setInvoiceToPrint] = useState<InvoiceDraft | null>(null);
  const [patientNotes, setPatientNotes] = useState<PatientNote[]>([]);
  const [noteTarget, setNoteTarget] = useState<RecordItem | null>(null);
  const [noteDraft, setNoteDraft] = useState<NoteDraft>({ note: "", reminders: [] });
  const [savingNote, setSavingNote] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("printInvoice")) return;
    const clearPrintedInvoice = () => setInvoiceToPrint(null);
    window.addEventListener("afterprint", clearPrintedInvoice);
    return () => window.removeEventListener("afterprint", clearPrintedInvoice);
  }, []);

  useLayoutEffect(() => {
    if (!invoiceToPrint) return;
    const printPageStyle = document.createElement("style");
    printPageStyle.id = "invoice-a5-page-size";
    printPageStyle.textContent = "@page { size: 148mm 210mm; margin: 0; }";
    document.head.appendChild(printPageStyle);
    document.documentElement.classList.add("invoice-page-size");
    document.body.classList.add("invoice-page-size");
    return () => {
      printPageStyle.remove();
      document.documentElement.classList.remove("invoice-page-size");
      document.body.classList.remove("invoice-page-size");
    };
  }, [invoiceToPrint]);

  const openInvoice = (record: RecordItem) => {
    const hasTympanometry = Boolean(record.right.tympanometry || record.left.tympanometry);
    const hasAudiometry = Boolean(record.right.audiometry || record.left.audiometry);
    const selected = settings.testFees.filter((test) =>
      (test.name.toLowerCase().includes("tymp") && hasTympanometry) ||
      (test.name.toLowerCase().includes("audio") && hasAudiometry),
    );
    setInvoiceRecord(record);
    setInvoiceDraft({
      honorific: record.gender === "female" ? "سرکار خانم" : "جناب آقای",
      patientName: record.persianFullName.trim() || record.fullName,
      date: new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran" }).format(new Date()),
      items: selected,
    });
  };

  useEffect(() => {
    if (!window.desktop || new URLSearchParams(window.location.search).has("printRecord")) return;
    void window.desktop.releaseNotes().then(setReleaseNotes).catch(() => {});
  }, []);

  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((state: { authenticated: boolean; onboardingRequired?: boolean; settings?: AppSettings }) => {
        setLoggedIn(state.authenticated);
        if (state.settings) setSettings(state.settings);
        setAuthMode(!state.authenticated ? "login" : state.onboardingRequired ? "onboarding" : "app");
      })
      .catch(() => setAuthMode("login"));
  }, []);

  useEffect(() => {
    if (!loggedIn || authMode !== "app") return;
    void fetch("/api/settings", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<AppSettings>;
      })
      .then(setSettings)
      .catch(() => setToast("خواندن تنظیمات کاربر ناموفق بود"));
  }, [loggedIn, authMode]);

  useEffect(() => {
    if (!loggedIn || authMode !== "app") return;
    void fetch("/api/patient-notes", { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ notes: PatientNote[] }>; })
      .then(({ notes }) => setPatientNotes(notes))
      .catch(() => setToast("خواندن یادداشت‌ها و یادآوری‌ها ناموفق بود"));
    const initialTick = window.setTimeout(() => setClock(Date.now()), 0);
    const interval = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => { window.clearTimeout(initialTick); window.clearInterval(interval); };
  }, [loggedIn, authMode]);

  useEffect(() => {
    if (!loggedIn || authMode !== "app") return;
    const now = Date.now();
    const nextReminder = patientNotes
      .flatMap((item) => item.reminders)
      .filter((item) => !item.read && Date.parse(item.remindAt) > now)
      .sort((a, b) => Date.parse(a.remindAt) - Date.parse(b.remindAt))[0];
    if (!nextReminder) return;
    const delay = Math.min(Date.parse(nextReminder.remindAt) - now, 2_147_000_000);
    const timer = window.setTimeout(() => setClock(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [patientNotes, loggedIn, authMode]);

  useEffect(() => {
    if (!loggedIn || authMode !== "app") return;
    void fetch("/api/otoscopy-results", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ results: string[] }>;
      })
      .then(({ results }) => setOtoscopyResults(results))
      .catch(() => setToast("خواندن فهرست نتایج اتوسکوپی ناموفق بود"));
  }, [loggedIn, authMode]);

  useEffect(() => {
    if (!loggedIn || authMode !== "app") return;
    const serializedInvoice = new URLSearchParams(window.location.search).get("printInvoice");
    if (serializedInvoice) {
      try { setInvoiceToPrint(JSON.parse(serializedInvoice) as InvoiceDraft); } catch {}
      return;
    }
    let cancelled = false;
    const printRecordId = new URLSearchParams(window.location.search).get(
      "printRecord",
    );
    if (printRecordId) {
      void fetch(`/api/records/${encodeURIComponent(printRecordId)}`, {
        cache: "no-store",
      })
        .then((response) => {
          if (!response.ok) throw new Error();
          return response.json() as Promise<{ record: RecordItem }>;
        })
        .then(({ record }) => {
          if (!cancelled) setPrintRecord(normalizeRecord(record));
        });
      return () => {
        cancelled = true;
      };
    }
    const loadRecords = async () => {
      try {
        const saved = localStorage.getItem("audiology-records");
        if (saved) {
          const parsed = JSON.parse(saved) as Array<
            RecordItem & { fileName?: string }
          >;
          const migrated = [] as RecordItem[];
          for (const { fileName, ...record } of parsed) {
            migrated.push(
              await migrateBrowserRecord({
                ...record,
                doctorName: record.doctorName || fileName || "",
                phoneNumber: record.phoneNumber || "",
                gender: record.gender || "",
                visitDate: record.visitDate || formatTehranDate(record.updatedAt),
              }),
            );
          }
          localStorage.removeItem("audiology-records");
          if (!cancelled) startTransition(() => setRecords(migrated));
          return;
        }
        const response = await fetch("/api/records", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = (await response.json()) as { records: RecordItem[] };
        if (!cancelled) {
          startTransition(() =>
            setRecords(
              data.records.map(normalizeRecord),
            ),
          );
        }
      } catch {
        if (!cancelled) setToast("خواندن اطلاعات از دیتابیس ناموفق بود");
      }
    };
    void loadRecords();
    return () => {
      cancelled = true;
    };
  }, [loggedIn, authMode]);

  useEffect(() => {
    if (!loggedIn || view !== "wizard" || current.status !== "draft") return;
    const timer = setTimeout(() => {
      const saved = {
        ...current,
        updatedAt: currentTimestamp(),
      };
      setRecords((previous) =>
        previous.some((record) => record.id === current.id)
          ? previous.map((record) =>
              record.id === current.id ? saved : record,
            )
          : [saved, ...previous],
      );
      void persistRecord(saved).catch(() =>
        setToast("ذخیره خودکار ناموفق بود"),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [current, step, view, loggedIn]);

  const filtered = useMemo(
    () => {
      const dateKey = (value: string) =>
        value
          .replace(/[۰-۹]/g, (digit) =>
            String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)),
          )
          .replaceAll("/", "-");
      const start = dateKey(startDate);
      const end = dateKey(endDate);
      return records
        .filter((record) => {
          const visitDate = dateKey(
            record.visitDate || formatTehranDate(record.updatedAt),
          );
          return (
            `${record.fullName} ${record.nationalId} ${record.phoneNumber || ""} ${record.doctorName}`.includes(
              query,
            ) &&
            (!start || visitDate >= start) &&
            (!end || visitDate <= end)
          );
        })
        .sort((a, b) => {
          const byVisitDate = dateKey(
            b.visitDate || formatTehranDate(b.updatedAt),
          ).localeCompare(
            dateKey(a.visitDate || formatTehranDate(a.updatedAt)),
          );
          if (byVisitDate !== 0) return byVisitDate;
          return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        });
    },
    [records, query, startDate, endDate],
  );
  const patientPageCount = Math.max(1, Math.ceil(filtered.length / PATIENTS_PER_PAGE));
  const activePatientPage = Math.min(patientPage, patientPageCount);
  const paginatedPatients = filtered.slice(
    (activePatientPage - 1) * PATIENTS_PER_PAGE,
    activePatientPage * PATIENTS_PER_PAGE,
  );
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  };
  const dueNotifications = patientNotes.flatMap((item) => item.reminders.map((reminder) => ({ ...reminder, recordId: item.recordId }))).filter((item) => Date.parse(item.remindAt) <= clock);
  const unreadNotificationCount = dueNotifications.filter((item) => !item.read).length;
  const activeReminder = dueNotifications.find((item) => !item.read);
  const activeReminderPatient = activeReminder ? records.find((record) => record.id === activeReminder.recordId) : undefined;
  const openNote = (record: RecordItem) => {
    const saved = patientNotes.find((item) => item.recordId === record.id);
    setNoteTarget(record);
    setNoteDraft({
      note: saved?.note || "",
      reminders: (saved?.reminders || []).map((item) => ({ id: item.id, text: item.text, date: formatTehranDate(item.remindAt), time: localTimeInput(item.remindAt) })),
    });
  };
  const savePatientNote = async () => {
    if (!noteTarget || savingNote) return;
    const reminders = noteDraft.reminders.map((item) => ({ id: item.id, text: item.text.trim(), remindAt: jalaliDateTimeToIso(item.date, item.time) }));
    if (reminders.some((item) => !item.text || !item.remindAt)) return notify("متن، تاریخ شمسی و ساعت همه یادآوری‌ها را کامل کنید");
    setSavingNote(true);
    try {
      const response = await fetch("/api/patient-notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: noteTarget.id, note: noteDraft.note, reminders }),
      });
      const body = await response.json() as { note?: PatientNote; error?: string };
      if (!response.ok || !body.note) throw new Error(body.error);
      setPatientNotes((previous) => [body.note!, ...previous.filter((item) => item.recordId !== body.note!.recordId)]);
      setNoteTarget(null);
      notify("یادداشت بیمار ذخیره شد");
    } catch { notify("ذخیره یادداشت ناموفق بود"); }
    finally { setSavingNote(false); }
  };
  const markNotificationRead = async (reminderId: string) => {
    setPatientNotes((previous) => previous.map((item) => ({ ...item, reminders: item.reminders.map((reminder) => reminder.id === reminderId ? { ...reminder, read: true } : reminder) })));
    await fetch("/api/patient-notes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reminderId }) }).catch(() => {});
  };
  const saveOtoscopyResult = (rawValue: string) => {
    const value = rawValue.trim();
    if (!value || otoscopyResults.includes(value)) return;
    void fetch("/api/otoscopy-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    })
      .then((response) => {
        if (!response.ok) throw new Error();
        setOtoscopyResults((previous) =>
          previous.includes(value) ? previous : [...previous, value],
        );
      })
      .catch(() => notify("ذخیره نتیجه اتوسکوپی در فهرست ناموفق بود"));
  };
  const deleteOtoscopyResult = (value: string) => {
    void fetch(`/api/otoscopy-results?value=${encodeURIComponent(value)}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) throw new Error();
        setOtoscopyResults((previous) =>
          previous.filter((item) => item !== value),
        );
      })
      .catch(() => notify("حذف نتیجه اتوسکوپی از فهرست ناموفق بود"));
  };
  const openNew = () => {
    setCurrent(emptyRecord());
    setStep(1);
    setView("wizard");
  };
  const openRecord = (record: RecordItem) => {
    setCurrent(normalizeRecord(record));
    setStep(record.status === "completed" ? 5 : 1);
    setView("wizard");
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const done = {
      ...current,
      status: "completed" as const,
      updatedAt: currentTimestamp(),
    };
    const next = records.some((record) => record.id === done.id)
      ? records.map((record) => (record.id === done.id ? done : record))
      : [done, ...records];
    setRecords(next);
    setCurrent(done);
    try {
      await persistRecord(done);
    } catch {
      notify("ذخیره پرونده ناموفق بود");
      setSaving(false);
      return;
    }
    try {
      if (window.desktop) {
        await window.desktop.generateReport(done.id);
      } else {
        const response = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordId: done.id }),
        });
        if (!response.ok) throw new Error();
      }
      setView("dashboard");
      notify("تشخیص و فایل PDF با موفقیت ذخیره شدند");
    } catch {
      notify("پرونده ثبت شد، اما ذخیره فایل PDF ناموفق بود");
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/records/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      setRecords((previous) => previous.filter((record) => record.id !== id));
      setDeleteTarget(null);
      notify("پرونده حذف شد");
    } catch {
      notify("حذف پرونده ناموفق بود");
    } finally {
      setDeleting(false);
    }
  };

  if (printRecord)
    return (
      <main className="print-report-ready">
        <PrintReport record={printRecord} headerUrl={settings.headerUrl} themeColor={settings.printThemeColor} />
      </main>
    );

  if (invoiceToPrint)
    return (
      <main className="invoice-print-mode" dir="rtl">
        <InvoicePrint draft={invoiceToPrint} headerUrl={settings.headerUrl} />
      </main>
    );

  if (authMode === "loading") return <main className="login-page" dir="rtl"><section className="login-card"><p>در حال آماده‌سازی برنامه…</p></section></main>;

  if (!loggedIn || authMode === "login")
    return (
      <Login
        onLogin={(onboardingRequired) => {
          setLoggedIn(true);
          setAuthMode(onboardingRequired ? "onboarding" : "app");
        }}
      />
    );

  if (authMode === "onboarding") return <Onboarding onComplete={() => { setLoggedIn(false); setAuthMode("login"); }} />;

  return (
    <main dir="rtl">
      {releaseNotes && <div className="release-modal-backdrop" role="presentation">
        <section className="release-modal" role="dialog" aria-modal="true" aria-labelledby="release-title">
          <div className="release-modal-icon"><Icon name="check" /></div>
          <p className="eyebrow">به‌روزرسانی موفق</p>
          <h2 id="release-title">آوینا به نسخه {releaseNotes.version} به‌روزرسانی شد</h2>
          <p className="release-date">تاریخ انتشار: {new Date(releaseNotes.update_date).toLocaleDateString("fa-IR")}</p>
          <div className="release-notes-scroll"><MarkdownChangelog value={releaseNotes.changelog} /></div>
          <button className="primary" autoFocus onClick={() => void window.desktop?.acknowledgeRelease(releaseNotes.version).then(() => setReleaseNotes(null))}>بستن و ادامه</button>
        </section>
      </div>}
      {invoiceRecord && invoiceDraft && <InvoiceModal
        record={invoiceRecord}
        draft={invoiceDraft}
        availableTests={settings.testFees}
        onChange={setInvoiceDraft}
        onClose={() => { setInvoiceRecord(null); setInvoiceDraft(null); }}
        onSave={() => {
          if (!invoiceDraft.patientName.trim() || !invoiceDraft.date.trim() || !invoiceDraft.items.length || invoiceDraft.items.some((item) => item.price == null)) {
            notify("نام بیمار، تاریخ و مبلغ تست‌های فاکتور را کامل کنید");
            return;
          }
          if (window.desktop) {
            void window.desktop.saveInvoicePdfAs(invoiceRecord.id, invoiceDraft)
              .then((result) => { if (!result.canceled) notify("PDF فاکتور در محل انتخاب‌شده ذخیره شد"); })
              .catch(() => notify("ذخیره PDF فاکتور ناموفق بود"));
            return;
          }
          setInvoiceToPrint(invoiceDraft);
          setTimeout(() => { void document.fonts.ready.then(() => window.print()); }, 0);
        }}
        onPrint={() => {
          if (!invoiceDraft.patientName.trim() || !invoiceDraft.date.trim() || !invoiceDraft.items.length || invoiceDraft.items.some((item) => item.price == null)) {
            notify("نام بیمار، تاریخ و مبلغ تست‌های فاکتور را کامل کنید");
            return;
          }
          if (window.desktop) {
            void window.desktop.saveInvoicePdf(invoiceRecord.id, invoiceDraft)
              .then(() => notify("فاکتور ذخیره و با برنامه پیش‌فرض PDF باز شد"))
              .catch(() => notify("ذخیره یا بازکردن PDF فاکتور ناموفق بود"));
            return;
          }
          setInvoiceToPrint(invoiceDraft);
          setTimeout(() => {
            void (async () => {
              await document.fonts.ready;
              const letterhead = document.querySelector<HTMLImageElement>(".invoice-print-letterhead");
              if (letterhead && !letterhead.complete) {
                await Promise.race([
                  new Promise<void>((resolve) => {
                    letterhead.addEventListener("load", () => resolve(), { once: true });
                    letterhead.addEventListener("error", () => resolve(), { once: true });
                  }),
                  new Promise<void>((resolve) => setTimeout(resolve, 5000)),
                ]);
              } else if (letterhead?.naturalWidth) {
                await letterhead.decode().catch(() => {});
              }
              try {
                const response = await fetch("/api/invoices", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ recordId: invoiceRecord.id, invoice: invoiceDraft }),
                });
                if (!response.ok) throw new Error();
                notify("فاکتور در پوشه factors ذخیره شد");
              } catch {
                notify("ذخیره PDF فاکتور ناموفق بود");
              }
              window.print();
            })();
          }, 0);
        }}
      />}
      {deleteTarget && (
        <div className="delete-modal-backdrop" role="presentation">
          <section className="delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-modal-title" aria-describedby="delete-modal-description">
            <div className="delete-modal-icon"><Icon name="trash" /></div>
            <h2 id="delete-modal-title">حذف تشخیص</h2>
            <p id="delete-modal-description">
              آیا از حذف تشخیص <strong>{deleteTarget.fullName || "بدون نام"}</strong> مطمئن هستید؟ این عملیات قابل بازگشت نیست.
            </p>
            <div className="delete-modal-actions">
              <button type="button" className="secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                خیر، انصراف
              </button>
              <button type="button" className="danger-button" disabled={deleting} autoFocus onClick={() => void remove(deleteTarget.id)}>
                {deleting ? "در حال حذف…" : "بله، حذف شود"}
              </button>
            </div>
          </section>
        </div>
      )}
      {noteTarget && (
        <div className="note-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNoteTarget(null); }}>
          <section className="note-modal" role="dialog" aria-modal="true" aria-labelledby="note-modal-title">
            <div className="note-modal-heading">
              <div><p className="eyebrow">یادداشت بیمار</p><h2 id="note-modal-title">{noteTarget.fullName || "بیمار بدون نام"}</h2></div>
              <button className="invoice-close" type="button" aria-label="بستن" onClick={() => setNoteTarget(null)}>×</button>
            </div>
            <label className="note-field">متن یادداشت
              <textarea autoFocus rows={5} value={noteDraft.note} onChange={(event) => setNoteDraft({ ...noteDraft, note: event.target.value })} placeholder="یادداشت مربوط به این بیمار را بنویسید…" />
            </label>
            <fieldset className="reminder-fields">
              <legend><Icon name="bell" /> یادآوری‌ها</legend>
              <div className="reminder-list" aria-live="polite">
                {noteDraft.reminders.map((reminder, index) => <article className="reminder-card" key={reminder.id}>
                  <header className="reminder-card-header">
                    <div><span>{(index + 1).toLocaleString("fa-IR")}</span><strong>یادآوری {index + 1}</strong></div>
                    <button type="button" className="reminder-remove" aria-label={`حذف یادآوری ${index + 1}`} onClick={() => setNoteDraft({ ...noteDraft, reminders: noteDraft.reminders.filter((_, itemIndex) => itemIndex !== index) })}><Icon name="trash" /><span>حذف</span></button>
                  </header>
                  <div className="reminder-card-fields">
                    <label className="reminder-text-field">متن یادآوری
                      <input value={reminder.text} onChange={(event) => setNoteDraft({ ...noteDraft, reminders: noteDraft.reminders.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) })} placeholder="مثلاً تماس برای پیگیری سمعک" />
                    </label>
                    <label>تاریخ شمسی
                      <BirthDatePicker value={reminder.date} onChange={(date) => setNoteDraft({ ...noteDraft, reminders: noteDraft.reminders.map((item, itemIndex) => itemIndex === index ? { ...item, date } : item) })} placeholder="۱۴۰۵/۰۷/۱۰" ariaLabel="انتخاب تاریخ شمسی یادآوری" compact />
                    </label>
                    <label>ساعت
                      <ReminderTimePicker value={reminder.time} onChange={(time) => setNoteDraft({ ...noteDraft, reminders: noteDraft.reminders.map((item, itemIndex) => itemIndex === index ? { ...item, time } : item) })} />
                    </label>
                  </div>
                </article>)}
                {noteDraft.reminders.length === 0 && <p className="reminder-empty">هنوز یادآوری‌ای برای این بیمار ثبت نشده است.</p>}
              </div>
              <button type="button" className="secondary reminder-add" onClick={() => setNoteDraft({ ...noteDraft, reminders: [...noteDraft.reminders, { id: crypto.randomUUID(), text: "", date: formatTehranDate(), time: "09:00" }] })}><Icon name="plus" /> افزودن یادآوری</button>
              <small>برای هر بیمار می‌توانید چند یادآوری با تاریخ شمسی و ساعت متفاوت ثبت کنید.</small>
            </fieldset>
            <div className="note-modal-actions">
              <button type="button" className="secondary" onClick={() => setNoteTarget(null)}>انصراف</button>
              <button type="button" className="primary" disabled={savingNote} onClick={() => void savePatientNote()}>{savingNote ? "در حال ذخیره…" : "ذخیره یادداشت"}</button>
            </div>
          </section>
        </div>
      )}
      <header className="topbar">
        <div className="brand">
          <strong className="brand-name">سامانه مدیریت شنوایی شناسی</strong>
          <div>
            {/* <small>سامانه مدیریت شنوایی‌سنجی</small> */}
          </div>
        </div>
        <div className="header-clock-area">
          <HeaderClock />
          {activeReminder && <aside className="header-reminder-alert" role="status" aria-live="assertive">
            <button type="button" className="header-reminder-main" onClick={() => { void markNotificationRead(activeReminder.id); if (activeReminderPatient) openNote(activeReminderPatient); }}>
              <span className="header-reminder-icon"><Icon name="bell" /></span>
              <span className="header-reminder-content"><strong>{activeReminderPatient?.fullName || "یادآوری بیمار"}</strong><span title={activeReminder.text}>{activeReminder.text}</span></span>
              {unreadNotificationCount > 1 && <b>+{(unreadNotificationCount - 1).toLocaleString("fa-IR")}</b>}
            </button>
            <button type="button" className="header-reminder-dismiss" aria-label="خوانده شد" title="خوانده شد" onClick={() => void markNotificationRead(activeReminder.id)}><Icon name="close" /></button>
          </aside>}
        </div>
        <div className="profile">
          <span className="avatar" aria-hidden="true"><Icon name="person" /></span>
          <div>
            <strong>{settings.audiologistName || "شنوایی‌شناس"}</strong>
            <small>Audiologist</small>
          </div>
          <div className="notification-wrap">
            <button className="settings-button notification-button" title="اعلان‌ها" aria-label={`اعلان‌ها${unreadNotificationCount ? `، ${unreadNotificationCount} اعلان جدید` : ""}`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}>
              <Icon name="bell" />
              {unreadNotificationCount > 0 && <span className="notification-badge">{unreadNotificationCount.toLocaleString("fa-IR")}</span>}
            </button>
            {notificationsOpen && <section className="notification-panel" aria-label="اعلان‌های یادآوری">
              <header><strong>اعلان‌ها</strong><small>{dueNotifications.length.toLocaleString("fa-IR")} یادآوری</small></header>
              <div className="notification-list">
                {dueNotifications.length === 0 ? <p className="notification-empty">اعلان جدیدی ندارید.</p> : dueNotifications.map((item) => {
                  const patient = records.find((record) => record.id === item.recordId);
                  return <button key={item.id} className={item.read ? "read" : "unread"} onClick={() => { void markNotificationRead(item.id); if (patient) openNote(patient); setNotificationsOpen(false); }}>
                    <span><Icon name="bell" /></span><div><strong>{patient?.fullName || "بیمار"}</strong><p>{item.text}</p><time>{formatTehranDateTime(item.remindAt)}</time></div>
                  </button>;
                })}
              </div>
            </section>}
          </div>
          <button className="settings-button" title="تنظیمات" aria-label="تنظیمات" onClick={() => setView("settings")}><Icon name="settings" /></button>
          <button
            className="logout"
            onClick={() => {
              void fetch("/api/auth/logout", { method: "POST" }).finally(() => { setLoggedIn(false); setAuthMode("login"); });
            }}
          >
            <Icon name="logout" />
          </button>
        </div>
      </header>
      {view === "settings" ? (
        <Settings settings={settings} onSettings={setSettings} onBack={() => setView("dashboard")} />
      ) : view === "dashboard" ? (
        <section className="shell">
          <div className="hero-row">
            <div>
              {/* <p className="eyebrow">مدیریت مراجعین</p> */}
              <h1>پرونده‌ بیماران</h1>
              <p>
                اطلاعات بیماران، تشخیص‌ها و گزارش‌های ثبت‌شده را مدیریت کنید.
              </p>
            </div>
            <button className="primary" onClick={openNew}>
              <Icon name="plus" /> ثبت تشخیص جدید
            </button>
          </div>
          <div className="stats">
            <article>
              <span className="stat-icon blue">
                <Icon name="users" />
              </span>
              <div>
                <small>کل پرونده‌ها</small>
                <strong>{records.length.toLocaleString("fa-IR")}</strong>
              </div>
            </article>
            <article>
              <span className="stat-icon green">
                <Icon name="file" />
              </span>
              <div>
                <small>تشخیص‌های تکمیل‌شده</small>
                <strong>
                  {records
                    .filter((r) => r.status === "completed")
                    .length.toLocaleString("fa-IR")}
                </strong>
              </div>
            </article>
            <article>
              <span className="stat-icon amber">
                <Icon name="file" />
              </span>
              <div>
                <small>پیش‌نویس‌ها</small>
                <strong>
                  {records
                    .filter((r) => r.status === "draft")
                    .length.toLocaleString("fa-IR")}
                </strong>
              </div>
            </article>
          </div>
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>فهرست بیماران</h2>
                <p>
                  {filtered.length.toLocaleString("fa-IR")} پرونده نمایش داده می‌شود
                </p>
              </div>
              <div
                className="panel-filters"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                  gap: 8,
                  maxWidth: "100%",
                }}
              >
                <label className="search">
                  <Icon name="search" />
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPatientPage(1);
                    }}
                    placeholder="جستجو نام، کد ملی یا پزشک..."
                  />
                </label>
                <div
                  className="date-range"
                  aria-label="فیلتر تاریخ مراجعه"
                  style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                >
                  <div className="date-filter-field" style={{ width: 150 }}>
                    <BirthDatePicker
                      value={startDate}
                      onChange={(value) => {
                        setStartDate(value);
                        setPatientPage(1);
                      }}
                      placeholder="از تاریخ"
                      ariaLabel="انتخاب تاریخ شروع"
                      compact
                    />
                  </div>
                  <div className="date-filter-field" style={{ width: 150 }}>
                    <BirthDatePicker
                      value={endDate}
                      onChange={(value) => {
                        setEndDate(value);
                        setPatientPage(1);
                      }}
                      placeholder="تا تاریخ"
                      ariaLabel="انتخاب تاریخ پایان"
                      compact
                    />
                  </div>
                  {(startDate || endDate) && (
                    <button
                      className="clear-date-filter"
                      type="button"
                      aria-label="پاک کردن فیلتر تاریخ"
                      title="پاک کردن فیلتر تاریخ"
                      style={{
                        width: 32,
                        height: 40,
                        border: 0,
                        background: "transparent",
                        color: "#8a96a8",
                        fontSize: 20,
                      }}
                      onClick={() => {
                        setStartDate("");
                        setEndDate("");
                        setPatientPage(1);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>بیمار</th>
                    <th>پزشک معالج</th>
                    <th>کد ملی</th>
                    <th>تاریخ مراجعه</th>
                    <th>وضعیت</th>
                    <th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPatients.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="patient">
                          <span>{r.fullName.slice(0, 1) || "؟"}</span>
                          <strong>{r.fullName || "بدون نام"}</strong>
                        </div>
                      </td>
                      <td>{r.doctorName || "—"}</td>
                      <td className="ltr">{r.nationalId || "—"}</td>
                      <td>{r.visitDate || formatTehranDate(r.updatedAt)}</td>
                      <td>
                        <span className={`badge ${r.status}`}>
                          {r.status === "completed" ? "تکمیل‌شده" : "پیش‌نویس"}
                        </span>
                      </td>
                      <td>
                        <div className="actions">
                          <ActionButton
                            icon="eye"
                            label="مشاهده پرونده"
                            onClick={() => openRecord(r)}
                          />
                          <ActionButton
                            icon="print"
                            label="پرینت"
                            onClick={() => {
                              if (window.desktop) {
                                void generateAndOpenPdf(r.id).catch(() =>
                                  notify("ساخت یا بازکردن فایل PDF ناموفق بود"),
                                );
                              } else {
                                setCurrent(r);
                                setTimeout(() => window.print(), 60);
                              }
                            }}
                          />
                          <ActionButton
                            icon="dollar"
                            label="صدور فاکتور"
                            onClick={() => openInvoice(r)}
                          />
                          <ActionButton
                            icon="note"
                            label={patientNotes.some((item) => item.recordId === r.id) ? "ویرایش یادداشت و یادآوری" : "ثبت یادداشت و یادآوری"}
                            onClick={() => openNote(r)}
                          />
                          <ActionButton
                            icon="trash"
                            label="حذف"
                            onClick={() => setDeleteTarget(r)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > PATIENTS_PER_PAGE && (
              <nav className="patient-pagination" aria-label="صفحه‌بندی فهرست بیماران">
                <button
                  type="button"
                  onClick={() => setPatientPage(activePatientPage - 1)}
                  disabled={activePatientPage === 1}
                >
                  قبلی
                </button>
                <span aria-live="polite">
                  صفحه {activePatientPage.toLocaleString("fa-IR")} از {patientPageCount.toLocaleString("fa-IR")}
                </span>
                <button
                  type="button"
                  onClick={() => setPatientPage(activePatientPage + 1)}
                  disabled={activePatientPage === patientPageCount}
                >
                  بعدی
                </button>
              </nav>
            )}
          </div>
        </section>
      ) : (
        <Wizard
          step={step}
          setStep={setStep}
          record={current}
          setRecord={setCurrent}
          onBack={() => setView("dashboard")}
          onSave={save}
          saving={saving}
          notify={notify}
          otoscopyResults={otoscopyResults}
          onSaveOtoscopyResult={saveOtoscopyResult}
          onDeleteOtoscopyResult={deleteOtoscopyResult}
        />
      )}
      <PrintReport record={current} headerUrl={settings.headerUrl} themeColor={settings.printThemeColor} />
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [header, setHeader] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (!header) return setError("تصویر سربرگ را انتخاب کنید.");
    const form = new FormData(); form.set("name", name); form.set("password", password); form.set("passwordConfirmation", confirmation); form.set("header", header);
    setSaving(true);
    try {
      const response = await fetch("/api/onboarding", { method: "POST", body: form });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error);
      onComplete();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ذخیره اطلاعات ناموفق بود."); }
    finally { setSaving(false); }
  };
  return <main className="login-page" dir="rtl"><section className="login-card onboarding-card">
    <h1>راه‌اندازی اولیه</h1><p>پیش از استفاده، مشخصات مدیر و سربرگ گزارش را ثبت کنید.</p>
    <form onSubmit={submit}>
      <label>نام و نام خانوادگی شنوایی‌شناس<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>رمز عبور جدید<input required minLength={10} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>تکرار رمز عبور<input required minLength={10} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      <label>تصویر سربرگ (عرض ۲۴۸۰ و حداکثر ارتفاع ۴۰۰ پیکسل)<input required type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setHeader(event.target.files?.[0] || null)} /></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button className="primary wide" disabled={saving}>{saving ? "در حال ذخیره…" : "تکمیل راه‌اندازی"}</button>
    </form>
  </section></main>;
}

function Settings({ settings, onSettings, onBack }: { settings: AppSettings; onSettings: (settings: AppSettings) => void; onBack: () => void }) {
  const [name, setName] = useState(settings.audiologistName);
  const [themeColor, setThemeColor] = useState(settings.printThemeColor);
  const [testFees, setTestFees] = useState<TestFee[]>(settings.testFees || []);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState({ current: false, new: false, confirmation: false });
  const [message, setMessage] = useState("");
  const [updateState, setUpdateState] = useState("آماده بررسی");
  const [updateInfo, setUpdateInfo] = useState<{ version: string; changelog: string; update_date: string; url: string } | null>(null);
  const [desktopInfo, setDesktopInfo] = useState<{ version?: string; licenseId?: string; deviceId?: string }>({});
  useEffect(() => {
    const labels: Record<string, string> = { checking: "در حال بررسی…", downloading: "در حال دانلود…", "up-to-date": "نرم‌افزار به‌روز است", ready: "آماده نصب", error: "خطا در به‌روزرسانی", development: "در حالت توسعه غیرفعال است", catalog: "اطلاعات نسخه دریافت شد" };
    const dispose = window.desktop?.onUpdateStatus((status) => { setUpdateState(status.percent != null ? `در حال دانلود: ${status.percent}٪` : labels[status.state] || status.state); if (status.latest) setUpdateInfo(status.latest); });
    if (window.desktop) void Promise.all([window.desktop.appVersion(), window.desktop.licenseStatus()]).then(([version, license]) => setDesktopInfo({ version, licenseId: license.licenseId, deviceId: license.deviceId }));
    return dispose;
  }, []);
  const saveName = async () => {
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audiologistName: name, printThemeColor: themeColor }) });
    const body = await response.json() as AppSettings & { error?: string }; if (!response.ok) return setMessage(body.error || "ذخیره ناموفق بود."); onSettings(body); setMessage("تنظیمات ذخیره شد.");
  };
  const uploadHeader = async (file?: File) => {
    if (!file) return; const form = new FormData(); form.set("header", file);
    const response = await fetch("/api/settings/header", { method: "POST", body: form }); const body = await response.json() as { headerUrl?: string; error?: string };
    if (!response.ok) return setMessage(body.error || "بارگذاری ناموفق بود."); onSettings({ ...settings, headerUrl: body.headerUrl || settings.headerUrl }); setMessage("سربرگ ذخیره شد.");
  };
  const changePassword = async () => {
    if (newPassword !== newPasswordConfirmation) return setMessage("رمز جدید و تکرار آن یکسان نیستند.");
    const response = await fetch("/api/settings/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) }); const body = await response.json() as { error?: string };
    if (!response.ok) return setMessage(body.error || "تغییر رمز ناموفق بود."); setMessage("رمز تغییر کرد؛ لطفاً دوباره وارد شوید."); setTimeout(() => location.reload(), 1000);
  };
  const saveTestFees = async () => {
    if (!testFees.length || testFees.some((test) => !test.name.trim() || test.price == null || test.price < 0)) return setMessage("نام و هزینه همه تست‌ها را کامل کنید.");
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audiologistName: name, printThemeColor: themeColor, testFees }) });
    const body = await response.json() as AppSettings & { error?: string };
    if (!response.ok) return setMessage(body.error || "ذخیره هزینه‌ها ناموفق بود.");
    onSettings(body); setTestFees(body.testFees); setMessage("هزینه تست‌ها ذخیره شد.");
  };
  return <section className="shell settings-page" dir="rtl">
    <div className="hero-row"><div><p className="eyebrow">مدیریت برنامه</p><h1>تنظیمات</h1></div><button className="secondary" onClick={onBack}>بازگشت</button></div>
    <div className="settings-grid">
      <article className="form-card"><h2>مشخصات و سربرگ چاپ</h2><p>نام زیر در بالای عنوان Audiologist نمایش داده می‌شود.</p><label>نام و نام خانوادگی شنوایی‌شناس<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>تم رنگی چاپ و PDF<div className="theme-color-field"><input type="color" value={/^#[0-9a-f]{6}$/i.test(themeColor) ? themeColor : "#5F7DC9"} onChange={(e) => setThemeColor(e.target.value.toUpperCase())} aria-label="انتخاب تم رنگی" /><input dir="ltr" value={themeColor} maxLength={7} placeholder="#5F7DC9" pattern="#[0-9A-Fa-f]{6}" onChange={(e) => setThemeColor(e.target.value)} aria-label="کد تم رنگی" /></div><small>کد رنگ را به شکل #RRGGBB وارد کنید. رنگ‌های پزشکی گوش راست و چپ تغییر نمی‌کنند.</small></label><button className="primary" onClick={saveName}>ذخیره مشخصات و تم رنگی</button><label>تصویر سربرگ چاپ (عرض ۲۴۸۰ و حداکثر ارتفاع ۴۰۰ پیکسل)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void uploadHeader(e.target.files?.[0])} /></label><img className="settings-header-preview" src={settings.headerUrl} alt="پیش‌نمایش سربرگ چاپ" /></article>
      <article className="form-card"><h2>تغییر رمز عبور</h2>
        <label>رمز فعلی<div className="password"><input required autoComplete="current-password" type={visiblePasswords.current ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /><button type="button" aria-label={visiblePasswords.current ? "پنهان کردن رمز فعلی" : "نمایش رمز فعلی"} onClick={() => setVisiblePasswords((state) => ({ ...state, current: !state.current }))}><Icon name="eye" /></button></div></label>
        <label>رمز جدید<div className="password"><input required minLength={10} autoComplete="new-password" type={visiblePasswords.new ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /><button type="button" aria-label={visiblePasswords.new ? "پنهان کردن رمز جدید" : "نمایش رمز جدید"} onClick={() => setVisiblePasswords((state) => ({ ...state, new: !state.new }))}><Icon name="eye" /></button></div></label>
        <label>تکرار رمز جدید<div className="password"><input required minLength={10} autoComplete="new-password" type={visiblePasswords.confirmation ? "text" : "password"} value={newPasswordConfirmation} onChange={(e) => setNewPasswordConfirmation(e.target.value)} /><button type="button" aria-label={visiblePasswords.confirmation ? "پنهان کردن تکرار رمز جدید" : "نمایش تکرار رمز جدید"} onClick={() => setVisiblePasswords((state) => ({ ...state, confirmation: !state.confirmation }))}><Icon name="eye" /></button></div></label>
        <button className="primary" onClick={changePassword}>تغییر رمز</button>
      </article>
      <article className="form-card test-fees-card">
        <div className="settings-card-heading"><div><h2>هزینه تست‌ها</h2><p>مبلغ هر تست را به ریال ثبت کنید؛ این مبالغ هنگام صدور فاکتور قابل ویرایش‌اند.</p></div><button className="secondary" type="button" onClick={() => setTestFees((items) => [...items, { id: crypto.randomUUID(), name: "", price: null }])}><Icon name="plus" /> افزودن تست</button></div>
        <div className="test-fees-list">
          {testFees.map((test, index) => <div className="test-fee-row" key={test.id}>
            <label>نام تست<input readOnly={test.id === "tympanometry" || test.id === "audiometry"} value={test.name} placeholder="نام تست" onChange={(event) => setTestFees((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label>
            <label>هزینه (ریال)<input type="number" min="0" step="1" value={test.price ?? ""} placeholder="مثلاً ۱٬۵۰۰٬۰۰۰" onChange={(event) => setTestFees((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value === "" ? null : Number(event.target.value) } : item))} /></label>
            <button className="icon-btn test-fee-delete" type="button" aria-label={`حذف تست ${test.name || index + 1}`} title="حذف تست" disabled={testFees.length <= 1 || test.id === "tympanometry" || test.id === "audiometry"} onClick={() => setTestFees((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Icon name="trash" /></button>
          </div>)}
        </div>
        <button className="primary" type="button" onClick={saveTestFees}>ذخیره هزینه تست‌ها</button>
      </article>
      <article className="form-card"><h2>مجوز و به‌روزرسانی</h2><p>نسخه فعلی: {desktopInfo.version || "نسخه وب"}</p>{desktopInfo.licenseId && <p dir="ltr">License: {desktopInfo.licenseId}<br />Device: {desktopInfo.deviceId}</p>}<p>وضعیت: {updateState}</p>{updateInfo && <div className="update-details"><p><strong>آخرین نسخه: {updateInfo.version}</strong></p><p>تاریخ انتشار: {new Date(updateInfo.update_date).toLocaleDateString("fa-IR")}</p><MarkdownChangelog value={updateInfo.changelog} /></div>}<button className="primary" disabled={typeof window === "undefined" || !window.desktop} onClick={() => void window.desktop?.checkForUpdates()}>بررسی به‌روزرسانی</button>{updateState === "آماده نصب" && <button className="secondary" onClick={() => window.desktop?.installUpdate()}>نصب و راه‌اندازی مجدد</button>}</article>
    </div>{message && <div className="toast">{message}</div>}
  </section>;
}

function formatMoney(value: number) { return value.toLocaleString("fa-IR"); }

function InvoiceModal({ draft, availableTests, onChange, onClose, onPrint, onSave }: { record: RecordItem; draft: InvoiceDraft; availableTests: TestFee[]; onChange: (draft: InvoiceDraft) => void; onClose: () => void; onPrint: () => void; onSave: () => void }) {
  const total = draft.items.reduce((sum, item) => sum + (item.price || 0), 0);
  const toggleTest = (test: TestFee) => onChange({ ...draft, items: draft.items.some((item) => item.id === test.id) ? draft.items.filter((item) => item.id !== test.id) : [...draft.items, test] });
  return <div className="invoice-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="invoice-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title">
      <div className="invoice-modal-heading"><div><p className="eyebrow">صدور رسید</p><h2 id="invoice-modal-title">فاکتور بیمار</h2></div><button className="invoice-close" type="button" aria-label="بستن" onClick={onClose}>×</button></div>
      <div className="invoice-fields">
        <label>عنوان<select value={draft.honorific} onChange={(event) => onChange({ ...draft, honorific: event.target.value as InvoiceDraft["honorific"] })}><option>سرکار خانم</option><option>جناب آقای</option></select></label>
        <label>نام و نام خانوادگی بیمار<input autoFocus value={draft.patientName} onChange={(event) => onChange({ ...draft, patientName: event.target.value })} /></label>
        <label>تاریخ<input dir="rtl" value={draft.date} onChange={(event) => onChange({ ...draft, date: event.target.value })} /></label>
      </div>
      <fieldset className="invoice-tests"><legend>تست‌های انجام‌شده</legend><div className="invoice-test-options">{availableTests.map((test) => <label key={test.id}><input type="checkbox" checked={draft.items.some((item) => item.id === test.id)} onChange={() => toggleTest(test)} /><span>{test.name}</span><small>{test.price == null ? "بدون هزینه ثبت‌شده" : `${formatMoney(test.price)} ریال`}</small></label>)}</div></fieldset>
      {draft.items.length > 0 && <div className="invoice-items-editor">{draft.items.map((item) => <label key={item.id}><span>{item.name}</span><div><input type="number" min="0" step="1" value={item.price ?? ""} aria-label={`هزینه ${item.name}`} onChange={(event) => onChange({ ...draft, items: draft.items.map((selected) => selected.id === item.id ? { ...selected, price: event.target.value === "" ? null : Number(event.target.value) } : selected) })} /><small>ریال</small></div></label>)}</div>}
      <div className="invoice-total"><span>جمع کل</span><strong>{formatMoney(total)} ریال</strong><small>معادل {formatMoney(Math.round(total / 10))} تومان</small></div>
      <div className="invoice-modal-actions"><button className="secondary" type="button" onClick={onClose}>انصراف</button><button className="secondary" type="button" onClick={onSave}>ذخیره PDF</button><button className="primary" type="button" onClick={onPrint}><Icon name="print" /> چاپ فاکتور A5</button></div>
    </section>
  </div>;
}

function InvoicePrint({ draft, headerUrl }: { draft: InvoiceDraft; headerUrl: string }) {
  const total = draft.items.reduce((sum, item) => sum + (item.price || 0), 0);
  return <section className="invoice-print" dir="rtl">
    <img className="invoice-print-letterhead" src={headerUrl} alt="سربرگ مرکز شنوایی‌سنجی" />
    <div className="invoice-print-body">
      <div className="invoice-bismillah">بسمه تعالی</div>
      <div className="invoice-spacer" aria-hidden="true" />
      <h1>رسید دریافت وجه</h1>
      <p className="invoice-receipt-text">از {draft.honorific} <strong>{draft.patientName}</strong> مبلغ <strong>{formatMoney(total)}</strong> ریال معادل <strong>{formatMoney(Math.round(total / 10))}</strong> تومان بابت تست‌های زیر دریافت گردید.</p>
      <table><thead><tr><th>ردیف</th><th>شرح تست</th><th>مبلغ (ریال)</th></tr></thead><tbody>{draft.items.map((item, index) => <tr key={item.id}><td>{(index + 1).toLocaleString("fa-IR")}</td><td>{item.name}</td><td>{formatMoney(item.price || 0)}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}>جمع کل</td><td>{formatMoney(total)}</td></tr></tfoot></table>
      <div className="invoice-print-footer"><div><span>تاریخ</span><strong>{draft.date}</strong></div><div><span>مهر و امضا</span></div></div>
    </div>
  </section>;
}

function Login({ onLogin }: { onLogin: (onboardingRequired: boolean) => void }) {
  const [show, setShow] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryPasswordConfirmation, setRecoveryPasswordConfirmation] = useState("");
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [showRecoveryConfirmation, setShowRecoveryConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const body = await response.json() as { onboardingRequired?: boolean };
      if (!response.ok) throw new Error();
      onLogin(Boolean(body.onboardingRequired));
    } catch {
      setError("نام کاربری یا رمز عبور اشتباه است.");
    } finally {
      setSubmitting(false);
    }
  };
  const recover = async () => {
    if (!recoveryCode.trim()) return setError("کد بازیابی را وارد کنید.");
    if (recoveryPassword.length < 10 || !/[A-Za-z]/.test(recoveryPassword) || !/\d/.test(recoveryPassword)) return setError("رمز جدید باید حداقل ۱۰ نویسه و شامل حرف انگلیسی و عدد باشد.");
    if (recoveryPassword !== recoveryPasswordConfirmation) return setError("رمز جدید و تکرار آن یکسان نیستند.");
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/auth/recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: recoveryCode, newPassword: recoveryPassword }) });
      const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error);
      setRecovering(false); setError("رمز عبور تغییر کرد. اکنون وارد شوید.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "بازیابی ناموفق بود."); }
    finally { setSubmitting(false); }
  };

  return (
    <main className="login-page" dir="rtl">
      <section className="login-card">
        <div className="login-brand-name">شنوایی شناسی</div>
        <p>مدیریت یکپارچه پرونده‌های شنوایی‌سنجی</p>
        <form onSubmit={recovering ? (event) => { event.preventDefault(); void recover(); } : submit}>
          {!recovering ? <>
          <label>
            نام کاربری
            <input
              required
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError("");
              }}
              placeholder="نام کاربری خود را وارد کنید"
            />
          </label>
          <label>
            رمز عبور
            <div className="password">
              <input
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                type={show ? "text" : "password"}
                placeholder="••••••••"
              />
              <button
                type="button"
                aria-label={show ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
                onClick={() => setShow(!show)}
              >
                <Icon name="eye" />
              </button>
            </div>
          </label>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <div className="login-options">
            <label>
              <input type="checkbox" /> مرا به خاطر بسپار
            </label>
            <button type="button" className="link-button" onClick={() => { setRecovering(true); setError(""); }}>فراموشی رمز عبور</button>
          </div>
          <button className="primary wide" disabled={submitting}>{submitting ? "در حال ورود…" : "ورود به سامانه"}</button>
          </> : <>
            <div className="recovery-box">
              <div className="recovery-heading"><strong>بازیابی رمز عبور</strong><button type="button" className="link-button recovery-back" onClick={() => { setRecovering(false); setError(""); }}>بازگشت به ورود</button></div>
              <label>کد بازیابی<input autoComplete="one-time-code" value={recoveryCode} onChange={(e) => { setRecoveryCode(e.target.value); setError(""); }} /></label>
              <label>رمز جدید<div className="password"><input type={showRecoveryPassword ? "text" : "password"} autoComplete="new-password" minLength={10} value={recoveryPassword} onChange={(e) => { setRecoveryPassword(e.target.value); setError(""); }} /><button type="button" aria-label={showRecoveryPassword ? "پنهان کردن رمز جدید" : "نمایش رمز جدید"} onClick={() => setShowRecoveryPassword(!showRecoveryPassword)}><Icon name="eye" /></button></div></label>
              <label>تکرار رمز جدید<div className="password"><input type={showRecoveryConfirmation ? "text" : "password"} autoComplete="new-password" minLength={10} value={recoveryPasswordConfirmation} onChange={(e) => { setRecoveryPasswordConfirmation(e.target.value); setError(""); }} /><button type="button" aria-label={showRecoveryConfirmation ? "پنهان کردن تکرار رمز جدید" : "نمایش تکرار رمز جدید"} onClick={() => setShowRecoveryConfirmation(!showRecoveryConfirmation)}><Icon name="eye" /></button></div></label>
              {error && <p className="login-error" role="alert">{error}</p>}
              <button className="primary wide" disabled={submitting}>{submitting ? "در حال ثبت…" : "ثبت رمز جدید"}</button>
            </div>
          </>}
        </form>
        <small>نسخه ۱.۰ · سامانه تخصصی کلینیک شنوایی</small>
      </section>
    </main>
  );
}

function Wizard({
  step,
  setStep,
  record,
  setRecord,
  onBack,
  onSave,
  saving,
  notify,
  otoscopyResults,
  onSaveOtoscopyResult,
  onDeleteOtoscopyResult,
}: {
  step: number;
  setStep: (n: number) => void;
  record: RecordItem;
  setRecord: React.Dispatch<React.SetStateAction<RecordItem>>;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  notify: (s: string) => void;
  otoscopyResults: string[];
  onSaveOtoscopyResult: (value: string) => void;
  onDeleteOtoscopyResult: (value: string) => void;
}) {
  const [annotatingSide, setAnnotatingSide] = useState<"right" | "left" | null>(
    null,
  );
  const audiometricTests = normalizeAudiometricTests(record.audiometricTests);
  const update = (key: keyof RecordItem, value: string) =>
    setRecord((current) => ({ ...current, [key]: value }));
  const updateDoctorName = (doctorName: string) =>
    setRecord((current) => ({
      ...current,
      doctorName,
      right: {
        ...current.right,
        tympanometry: {
          ...emptyTympanometry(),
          ...current.right.tympanometry,
          dearDoctor: doctorName,
        },
      },
      left: {
        ...current.left,
        tympanometry: {
          ...emptyTympanometry(),
          ...current.left.tympanometry,
          dearDoctor: doctorName,
        },
      },
      audiometricTests: {
        ...normalizeAudiometricTests(current.audiometricTests),
        dearDoctor: doctorName,
      },
    }));
  const updateEar = (side: "right" | "left", patch: Partial<Ear>) =>
    setRecord((current) => ({
      ...current,
      [side]: { ...current[side], ...patch },
    }));
  const updateTympanometry = (
    side: "right" | "left",
    patch: Partial<Tympanometry>,
  ) =>
    updateEar(side, {
      tympanometry: {
        ...emptyTympanometry(),
        ...record[side].tympanometry,
        ...patch,
      },
    });
  const updateAudiometry = (side: "right" | "left", value: Audiometry) =>
    updateEar(side, { audiometry: value });
  const updateSpeechAudiometry = (
    side: "right" | "left",
    field: SpeechAudiometryField,
    value: string,
  ) => {
    const current = normalizeSpeechAudiometry(record[side].speechAudiometry);
    const next = { ...current, [field]: value };
    if (field === "srt") {
      const threshold = Number(value);
      next.mcl =
        value.trim() && Number.isFinite(threshold)
          ? String(threshold + 30)
          : "";
    }
    if (field === "srtNoise") {
      const threshold = Number(value);
      next.mclNoise =
        value.trim() && Number.isFinite(threshold)
          ? String(threshold + 30)
          : "";
    }
    updateEar(side, { speechAudiometry: next });
  };
  const copyAudiometryTo = (from: "right" | "left", to: "right" | "left") => {
    updateEar(to, { audiometry: copyAudiometry(record[from].audiometry) });
    notify(
      `اطلاعات ادیومتری گوش ${from === "right" ? "راست" : "چپ"} به گوش ${to === "right" ? "راست" : "چپ"} کپی شد`,
    );
  };
  const canNext =
    step !== 1 ||
    (record.doctorName &&
      record.fullName &&
      record.nationalId &&
      record.phoneNumber &&
      record.birthDate &&
      record.visitDate &&
      record.gender);
  const handleImageUpload = async (
    side: "right" | "left",
    file: File | null,
  ) => {
    if (!file) return;
    try {
      await persistRecord(record);
      const original = await uploadPatientImage(
        record.id,
        side,
        "original",
        file,
        file.name,
      );
      const currentImage = await uploadPatientImage(
        record.id,
        side,
        "current",
        file,
        file.name,
      );
      updateEar(side, {
        imageName: file.name,
        imageDataUrl: currentImage.url,
        originalImageDataUrl: original.url,
        arrows: [],
      });
    } catch {
      notify("ذخیره تصویر ناموفق بود");
    }
  };
  const removeImage = async (side: "right" | "left") => {
    try {
      const response = await fetch(
        `/api/uploads/images?recordId=${encodeURIComponent(record.id)}&side=${side}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error();
      updateEar(side, {
        imageName: "",
        imageDataUrl: "",
        originalImageDataUrl: "",
        arrows: [],
      });
    } catch {
      notify("حذف تصویر ناموفق بود");
    }
  };
  return (
    <section className="wizard-shell">
      <div className="wizard-top">
        <button className="back-link" onClick={onBack}>
          <Icon name="back" /> بازگشت به پرونده‌ها
        </button>
      </div>
      <div className="wizard-body">
        <aside className="wizard-sidebar">
          <div className="stepper">
            {[
              { n: 1, t: "Patient Information" },
              { n: 2, t: "Otoscopy" },
              { n: 3, t: "Tympanometry" },
              { n: 4, t: "Audiometry" },
              { n: 5, t: "Summary & Save" },
            ].map((s) => (
              <button
                type="button"
                className={`step ${step >= s.n ? "active" : ""} ${step === s.n ? "current" : ""}`}
                disabled={s.n > 1 && !canNext}
                onClick={() => setStep(s.n)}
                key={s.n}
              >
                <span>{step > s.n ? "✓" : s.n.toLocaleString("fa-IR")}</span>
                <div>
                  <strong>{s.t}</strong>
                </div>
              </button>
            ))}
          </div>
          <div className="wizard-actions">
            <button
              className="secondary"
              disabled={step === 1}
              onClick={() => setStep(step - 1)}
            >
              مرحله قبلی
            </button>
            {step < 5 ? (
              <button
                className="primary"
                disabled={!canNext}
                onClick={() => setStep(step + 1)}
              >
                مرحله بعد
              </button>
            ) : (
              <button className="primary" disabled={saving} onClick={onSave}>
                {saving ? "در حال ذخیره پرونده و PDF..." : "ثبت نهایی تشخیص"}
              </button>
            )}
          </div>
        </aside>
        <div className="form-card">
          {step === 5 && <RecordSummary record={record} />}
          {step === 1 && (
            <>
              <div className="section-title">
                <span>۱</span>
                <div>
                  <h2>اطلاعات بیمار</h2>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  <span>
                    Full Name (English) <b>*</b>
                  </span>
                  <input
                    value={record.fullName}
                    onChange={(e) =>
                      update("fullName", sanitizeEnglishName(e.target.value))
                    }
                    placeholder="Patient full name"
                    dir="ltr"
                  />
                </label>
                <label>
                  <span>Full Name (فارسی)</span>
                  <input
                    value={record.persianFullName}
                    onChange={(e) =>
                      update(
                        "persianFullName",
                        sanitizePersianName(e.target.value),
                      )
                    }
                    placeholder="نام و نام خانوادگی بیمار"
                    dir="rtl"
                  />
                </label>
                <label>
                  <span>
                    Referred Doctor <b>*</b>
                  </span>
                  <input
                    value={record.doctorName}
                    onChange={(e) => updateDoctorName(e.target.value)}
                    placeholder="نام پزشک معالج"
                  />
                </label>
                <label>
                  <span>
                    National ID <b>*</b>
                  </span>
                  <input
                    className="ltr"
                    value={record.nationalId}
                    onChange={(e) =>
                      update("nationalId", toEnglishDigits(e.target.value))
                    }
                    placeholder="۱۰ رقم"
                  />
                </label>
                <label>
                  <span>
                    Phone Number <b>*</b>
                  </span>
                  <input
                    className="ltr"
                    type="tel"
                    inputMode="tel"
                    value={record.phoneNumber}
                    onChange={(e) =>
                      update("phoneNumber", toEnglishDigits(e.target.value))
                    }
                    placeholder="شماره تماس بیمار"
                  />
                </label>
                <label>
                  <span>
                    Birth Date <b>*</b>
                  </span>
                  <BirthDatePicker
                    value={record.birthDate}
                    onChange={(v) => update("birthDate", v)}
                    placeholder="۱۳۷۰/۰۱/۰۱"
                  />
                </label>
                <label>
                  <span>
                    Visit Date <b>*</b>
                  </span>
                  <BirthDatePicker
                    value={record.visitDate}
                    onChange={(v) => update("visitDate", v)}
                    placeholder="تاریخ مراجعه"
                    ariaLabel="انتخاب تاریخ مراجعه"
                  />
                </label>
                <label>
                  <span>
                    Gender <b>*</b>
                  </span>
                  <select
                    value={record.gender}
                    onChange={(e) => update("gender", e.target.value as Gender)}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </label>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="section-title">
                <span>۲</span>
                <div>
                  <h2>اطلاعات اتوسکوپی</h2>
                </div>
              </div>
              <div className="ear-grid">
                {(["left", "right"] as const).map((side) => (
                  <div className={`ear-card ${side}`} key={side}>
                    <h3>گوش {side === "right" ? "راست" : "چپ"}</h3>
                    <div className="image-upload-wrapper">
                      <label className="dropzone">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) =>
                            void handleImageUpload(
                              side,
                              e.target.files?.[0] || null,
                            )
                          }
                        />
                        <Icon name="upload" />
                        <strong>
                          {record[side].imageName || "بارگذاری تصویر اتوسکوپی"}
                        </strong>
                        <small>PNG یا JPG، حداکثر ۱۰ مگابایت</small>
                      </label>
                      {record[side].imageDataUrl && (
                        <div className="image-preview">
                          <img
                            src={record[side].imageDataUrl}
                            alt={`پیش‌نمایش گوش ${side === "right" ? "راست" : "چپ"}`}
                          />
                          <div className="image-actions">
                            <button
                              className="icon-btn"
                              type="button"
                              title="کشیدن فلش روی تصویر"
                              aria-label="کشیدن فلش روی تصویر"
                              onClick={() => setAnnotatingSide(side)}
                            >
                              <Icon name="arrow" />
                            </button>
                            <button
                              className="icon-btn"
                              type="button"
                              title="حذف تصویر"
                              aria-label="حذف تصویر"
                              onClick={() => void removeImage(side)}
                            >
                              <Icon name="trash" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <label>
                      نتیجه معاینه
                      <AutocompleteInput
                        value={record[side].result}
                        onChange={(v) => updateEar(side, { result: v })}
                        placeholder="نتیجه معاینه را تایپ کنید..."
                        suggestions={otoscopyResults}
                        onSaveSuggestion={onSaveOtoscopyResult}
                        onDeleteSuggestion={onDeleteOtoscopyResult}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <div className="section-title">
                <span>۳</span>
                <div>
                  <h2>اطلاعات Tympanometry</h2>
                </div>
              </div>
              <div className="tympanometry-grid">
                {(["left", "right"] as const).map((side) => {
                  const saved = record[side].tympanometry;
                  return (
                    <TympanometryCard
                      key={side}
                      side={side}
                      value={{
                        ...emptyTympanometry(),
                        ...saved,
                        ipsi: { ...emptyReflex(), ...saved?.ipsi },
                        contra: { ...emptyReflex(), ...saved?.contra },
                      }}
                      onChange={(patch) => updateTympanometry(side, patch)}
                    />
                  );
                })}
              </div>
              <CombinedDoctorComment
                dearDoctor={
                  record.right.tympanometry?.dearDoctor ||
                  record.left.tympanometry?.dearDoctor ||
                  ""
                }
                comment={mergeDoctorComments(
                  record.right.tympanometry?.comment,
                  record.left.tympanometry?.comment,
                )}
                onDearDoctorChange={(text) => {
                  updateTympanometry("right", { dearDoctor: text });
                }}
                onCommentChange={(text) =>
                  setRecord((current) => ({
                    ...current,
                    right: {
                      ...current.right,
                      tympanometry: {
                        ...emptyTympanometry(),
                        ...current.right.tympanometry,
                        comment: text,
                      },
                    },
                    left: {
                      ...current.left,
                      tympanometry: {
                        ...emptyTympanometry(),
                        ...current.left.tympanometry,
                        comment: text,
                      },
                    },
                  }))
                }
              />
            </>
          )}
          {step === 4 && (
            <>
              <div className="section-title">
                <span>۴</span>
                <div>
                  <h2>اطلاعات Audiometry</h2>
                </div>
              </div>
              <div className="audiometry-grid">
                {(["right", "left"] as const).map((side) => {
                  const saved = record[side].audiometry;
                  const value = {
                    ac: { ...emptyAudiometryRow(), ...saved?.ac },
                    bc: { ...emptyAudiometryRow(), ...saved?.bc },
                  };
                  return (
                    <AudiometryCard
                      key={side}
                      side={side}
                      value={value}
                      onChange={(next) => updateAudiometry(side, next)}
                    />
                  );
                })}
                <div className="audiometry-copy-controls">
                  <button
                    type="button"
                    onClick={() => copyAudiometryTo("left", "right")}
                    title="کپی اطلاعات گوش چپ به گوش راست"
                    aria-label="کپی اطلاعات گوش چپ به گوش راست"
                  >
                    <Icon name="arrowLeft" />
                  </button>
                  <button
                    type="button"
                    onClick={() => copyAudiometryTo("right", "left")}
                    title="کپی اطلاعات گوش راست به گوش چپ"
                    aria-label="کپی اطلاعات گوش راست به گوش چپ"
                  >
                    <Icon name="arrowRight" />
                  </button>
                </div>
                <AudiometricTestsPanel
                  value={audiometricTests}
                  onChange={(value) =>
                    setRecord({ ...record, audiometricTests: value })
                  }
                />
                <SpeechAudiometryPanel
                  values={{
                    right: normalizeSpeechAudiometry(
                      record.right.speechAudiometry,
                    ),
                    left: normalizeSpeechAudiometry(
                      record.left.speechAudiometry,
                    ),
                  }}
                  onChange={updateSpeechAudiometry}
                />
                <div className="audiometry-comment">
                  <CombinedDoctorComment
                    action={
                      <AudiometrySuggestion
                        right={record.right.audiometry}
                        left={record.left.audiometry}
                        onApply={(text) => setRecord({
                          ...record,
                          audiometricTests: {
                            ...audiometricTests,
                            comments: { right: text, left: text },
                          },
                        })}
                      />
                    }
                    resultTitle="Audiometry Result"
                    dearDoctor={audiometricTests.dearDoctor}
                    comment={audiometricTests.comments.right}
                    onDearDoctorChange={(text) =>
                      setRecord({
                        ...record,
                        audiometricTests: {
                          ...audiometricTests,
                          dearDoctor: text,
                        },
                      })
                    }
                    onCommentChange={(text) =>
                      setRecord({
                        ...record,
                        audiometricTests: {
                          ...audiometricTests,
                          comments: { right: text, left: text },
                        },
                      })
                    }
                  />
                </div>
              </div>
            </>
          )}
          {step === 5 && (
            <>
              <div className="section-title">
                <span>۵</span>
                <div>
                  <h2>خلاصه پرونده</h2>
                </div>
              </div>
              <div className="summary">
                <h3>مشخصات بیمار</h3>
                <dl>
                  <div>
                    <dt>Full Name</dt>
                    <dd>{record.fullName || "—"}</dd>
                  </div>
                  <div>
                    <dt>Referred Doctor</dt>
                    <dd>{record.doctorName || "—"}</dd>
                  </div>
                  <div>
                    <dt>National ID</dt>
                    <dd>{record.nationalId || "—"}</dd>
                  </div>
                  <div>
                    <dt>Phone Number</dt>
                    <dd dir="ltr">{record.phoneNumber || "—"}</dd>
                  </div>
                  <div>
                    <dt>Gender</dt>
                    <dd>{genderLabel(record.gender) || "—"}</dd>
                  </div>
                  <div>
                    <dt>Age</dt>
                    <dd>{calculateAge(record.birthDate) || "—"}</dd>
                  </div>
                  <div>
                    <dt>Visit Date</dt>
                    <dd>{record.visitDate || "—"}</dd>
                  </div>
                </dl>
                <h3>نتیجه اتوسکوپی</h3>
                <div className="result-row">
                  <article>
                    <span>R</span>
                    <div>
                      <small>گوش راست</small>
                      <strong>{record.right.result || "ثبت نشده"}</strong>
                      <em>{record.right.imageName || "بدون تصویر"}</em>
                    </div>
                  </article>
                  <article>
                    <span>L</span>
                    <div>
                      <small>گوش چپ</small>
                      <strong>{record.left.result || "ثبت نشده"}</strong>
                      <em>{record.left.imageName || "بدون تصویر"}</em>
                    </div>
                  </article>
                </div>
                <h3>نتیجه Tympanometry</h3>
                <div className="tymp-summary">
                  {(["right", "left"] as const).map((side) => {
                    const t = record[side].tympanometry;
                    return (
                      <article key={side}>
                        <strong>گوش {side === "right" ? "راست" : "چپ"}</strong>
                        <span>TYPE: {t?.type || "—"}</span>
                        <span>CANAL VOL: {t?.canalVolume || "—"} cc</span>
                        <span>STAT.COMP: {t?.staticCompliance || "—"} ml</span>
                        <span>
                          M.E.PRESS: {t?.middleEarPressure || "—"} daPa
                        </span>
                        <span>Gradient: {t?.gradient || "—"} %</span>
                      </article>
                    );
                  })}
                </div>
                <h3>نتیجه Audiometry</h3>
                <div className="audiometry-summary">
                  {(["right", "left"] as const).map((side) => {
                    const audiometry = record[side].audiometry;
                    const count = (["ac", "bc"] as const)
                      .flatMap((row) => Object.values(audiometry?.[row] || {}))
                      .filter((cell) => cell.value.trim()).length;
                    return (
                      <article key={side}>
                        <span className="ear-code">
                          {side === "right" ? "R" : "L"}
                        </span>
                        <div>
                          <strong>
                            گوش {side === "right" ? "راست" : "چپ"}
                          </strong>
                          <small>
                            {count
                              ? `${count.toLocaleString("fa-IR")} آستانه ثبت شده`
                              : "ثبت نشده"}
                          </small>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
              <div className="export-row">
                <button onClick={() => {
                  if (window.desktop) {
                    void generateAndOpenPdf(record.id).catch(() =>
                      notify("ساخت یا بازکردن فایل PDF ناموفق بود"),
                    );
                  } else {
                    window.print();
                  }
                }}>
                  <Icon name="print" /> پرینت
                </button>
                <button
                  onClick={() => {
                    void generateAndOpenPdf(record.id)
                      .then(() => notify("فایل PDF ذخیره و باز شد"))
                      .catch(() => notify("ساخت یا بازکردن فایل PDF ناموفق بود"));
                  }}
                >
                  <Icon name="file" /> خروجی PDF
                </button>
                <button
                  onClick={() => notify("لینک گزارش برای ارسال پیامک آماده شد")}
                >
                  <Icon name="sms" /> ارسال با پیامک
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {annotatingSide && record[annotatingSide].imageDataUrl && (
        <ImageAnnotator
          imageUrl={
            record[annotatingSide].originalImageDataUrl ||
            record[annotatingSide].imageDataUrl
          }
          existingArrows={record[annotatingSide].arrows}
          onClose={() => setAnnotatingSide(null)}
          onSave={(imageDataUrl, arrows) => {
            const side = annotatingSide;
            void (async () => {
              try {
                // Do not fetch the data URL here. Electron's production CSP only
                // permits network requests to the local application origin.
                const blob = dataUrlToBlob(imageDataUrl);
                const uploaded = await uploadPatientImage(
                  record.id,
                  side,
                  "current",
                  blob,
                  record[side].imageName || `${side}.jpg`,
                );
                updateEar(side, { imageDataUrl: uploaded.url, arrows });
                setAnnotatingSide(null);
              } catch {
                notify("ذخیره تصویر علامت‌گذاری‌شده ناموفق بود");
              }
            })();
          }}
        />
      )}
    </section>
  );
}

function hasText(value?: string) {
  return Boolean(
    value
      ?.replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim(),
  );
}

function ReportPage({
  icon,
  title,
  record,
  headerUrl,
  children,
  className = "",
}: {
  icon: string;
  title: string;
  record: RecordItem;
  headerUrl: string;
  children: React.ReactNode;
  className?: string;
}) {
  const patientFields: Array<[string, string]> = [
    ["Full Name", record.fullName],
    ["National ID", record.nationalId],
    ["Gender", genderLabel(record.gender)],
    ["Age", calculateAge(record.birthDate)],
    ["Referred Doctor", record.doctorName.trim() ? `Dr. ${record.doctorName.trim()}` : ""],
  ];

  return (
    <section className={`print-page ${className}`}>
      <header className="print-header">
        <img
          className="print-letterhead"
          src={headerUrl}
          alt="سربرگ کلینیک شنوایی"
        />
      </header>
      <span className="print-visit-date" dir="rtl">
        تاریخ مراجعه: {record.visitDate || formatTehranDate(record.updatedAt)}
      </span>
      {patientFields.some(([, value]) => hasText(value)) && (
        <div
          className="print-patient-line"
          dir="ltr"
          aria-label="Patient Information"
        >
          {patientFields
            .filter(([, value]) => hasText(value))
            .map(([label, value]) => (
              <span key={label}>
                <strong>{label}:</strong> <b dir="auto">{value}</b>
              </span>
            ))}
        </div>
      )}
      <div className="print-title">
        <span>
          <Icon name={icon} />
        </span>
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      {children}
    </section>
  );
}

function ReportFields({
  fields,
}: {
  fields: Array<[string, string | undefined, string?]>;
}) {
  const populated = fields.filter(([, value]) => hasText(value));
  if (!populated.length) return null;
  return (
    <dl className="print-fields">
      {populated.map(([label, value, unit]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd dir="auto">
            {value}
            {unit && <small> {unit}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PrintReflexTable({ value }: { value: Tympanometry }) {
  const frequencies: Array<[keyof ReflexValues, string]> = [
    ["hz500", "500"],
    ["hz1k", "1k"],
    ["hz2k", "2k"],
    ["hz4k", "4k"],
  ];
  const rows = (["ipsi", "contra"] as const).filter((row) =>
    Object.values(value[row]).some(hasText),
  );
  const populated = frequencies.filter(
    ([key]) => hasText(value.ipsi[key]) || hasText(value.contra[key]),
  );
  if (!populated.length) return null;
  return (
    <table className="print-data-table" dir="ltr">
      <caption>Acoustic Reflex</caption>
      <thead>
        <tr>
          <th>Test</th>
          {populated.map(([key, label]) => (
            <th key={key}>{label} Hz</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row}>
            <th>{row.toUpperCase()}</th>
            {populated.map(([key]) => (
              <td key={key}>{value[row][key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrintSpeechAudiometryTable({ value }: { value: SpeechAudiometry }) {
  const rows: Array<[string, string, string, string]> = [
    ["In Quiet", value.srt, value.mcl, value.ucl],
    ["In Noise", value.srtNoise, value.mclNoise, value.uclNoise],
  ];
  const populated = rows.filter(([, ...values]) => values.some(hasText));
  if (!populated.length) return null;
  return (
    <table className="print-data-table speech-audiometry-table" dir="ltr">
      <thead>
        <tr>
          <th>Condition</th>
          <th>SRT <small>dB HL</small></th>
          <th>MCL <small>dB HL</small></th>
          <th>UCL</th>
        </tr>
      </thead>
      <tbody>
        {populated.map(([condition, ...values]) => (
          <tr key={condition}>
            <th>{condition}</th>
            {values.map((fieldValue, index) => (
              <td key={index}>
                {hasText(fieldValue)
                  ? `${fieldValue}${index === 2 ? "%" : ""}`
                  : "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrintAudiometricTestsTable({ value }: { value: AudiometricTests }) {
  const rinneLabel = (result: RinneResult) =>
    result === "positive"
      ? "Positive"
      : result === "negative"
        ? "Negative"
        : "";
  const rinneFields = (["right", "left"] as const).map((side) => ({
    label: `Rinne ${side === "right" ? "RE" : "LE"}`,
    value: rinneLabel(value.rinne[side]),
  }));
  const weberFields = weberFrequencies
    .map((frequency) => ({
      label: `Weber ${frequency} Hz`,
      value: value.weber[frequency],
    }))
    .filter((field) => Boolean(field.value));
  if (!rinneFields.some((field) => hasText(field.value)) && !weberFields.length)
    return null;

  return (
    <table className="print-data-table print-audiometric-tests-table" dir="ltr">
      <thead>
        <tr>
          {rinneFields.slice(0, 1).map((field) => (
            <th key={field.label}>{field.label}</th>
          ))}
          {weberFields.map((field) => (
            <th key={field.label}>{field.label}</th>
          ))}
          {rinneFields.slice(1).map((field) => (
            <th key={field.label}>{field.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {rinneFields.slice(0, 1).map((field) => (
            <td key={field.label}>{field.value}</td>
          ))}
          {weberFields.map((field) => (
            <td key={field.label} aria-label={weberLabel(field.value)}>
              <WeberIndicator value={field.value} />
            </td>
          ))}
          {rinneFields.slice(1).map((field) => (
            <td key={field.label}>{field.value}</td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function PrintComments({
  dearDoctor,
  comment,
  title,
}: {
  dearDoctor?: string;
  comment: string;
  title: string;
}) {
  if (!hasText(dearDoctor) && !hasText(comment)) return null;
  return (
    <section className="print-comments">
      <div className="print-comment-grid">
        <article className="print-note">
          {hasText(dearDoctor) && (
            <div className="print-doctor">
              <span>Dear Dr.</span>
              <strong dir="auto">{dearDoctor}</strong>
            </div>
          )}
          {hasText(comment) && (
            <>
            <header>
              <strong>{title}</strong>
            </header>
            <div
              dir="auto"
              dangerouslySetInnerHTML={{ __html: comment }}
            />
            </>
          )}
        </article>
      </div>
    </section>
  );
}

function PrintReport({ record, headerUrl, themeColor }: { record: RecordItem; headerUrl: string; themeColor: string }) {
  const sides = ["right", "left"] as const;
  const tests = normalizeAudiometricTests(record.audiometricTests);
  const tympanometryDoctor =
    record.right.tympanometry?.dearDoctor ||
    record.left.tympanometry?.dearDoctor;
  const tympanometryComment = mergeDoctorComments(
    record.right.tympanometry?.comment,
    record.left.tympanometry?.comment,
  );
  const hasOtoscopy = (side: "right" | "left") =>
    hasText(record[side].result) ||
    hasText(record[side].imageName) ||
    hasText(record[side].imageDataUrl);
  const hasTympanometry = (side: "right" | "left") => {
    const value = record[side].tympanometry;
    return Boolean(
      value &&
      ([
        value.type,
        value.canalVolume,
        value.staticCompliance,
        value.middleEarPressure,
        value.gradient,
      ].some(hasText) ||
        value.points.length ||
        Object.values(value.ipsi).some(hasText) ||
        Object.values(value.contra).some(hasText)),
    );
  };
  const hasAudiometry = (side: "right" | "left") => {
    const value = record[side].audiometry;
    const speech = record[side].speechAudiometry;
    return Boolean(
      (value &&
        (["ac", "bc"] as const).some((row) =>
          Object.values(value[row]).some((cell) => hasText(cell.value)),
        )) ||
      (speech && Object.values(speech).some(hasText)),
    );
  };
  const hasAudiometricTests =
    tests.rinne.right ||
    tests.rinne.left ||
    Object.values(tests.weber).some(Boolean) ||
    hasText(tests.dearDoctor);

  return (
    <div className="print-report" style={{ "--print-theme": themeColor } as React.CSSProperties}>
      {(sides.some(hasTympanometry) ||
        sides.some(hasOtoscopy) ||
        hasText(tympanometryDoctor) ||
        hasText(tympanometryComment)) && (
        <ReportPage
          icon="tympanometry"
          title="Tympanometry"
          record={record}
          headerUrl={headerUrl}
          className="print-tympanometry-page"
        >
          {sides.some(hasOtoscopy) && (
            <section className="print-otoscopy-section">
              <div className="print-title print-subtitle">
                <span>
                  <Icon name="ear" />
                </span>
                <div>
                  <h2>Otoscopy</h2>
                </div>
              </div>
              <div className="print-ear-grid">
                {sides.filter(hasOtoscopy).map((side) => (
                  <article className={`print-ear ${side}`} key={side}>
                    {record[side].imageDataUrl && (
                      <div className="print-otoscopy-image-wrap">
                        <img
                          className="print-otoscopy-image"
                          src={record[side].imageDataUrl}
                          alt={`تصویر اتوسکوپی گوش ${side === "right" ? "راست" : "چپ"}`}
                          style={{
                            gridArea: "1 / 1",
                            alignSelf: "center",
                            justifySelf: "center",
                            width: "auto",
                            height: "58mm",
                            maxWidth: "none",
                          }}
                        />
                        <span
                          className="print-otoscopy-ear-badge"
                          style={{
                            gridArea: "1 / 1",
                            alignSelf: "start",
                            justifySelf: "end",
                            zIndex: 2,
                            display: "grid",
                            placeItems: "center",
                            width: "8mm",
                            height: "6mm",
                            margin: "2mm",
                            border: `1px solid ${side === "right" ? "#f3b8b8" : "#c5d1f2"}`,
                            borderRadius: "1.8mm",
                            backgroundColor:
                              side === "right" ? "#fff0f0" : "#eef3ff",
                            color: side === "right" ? "#d84a4a" : "#5f7dc9",
                            font: "800 8pt/1 Arial, sans-serif",
                            boxShadow:
                              "0 0.4mm 1.5mm rgba(15, 23, 42, 0.2)",
                          }}
                        >
                          {side === "right" ? "RE" : "LE"}
                        </span>
                      </div>
                    )}
                    {hasText(record[side].result) && (
                      <div
                        className={`print-note print-otoscopy-result ${side}`}
                      >
                        <header>
                          <span>{side === "right" ? "R" : "L"}</span>
                          <strong>
                            Otoscopy {side === "right" ? "RE" : "LE"} Result
                          </strong>
                        </header>
                        <div dir="auto">{record[side].result}</div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {sides.some(hasTympanometry) && (
            <div className="print-ear-grid">
              {sides.filter(hasTympanometry).map((side) => {
                const saved = record[side].tympanometry;
                const value = {
                  ...emptyTympanometry(),
                  ...saved,
                  ipsi: { ...emptyReflex(), ...saved?.ipsi },
                  contra: { ...emptyReflex(), ...saved?.contra },
                };
                const showChart =
                  value.points.length > 0 ||
                  (hasText(value.middleEarPressure) &&
                    hasText(value.staticCompliance));
                return (
                  <article className={`print-ear ${side}`} key={side}>
                    {showChart && (
                      <TympanometrySummaryChart side={side} value={value} />
                    )}
                    <div className="print-tymp-fields">
                      <ReportFields
                        fields={[
                          ["Stat. Comp.", value.staticCompliance, "ml"],
                          [
                            "M.E. Press.",
                            value.middleEarPressure,
                            "daPa",
                          ],
                          ["Canal Vol.", value.canalVolume, "cc"],
                          ["Gradient", value.gradient, "%"],
                          ["Type", value.type],
                        ]}
                      />
                    </div>
                    <PrintReflexTable value={value} />
                  </article>
                );
              })}
            </div>
          )}
          <PrintComments
            dearDoctor={tympanometryDoctor}
            comment={tympanometryComment}
            title="Tympanometry Result"
          />
        </ReportPage>
      )}

      {(sides.some(hasAudiometry) ||
        hasAudiometricTests ||
        hasText(tests.comments.right)) && (
        <ReportPage
          icon="audiometry"
          title="Audiometry"
          record={record}
          headerUrl={headerUrl}
          className="print-audiometry-page"
        >
          <div className="print-ear-grid">
            {sides.filter(hasAudiometry).map((side) => {
              const audiometry = copyAudiometry(record[side].audiometry);
              const hasThresholds = audiometryFrequencies.some(
                (frequency) =>
                  hasText(audiometry.ac[frequency].value) ||
                  hasText(audiometry.bc[frequency].value),
              );
              const speech = normalizeSpeechAudiometry(
                record[side].speechAudiometry,
              );
              return (
                <article className={`print-ear ${side}`} key={side}>
                  <h2>
                    <span>{side === "right" ? "R" : "L"}</span> گوش{" "}
                    {side === "right" ? "راست" : "چپ"}
                  </h2>
                  {hasThresholds && (
                    <AudiometrySummaryChart
                      side={side}
                      value={audiometry}
                      print
                    />
                  )}
                  <PrintSpeechAudiometryTable value={speech} />
                </article>
              );
            })}
          </div>
          {hasAudiometricTests && (
            <div className="print-tests">
              <PrintAudiometricTestsTable value={tests} />
            </div>
          )}
          <PrintComments
            dearDoctor={tests.dearDoctor}
            comment={tests.comments.right}
            title="Audiometry Result"
          />
        </ReportPage>
      )}
    </div>
  );
}

function RecordSummary({ record }: { record: RecordItem }) {
  const ears = ["left", "right"] as const;
  const reflexFrequencies: Array<[keyof ReflexValues, string]> = [
    ["hz500", "500"],
    ["hz1k", "1k"],
    ["hz2k", "2k"],
    ["hz4k", "4k"],
  ];
  const tests = normalizeAudiometricTests(record.audiometricTests);
  const valueOrDash = (value?: string) => value?.trim() || "—";
  const rinneSymbol = (value: RinneResult) =>
    value === "positive" ? "+" : value === "negative" ? "−" : "—";

  return (
    <div className="record-summary">
      <div className="summary-heading">
        <span>۵</span>
        <div>
          <h2>خلاصه کامل پرونده</h2>
        </div>
      </div>

      <section className="summary-section patient-summary">
        <header>
          <span>۱</span>
          <div>
            <h3>اطلاعات بیمار</h3>
          </div>
        </header>
        <dl className="summary-details">
          <div className="patient-name-field">
            <dt>Full Name</dt>
            <dd dir="auto">{valueOrDash(record.fullName)}</dd>
          </div>
          <div className="patient-name-field">
            <dt>Referred Doctor</dt>
            <dd dir="auto">{valueOrDash(record.doctorName)}</dd>
          </div>
          <div>
            <dt>National ID</dt>
            <dd className="national-id" dir="ltr">
              {valueOrDash(record.nationalId)}
            </dd>
          </div>
          <div>
            <dt>Phone Number</dt>
            <dd dir="ltr">{valueOrDash(record.phoneNumber)}</dd>
          </div>
          <div>
            <dt>Gender</dt>
            <dd>{valueOrDash(genderLabel(record.gender))}</dd>
          </div>
          <div>
            <dt>Age</dt>
            <dd>{valueOrDash(calculateAge(record.birthDate))}</dd>
          </div>
          <div>
            <dt>Visit Date</dt>
            <dd>{valueOrDash(record.visitDate)}</dd>
          </div>
        </dl>
      </section>

      <section className="summary-section">
        <header>
          <span>۲</span>
          <div>
            <h3>Otoscopy</h3>
          </div>
        </header>
        <div className="summary-ear-grid">
          {ears.map((side) => (
            <article className={`summary-ear ${side}`} key={side}>
              <div className="summary-ear-title">
                <span className="ear-code">{side === "right" ? "R" : "L"}</span>
                <strong>گوش {side === "right" ? "راست" : "چپ"}</strong>
              </div>
              {record[side].imageDataUrl ? (
                <img
                  className="summary-otoscopy-image"
                  src={record[side].imageDataUrl}
                  alt={`تصویر اتوسکوپی گوش ${side === "right" ? "راست" : "چپ"}`}
                />
              ) : (
                <div className="summary-image-empty">تصویری ثبت نشده است</div>
              )}
              <dl
                className="summary-details compact summary-otoscopy-details"
                dir="ltr"
              >
                <div>
                  <dt>Otoscopy Result</dt>
                  <dd>{valueOrDash(record[side].result)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="summary-section">
        <header>
          <span>۳</span>
          <div>
            <h3>Tympanometry</h3>
          </div>
        </header>
        <div className="summary-ear-grid">
          {ears.map((side) => {
            const tymp = {
              ...emptyTympanometry(),
              ...record[side].tympanometry,
              ipsi: { ...emptyReflex(), ...record[side].tympanometry?.ipsi },
              contra: {
                ...emptyReflex(),
                ...record[side].tympanometry?.contra,
              },
            };
            return (
              <article className={`summary-ear ${side}`} key={side}>
                <div className="summary-ear-title">
                  <span className="ear-code">
                    {side === "right" ? "R" : "L"}
                  </span>
                  <strong>گوش {side === "right" ? "راست" : "چپ"}</strong>
                </div>
                <TympanometrySummaryChart side={side} value={tymp} />
                <dl className="summary-details tymp-values">
                  <div>
                    <dt>Type</dt>
                    <dd dir="auto">{valueOrDash(tymp.type)}</dd>
                  </div>
                  <div>
                    <dt>Canal Vol.</dt>
                    <dd>
                      {valueOrDash(tymp.canalVolume)} <small>cc</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Stat. Comp.</dt>
                    <dd>
                      {valueOrDash(tymp.staticCompliance)} <small>ml</small>
                    </dd>
                  </div>
                  <div>
                    <dt>M.E. Press.</dt>
                    <dd>
                      {valueOrDash(tymp.middleEarPressure)} <small>daPa</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Gradient</dt>
                    <dd>
                      {valueOrDash(tymp.gradient)} <small>%</small>
                    </dd>
                  </div>
                </dl>
                <div className="summary-reflex" dir="ltr">
                  <strong>Acoustic Reflex</strong>
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        {reflexFrequencies.map(([, label]) => (
                          <th key={label}>{label} Hz</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(["ipsi", "contra"] as const).map((row) => (
                        <tr key={row}>
                          <th>{row === "ipsi" ? "IPSI" : "CONTRA"}</th>
                          {reflexFrequencies.map(([key]) => (
                            <td key={key}>{valueOrDash(tymp[row][key])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
        <div className="summary-doctor summary-tymp-doctor">
          <span>Dear Dr.</span>
          <strong dir="auto">
            {valueOrDash(
              record.right.tympanometry?.dearDoctor ||
                record.left.tympanometry?.dearDoctor,
            )}
          </strong>
        </div>
        <div className="summary-comment-grid shared">
          <div className="summary-note">
            <small>Tympanometry Result</small>
            {hasText(
              mergeDoctorComments(
                record.right.tympanometry?.comment,
                record.left.tympanometry?.comment,
              ),
            ) ? (
              <div
                dir="auto"
                dangerouslySetInnerHTML={{
                  __html: mergeDoctorComments(
                    record.right.tympanometry?.comment,
                    record.left.tympanometry?.comment,
                  ),
                }}
              />
            ) : (
              <p>ثبت نشده</p>
            )}
          </div>
        </div>
      </section>

      <section className="summary-section">
        <header>
          <span>۴</span>
          <div>
            <h3>Audiometry</h3>
          </div>
        </header>
        <div className="summary-audiometry-grid">
          {ears.map((side) => {
            const audiometry = copyAudiometry(record[side].audiometry);
            const speech = normalizeSpeechAudiometry(
              record[side].speechAudiometry,
            );
            return (
              <article className={`summary-ear ${side}`} key={side}>
                <div className="summary-ear-title">
                  <span className="ear-code">
                    {side === "right" ? "R" : "L"}
                  </span>
                  <strong>گوش {side === "right" ? "راست" : "چپ"}</strong>
                </div>
                <AudiometrySummaryChart side={side} value={audiometry} />
                <div className="summary-table-wrap">
                  <table className="summary-thresholds" dir="ltr">
                    <thead>
                      <tr>
                        <th>Path</th>
                        {audiometryFrequencies.map((frequency) => (
                          <th key={frequency}>
                            {frequency >= 1000
                              ? `${frequency / 1000}k`
                              : frequency}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(["ac", "bc"] as const).map((row) => (
                        <tr key={row}>
                          <th>{row.toUpperCase()}</th>
                          {audiometryFrequencies.map((frequency) => {
                            const cell = audiometry[row][frequency];
                            return (
                              <td key={frequency}>
                                {cell.value ? (
                                  <>
                                    <strong>{cell.value}</strong>
                                    {cell.modifier && (
                                      <small>{cell.modifier}</small>
                                    )}
                                  </>
                                ) : (
                                  "—"
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h4 className="summary-speech-title">Speech Audiometry</h4>
                <dl className="summary-details speech-values" dir="ltr">
                  {(
                    [
                      ["SRT (In Quiet)", speech.srt, "dB HL"],
                      ["MCL (In Quiet)", speech.mcl, "dB HL"],
                      ["UCL (In Quiet)", speech.ucl, "%"],
                      ["SRT (In Noise)", speech.srtNoise, "dB HL"],
                      ["MCL (In Noise)", speech.mclNoise, "dB HL"],
                      ["UCL (In Noise)", speech.uclNoise, "%"],
                    ] as const
                  ).map(([label, value, unit]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        {valueOrDash(value)}{" "}
                        <small>{unit}</small>
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            );
          })}
        </div>
        <div className="summary-doctor summary-tymp-doctor">
          <span>Dear Dr.</span>
          <strong dir="auto">{valueOrDash(tests.dearDoctor)}</strong>
        </div>
        <div className="summary-comment-grid shared">
          <div className="summary-note">
            <small>Audiometry Result</small>
            {hasText(tests.comments.right) ? (
              <div
                dir="auto"
                dangerouslySetInnerHTML={{ __html: tests.comments.right }}
              />
            ) : (
              <p>ثبت نشده</p>
            )}
          </div>
        </div>
        <div className="summary-tests" dir="ltr">
          <div className="rinne-summary right">
            <span>Rinne RE</span>
            <strong
              aria-label={
                tests.rinne.right === "positive"
                  ? "Positive"
                  : tests.rinne.right === "negative"
                    ? "Negative"
                    : "Not recorded"
              }
            >
              {rinneSymbol(tests.rinne.right)}
            </strong>
          </div>
          <div className="rinne-summary left">
            <span>Rinne LE</span>
            <strong
              aria-label={
                tests.rinne.left === "positive"
                  ? "Positive"
                  : tests.rinne.left === "negative"
                    ? "Negative"
                    : "Not recorded"
              }
            >
              {rinneSymbol(tests.rinne.left)}
            </strong>
          </div>
          {weberFrequencies.map((frequency) => (
            <div className="weber-summary" key={frequency}>
              <span>Weber {frequency} Hz</span>
              <strong
                aria-label={weberLabel(tests.weber[frequency])}
              >
                <WeberIndicator value={tests.weber[frequency]} />
              </strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AudiometrySummaryChart({
  side,
  value,
  print = false,
}: {
  side: "right" | "left";
  value: Audiometry;
  print?: boolean;
}) {
  const plot = { left: 85, right: 790, top: 34, bottom: 424 };
  const verticalScale = print ? 2.5 : 1;
  const yTicks = Array.from({ length: 14 }, (_, index) => -10 + index * 10);
  const x = (index: number) =>
    plot.left +
    (index / (audiometryFrequencies.length - 1)) * (plot.right - plot.left);
  const y = (threshold: number) =>
    (plot.top + ((threshold + 10) / 130) * (plot.bottom - plot.top)) *
    verticalScale;
  const entered = (row: "ac" | "bc") =>
    audiometryFrequencies.flatMap((frequency, index) => {
      if (row === "bc" && frequency >= 6000) return [];
      const cell = value[row][frequency] || { value: "", modifier: "" },
        counterpartCell = value[row === "bc" ? "ac" : "bc"][frequency];
      const threshold = Number(cell.value),
        counterpart = Number(counterpartCell?.value);
      const violatesBoneGap =
        Boolean(counterpartCell?.value.trim()) &&
        Number.isFinite(counterpart) &&
        (row === "bc" ? threshold > counterpart : counterpart > threshold);
      return cell.value.trim() !== "" &&
        isValidAudiometryThreshold(cell.value) &&
        !violatesBoneGap
        ? [{ frequency, index, threshold, modifier: cell.modifier }]
        : [];
    });
  const acPoints = entered("ac"),
    bcPoints = entered("bc");
  const lineSegments = (points: ReturnType<typeof entered>) =>
    points.slice(0, -1).map((point, index) => {
      const next = points[index + 1],
        dx = x(next.index) - x(point.index),
        dy = y(next.threshold) - y(point.threshold),
        distance = Math.hypot(dx, dy),
        startInset = point.modifier === "MD" ? 22 : 18,
        endInset = next.modifier === "MD" ? 22 : 18;
      return `${x(point.index) + (dx / distance) * startInset},${y(point.threshold) + (dy / distance) * startInset} ${x(next.index) - (dx / distance) * endInset},${y(next.threshold) - (dy / distance) * endInset}`;
    });
  const lines = (points: ReturnType<typeof entered>, className: string) =>
    lineSegments(points).map((segment, index) => (
      <polyline className={className} key={index} points={segment} />
    ));
  return (
    <div className={`audiogram summary-audiogram ${side}`} dir="ltr">
      <svg
        viewBox={`0 0 910 ${465 * verticalScale}`}
        role="img"
        aria-label={`نمودار ادیومتری گوش ${side === "right" ? "راست" : "چپ"}`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              className="audiometry-grid-line"
              x1={plot.left}
              x2={plot.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text x="42" y={y(tick) + 4}>
              {tick}
            </text>
          </g>
        ))}
        {audiometryFrequencies.map((frequency, index) => (
          <g key={frequency}>
            <line
              className="audiometry-grid-line"
              x1={x(index)}
              x2={x(index)}
              y1={plot.top * verticalScale}
              y2={plot.bottom * verticalScale}
            />
            <text x={x(index)} y={447 * verticalScale}>
              {frequency >= 1000 ? `${frequency / 1000}k` : frequency}
            </text>
          </g>
        ))}
        <text className="axis-title" x={print ? 55 : 18} y={22 * verticalScale}>
          dB HL
        </text>
        <text
          className="axis-title"
          x={print ? 700 : 830}
          y={462 * verticalScale}
        >
          Frequency (Hz)
        </text>
        {acPoints.length > 1 && lines(acPoints, "ac-line")}{" "}
        {bcPoints.length > 1 && lines(bcPoints, "bc-line")}{" "}
        {acPoints.map((point) => (
          <g className="ac-point" key={point.frequency}>
            <AudiometryMarker
              side={side}
              row="ac"
              modifier={point.modifier}
              x={x(point.index)}
              y={y(point.threshold)}
              verticalScale={verticalScale}
            />
          </g>
        ))}
        {bcPoints.map((point) => (
          <g className="bc-point" key={point.frequency}>
            <AudiometryMarker
              side={side}
              row="bc"
              modifier={point.modifier}
              x={x(point.index)}
              y={y(point.threshold)}
              verticalScale={verticalScale}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

function TympanometrySummaryChart({
  side,
  value,
}: {
  side: "right" | "left";
  value: Tympanometry;
}) {
  const xTicks = Array.from({ length: 10 }, (_, i) => -600 + i * 100),
    yTicks = Array.from({ length: 6 }, (_, i) => 2.5 - i * 0.5);
  const plot = { left: 54, right: 574, top: 18, bottom: 248 };
  const x = (pressure: number) =>
      plot.left + ((pressure + 600) / 900) * (plot.right - plot.left),
    y = (compliance: number) =>
      plot.bottom - (compliance / 2.5) * (plot.bottom - plot.top);
  const smoothPath = (points: TympanometryPoint[]) => {
    if (!points.length) return "";
    if (points.length === 1)
      return `M ${x(points[0].pressure)} ${y(points[0].compliance)}`;
    let path = `M ${x(points[0].pressure)} ${y(points[0].compliance)}`;
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (x(points[i].pressure) + x(points[i + 1].pressure)) / 2,
        my = (y(points[i].compliance) + y(points[i + 1].compliance)) / 2;
      path += ` Q ${x(points[i].pressure)} ${y(points[i].compliance)} ${mx} ${my}`;
    }
    const last = points.at(-1)!;
    return `${path} Q ${x(last.pressure)} ${y(last.compliance)} ${x(last.pressure)} ${y(last.compliance)}`;
  };
  const peakPressure = Number(value.middleEarPressure),
    peakCompliance = Number(value.staticCompliance),
    hasPeak =
      value.middleEarPressure.trim() !== "" &&
      value.staticCompliance.trim() !== "" &&
      peakPressure >= -600 &&
      peakPressure <= 300 &&
      peakCompliance >= 0 &&
      peakCompliance <= 2.5;
  const automaticPoints = hasPeak
    ? Array.from({ length: 51 }, (_, i) => {
        const offset = -300 + i * 10,
          span = offset < 0 ? 300 : 200,
          decay =
            (Math.exp((-4 * Math.abs(offset)) / span) - Math.exp(-4)) /
            (1 - Math.exp(-4));
        return {
          pressure: peakPressure + offset,
          compliance: peakCompliance * Math.max(0, decay),
        };
      }).filter((point) => point.pressure >= -600 && point.pressure <= 300)
    : [];
  const chartPoints = value.points.length > 1 ? value.points : automaticPoints;
  return (
    <div className="tymp-chart summary-tymp-chart" dir="ltr">
      <svg
        viewBox="0 0 620 286"
        role="img"
        aria-label={`نمودار تمپانومتری گوش ${side === "right" ? "راست" : "چپ"}`}
      >
        <rect
          className="tympanometry-grid-border"
          x={plot.left}
          y={plot.top}
          width={plot.right - plot.left}
          height={plot.bottom - plot.top}
          fill="none"
          stroke="#8b96a5"
          strokeWidth="1.25"
        />
        {yTicks.map((v) => (
          <g key={v}>
            <line
              className="tympanometry-grid-line"
              x1={plot.left}
              x2={plot.right}
              y1={y(v)}
              y2={y(v)}
              stroke="#aeb7c4"
              strokeWidth="1"
            />
            <text x="43" y={y(v) + 4}>
              {v}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <g key={v}>
            <line
              className="tympanometry-grid-line"
              x1={x(v)}
              x2={x(v)}
              y1={plot.top}
              y2={plot.bottom}
              stroke="#aeb7c4"
              strokeWidth="1"
            />
            <text x={x(v)} y="269">
              {v}
            </text>
          </g>
        ))}
        <text className="axis-label" x="18" y="13">
          ml
        </text>
        <text className="axis-label" x="580" y="283">
          daPa
        </text>
        {chartPoints.length > 1 && (
          <path className="drawn-curve" d={smoothPath(chartPoints)} />
        )}{" "}
        {value.points.length < 2 && hasPeak && (
          <g className="peak-marker">
            <line
              x1={x(peakPressure)}
              x2={x(peakPressure)}
              y1={y(peakCompliance)}
              y2={plot.bottom}
            />
            <line
              x1={plot.left}
              x2={x(peakPressure)}
              y1={y(peakCompliance)}
              y2={y(peakCompliance)}
            />
            <circle cx={x(peakPressure)} cy={y(peakCompliance)} r="7" />
          </g>
        )}
      </svg>
    </div>
  );
}

function TympanometryCard({
  side,
  value,
  onChange,
}: {
  side: "right" | "left";
  value: Tympanometry;
  onChange: (patch: Partial<Tympanometry>) => void;
}) {
  const [drawMode, setDrawMode] = useState<"automatic" | "pencil">("automatic"),
    drawing = useRef(false),
    pointsRef = useRef(value.points);
  useEffect(() => {
    pointsRef.current = value.points;
  }, [value.points]);
  const xTicks = Array.from({ length: 10 }, (_, i) => -600 + i * 100),
    yTicks = Array.from({ length: 6 }, (_, i) => 2.5 - i * 0.5);
  const plot = { left: 54, right: 574, top: 18, bottom: 248 };
  const x = (pressure: number) =>
      plot.left + ((pressure + 600) / 900) * (plot.right - plot.left),
    y = (compliance: number) =>
      plot.bottom - (compliance / 2.5) * (plot.bottom - plot.top);
  const eventPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(),
      px = ((event.clientX - rect.left) / rect.width) * 620,
      py = ((event.clientY - rect.top) / rect.height) * 286;
    if (px < plot.left || px > plot.right || py < plot.top || py > plot.bottom)
      return null;
    return {
      pressure:
        Math.round(
          (-600 + ((px - plot.left) / (plot.right - plot.left)) * 900) * 10,
        ) / 10,
      compliance:
        Math.round(((plot.bottom - py) / (plot.bottom - plot.top)) * 250) / 100,
    };
  };
  const appendPoint = (point: TympanometryPoint) => {
    const last = pointsRef.current.at(-1);
    if (
      last &&
      Math.hypot(
        x(last.pressure) - x(point.pressure),
        y(last.compliance) - y(point.compliance),
      ) < 4
    )
      return;
    pointsRef.current = [...pointsRef.current, point];
    onChange({ points: pointsRef.current });
  };
  const pointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (drawMode !== "pencil") return;
    event.preventDefault();
    const point = eventPoint(event);
    if (!point) return;
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    appendPoint(point);
  };
  const pointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (drawMode !== "pencil" || !drawing.current) return;
    event.preventDefault();
    const point = eventPoint(event);
    if (point) appendPoint(point);
  };
  const smoothPath = (points: TympanometryPoint[]) => {
    if (!points.length) return "";
    if (points.length === 1)
      return `M ${x(points[0].pressure)} ${y(points[0].compliance)}`;
    let path = `M ${x(points[0].pressure)} ${y(points[0].compliance)}`;
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (x(points[i].pressure) + x(points[i + 1].pressure)) / 2,
        my = (y(points[i].compliance) + y(points[i + 1].compliance)) / 2;
      path += ` Q ${x(points[i].pressure)} ${y(points[i].compliance)} ${mx} ${my}`;
    }
    const last = points.at(-1)!;
    return `${path} Q ${x(last.pressure)} ${y(last.compliance)} ${x(last.pressure)} ${y(last.compliance)}`;
  };
  const peakPressure = Number(value.middleEarPressure),
    peakCompliance = Number(value.staticCompliance),
    hasPeak =
      value.middleEarPressure.trim() !== "" &&
      value.staticCompliance.trim() !== "" &&
      peakPressure >= -600 &&
      peakPressure <= 300 &&
      peakCompliance >= 0 &&
      peakCompliance <= 2.5;
  const updateReflex = (
    row: "ipsi" | "contra",
    frequency: keyof ReflexValues,
    text: string,
  ) => onChange({ [row]: { ...value[row], [frequency]: text } });
  const automaticPoints = hasPeak
    ? Array.from({ length: 51 }, (_, i) => {
        const offset = -300 + i * 10,
          span = offset < 0 ? 300 : 200,
          decay =
            (Math.exp((-4 * Math.abs(offset)) / span) - Math.exp(-4)) /
            (1 - Math.exp(-4));
        return {
          pressure: peakPressure + offset,
          compliance: peakCompliance * Math.max(0, decay),
        };
      }).filter((point) => point.pressure >= -600 && point.pressure <= 300)
    : [];
  return (
    <article className={`tymp-card ${side}`}>
      <div className="tymp-head">
        <div>
          <span className="ear-code">{side === "right" ? "R" : "L"}</span>
          <h3>گوش {side === "right" ? "راست" : "چپ"}</h3>
        </div>
        <div className="chart-tools">
          <button
            type="button"
            className={drawMode === "automatic" ? "selected" : ""}
            title="رسم خودکار"
            onClick={() => setDrawMode("automatic")}
          >
            خودکار
          </button>
          <button
            type="button"
            className={drawMode === "pencil" ? "selected" : ""}
            title="رسم دستی با مداد"
            onClick={() => setDrawMode("pencil")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m4 20 4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" />
              <path d="m14.5 6.5 3 3" />
            </svg>{" "}
            دستی
          </button>
          {drawMode === "pencil" && (
            <button
              type="button"
              disabled={!value.points.length}
              onClick={() => {
                pointsRef.current = [];
                onChange({ points: [] });
              }}
            >
              پاک کردن
            </button>
          )}
        </div>
      </div>
      <div className={`tymp-chart ${drawMode}`}>
        <svg
          viewBox="0 0 620 286"
          role="img"
          aria-label={`نمودار تمپانومتری گوش ${side === "right" ? "راست" : "چپ"}`}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={() => (drawing.current = false)}
          onPointerCancel={() => (drawing.current = false)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={plot.left} x2={plot.right} y1={y(v)} y2={y(v)} />
              <text x="43" y={y(v) + 4}>
                {v}
              </text>
            </g>
          ))}
          {xTicks.map((v) => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={plot.top} y2={plot.bottom} />
              <text x={x(v)} y="269">
                {v}
              </text>
            </g>
          ))}
          <text className="axis-label" x="18" y="13">
            ml
          </text>
          <text className="axis-label" x="580" y="283">
            daPa
          </text>
          {drawMode === "pencil" && value.points.length > 1 && (
            <path className="drawn-curve" d={smoothPath(value.points)} />
          )}{" "}
          {drawMode === "automatic" && automaticPoints.length > 1 && (
            <path
              className="drawn-curve automatic-curve"
              d={smoothPath(automaticPoints)}
            />
          )}{" "}
          {drawMode === "automatic" && hasPeak && (
            <g className="peak-marker">
              <line
                x1={x(peakPressure)}
                x2={x(peakPressure)}
                y1={y(peakCompliance)}
                y2={plot.bottom}
              />
              <line
                x1={plot.left}
                x2={x(peakPressure)}
                y1={y(peakCompliance)}
                y2={y(peakCompliance)}
              />
              <circle cx={x(peakPressure)} cy={y(peakCompliance)} r="7" />
              <text x={x(peakPressure) + 10} y={y(peakCompliance) - 10}>
                Peak
              </text>
            </g>
          )}
        </svg>
        <small>
          {drawMode === "pencil"
            ? "برای رسم آزاد، مداد را روی نمودار بکشید."
            : hasPeak
              ? "منحنی خودکار در فاصله ۳۰۰ daPa از چپ و ۲۰۰ daPa از راست قله به محور می‌رسد."
              : "برای نمایش منحنی خودکار، STAT.COMP و M.E.PRESS را وارد کنید."}
        </small>
      </div>
      <div className="tymp-fields">
        <label>
          <span>
            CANAL VOL <em>(cc)</em>
          </span>
          <input
            dir="ltr"
            inputMode="decimal"
            value={value.canalVolume}
            onChange={(e) => onChange({ canalVolume: e.target.value })}
          />
        </label>
        <label>
          <span>
            STAT.COMP <em>(ml)</em>
          </span>
          <input
            dir="ltr"
            inputMode="decimal"
            value={value.staticCompliance}
            onChange={(e) => onChange({ staticCompliance: e.target.value })}
          />
        </label>
        <label>
          <span>
            M.E.PRESS <em>(daPa)</em>
          </span>
          <input
            dir="ltr"
            inputMode="decimal"
            value={value.middleEarPressure}
            onChange={(e) => onChange({ middleEarPressure: e.target.value })}
          />
        </label>
        <label>
          <span>
            Gradient <em>(%)</em>
          </span>
          <input
            dir="ltr"
            inputMode="decimal"
            value={value.gradient}
            onChange={(e) => onChange({ gradient: e.target.value })}
          />
        </label>
        <label>
          <span>TYPE</span>
          <select
            value={value.type}
            onChange={(e) => onChange({ type: e.target.value })}
          >
            <option value="">انتخاب کنید</option>
            {["An", "As", "Ad", "C1", "C2", "B", "D", "E"].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="reflex-section">
        <h4>Acoustic Reflex</h4>
        <div
          className="reflex-table"
          role="table"
          aria-label={`رفلکس آکوستیک گوش ${side === "right" ? "راست" : "چپ"}`}
        >
          <span />
          <strong>500</strong>
          <strong>1KHz</strong>
          <strong>2KHz</strong>
          <strong>4KHz</strong>
          {(["ipsi", "contra"] as const).map((row) => (
            <React.Fragment key={row}>
              <b>{row === "ipsi" ? "IPSI" : "Contra"}</b>
              {(["hz500", "hz1k", "hz2k", "hz4k"] as const).map((frequency) => (
                <input
                  key={frequency}
                  dir="ltr"
                  value={value[row][frequency]}
                  onChange={(e) => updateReflex(row, frequency, e.target.value)}
                  aria-label={`${row} ${frequency}`}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
      <fieldset className="doctor-comment">
        <legend>Comment</legend>

        <label>
          <span>Dear Dr.</span>
          <input
            value={value.dearDoctor}
            onChange={(e) => onChange({ dearDoctor: e.target.value })}
          />
        </label>
        <label>
          <span>Tympanometry</span>
          <textarea
            rows={4}
            value={value.comment}
            onChange={(e) => onChange({ comment: e.target.value })}
          />
        </label>
      </fieldset>
    </article>
  );
}

function AudiometryCardView({
  side,
  value,
  onChange,
}: {
  side: "right" | "left";
  value: Audiometry;
  onChange: (value: Audiometry) => void;
}) {
  const plot = { left: 85, right: 790, top: 34, bottom: 424 };
  const yTicks = Array.from({ length: 14 }, (_, index) => -10 + index * 10);
  const x = (index: number) =>
    plot.left +
    (index / (audiometryFrequencies.length - 1)) * (plot.right - plot.left);
  const y = (threshold: number) =>
    plot.top + ((threshold + 10) / 130) * (plot.bottom - plot.top);
  const entered = (row: "ac" | "bc") =>
    audiometryFrequencies.flatMap((frequency, index) => {
      if (row === "bc" && frequency >= 6000) return [];
      const cell = value[row][frequency] || { value: "", modifier: "" },
        counterpartCell = value[row === "bc" ? "ac" : "bc"][frequency];
      const threshold = Number(cell.value),
        counterpart = Number(counterpartCell?.value);
      const violatesBoneGap =
        Boolean(counterpartCell?.value.trim()) &&
        Number.isFinite(counterpart) &&
        (row === "bc" ? threshold > counterpart : counterpart > threshold);
      return cell.value.trim() !== "" &&
        isValidAudiometryThreshold(cell.value) &&
        !violatesBoneGap
        ? [{ frequency, index, threshold, modifier: cell.modifier }]
        : [];
    });
  const updateCell = (
    row: "ac" | "bc",
    frequency: number,
    patch: Partial<AudiometryCell>,
  ) =>
    onChange({
      ...value,
      [row]: {
        ...value[row],
        [frequency]: {
          ...(value[row][frequency] || { value: "", modifier: "" }),
          ...patch,
        },
      },
    });
  const acPoints = entered("ac"),
    bcPoints = entered("bc");
  const lineSegments = (points: ReturnType<typeof entered>) =>
    points.slice(0, -1).map((point, index) => {
      const next = points[index + 1],
        dx = x(next.index) - x(point.index),
        dy = y(next.threshold) - y(point.threshold),
        distance = Math.hypot(dx, dy),
        startInset = point.modifier === "MD" ? 22 : 18,
        endInset = next.modifier === "MD" ? 22 : 18;
      return `${x(point.index) + (dx / distance) * startInset},${y(point.threshold) + (dy / distance) * startInset} ${x(next.index) - (dx / distance) * endInset},${y(next.threshold) - (dy / distance) * endInset}`;
    });
  const lines = (points: ReturnType<typeof entered>, className: string) =>
    lineSegments(points).map((segment, index) => (
      <polyline className={className} key={index} points={segment} />
    ));
  return (
    <article className={`audiometry-card ${side}`}>
      <header>
        <div>
          <span className="ear-code">{side === "right" ? "R" : "L"}</span>
          <div>
            <h3>گوش {side === "right" ? "راست" : "چپ"}</h3>
            <small>{side === "right" ? "Right ear" : "Left ear"}</small>
          </div>
        </div>
        <div className="audiometry-legend">
          <span className="ac-key">
            <img src={audiometryMarkerAsset(side, "ac")} alt="" /> AC
          </span>
          <span className="bc-key">
            <img src={audiometryMarkerAsset(side, "bc")} alt="" /> BC
          </span>
        </div>
      </header>
      <div className="audiogram">
        <svg
          viewBox="0 0 910 465"
          role="img"
          aria-label={`نمودار ادیومتری گوش ${side === "right" ? "راست" : "چپ"}`}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)} />
              <text x="42" y={y(tick) + 4}>
                {tick}
              </text>
            </g>
          ))}
          {audiometryFrequencies.map((frequency, index) => (
            <g key={frequency}>
              <line
                x1={x(index)}
                x2={x(index)}
                y1={plot.top}
                y2={plot.bottom}
              />
              <text x={x(index)} y="447">
                {frequency >= 1000 ? `${frequency / 1000}k` : frequency}
              </text>
            </g>
          ))}
          <text className="axis-title" x="18" y="22">
            dB HL
          </text>
          <text className="axis-title" x="830" y="462">
            Frequency (Hz)
          </text>
          {acPoints.length > 1 && lines(acPoints, "ac-line")}{" "}
          {bcPoints.length > 1 && lines(bcPoints, "bc-line")}{" "}
          {acPoints.map((point) => (
            <g className="ac-point" key={point.frequency}>
              <AudiometryMarker
                side={side}
                row="ac"
                modifier={point.modifier}
                x={x(point.index)}
                y={y(point.threshold)}
              />
            </g>
          ))}
          {bcPoints.map((point) => (
            <g className="bc-point" key={point.frequency}>
              <AudiometryMarker
                side={side}
                row="bc"
                modifier={point.modifier}
                x={x(point.index)}
                y={y(point.threshold)}
              />
            </g>
          ))}
        </svg>
      </div>
      <div className="audiometry-table-wrap">
        <table className="audiometry-table" dir="ltr">
          <thead>
            <tr>
              <th>Path</th>
              {audiometryFrequencies.map((frequency) => (
                <th key={frequency}>
                  {frequency}
                  <small>Hz</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["ac", "bc"] as const).map((row) => (
              <tr key={row}>
                <th>
                  <strong>{row.toUpperCase()}</strong>
                  <small>{row === "ac" ? "Air" : "Bone"}</small>
                </th>
                {audiometryFrequencies.map((frequency) => {
                  const cell = value[row][frequency] || {
                    value: "",
                    modifier: "",
                  };
                  const invalidBoneGap =
                    row === "bc" &&
                    isInvalidBoneConductionGap(value, frequency);
                  return (
                    <td
                      key={frequency}
                      className={invalidBoneGap ? "invalid-bone-gap" : undefined}
                    >
                      <input
                        className={invalidBoneGap ? "invalid-bone-gap" : undefined}
                        type="number"
                        min="-10"
                        max="120"
                        step="5"
                        value={cell.value}
                        onChange={(event) =>
                          updateCell(row, frequency, {
                            value: event.target.value,
                          })
                        }
                        aria-label={`${row.toUpperCase()} ${frequency} Hz threshold`}
                        aria-invalid={invalidBoneGap}
                        placeholder="dB"
                      />
                      <select
                        value={cell.modifier}
                        onChange={(event) =>
                          updateCell(row, frequency, {
                            modifier: event.target.value as AudiometryModifier,
                          })
                        }
                        aria-label={`${row.toUpperCase()} ${frequency} Hz modifier`}
                      >
                        <option value="">—</option>
                        <option value="M">M</option>
                        <option value="NR">NR</option>
                        <option value="MD">MD</option>
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function AudiometryCard({
  side,
  value,
  onChange,
}: {
  side: "right" | "left";
  value: Audiometry;
  onChange: (value: Audiometry) => void;
}) {
  const [draft, setDraft] = useState(value);
  const valueSignature = JSON.stringify(value);
  const syncDraft = useEffectEvent(() => setDraft(value));

  useEffect(() => {
    startTransition(syncDraft);
  }, [valueSignature]);

  const handleChange = (next: Audiometry) => {
    setDraft(next);
    for (const row of ["ac", "bc"] as const) {
      for (const frequency of audiometryFrequencies) {
        const previousCell = value[row][frequency] || {
          value: "",
          modifier: "",
        };
        const nextCell = next[row][frequency] || { value: "", modifier: "" };
        if (previousCell.value === nextCell.value) continue;
        if (!isValidAudiometryThreshold(nextCell.value)) return;

        const acValue =
          row === "ac" ? nextCell.value : next.ac[frequency]?.value || "";
        const bcValue =
          row === "bc" ? nextCell.value : next.bc[frequency]?.value || "";
        if (
          acValue.trim() &&
          bcValue.trim() &&
          Number(bcValue) > Number(acValue)
        )
          return;
      }
    }
    onChange(next);
  };

  const acAverageFrequencies = [500, 1000, 2000] as const;
  const acAverageValues = acAverageFrequencies
    .map((frequency) => draft.ac[frequency])
    .map((cell) =>
      cell?.value.trim() && isValidAudiometryThreshold(cell.value)
        ? Number(cell.value)
        : null,
    );
  const acAverage = acAverageValues.every((value) => value !== null)
    ? acAverageValues.reduce((sum, value) => sum + value, 0) /
      acAverageValues.length
    : null;

  return (
    <>
      <AudiometryCardView side={side} value={draft} onChange={handleChange} />
      <div className={`pure-tone-average ${side}`} dir="ltr">
        <div>
          <span>AC AVG (500, 1000, 2000 Hz)</span>
          <strong>
            {acAverage === null ? "—" : `${acAverage.toFixed(1)} dB HL`}
          </strong>
        </div>
      </div>
    </>
  );
}

function WeberIndicator({ value }: { value: WeberResult }) {
  if (!value) return <span className="weber-empty">—</span>;
  return (
    <span className="weber-indicator" aria-hidden="true">
      {(value === "left" || value === "both") && (
        <span className="weber-arrow left">←</span>
      )}
      {(value === "right" || value === "both") && (
        <span className="weber-arrow right">→</span>
      )}
    </span>
  );
}

function weberLabel(value: WeberResult) {
  return value === "left"
    ? "Right"
    : value === "right"
      ? "Left"
      : value === "both"
        ? "Both"
        : "Not recorded";
}

function SpeechAudiometryPanel({
  values,
  onChange,
}: {
  values: Record<"right" | "left", SpeechAudiometry>;
  onChange: (
    side: "right" | "left",
    field: SpeechAudiometryField,
    value: string,
  ) => void;
}) {
  const conditions = [
    { label: "In Quiet", fields: ["srt", "mcl", "ucl"] as const },
    {
      label: "In Noise",
      fields: ["srtNoise", "mclNoise", "uclNoise"] as const,
    },
  ];
  return (
    <section className="speech-audiometry" dir="ltr">
      <div className="speech-audiometry-heading">
        <h3>Speech Audiometry</h3>
        <small>MCL = SRT + 30 dB</small>
      </div>
      <div className="speech-audiometry-ears">
        {(["right", "left"] as const).map((side) => (
          <fieldset className={side} key={side}>
            <legend>{side === "right" ? "Right Ear" : "Left Ear"}</legend>
            {conditions.map(({ label: condition, fields }) => (
              <div className="speech-audiometry-condition" key={condition}>
                <h4>{condition}</h4>
                {fields.map((field, index) => {
                  const label = ["SRT", "MCL", "UCL"][index];
                  return (
                    <label key={field}>
                      <span>
                        {label}{" "}
                        <small>{label === "UCL" ? "%" : "dB HL"}</small>
                      </span>
                      <input
                        type="number"
                        step="5"
                        value={values[side][field]}
                        onChange={(event) =>
                          onChange(side, field, event.target.value)
                        }
                        aria-label={`${side} ear ${label} (${condition})`}
                      />
                    </label>
                  );
                })}
              </div>
            ))}
          </fieldset>
        ))}
      </div>
    </section>
  );
}

function AudiometricTestsPanel({
  value,
  onChange,
}: {
  value: AudiometricTests;
  onChange: (value: AudiometricTests) => void;
}) {
  const updateRinne = (side: "right" | "left", result: RinneResult) =>
    onChange({ ...value, rinne: { ...value.rinne, [side]: result } });
  const updateWeber = (frequency: number, result: WeberResult) =>
    onChange({ ...value, weber: { ...value.weber, [frequency]: result } });
  return (
    <section className="audiometric-tests" dir="ltr">
      <div className="rinne-controls">
        {(["right", "left"] as const).map((side) => (
          <label key={side}>
            <span>Rinne {side === "right" ? "RE" : "LE"}</span>
            <select
              value={value.rinne[side]}
              onChange={(event) =>
                updateRinne(side, event.target.value as RinneResult)
              }
            >
              <option value="">Select</option>
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
            </select>
          </label>
        ))}
      </div>
      <div className="weber-controls">
        <div className="weber-heading">
          <strong>Weber Audiometric</strong>
          <small>Red: right / Blue: left</small>
        </div>
        <div className="weber-frequency-grid">
          {weberFrequencies.map((frequency) => (
            <label key={frequency}>
              <span>{frequency} Hz</span>
              <span
                className={`weber-select ${value.weber[frequency] || "empty"}`}
              >
                <select
                  aria-label={`Weber ${frequency} Hz`}
                  value={value.weber[frequency]}
                  onChange={(event) =>
                    updateWeber(frequency, event.target.value as WeberResult)
                  }
                >
                  <option value="">Select</option>
                  <option value="left">← Right</option>
                  <option value="right">→ Left</option>
                  <option value="both">← → Both</option>
                </select>
                <span className="weber-selected">
                  <WeberIndicator value={value.weber[frequency]} />
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function CombinedDoctorComment({
  dearDoctor,
  comment,
  onDearDoctorChange,
  onCommentChange,
  resultTitle = "Tympanometry Result",
  action,
}: {
  dearDoctor: string;
  comment: string;
  onDearDoctorChange: (text: string) => void;
  onCommentChange: (text: string) => void;
  resultTitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <fieldset className="combined-comment">
      <legend>Comment</legend>
      {action}
      <label className="dear-doctor">
        <span>Dear Dr.</span>
        <input
          value={dearDoctor}
          onChange={(e) => onDearDoctorChange(e.target.value)}
          placeholder="نام یا پیام خطاب به پزشک"
        />
      </label>
      <div className="result-heading">
        <strong>{resultTitle}</strong>
        <small>نتیجه مشترک هر دو گوش را ثبت کنید.</small>
      </div>
      <div className="rich-results">
        <RichTextEditor
          side="both"
          value={comment}
          onChange={onCommentChange}
        />
      </div>
    </fieldset>
  );
}

function RichTextEditor({
  side,
  value,
  onChange,
}: {
  side: "right" | "left" | "both";
  value: string;
  onChange: (text: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== value) editor.innerHTML = value;
  }, [value]);
  const format = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    onChange(editorRef.current?.innerHTML || "");
  };
  return (
    <section className={`rich-editor ${side}`}>
      <header>
        {side !== "both" && (
          <span className="ear-code">{side === "right" ? "R" : "L"}</span>
        )}
        <strong>
          {side === "both"
            ? "نتیجه هر دو گوش"
            : `گوش ${side === "right" ? "راست" : "چپ"}`}
        </strong>
      </header>
      <div className="rich-toolbar" dir="ltr">
        <button
          type="button"
          title="Bold"
          onMouseDown={(e) => {
            e.preventDefault();
            format("bold");
          }}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          title="Underline"
          onMouseDown={(e) => {
            e.preventDefault();
            format("underline");
          }}
        >
          <u>U</u>
        </button>
      </div>
      <div
        ref={editorRef}
        className="rich-input"
        contentEditable
        suppressContentEditableWarning
        dir="auto"
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        data-placeholder="گزارش برای پزشک را وارد کنید..."
      />
    </section>
  );
}
