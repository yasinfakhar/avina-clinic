"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatJalali, jalaaliMonthLength, parseJalali, todayJalali, weekdayOffset } from "../jalali-date";

const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

const fa = (n: number) => n.toLocaleString("fa-IR");

type BirthDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  compact?: boolean;
};

export function BirthDatePicker({
  value,
  onChange,
  placeholder = "۱۳۷۰/۰۱/۰۱",
  ariaLabel = "انتخاب تاریخ تولد",
  compact = false,
}: BirthDatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseJalali(value), [value]);
  const [view, setView] = useState(() => selected ?? todayJalali());

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
        style={compact ? { height: 40 } : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) setView(selected ?? todayJalali());
          setOpen((current) => !current);
        }}
      >
        <span>{value || placeholder}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      {open && (
        <div
          className="birth-datepicker-panel"
          role="dialog"
          aria-label={ariaLabel}
          style={compact ? { right: 0, left: "auto", width: 280 } : undefined}
        >
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
