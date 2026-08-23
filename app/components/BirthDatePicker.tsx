"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

const toEnglishDigits = (value: string) =>
  value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

const toPersianDigits = (value: string | number) =>
  String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

const fa = (n: number) => n.toLocaleString("fa-IR");

function jalCal(jy: number) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const bl = breaks.length;
  let gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jm: number;
  let jump: number;
  let leap: number;
  let n: number;
  let i: number;

  if (jy < jp || jy >= breaks[bl - 1]) throw new Error("Invalid Jalali year");

  for (i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += Math.floor(jump / 33) * 8 + Math.floor((jump % 33) / 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ += Math.floor(n / 33) * 8 + Math.floor(((n % 33) + 3) / 4);
  if ((jump % 33) === 4 && jump - n === 4) leapJ += 1;
  leap = Math.floor(((gy % 4) + 2) % 4);
  if (leap === 0 && n === 0 && (jump % 33) === 4) leap = -1;
  return { leap, gy };
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, 21) + (jm - 1) * 31 - Math.floor(jm / 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, 21);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + Math.floor(k / 31), jd: (k % 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + Math.floor(k / 30), jd: (k % 30) + 1 };
}

function g2d(gy: number, gm: number, gd: number) {
  let d =
    Math.floor((gy + Math.floor((gm - 8) / 6) + 100100) * 1461 / 4) +
    Math.floor(153 * ((gm + 9) % 12) + 2) / 5 +
    gd -
    34840408;
  d -= Math.floor(Math.floor((gy + 100100 + Math.floor((gm - 8) / 6)) / 100) * 3 / 4) + 752;
  return d;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631 + Math.floor(Math.floor((4 * jdn + 183187720) / 146097) * 3 / 4) * 4 - 3908;
  const i = Math.floor(((j % 1461) / 4)) * 5 + 308;
  const gd = (i % 153) + 1;
  const gm = Math.floor(i / 153) % 12 + 1;
  const gy = Math.floor(j / 1461) - 100100 + Math.floor((8 - gm) / 6);
  return { gy, gm, gd };
}

function jalaaliMonthLength(jy: number, jm: number) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalCal(jy).leap === 0 ? 30 : 29;
}

function todayJalali() {
  const now = new Date();
  return d2j(g2d(now.getFullYear(), now.getMonth() + 1, now.getDate()));
}

function parseJalali(value: string) {
  const parts = toEnglishDigits(value.trim()).split("/").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [jy, jm, jd] = parts;
  if (jm < 1 || jm > 12 || jd < 1 || jd > jalaaliMonthLength(jy, jm)) return null;
  return { jy, jm, jd };
}

function formatJalali(jy: number, jm: number, jd: number) {
  return `${toPersianDigits(String(jy).padStart(4, "0"))}/${toPersianDigits(String(jm).padStart(2, "0"))}/${toPersianDigits(String(jd).padStart(2, "0"))}`;
}

function weekdayOffset(jy: number, jm: number) {
  const { gy, gm, gd } = d2g(j2d(jy, jm, 1));
  const day = new Date(gy, gm - 1, gd).getDay();
  return (day + 1) % 7;
}

type BirthDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function BirthDatePicker({ value, onChange, placeholder = "۱۳۷۰/۰۱/۰۱" }: BirthDatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseJalali(value), [value]);
  const [view, setView] = useState(() => selected ?? todayJalali());

  useEffect(() => {
    if (open) setView(selected ?? todayJalali());
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const monthLength = jalaaliMonthLength(view.jy, view.jm);
  const offset = weekdayOffset(view.jy, view.jm);
  const days = Array.from({ length: offset + monthLength }, (_, i) => (i < offset ? 0 : i - offset + 1));

  const shiftMonth = (delta: number) => {
    setView((current) => {
      let jm = current.jm + delta;
      let jy = current.jy;
      while (jm > 12) { jm -= 12; jy += 1; }
      while (jm < 1) { jm += 12; jy -= 1; }
      return { jy, jm, jd: 1 };
    });
  };

  const setYear = (year: number) => {
    setView((current) => ({ ...current, jy: year }));
  };

  const setMonth = (month: number) => {
    setView((current) => ({ ...current, jm: month }));
  };

  const pickDay = (day: number) => {
    onChange(formatJalali(view.jy, view.jm, day));
    setOpen(false);
  };

  return (
    <div className="birth-datepicker" ref={rootRef}>
      <button
        type="button"
        className={`birth-datepicker-trigger${value ? " has-value" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value || placeholder}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      {open && (
        <div className="birth-datepicker-panel" role="dialog" aria-label="انتخاب تاریخ تولد">
          <div className="birth-datepicker-head">
            <button type="button" aria-label="ماه قبل" onClick={() => shiftMonth(-1)}>‹</button>
            <div className="birth-datepicker-selectors">
              <select
                value={view.jm}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="birth-datepicker-month-select"
              >
                {PERSIAN_MONTHS.map((month, index) => (
                  <option key={month} value={index + 1}>{month}</option>
                ))}
              </select>
              <select
                value={view.jy}
                onChange={(e) => setYear(Number(e.target.value))}
                className="birth-datepicker-year-select"
              >
                {Array.from({ length: 100 }, (_, i) => todayJalali().jy - 80 + i).map((year) => (
                  <option key={year} value={year}>{fa(year)}</option>
                ))}
              </select>
            </div>
            <button type="button" aria-label="ماه بعد" onClick={() => shiftMonth(1)}>›</button>
          </div>
          <div className="birth-datepicker-weekdays">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="birth-datepicker-days">
            {days.map((day, index) => (
              day === 0
                ? <span key={`empty-${index}`} className="birth-datepicker-empty" />
                : (
                  <button
                    key={day}
                    type="button"
                    className={selected?.jy === view.jy && selected?.jm === view.jm && selected?.jd === day ? "selected" : ""}
                    onClick={() => pickDay(day)}
                  >
                    {fa(day)}
                  </button>
                )
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
