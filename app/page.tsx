"use client";

import React, { startTransition, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BirthDatePicker } from "./components/BirthDatePicker";
import { AutocompleteInput } from "./components/AutocompleteInput";
import { ImageAnnotator } from "./components/ImageAnnotator";

type Arrow = { startX: number; startY: number; endX: number; endY: number; normalized?: boolean };
type TympanometryPoint = { pressure: number; compliance: number };
type ReflexValues = { hz500: string; hz1k: string; hz2k: string; hz4k: string };
type Tympanometry = { canalVolume: string; staticCompliance: string; middleEarPressure: string; gradient: string; type: string; points: TympanometryPoint[]; ipsi: ReflexValues; contra: ReflexValues; dearDoctor: string; comment: string };
type AudiometryModifier = "" | "M" | "NR" | "MD";
type AudiometryCell = { value: string; modifier: AudiometryModifier };
type AudiometryRow = Record<string, AudiometryCell>;
type Audiometry = { ac: AudiometryRow; bc: AudiometryRow };
type SpeechAudiometry = { srt: string; mcl: string; ucl: string };
type RinneResult = "" | "positive" | "negative";
type WeberResult = "" | "left" | "right" | "both";
type AudiometricTests = { rinne: Record<"right" | "left", RinneResult>; weber: Record<string, WeberResult>; dearDoctor: string; comments: Record<"right" | "left", string> };
type Ear = { result: string; imageName: string; imageDataUrl?: string; originalImageDataUrl?: string; arrows?: Arrow[]; tympanometry?: Tympanometry; audiometry?: Audiometry; speechAudiometry?: SpeechAudiometry };
type RecordItem = {
  id: string; doctorName: string; fullName: string; nationalId: string;
  birthDate: string; right: Ear; left: Ear; audiometricTests?: AudiometricTests; status: "draft" | "completed"; updatedAt: string;
};

const seed: RecordItem[] = [
  { id: "A-1405-021", doctorName: "دکتر سمیرا محمدی جوزدانی", fullName: "سارا احمدی", nationalId: "۰۰۱۲۳۴۵۶۷۸", birthDate: "۱۳۷۲/۰۸/۱۴", right: { result: "Normal TM", imageName: "right-ear.jpg" }, left: { result: "Normal TM", imageName: "left-ear.jpg" }, status: "completed", updatedAt: "امروز، ۱۰:۳۵" },
  { id: "A-1405-020", doctorName: "دکتر سمیرا محمدی جوزدانی", fullName: "محمد رضایی", nationalId: "۰۴۵۶۷۸۹۱۲۳", birthDate: "۱۳۶۵/۰۲/۲۹", right: { result: "O4", imageName: "" }, left: { result: "", imageName: "" }, status: "draft", updatedAt: "دیروز، ۱۶:۲۰" },
  { id: "A-1405-019", doctorName: "دکتر سمیرا محمدی جوزدانی", fullName: "مریم کریمی", nationalId: "۲۲۸۹۱۲۳۴۵۶", birthDate: "۱۳۸۰/۱۱/۰۵", right: { result: "Normal TM", imageName: "" }, left: { result: "Normal TM", imageName: "" }, status: "completed", updatedAt: "۲ مرداد ۱۴۰۵" },
];

const emptyRecord = (): RecordItem => ({
  id: `A-${Date.now().toString().slice(-6)}`, doctorName: "", fullName: "", nationalId: "",
  birthDate: "", right: { result: "", imageName: "", imageDataUrl: "", originalImageDataUrl: "", arrows: [] }, left: { result: "", imageName: "", imageDataUrl: "", originalImageDataUrl: "", arrows: [] },
  audiometricTests: emptyAudiometricTests(), status: "draft", updatedAt: "همین حالا",
});
const emptyReflex = (): ReflexValues => ({ hz500: "", hz1k: "", hz2k: "", hz4k: "" });
const emptyTympanometry = (): Tympanometry => ({ canalVolume: "", staticCompliance: "", middleEarPressure: "", gradient: "", type: "", points: [], ipsi: emptyReflex(), contra: emptyReflex(), dearDoctor: "", comment: "" });
const audiometryFrequencies = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000] as const;
const weberFrequencies = [250, 500, 1000, 2000, 4000] as const;
const emptyAudiometryRow = (): AudiometryRow => Object.fromEntries(audiometryFrequencies.map(frequency => [frequency, { value: "", modifier: "" }]));
const emptySpeechAudiometry = (): SpeechAudiometry => ({ srt: "", mcl: "", ucl: "" });
const normalizeSpeechAudiometry = (value?: SpeechAudiometry): SpeechAudiometry => {
  const normalized = { ...emptySpeechAudiometry(), ...value };
  const srt = normalized.srt;
  const threshold = Number(srt);
  const automaticMcl = srt.trim() && Number.isFinite(threshold) ? String(threshold + 30) : "";
  return { ...normalized, mcl: normalized.mcl.trim() ? normalized.mcl : automaticMcl };
};
const emptyAudiometricTests = (): AudiometricTests => ({ rinne: { right: "", left: "" }, weber: Object.fromEntries(weberFrequencies.map(frequency => [frequency, ""])), dearDoctor: "", comments: { right: "", left: "" } });
const normalizeAudiometricTests = (value?: AudiometricTests): AudiometricTests => ({
  rinne: { ...emptyAudiometricTests().rinne, ...value?.rinne },
  weber: { ...emptyAudiometricTests().weber, ...value?.weber },
  dearDoctor: value?.dearDoctor || "",
  comments: { ...emptyAudiometricTests().comments, ...value?.comments },
});
const AUDIOMETRY_MIN = -10;
const AUDIOMETRY_MAX = 120;
const AUDIOMETRY_STEP = 5;

function isValidAudiometryThreshold(value: string) {
  if (value.trim() === "") return true;
  const threshold = Number(value);
  return Number.isFinite(threshold) && threshold >= AUDIOMETRY_MIN && threshold <= AUDIOMETRY_MAX && threshold % AUDIOMETRY_STEP === 0;
}

function copyAudiometry(value?: Audiometry): Audiometry {
  const copied: Audiometry = {
    ac: Object.fromEntries(audiometryFrequencies.map(frequency => [frequency, { ...(value?.ac[frequency] || { value: "", modifier: "" }) }])),
    bc: Object.fromEntries(audiometryFrequencies.map(frequency => [frequency, { ...(value?.bc[frequency] || { value: "", modifier: "" }) }])),
  };
  for (const frequency of audiometryFrequencies) {
    const acValue = copied.ac[frequency].value;
    const bcValue = copied.bc[frequency].value;
    if (!isValidAudiometryThreshold(acValue)) copied.ac[frequency].value = "";
    if (!isValidAudiometryThreshold(bcValue) || (acValue.trim() && Number(bcValue) > Number(acValue))) copied.bc[frequency].value = "";
  }
  return copied;
}

function audiometryMarkerAsset(side: "right" | "left", row: "ac" | "bc", modifier: AudiometryModifier = "") {
  if (row === "ac") {
    if (modifier === "NR") return side === "right" ? "/audiometry/05_RE_AC_triangle_no_response.svg" : "/audiometry/07_LE_AC_square_no_response.svg";
    if (modifier === "") return side === "right" ? "/audiometry/01_RE_AC_circle.svg" : "/audiometry/03_LE_AC_multiply.svg";
    return side === "right" ? "/audiometry/01_RE_AC_triangle.svg" : "/audiometry/03_LE_AC_square.svg";
  }
  if (modifier === "NR") return side === "right" ? "/audiometry/06_RE_BC_left_bracket_no_response.svg" : "/audiometry/08_LE_BC_right_bracket_no_response.svg";
  if (modifier === "") return side === "right" ? "/audiometry/09_RE_BC_unmasked_less_than.svg" : "/audiometry/10_LE_BC_unmasked_greater_than.svg";
  if (modifier === "MD") return side === "right" ? "/audiometry/less_than_MD.svg" : "/audiometry/greater_than_MD.svg";
  return side === "right" ? "/audiometry/02_RE_BC_left_bracket.svg" : "/audiometry/04_LE_BC_right_bracket.svg";
}

function AudiometryMarker({ side, row, modifier, x, y }: { side: "right" | "left"; row: "ac" | "bc"; modifier: AudiometryModifier; x: number; y: number }) {
  const size = modifier === "MD" ? 58 : 48;
  const frequencyIndex = Math.round((x - 85) / (790 - 85) * (audiometryFrequencies.length - 1));
  const frequency = audiometryFrequencies[frequencyIndex];
  const threshold = Math.round((y - 34) / (424 - 34) * 130 - 10);
  const label = `${row.toUpperCase()}، ${frequency} هرتز، ${threshold} دسی‌بل`;
  return <g className="audiometry-marker" role="img" aria-label={label} tabIndex={0}><title>{label}</title><circle cx={x} cy={y} r="11" style={{fill:"transparent",stroke:"none"}}/><image href={audiometryMarkerAsset(side, row, modifier)} x={x - size/2} y={y - size/2} width={size} height={size} aria-hidden="true" preserveAspectRatio="xMidYMid meet" /></g>;
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    ear: <><path d="M6 10a6 6 0 1 1 12 0c0 5-4 4-4 8a3 3 0 0 1-6 0"/><path d="M9.5 10a2.5 2.5 0 1 1 4.5 1.5c-1 1.5-2.5 1.5-2.5 3.5"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
    print: <><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 16H6L5 6M10 11v6M14 11v6"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></>,
    sms: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3v-15a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></>,
    tympanometry: <><path d="M3 12h3l2-7 4 14 3-10 2 3h4"/><path d="M4 21h16"/></>,
    audiometry: <><path d="M4 14v-4M8 17V7M12 20V4M16 17V7M20 14v-4"/></>,
    arrowLeft: <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>,
    arrowRight: <><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>,
    back: <path d="m9 18 6-6-6-6"/>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function ActionButton({ icon, label, onClick }: { icon: string; label: string; onClick?: () => void }) {
  return <button className="icon-btn" title={label} aria-label={label} onClick={onClick}><Icon name={icon}/></button>;
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [view, setView] = useState<"dashboard" | "wizard">("dashboard");
  const [step, setStep] = useState(1);
  const [records, setRecords] = useState<RecordItem[]>(seed);
  const [current, setCurrent] = useState<RecordItem>(emptyRecord);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("audiology-records");
    if (saved) {
      const parsed = JSON.parse(saved) as Array<RecordItem & { fileName?: string }>;
      startTransition(() => setRecords(parsed.map(({ fileName, ...record }) => ({ ...record, doctorName: record.doctorName || fileName || "" }))));
    }
    setLoggedIn(sessionStorage.getItem("audiology-login") === "yes");
  }, []);

  useEffect(() => {
    if (!loggedIn || view !== "wizard") return;
    const timer = setTimeout(() => {
      const next = records.some(r => r.id === current.id)
        ? records.map(r => r.id === current.id ? { ...current, status: "draft" as const, updatedAt: "همین حالا" } : r)
        : [{ ...current, status: "draft" as const, updatedAt: "همین حالا" }, ...records];
      setRecords(next); localStorage.setItem("audiology-records", JSON.stringify(next));
    }, 350);
    return () => clearTimeout(timer);
  }, [current, step, view, loggedIn]);

  const filtered = useMemo(() => records.filter(r => `${r.fullName} ${r.nationalId} ${r.doctorName}`.includes(query)), [records, query]);
  const notify = (message: string) => { setToast(message); setTimeout(() => setToast(""), 2600); };
  const openNew = () => { setCurrent(emptyRecord()); setStep(1); setView("wizard"); };
  const openRecord = (record: RecordItem) => { setCurrent(record); setStep(record.status === "completed" ? 5 : 1); setView("wizard"); };
  const save = () => {
    const done = { ...current, status: "completed" as const, updatedAt: "همین حالا" };
    const next = records.map(r => r.id === done.id ? done : r);
    setRecords(next); localStorage.setItem("audiology-records", JSON.stringify(next)); setCurrent(done);
    notify("تشخیص با موفقیت ثبت شد");
  };
  const remove = (id: string) => {
    const next = records.filter(r => r.id !== id); setRecords(next);
    localStorage.setItem("audiology-records", JSON.stringify(next)); notify("پرونده حذف شد");
  };

  if (!loggedIn) return <Login onLogin={() => { sessionStorage.setItem("audiology-login", "yes"); setLoggedIn(true); }} />;

  return (
    <main dir="rtl">
      <header className="topbar">
        <div className="brand"><img className="brand-mark" src="/avina-logo-transparent.png" alt="لوگوی آوینا"/><div><strong>آوینا</strong><small>سامانه مدیریت شنوایی‌سنجی</small></div></div>
        <div className="profile"><span className="avatar">د</span><div><strong>سمیرا محمدی </strong><small>Audiologist</small></div><button className="logout" onClick={() => { sessionStorage.removeItem("audiology-login"); setLoggedIn(false); }}><Icon name="logout"/></button></div>
      </header>
      {view === "dashboard" ? (
        <section className="shell">
          <div className="hero-row"><div><p className="eyebrow">مدیریت مراجعین</p><h1>پرونده‌های شنوایی‌سنجی</h1><p>اطلاعات بیماران، تشخیص‌ها و گزارش‌های ثبت‌شده را مدیریت کنید.</p></div><button className="primary" onClick={openNew}><Icon name="plus"/> ثبت تشخیص جدید</button></div>
          <div className="stats">
            <article><span className="stat-icon blue"><Icon name="users"/></span><div><small>کل پرونده‌ها</small><strong>{records.length.toLocaleString("fa-IR")}</strong></div></article>
            <article><span className="stat-icon green"><Icon name="file"/></span><div><small>تشخیص‌های تکمیل‌شده</small><strong>{records.filter(r => r.status === "completed").length.toLocaleString("fa-IR")}</strong></div></article>
            <article><span className="stat-icon amber"><Icon name="file"/></span><div><small>پیش‌نویس‌ها</small><strong>{records.filter(r => r.status === "draft").length.toLocaleString("fa-IR")}</strong></div></article>
          </div>
          <div className="panel">
            <div className="panel-head"><div><h2>فهرست بیماران</h2><p>{records.length.toLocaleString("fa-IR")} پرونده در سامانه</p></div><label className="search"><Icon name="search"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="جستجو نام، کد ملی یا پزشک..."/></label></div>
            <div className="table-wrap"><table><thead><tr><th>بیمار</th><th>پزشک معالج</th><th>کد ملی</th><th>آخرین بروزرسانی</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>
              {filtered.map(r => <tr key={r.id}><td><div className="patient"><span>{r.fullName.slice(0,1) || "؟"}</span><strong>{r.fullName || "بدون نام"}</strong></div></td><td>{r.doctorName || "—"}</td><td className="ltr">{r.nationalId || "—"}</td><td>{r.updatedAt}</td><td><span className={`badge ${r.status}`}>{r.status === "completed" ? "تکمیل‌شده" : "پیش‌نویس"}</span></td><td><div className="actions"><ActionButton icon="eye" label="مشاهده پرونده" onClick={() => openRecord(r)}/><ActionButton icon="print" label="پرینت" onClick={() => { setCurrent(r); setTimeout(() => window.print(), 60); }}/><ActionButton icon="file" label="ذخیره PDF" onClick={() => notify("پنجره چاپ باز می‌شود؛ گزینه Save as PDF را انتخاب کنید")}/><ActionButton icon="trash" label="حذف" onClick={() => remove(r.id)}/></div></td></tr>)}
            </tbody></table></div>
          </div>
        </section>
      ) : <Wizard step={step} setStep={setStep} record={current} setRecord={setCurrent} onBack={() => setView("dashboard")} onSave={save} notify={notify}/>}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [show, setShow] = useState(false);
  return <main className="login-page" dir="rtl"><section className="login-card"><img className="login-logo" src="/avina-logo-transparent.png" alt="لوگوی آوینا"/><h1>ورود به سامانه آوینا</h1><p>مدیریت یکپارچه پرونده‌های شنوایی‌سنجی</p><form onSubmit={e => { e.preventDefault(); onLogin(); }}><label>نام کاربری<input required placeholder="نام کاربری خود را وارد کنید"/></label><label>رمز عبور<div className="password"><input required type={show ? "text" : "password"} placeholder="••••••••"/><button type="button" onClick={() => setShow(!show)}><Icon name="eye"/></button></div></label><div className="login-options"><label><input type="checkbox"/> مرا به خاطر بسپار</label><a href="#">فراموشی رمز عبور</a></div><button className="primary wide">ورود به سامانه</button></form><small>نسخه ۱.۰ · سامانه تخصصی کلینیک شنوایی</small></section></main>;
}

function Wizard({ step, setStep, record, setRecord, onBack, onSave, notify }: { step: number; setStep: (n: number) => void; record: RecordItem; setRecord: (r: RecordItem) => void; onBack: () => void; onSave: () => void; notify: (s: string) => void }) {
  const [annotatingSide, setAnnotatingSide] = useState<"right" | "left" | null>(null);
  const audiometricTests = normalizeAudiometricTests(record.audiometricTests);
  const update = (key: keyof RecordItem, value: string) => setRecord({ ...record, [key]: value });
  const updateEar = (side: "right" | "left", patch: Partial<Ear>) => setRecord({ ...record, [side]: { ...record[side], ...patch } });
  const updateTympanometry = (side: "right" | "left", patch: Partial<Tympanometry>) => updateEar(side, { tympanometry: { ...emptyTympanometry(), ...record[side].tympanometry, ...patch } });
  const updateAudiometry = (side: "right" | "left", value: Audiometry) => updateEar(side, { audiometry: value });
  const updateSpeechAudiometry = (side: "right" | "left", field: "srt" | "mcl" | "ucl", value: string) => {
    const current = normalizeSpeechAudiometry(record[side].speechAudiometry);
    const next = { ...current, [field]: value };
    if (field === "srt") {
      const threshold = Number(value);
      next.mcl = value.trim() && Number.isFinite(threshold) ? String(threshold + 30) : "";
    }
    updateEar(side, { speechAudiometry: next });
  };
  const copyAudiometryTo = (from: "right" | "left", to: "right" | "left") => {
    updateEar(to, { audiometry: copyAudiometry(record[from].audiometry) });
    notify(`اطلاعات ادیومتری گوش ${from === "right" ? "راست" : "چپ"} به گوش ${to === "right" ? "راست" : "چپ"} کپی شد`);
  };
  const canNext = step !== 1 || (record.doctorName && record.fullName && record.nationalId && record.birthDate);
  const handleImageUpload = (side: "right" | "left", file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateEar(side, { imageName: file.name, imageDataUrl: reader.result as string, originalImageDataUrl: reader.result as string, arrows: [] });
    reader.readAsDataURL(file);
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
              <button type="button" className={`step ${step >= s.n ? "active" : ""} ${step === s.n ? "current" : ""}`} onClick={() => setStep(s.n)} key={s.n}>
                <span>{step > s.n ? "✓" : s.n.toLocaleString("fa-IR")}</span>
                <div>
                  <strong>{s.t}</strong>
                </div>
              </button>
            ))}
          </div>
          <div className="wizard-actions">
            <button className="secondary" disabled={step === 1} onClick={() => setStep(step - 1)}>
              مرحله قبلی
            </button>
            {step < 5 ? (
              <button className="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
                مرحله بعد
              </button>
            ) : (
              <button className="primary" onClick={onSave}>
                ثبت نهایی تشخیص
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
                    نام و نام خانوادگی <b>*</b>
                  </span>
                  <input value={record.fullName} onChange={(e) => update("fullName", e.target.value)} placeholder="نام کامل بیمار" />
                </label>
                <label>
                  <span>
                    نام پزشک معالج <b>*</b>
                  </span>
                  <input value={record.doctorName} onChange={(e) => update("doctorName", e.target.value)} placeholder="نام پزشک معالج" />
                </label>
                <label>
                  <span>
                    کد ملی <b>*</b>
                  </span>
                  <input className="ltr" value={record.nationalId} onChange={(e) => update("nationalId", e.target.value)} placeholder="۱۰ رقم" />
                </label>
                <label>
                  <span>
                    تاریخ تولد <b>*</b>
                  </span>
                  <BirthDatePicker value={record.birthDate} onChange={(v) => update("birthDate", v)} placeholder="۱۳۷۰/۰۱/۰۱" />
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
                {(["right", "left"] as const).map((side) => (
                  <div className={`ear-card ${side}`} key={side}>
                    <h3>گوش {side === "right" ? "راست" : "چپ"}</h3>
                    <div className="image-upload-wrapper">
                      <label className="dropzone">
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(side, e.target.files?.[0] || null)} />
                        <Icon name="upload" />
                        <strong>{record[side].imageName || "بارگذاری تصویر اتوسکوپی"}</strong>
                        <small>PNG یا JPG، حداکثر ۱۰ مگابایت</small>
                      </label>
                      {record[side].imageDataUrl && (
                        <div className="image-preview">
                          <img src={record[side].imageDataUrl} alt={`پیش‌نمایش گوش ${side === "right" ? "راست" : "چپ"}`} />
                          <div className="image-actions">
                            <button className="icon-btn" type="button" title="کشیدن فلش روی تصویر" aria-label="کشیدن فلش روی تصویر" onClick={() => setAnnotatingSide(side)}>
                              <Icon name="arrow" />
                            </button>
                            <button
                              className="icon-btn"
                              type="button"
                              title="حذف تصویر"
                              aria-label="حذف تصویر"
                              onClick={() =>
                                updateEar(side, {
                                  imageName: "",
                                  imageDataUrl: "",
                                  originalImageDataUrl: "",
                                  arrows: [],
                                })
                              }
                            >
                              <Icon name="trash" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <label>
                      نتیجه معاینه
                      <AutocompleteInput value={record[side].result} onChange={(v) => updateEar(side, { result: v })} placeholder="نتیجه معاینه را تایپ کنید..." storageKey="audiology-examination-results" suggestions={["Normal TM", "O4"]} />
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
                dearDoctor={record.right.tympanometry?.dearDoctor || record.left.tympanometry?.dearDoctor || ""}
                rightComment={record.right.tympanometry?.comment || ""}
                leftComment={record.left.tympanometry?.comment || ""}
                onDearDoctorChange={(text) => {
                  updateTympanometry("right", { dearDoctor: text });
                }}
                onCommentChange={(side, text) => updateTympanometry(side, { comment: text })}
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
                  return <AudiometryCard key={side} side={side} value={value} onChange={(next) => updateAudiometry(side, next)} />;
                })}
                <div className="audiometry-copy-controls">
                  <button type="button" onClick={() => copyAudiometryTo("left", "right")} title="کپی اطلاعات گوش چپ به گوش راست" aria-label="کپی اطلاعات گوش چپ به گوش راست">
                    <Icon name="arrowLeft" />
                  </button>
                  <button type="button" onClick={() => copyAudiometryTo("right", "left")} title="کپی اطلاعات گوش راست به گوش چپ" aria-label="کپی اطلاعات گوش راست به گوش چپ">
                    <Icon name="arrowRight" />
                  </button>
                </div>
                <AudiometricTestsPanel value={audiometricTests} onChange={(value) => setRecord({ ...record, audiometricTests: value })} />
                <SpeechAudiometryPanel
                  values={{
                    right: normalizeSpeechAudiometry(record.right.speechAudiometry),
                    left: normalizeSpeechAudiometry(record.left.speechAudiometry),
                  }}
                  onChange={updateSpeechAudiometry}
                />
                <div className="audiometry-comment">
                  <CombinedDoctorComment
                    resultTitle="Audiometry Result"
                    dearDoctor={audiometricTests.dearDoctor}
                    rightComment={audiometricTests.comments.right}
                    leftComment={audiometricTests.comments.left}
                    onDearDoctorChange={(text) =>
                      setRecord({
                        ...record,
                        audiometricTests: {
                          ...audiometricTests,
                          dearDoctor: text,
                        },
                      })
                    }
                    onCommentChange={(side, text) =>
                      setRecord({
                        ...record,
                        audiometricTests: {
                          ...audiometricTests,
                          comments: {
                            ...audiometricTests.comments,
                            [side]: text,
                          },
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
                    <dt>نام بیمار</dt>
                    <dd>{record.fullName || "—"}</dd>
                  </div>
                  <div>
                    <dt>نام پزشک معالج</dt>
                    <dd>{record.doctorName || "—"}</dd>
                  </div>
                  <div>
                    <dt>کد ملی</dt>
                    <dd>{record.nationalId || "—"}</dd>
                  </div>
                  <div>
                    <dt>تاریخ تولد</dt>
                    <dd>{record.birthDate || "—"}</dd>
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
                        <span>STAT.COMP: {t?.staticCompliance || "—"} cc</span>
                        <span>M.E.PRESS: {t?.middleEarPressure || "—"} daPa</span>
                        <span>Gradient: {t?.gradient || "—"} %</span>
                      </article>
                    );
                  })}
                </div>
                <h3>نتیجه Audiometry</h3>
                <div className="audiometry-summary">
                  {(["right", "left"] as const).map((side) => {
                    const audiometry = record[side].audiometry;
                    const count = (["ac", "bc"] as const).flatMap((row) => Object.values(audiometry?.[row] || {})).filter((cell) => cell.value.trim()).length;
                    return (
                      <article key={side}>
                        <span className="ear-code">{side === "right" ? "R" : "L"}</span>
                        <div>
                          <strong>گوش {side === "right" ? "راست" : "چپ"}</strong>
                          <small>{count ? `${count.toLocaleString("fa-IR")} آستانه ثبت شده` : "ثبت نشده"}</small>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
              <div className="export-row">
                <button onClick={() => window.print()}>
                  <Icon name="print" /> پرینت
                </button>
                <button
                  onClick={() => {
                    notify("در پنجره چاپ، گزینه Save as PDF را انتخاب کنید");
                    setTimeout(() => window.print(), 400);
                  }}
                >
                  <Icon name="file" /> خروجی PDF
                </button>
                <button onClick={() => notify("لینک گزارش برای ارسال پیامک آماده شد")}>
                  <Icon name="sms" /> ارسال با پیامک
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {annotatingSide && record[annotatingSide].imageDataUrl && (
        <ImageAnnotator
          imageUrl={record[annotatingSide].originalImageDataUrl || record[annotatingSide].imageDataUrl}
          existingArrows={record[annotatingSide].arrows}
          onClose={() => setAnnotatingSide(null)}
          onSave={(imageDataUrl, arrows) => {
            updateEar(annotatingSide, { imageDataUrl, arrows });
            setAnnotatingSide(null);
          }}
        />
      )}
      <PrintReport record={record} />
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

function ReportPage({ icon, title, record, children }: { icon: string; title: string; record: RecordItem; children: React.ReactNode }) {
  return (
    <section className="print-page">
      <header className="print-header">
        <div className="print-brand">
          <img src="/avina-logo-transparent.png" alt="لوگوی آوینا" />
          <div>
            <strong>کلینیک شنوایی آوینا</strong>
            <small>گزارش جامع ارزیابی شنوایی</small>
          </div>
        </div>
        <div className="print-case">
          <small>شماره پرونده</small>
          <strong dir="ltr">{record.id}</strong>
        </div>
      </header>
      <div className="print-title">
        <span>
          <Icon name={icon} />
        </span>
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      {children}
      <footer>
        <span>{record.fullName}</span>
        <span>گزارش شنوایی‌سنجی آوینا</span>
      </footer>
    </section>
  );
}

function ReportFields({ fields }: { fields: Array<[string, string | undefined, string?]> }) {
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
  const rows = (["ipsi", "contra"] as const).filter((row) => Object.values(value[row]).some(hasText));
  const populated = frequencies.filter(([key]) => hasText(value.ipsi[key]) || hasText(value.contra[key]));
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

function PrintThresholdTable({ value }: { value: Audiometry }) {
  const rows = (["ac", "bc"] as const).filter((row) => Object.values(value[row]).some((cell) => hasText(cell.value)));
  const populated = audiometryFrequencies.filter((frequency) => hasText(value.ac[frequency].value) || hasText(value.bc[frequency].value));
  if (!populated.length) return null;
  return (
    <table className="print-data-table threshold-table" dir="ltr">
      <caption>Hearing Thresholds (dB HL)</caption>
      <thead>
        <tr>
          <th>Path</th>
          {populated.map((frequency) => (
            <th key={frequency}>
              {frequency >= 1000 ? `${frequency / 1000}k` : frequency}
              <small> Hz</small>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row}>
            <th>{row.toUpperCase()}</th>
            {populated.map((frequency) => {
              const cell = value[row][frequency];
              return (
                <td key={frequency}>
                  {cell.value}
                  {cell.value && cell.modifier && <small> {cell.modifier}</small>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrintComments({ dearDoctor, comments, title }: { dearDoctor?: string; comments: Record<"right" | "left", string>; title: string }) {
  const populatedSides = (["left", "right"] as const).filter((side) => hasText(comments[side]));
  if (!hasText(dearDoctor) && !populatedSides.length) return null;
  return (
    <section className="print-comments">
      {hasText(dearDoctor) && (
        <div className="print-doctor">
          <span>Dear Dr.</span>
          <strong dir="auto">{dearDoctor}</strong>
        </div>
      )}
      {populatedSides.length > 0 && (
        <div className="print-comment-grid">
          {populatedSides.map((side) => (
            <article className={`print-note ${side}`} key={side}>
              <header>
                <span>{side === "right" ? "R" : "L"}</span>
                <strong>
                  {title}، گوش {side === "right" ? "راست" : "چپ"}
                </strong>
              </header>
              <div dir="auto" dangerouslySetInnerHTML={{ __html: comments[side] }} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PrintReport({ record }: { record: RecordItem }) {
  const sides = ["left", "right"] as const;
  const tests = normalizeAudiometricTests(record.audiometricTests);
  const patientFields: Array<[string, string]> = [
    ["نام و نام خانوادگی", record.fullName],
    ["نام پزشک معالج", record.doctorName],
    ["کد ملی", record.nationalId],
    ["تاریخ تولد", record.birthDate],
  ];
  const tympanometryDoctor = record.right.tympanometry?.dearDoctor || record.left.tympanometry?.dearDoctor;
  const hasOtoscopy = (side: "right" | "left") => hasText(record[side].result) || hasText(record[side].imageName) || hasText(record[side].imageDataUrl);
  const hasTympanometry = (side: "right" | "left") => {
    const value = record[side].tympanometry;
    return Boolean(value && ([value.type, value.canalVolume, value.staticCompliance, value.middleEarPressure, value.gradient].some(hasText) || value.points.length || Object.values(value.ipsi).some(hasText) || Object.values(value.contra).some(hasText)));
  };
  const hasAudiometry = (side: "right" | "left") => {
    const value = record[side].audiometry;
    const speech = record[side].speechAudiometry;
    return Boolean((value && (["ac", "bc"] as const).some((row) => Object.values(value[row]).some((cell) => hasText(cell.value)))) || (speech && Object.values(speech).some(hasText)));
  };
  const hasAudiometricTests = tests.rinne.right || tests.rinne.left || Object.values(tests.weber).some(Boolean) || hasText(tests.dearDoctor);
  const rinneLabel = (value: RinneResult) => (value === "positive" ? "Positive" : value === "negative" ? "Negative" : "");
  const weberLabel = (value: WeberResult) => (value === "left" ? "Left" : value === "right" ? "Right" : value === "both" ? "Both" : "");

  return (
    <div className="print-report">
      {patientFields.some(([, value]) => hasText(value)) && (
        <ReportPage icon="users" title="اطلاعات بیمار" record={record}>
          <ReportFields fields={patientFields} />
        </ReportPage>
      )}

      {sides.some(hasOtoscopy) && (
        <ReportPage icon="ear" title="Otoscopy" record={record}>
          <div className="print-ear-grid">
            {sides.filter(hasOtoscopy).map((side) => (
              <article className={`print-ear ${side}`} key={side}>
                <h2>
                  <span>{side === "right" ? "R" : "L"}</span> گوش {side === "right" ? "راست" : "چپ"}
                </h2>
                {record[side].imageDataUrl && <img className="print-otoscopy-image" src={record[side].imageDataUrl} alt={`تصویر اتوسکوپی گوش ${side === "right" ? "راست" : "چپ"}`} />}
                <ReportFields
                  fields={[
                    ["Otoscopy Result", record[side].result],
                    // ["نام فایل تصویر", record[side].imageName],
                  ]}
                />
              </article>
            ))}
          </div>
        </ReportPage>
      )}

      {(sides.some(hasTympanometry) || hasText(tympanometryDoctor) || sides.some((side) => hasText(record[side].tympanometry?.comment))) && (
        <ReportPage icon="tympanometry" title="Tympanometry" record={record}>
          <div className="print-ear-grid">
            {sides.filter(hasTympanometry).map((side) => {
              const saved = record[side].tympanometry;
              const value = { ...emptyTympanometry(), ...saved, ipsi: { ...emptyReflex(), ...saved?.ipsi }, contra: { ...emptyReflex(), ...saved?.contra } };
              const showChart = value.points.length > 0 || (hasText(value.middleEarPressure) && hasText(value.staticCompliance));
              return (
                <article className={`print-ear ${side}`} key={side}>
                  <h2>
                    <span>{side === "right" ? "R" : "L"}</span> گوش {side === "right" ? "راست" : "چپ"}
                  </h2>
                  {showChart && <TympanometrySummaryChart side={side} value={value} />}
                  <ReportFields
                    fields={[
                      ["Type", value.type],
                      ["Canal Volume", value.canalVolume, "cc"],
                      ["Static Compliance", value.staticCompliance, "cc"],
                      ["Middle Ear Pressure", value.middleEarPressure, "daPa"],
                      ["Gradient", value.gradient, "%"],
                    ]}
                  />
                  <PrintReflexTable value={value} />
                </article>
              );
            })}
          </div>
          <PrintComments dearDoctor={tympanometryDoctor} comments={{ right: record.right.tympanometry?.comment || "", left: record.left.tympanometry?.comment || "" }} title="Tympanometry Result" />
        </ReportPage>
      )}

      {(sides.some(hasAudiometry) || hasAudiometricTests || sides.some((side) => hasText(tests.comments[side]))) && (
        <ReportPage icon="audiometry" title="Audiometry" record={record}>
          <div className="print-ear-grid">
            {sides.filter(hasAudiometry).map((side) => {
              const audiometry = copyAudiometry(record[side].audiometry);
              const hasThresholds = audiometryFrequencies.some((frequency) => hasText(audiometry.ac[frequency].value) || hasText(audiometry.bc[frequency].value));
              const speech = normalizeSpeechAudiometry(record[side].speechAudiometry);
              return (
                <article className={`print-ear ${side}`} key={side}>
                  <h2>
                    <span>{side === "right" ? "R" : "L"}</span> گوش {side === "right" ? "راست" : "چپ"}
                  </h2>
                  {hasThresholds && <AudiometrySummaryChart side={side} value={audiometry} />}
                  <PrintThresholdTable value={audiometry} />
                  <ReportFields
                    fields={[
                      ["SRT", speech.srt, "dB HL"],
                      ["MCL", speech.mcl, "dB HL"],
                      ["UCL", speech.ucl, "%"],
                    ]}
                  />
                </article>
              );
            })}
          </div>
          {hasAudiometricTests && (
            <div className="print-tests">
              <ReportFields fields={[["Rinne LE", rinneLabel(tests.rinne.left)], ["Rinne RE", rinneLabel(tests.rinne.right)], ...weberFrequencies.map((frequency) => [`Weber ${frequency} Hz`, weberLabel(tests.weber[frequency])] as [string, string])]} />
            </div>
          )}
          <PrintComments dearDoctor={tests.dearDoctor} comments={tests.comments} title="Audiometry Result" />
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
  const rinneSymbol = (value: RinneResult) => (value === "positive" ? "+" : value === "negative" ? "−" : "—");

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
          <div>
            <dt>نام بیمار</dt>
            <dd dir="auto">{valueOrDash(record.fullName)}</dd>
          </div>
          <div>
            <dt>نام پزشک معالج</dt>
            <dd dir="auto">{valueOrDash(record.doctorName)}</dd>
          </div>
          <div>
            <dt>کد ملی</dt>
            <dd className="national-id" dir="ltr">
              {valueOrDash(record.nationalId)}
            </dd>
          </div>
          <div>
            <dt>تاریخ تولد</dt>
            <dd>{valueOrDash(record.birthDate)}</dd>
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
              {record[side].imageDataUrl ? <img className="summary-otoscopy-image" src={record[side].imageDataUrl} alt={`تصویر اتوسکوپی گوش ${side === "right" ? "راست" : "چپ"}`} /> : <div className="summary-image-empty">تصویری ثبت نشده است</div>}
              <dl className="summary-details compact summary-otoscopy-details" dir="ltr">
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
            const tymp = { ...emptyTympanometry(), ...record[side].tympanometry, ipsi: { ...emptyReflex(), ...record[side].tympanometry?.ipsi }, contra: { ...emptyReflex(), ...record[side].tympanometry?.contra } };
            return (
              <article className={`summary-ear ${side}`} key={side}>
                <div className="summary-ear-title">
                  <span className="ear-code">{side === "right" ? "R" : "L"}</span>
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
                      {valueOrDash(tymp.staticCompliance)} <small>cc</small>
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
          <strong dir="auto">{valueOrDash(record.right.tympanometry?.dearDoctor || record.left.tympanometry?.dearDoctor)}</strong>
        </div>
        <div className="summary-comment-grid">
          {ears.map((side) => {
            const comment = record[side].tympanometry?.comment;
            return (
              <div className={`summary-note ${side}`} key={side}>
                <small>Tympanometry {side === "right" ? "RE" : "LE"} Result</small>
                {comment ? <div dir="auto" dangerouslySetInnerHTML={{ __html: comment }} /> : <p>ثبت نشده</p>}
              </div>
            );
          })}
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
            return (
              <article className={`summary-ear ${side}`} key={side}>
                <div className="summary-ear-title">
                  <span className="ear-code">{side === "right" ? "R" : "L"}</span>
                  <strong>گوش {side === "right" ? "راست" : "چپ"}</strong>
                </div>
                <AudiometrySummaryChart side={side} value={audiometry} />
                <div className="summary-table-wrap">
                  <table className="summary-thresholds" dir="ltr">
                    <thead>
                      <tr>
                        <th>Path</th>
                        {audiometryFrequencies.map((frequency) => (
                          <th key={frequency}>{frequency >= 1000 ? `${frequency / 1000}k` : frequency}</th>
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
                                    {cell.modifier && <small>{cell.modifier}</small>}
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
                  {Object.entries(normalizeSpeechAudiometry(record[side].speechAudiometry)).map(([label, value]) => (
                    <div key={label}>
                      <dt>{label.toUpperCase()}</dt>
                      <dd>
                        {valueOrDash(value)} <small>{label === "ucl" ? "%" : "dB HL"}</small>
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
        <div className="summary-comment-grid">
          {ears.map((side) => (
            <div className={`summary-note ${side}`} key={side}>
              <small>Audiometry Result</small>
              {tests.comments[side] ? <div dir="auto" dangerouslySetInnerHTML={{ __html: tests.comments[side] }} /> : <p>ثبت نشده</p>}
            </div>
          ))}
        </div>
        <div className="summary-tests" dir="ltr">
          <div className="rinne-summary right">
            <span>Rinne RE</span>
            <strong aria-label={tests.rinne.right === "positive" ? "Positive" : tests.rinne.right === "negative" ? "Negative" : "Not recorded"}>{rinneSymbol(tests.rinne.right)}</strong>
          </div>
          <div className="rinne-summary left">
            <span>Rinne LE</span>
            <strong aria-label={tests.rinne.left === "positive" ? "Positive" : tests.rinne.left === "negative" ? "Negative" : "Not recorded"}>{rinneSymbol(tests.rinne.left)}</strong>
          </div>
          {weberFrequencies.map((frequency) => (
            <div className="weber-summary" key={frequency}>
              <span>Weber {frequency} Hz</span>
              <strong aria-label={tests.weber[frequency] === "left" ? "Left" : tests.weber[frequency] === "right" ? "Right" : tests.weber[frequency] === "both" ? "Both" : "Not recorded"}>
                <WeberIndicator value={tests.weber[frequency]} />
              </strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AudiometrySummaryChart({ side, value }: { side: "right"|"left"; value: Audiometry }) {
  const plot={left:85,right:790,top:34,bottom:424};
  const yTicks=Array.from({length:14},(_,index)=>-10+index*10);
  const x=(index:number)=>plot.left+index/(audiometryFrequencies.length-1)*(plot.right-plot.left);
  const y=(threshold:number)=>plot.top+(threshold+10)/130*(plot.bottom-plot.top);
  const entered=(row:"ac"|"bc")=>audiometryFrequencies.flatMap((frequency,index)=>{if(row==="bc"&&frequency>=6000)return [];const cell=value[row][frequency]||{value:"",modifier:""},counterpartCell=value[row==="bc"?"ac":"bc"][frequency];const threshold=Number(cell.value),counterpart=Number(counterpartCell?.value);const violatesBoneGap=Boolean(counterpartCell?.value.trim())&&Number.isFinite(counterpart)&&(row==="bc"?threshold>counterpart:counterpart>threshold);return cell.value.trim()!==""&&isValidAudiometryThreshold(cell.value)&&!violatesBoneGap?[{frequency,index,threshold,modifier:cell.modifier}]:[];});
  const acPoints=entered("ac"),bcPoints=entered("bc");
  const lineSegments=(points:ReturnType<typeof entered>)=>points.slice(0,-1).map((point,index)=>{const next=points[index+1],dx=x(next.index)-x(point.index),dy=y(next.threshold)-y(point.threshold),distance=Math.hypot(dx,dy),startInset=point.modifier==="MD"?22:18,endInset=next.modifier==="MD"?22:18;return `${x(point.index)+dx/distance*startInset},${y(point.threshold)+dy/distance*startInset} ${x(next.index)-dx/distance*endInset},${y(next.threshold)-dy/distance*endInset}`;});
  const lines=(points:ReturnType<typeof entered>,className:string)=>lineSegments(points).map((segment,index)=><polyline className={className} key={index} points={segment}/>);
  return <div className={`audiogram summary-audiogram ${side}`} dir="ltr"><svg viewBox="0 0 910 465" role="img" aria-label={`نمودار ادیومتری گوش ${side==="right"?"راست":"چپ"}`}>{yTicks.map(tick=><g key={tick}><line x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)}/><text x="42" y={y(tick)+4}>{tick}</text></g>)}{audiometryFrequencies.map((frequency,index)=><g key={frequency}><line x1={x(index)} x2={x(index)} y1={plot.top} y2={plot.bottom}/><text x={x(index)} y="447">{frequency>=1000?`${frequency/1000}k`:frequency}</text></g>)}<text className="axis-title" x="18" y="22">dB HL</text><text className="axis-title" x="830" y="462">Frequency (Hz)</text>{acPoints.length>1&&lines(acPoints,"ac-line")} {bcPoints.length>1&&lines(bcPoints,"bc-line")} {acPoints.map(point=><g className="ac-point" key={point.frequency}><AudiometryMarker side={side} row="ac" modifier={point.modifier} x={x(point.index)} y={y(point.threshold)}/></g>)}{bcPoints.map(point=><g className="bc-point" key={point.frequency}><AudiometryMarker side={side} row="bc" modifier={point.modifier} x={x(point.index)} y={y(point.threshold)}/></g>)}</svg></div>;
}

function TympanometrySummaryChart({ side, value }: { side: "right"|"left"; value: Tympanometry }) {
  const xTicks=Array.from({length:10},(_,i)=>-600+i*100), yTicks=Array.from({length:6},(_,i)=>2.5-i*.5);
  const plot={left:54,right:574,top:18,bottom:248};
  const x=(pressure:number)=>plot.left+(pressure+600)/900*(plot.right-plot.left), y=(compliance:number)=>plot.bottom-compliance/2.5*(plot.bottom-plot.top);
  const smoothPath=(points:TympanometryPoint[])=>{if(!points.length)return "";if(points.length===1)return `M ${x(points[0].pressure)} ${y(points[0].compliance)}`;let path=`M ${x(points[0].pressure)} ${y(points[0].compliance)}`;for(let i=1;i<points.length-1;i++){const mx=(x(points[i].pressure)+x(points[i+1].pressure))/2,my=(y(points[i].compliance)+y(points[i+1].compliance))/2;path+=` Q ${x(points[i].pressure)} ${y(points[i].compliance)} ${mx} ${my}`;}const last=points.at(-1)!;return `${path} Q ${x(last.pressure)} ${y(last.compliance)} ${x(last.pressure)} ${y(last.compliance)}`;};
  const peakPressure=Number(value.middleEarPressure), peakCompliance=Number(value.staticCompliance), hasPeak=value.middleEarPressure.trim()!==""&&value.staticCompliance.trim()!==""&&peakPressure>=-600&&peakPressure<=300&&peakCompliance>=0&&peakCompliance<=2.5;
  const automaticPoints=hasPeak?Array.from({length:41},(_,i)=>{const offset=-200+i*10,decay=(Math.exp(-4*Math.abs(offset)/200)-Math.exp(-4))/(1-Math.exp(-4));return {pressure:peakPressure+offset,compliance:peakCompliance*Math.max(0,decay)};}).filter(point=>point.pressure>=-600&&point.pressure<=300):[];
  const chartPoints=value.points.length>1?value.points:automaticPoints;
  return <div className="tymp-chart summary-tymp-chart" dir="ltr"><svg viewBox="0 0 620 286" role="img" aria-label={`نمودار تمپانومتری گوش ${side==="right"?"راست":"چپ"}`}>{yTicks.map(v=><g key={v}><line x1={plot.left} x2={plot.right} y1={y(v)} y2={y(v)}/><text x="43" y={y(v)+4}>{v}</text></g>)}{xTicks.map(v=><g key={v}><line x1={x(v)} x2={x(v)} y1={plot.top} y2={plot.bottom}/><text x={x(v)} y="269">{v}</text></g>)}<text className="axis-label" x="18" y="13">cc</text><text className="axis-label" x="580" y="283">daPa</text>{chartPoints.length>1&&<path className="drawn-curve" d={smoothPath(chartPoints)}/>} {value.points.length<2&&hasPeak&&<g className="peak-marker"><line x1={x(peakPressure)} x2={x(peakPressure)} y1={y(peakCompliance)} y2={plot.bottom}/><line x1={plot.left} x2={x(peakPressure)} y1={y(peakCompliance)} y2={y(peakCompliance)}/><circle cx={x(peakPressure)} cy={y(peakCompliance)} r="7"/></g>}</svg></div>;
}

function TympanometryCard({ side, value, onChange }: { side: "right"|"left"; value: Tympanometry; onChange: (patch: Partial<Tympanometry>)=>void }) {
  const [drawMode,setDrawMode]=useState<"automatic"|"pencil">("automatic"), drawing=useRef(false), pointsRef=useRef(value.points);
  pointsRef.current=value.points;
  const xTicks=Array.from({length:10},(_,i)=>-600+i*100), yTicks=Array.from({length:6},(_,i)=>2.5-i*.5);
  const plot={left:54,right:574,top:18,bottom:248};
  const x=(pressure:number)=>plot.left+(pressure+600)/900*(plot.right-plot.left), y=(compliance:number)=>plot.bottom-compliance/2.5*(plot.bottom-plot.top);
  const eventPoint=(event:React.PointerEvent<SVGSVGElement>)=>{const rect=event.currentTarget.getBoundingClientRect(),px=(event.clientX-rect.left)/rect.width*620,py=(event.clientY-rect.top)/rect.height*286;if(px<plot.left||px>plot.right||py<plot.top||py>plot.bottom)return null;return {pressure:Math.round((-600+(px-plot.left)/(plot.right-plot.left)*900)*10)/10,compliance:Math.round((plot.bottom-py)/(plot.bottom-plot.top)*250)/100};};
  const appendPoint=(point:TympanometryPoint)=>{const last=pointsRef.current.at(-1);if(last&&Math.hypot(x(last.pressure)-x(point.pressure),y(last.compliance)-y(point.compliance))<4)return;pointsRef.current=[...pointsRef.current,point];onChange({points:pointsRef.current});};
  const pointerDown=(event:React.PointerEvent<SVGSVGElement>)=>{if(drawMode!=="pencil")return;event.preventDefault();const point=eventPoint(event);if(!point)return;drawing.current=true;event.currentTarget.setPointerCapture(event.pointerId);appendPoint(point);};
  const pointerMove=(event:React.PointerEvent<SVGSVGElement>)=>{if(drawMode!=="pencil"||!drawing.current)return;event.preventDefault();const point=eventPoint(event);if(point)appendPoint(point);};
  const smoothPath=(points:TympanometryPoint[])=>{if(!points.length)return "";if(points.length===1)return `M ${x(points[0].pressure)} ${y(points[0].compliance)}`;let path=`M ${x(points[0].pressure)} ${y(points[0].compliance)}`;for(let i=1;i<points.length-1;i++){const mx=(x(points[i].pressure)+x(points[i+1].pressure))/2,my=(y(points[i].compliance)+y(points[i+1].compliance))/2;path+=` Q ${x(points[i].pressure)} ${y(points[i].compliance)} ${mx} ${my}`;}const last=points.at(-1)!;return `${path} Q ${x(last.pressure)} ${y(last.compliance)} ${x(last.pressure)} ${y(last.compliance)}`;};
  const peakPressure=Number(value.middleEarPressure), peakCompliance=Number(value.staticCompliance), hasPeak=value.middleEarPressure.trim()!==""&&value.staticCompliance.trim()!==""&&peakPressure>=-600&&peakPressure<=300&&peakCompliance>=0&&peakCompliance<=2.5;
  const updateReflex=(row:"ipsi"|"contra",frequency:keyof ReflexValues,text:string)=>onChange({[row]:{...value[row],[frequency]:text}});
  const automaticPoints=hasPeak?Array.from({length:41},(_,i)=>{const offset=-200+i*10,decay=(Math.exp(-4*Math.abs(offset)/200)-Math.exp(-4))/(1-Math.exp(-4));return {pressure:peakPressure+offset,compliance:peakCompliance*Math.max(0,decay)};}).filter(point=>point.pressure>=-600&&point.pressure<=300):[];
  return <article className={`tymp-card ${side}`}><div className="tymp-head"><div><span className="ear-code">{side==="right"?"R":"L"}</span><h3>گوش {side==="right"?"راست":"چپ"}</h3></div><div className="chart-tools"><button type="button" className={drawMode==="automatic"?"selected":""} title="رسم خودکار" onClick={()=>setDrawMode("automatic")}>خودکار</button><button type="button" className={drawMode==="pencil"?"selected":""} title="رسم دستی با مداد" onClick={()=>setDrawMode("pencil")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/><path d="m14.5 6.5 3 3"/></svg> دستی</button>{drawMode==="pencil"&&<button type="button" disabled={!value.points.length} onClick={()=>{pointsRef.current=[];onChange({points:[]});}}>پاک کردن</button>}</div></div><div className={`tymp-chart ${drawMode}`}><svg viewBox="0 0 620 286" role="img" aria-label={`نمودار تمپانومتری گوش ${side==="right"?"راست":"چپ"}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={()=>drawing.current=false} onPointerCancel={()=>drawing.current=false}>{yTicks.map(v=><g key={v}><line x1={plot.left} x2={plot.right} y1={y(v)} y2={y(v)}/><text x="43" y={y(v)+4}>{v}</text></g>)}{xTicks.map(v=><g key={v}><line x1={x(v)} x2={x(v)} y1={plot.top} y2={plot.bottom}/><text x={x(v)} y="269">{v}</text></g>)}<text className="axis-label" x="18" y="13">cc</text><text className="axis-label" x="580" y="283">daPa</text>{drawMode==="pencil"&&value.points.length>1&&<path className="drawn-curve" d={smoothPath(value.points)}/>} {drawMode==="automatic"&&automaticPoints.length>1&&<path className="drawn-curve automatic-curve" d={smoothPath(automaticPoints)}/>} {drawMode==="automatic"&&hasPeak&&<g className="peak-marker"><line x1={x(peakPressure)} x2={x(peakPressure)} y1={y(peakCompliance)} y2={plot.bottom}/><line x1={plot.left} x2={x(peakPressure)} y1={y(peakCompliance)} y2={y(peakCompliance)}/><circle cx={x(peakPressure)} cy={y(peakCompliance)} r="7"/><text x={x(peakPressure)+10} y={y(peakCompliance)-10}>Peak</text></g>}</svg><small>{drawMode==="pencil"?"برای رسم آزاد، مداد را روی نمودار بکشید.":hasPeak?"منحنی خودکار در فاصله ۲۰۰ daPa از دو طرف قله به محور می‌رسد.":"برای نمایش منحنی خودکار، STAT.COMP و M.E.PRESS را وارد کنید."}</small></div><div className="tymp-fields"><label><span>CANAL VOL <em>(cc)</em></span><input dir="ltr" inputMode="decimal" value={value.canalVolume} onChange={e=>onChange({canalVolume:e.target.value})}/></label><label><span>STAT.COMP <em>(cc)</em></span><input dir="ltr" inputMode="decimal" value={value.staticCompliance} onChange={e=>onChange({staticCompliance:e.target.value})}/></label><label><span>M.E.PRESS <em>(daPa)</em></span><input dir="ltr" inputMode="decimal" value={value.middleEarPressure} onChange={e=>onChange({middleEarPressure:e.target.value})}/></label><label><span>Gradient <em>(%)</em></span><input dir="ltr" inputMode="decimal" value={value.gradient} onChange={e=>onChange({gradient:e.target.value})}/></label><label><span>TYPE</span><select value={value.type} onChange={e=>onChange({type:e.target.value})}><option value="">انتخاب کنید</option>{["An","As","Ad","C1","C2","B","D","E"].map(type=><option key={type}>{type}</option>)}</select></label></div><div className="reflex-section"><h4>Acoustic Reflex</h4><div className="reflex-table" role="table" aria-label={`رفلکس آکوستیک گوش ${side==="right"?"راست":"چپ"}`}><span/><strong>500</strong><strong>1KHz</strong><strong>2KHz</strong><strong>4KHz</strong>{(["ipsi","contra"] as const).map(row=><React.Fragment key={row}><b>{row==="ipsi"?"IPSI":"Contra"}</b>{(["hz500","hz1k","hz2k","hz4k"] as const).map(frequency=><input key={frequency} dir="ltr" value={value[row][frequency]} onChange={e=>updateReflex(row,frequency,e.target.value)} aria-label={`${row} ${frequency}`}/>)}</React.Fragment>)}</div></div><fieldset className="doctor-comment"><legend>Comment</legend><label><span>Dear Dr.</span><input value={value.dearDoctor} onChange={e=>onChange({dearDoctor:e.target.value})}/></label><label><span>Tympanometry</span><textarea rows={4} value={value.comment} onChange={e=>onChange({comment:e.target.value})}/></label></fieldset></article>;
}

function AudiometryCardView({ side, value, onChange }: { side: "right"|"left"; value: Audiometry; onChange: (value: Audiometry)=>void }) {
  const plot={left:85,right:790,top:34,bottom:424};
  const yTicks=Array.from({length:14},(_,index)=>-10+index*10);
  const x=(index:number)=>plot.left+index/(audiometryFrequencies.length-1)*(plot.right-plot.left);
  const y=(threshold:number)=>plot.top+(threshold+10)/130*(plot.bottom-plot.top);
  const entered=(row:"ac"|"bc")=>audiometryFrequencies.flatMap((frequency,index)=>{if(row==="bc"&&frequency>=6000)return [];const cell=value[row][frequency]||{value:"",modifier:""},counterpartCell=value[row==="bc"?"ac":"bc"][frequency];const threshold=Number(cell.value),counterpart=Number(counterpartCell?.value);const violatesBoneGap=Boolean(counterpartCell?.value.trim())&&Number.isFinite(counterpart)&&(row==="bc"?threshold>counterpart:counterpart>threshold);return cell.value.trim()!==""&&isValidAudiometryThreshold(cell.value)&&!violatesBoneGap?[{frequency,index,threshold,modifier:cell.modifier}]:[];});
  const updateCell=(row:"ac"|"bc",frequency:number,patch:Partial<AudiometryCell>)=>onChange({...value,[row]:{...value[row],[frequency]:{...(value[row][frequency]||{value:"",modifier:""}),...patch}}});
  const acPoints=entered("ac"),bcPoints=entered("bc");
   const lineSegments=(points:ReturnType<typeof entered>)=>points.slice(0,-1).map((point,index)=>{const next=points[index+1],dx=x(next.index)-x(point.index),dy=y(next.threshold)-y(point.threshold),distance=Math.hypot(dx,dy),startInset=point.modifier==="MD"?22:18,endInset=next.modifier==="MD"?22:18;return `${x(point.index)+dx/distance*startInset},${y(point.threshold)+dy/distance*startInset} ${x(next.index)-dx/distance*endInset},${y(next.threshold)-dy/distance*endInset}`;});
   const lines=(points:ReturnType<typeof entered>,className:string)=>lineSegments(points).map((segment,index)=><polyline className={className} key={index} points={segment}/>);
   return <article className={`audiometry-card ${side}`}><header><div><span className="ear-code">{side==="right"?"R":"L"}</span><div><h3>گوش {side==="right"?"راست":"چپ"}</h3><small>{side==="right"?"Right ear":"Left ear"}</small></div></div><div className="audiometry-legend"><span className="ac-key"><img src={audiometryMarkerAsset(side,"ac")} alt=""/> AC</span><span className="bc-key"><img src={audiometryMarkerAsset(side,"bc")} alt=""/> BC</span></div></header><div className="audiogram"><svg viewBox="0 0 910 465" role="img" aria-label={`نمودار ادیومتری گوش ${side==="right"?"راست":"چپ"}`}>{yTicks.map(tick=><g key={tick}><line x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)}/><text x="42" y={y(tick)+4}>{tick}</text></g>)}{audiometryFrequencies.map((frequency,index)=><g key={frequency}><line x1={x(index)} x2={x(index)} y1={plot.top} y2={plot.bottom}/><text x={x(index)} y="447">{frequency>=1000?`${frequency/1000}k`:frequency}</text></g>)}<text className="axis-title" x="18" y="22">dB HL</text><text className="axis-title" x="830" y="462">Frequency (Hz)</text>{acPoints.length>1&&lines(acPoints,"ac-line")} {bcPoints.length>1&&lines(bcPoints,"bc-line")} {acPoints.map(point=><g className="ac-point" key={point.frequency}><AudiometryMarker side={side} row="ac" modifier={point.modifier} x={x(point.index)} y={y(point.threshold)}/></g>)}{bcPoints.map(point=><g className="bc-point" key={point.frequency}><AudiometryMarker side={side} row="bc" modifier={point.modifier} x={x(point.index)} y={y(point.threshold)}/></g>)}</svg></div><div className="audiometry-table-wrap"><table className="audiometry-table" dir="ltr"><thead><tr><th>Path</th>{audiometryFrequencies.map(frequency=><th key={frequency}>{frequency}<small>Hz</small></th>)}</tr></thead><tbody>{(["ac","bc"] as const).map(row=><tr key={row}><th><strong>{row.toUpperCase()}</strong><small>{row==="ac"?"Air":"Bone"}</small></th>{audiometryFrequencies.map(frequency=>{const cell=value[row][frequency]||{value:"",modifier:""};return <td key={frequency}><input type="number" min="-10" max="120" step="5" value={cell.value} onChange={event=>updateCell(row,frequency,{value:event.target.value})} aria-label={`${row.toUpperCase()} ${frequency} Hz threshold`} placeholder="dB"/><select value={cell.modifier} onChange={event=>updateCell(row,frequency,{modifier:event.target.value as AudiometryModifier})} aria-label={`${row.toUpperCase()} ${frequency} Hz modifier`}><option value="">—</option><option value="M">M</option><option value="NR">NR</option><option value="MD">MD</option></select></td>})}</tr>)}</tbody></table></div></article>;
}

function AudiometryCard({ side, value, onChange }: { side: "right"|"left"; value: Audiometry; onChange: (value: Audiometry)=>void }) {
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
        const previousCell = value[row][frequency] || { value: "", modifier: "" };
        const nextCell = next[row][frequency] || { value: "", modifier: "" };
        if (previousCell.value === nextCell.value) continue;
        if (!isValidAudiometryThreshold(nextCell.value)) return;

        const acValue = row === "ac" ? nextCell.value : next.ac[frequency]?.value || "";
        const bcValue = row === "bc" ? nextCell.value : next.bc[frequency]?.value || "";
        if (acValue.trim() && bcValue.trim() && Number(bcValue) > Number(acValue)) return;
      }
    }
    onChange(next);
  };

  const acAverageFrequencies = [500, 1000, 2000] as const;
  const acAverageValues = acAverageFrequencies.map(frequency => draft.ac[frequency]).map(cell => cell?.value.trim() && isValidAudiometryThreshold(cell.value) ? Number(cell.value) : null);
  const acAverage = acAverageValues.every(value => value !== null) ? acAverageValues.reduce((sum, value) => sum + value, 0) / acAverageValues.length : null;

  return <><AudiometryCardView side={side} value={draft} onChange={handleChange}/><div className={`pure-tone-average ${side}`} dir="ltr"><div><span>AC AVG (500, 1000, 2000 Hz)</span><strong>{acAverage === null ? "—" : `${acAverage.toFixed(1)} dB HL`}</strong></div></div></>;
}

function WeberIndicator({ value }: { value: WeberResult }) {
  if (!value) return <span className="weber-empty">—</span>;
  return <span className="weber-indicator" aria-hidden="true">
    {(value === "left" || value === "both") && <span className="weber-arrow left">←</span>}
    {(value === "right" || value === "both") && <span className="weber-arrow right">→</span>}
  </span>;
}

function SpeechAudiometryPanel({ values, onChange }: { values: Record<"right"|"left", SpeechAudiometry>; onChange: (side: "right"|"left", field: "srt"|"mcl"|"ucl", value: string) => void }) {
  return <section className="speech-audiometry" dir="ltr">
    <div className="speech-audiometry-heading"><h3>Speech Audiometry</h3><small>MCL = SRT + 30 dB</small></div>
    <div className="speech-audiometry-ears">
      {(["right", "left"] as const).map(side => <fieldset className={side} key={side}>
        <legend>{side === "right" ? "Right Ear" : "Left Ear"}</legend>
        <label><span>SRT <small>dB HL</small></span><input type="number" step="5" value={values[side].srt} onChange={event => onChange(side, "srt", event.target.value)}/></label>
        <label><span>MCL <small>dB HL</small></span><input type="number" step="5" value={values[side].mcl} onChange={event => onChange(side, "mcl", event.target.value)} aria-label={`${side} ear MCL, automatically calculated but editable`}/></label>
        <label><span>UCL <small>%</small></span><input type="number" step="5" value={values[side].ucl} onChange={event => onChange(side, "ucl", event.target.value)}/></label>
      </fieldset>)}
    </div>
  </section>;
}

function AudiometricTestsPanel({ value, onChange }: { value: AudiometricTests; onChange: (value: AudiometricTests) => void }) {
  const updateRinne = (side: "right" | "left", result: RinneResult) => onChange({ ...value, rinne: { ...value.rinne, [side]: result } });
  const updateWeber = (frequency: number, result: WeberResult) => onChange({ ...value, weber: { ...value.weber, [frequency]: result } });
  return <section className="audiometric-tests" dir="ltr">
    <div className="rinne-controls">
      {(["right", "left"] as const).map(side => <label key={side}>
        <span>Rinne {side === "right" ? "RE" : "LE"}</span>
        <select value={value.rinne[side]} onChange={event => updateRinne(side, event.target.value as RinneResult)}>
          <option value="">Select</option><option value="positive">Positive</option><option value="negative">Negative</option>
        </select>
      </label>)}
    </div>
    <div className="weber-controls">
      <div className="weber-heading"><strong>Weber Audiometric</strong><small>Red: left / Blue: right</small></div>
      <div className="weber-frequency-grid">
        {weberFrequencies.map(frequency => <label key={frequency}>
          <span>{frequency} Hz</span>
          <span className={`weber-select ${value.weber[frequency] || "empty"}`}>
            <select aria-label={`Weber ${frequency} Hz`} value={value.weber[frequency]} onChange={event => updateWeber(frequency, event.target.value as WeberResult)}>
              <option value="">Select</option><option value="left">← Left</option><option value="right">→ Right</option><option value="both">← → Both</option>
            </select>
            <span className="weber-selected"><WeberIndicator value={value.weber[frequency]}/></span>
          </span>
        </label>)}
      </div>
    </div>
  </section>;
}

function CombinedDoctorComment({ dearDoctor, rightComment, leftComment, onDearDoctorChange, onCommentChange, resultTitle = "Tympanometry Result" }: { dearDoctor:string; rightComment:string; leftComment:string; onDearDoctorChange:(text:string)=>void; onCommentChange:(side:"right"|"left",text:string)=>void; resultTitle?:string }) {
  return <fieldset className="combined-comment"><legend>Comment</legend><label className="dear-doctor"><span>Dear Dr.</span><input value={dearDoctor} onChange={e=>onDearDoctorChange(e.target.value)} placeholder="نام یا پیام خطاب به پزشک"/></label><div className="result-heading"><strong>{resultTitle}</strong><small>نتیجه هر دو گوش را با ابزارهای ویرایش ثبت کنید.</small></div><div className="rich-results"><RichTextEditor side="left" value={leftComment} onChange={text=>onCommentChange("left",text)}/><RichTextEditor side="right" value={rightComment} onChange={text=>onCommentChange("right",text)}/></div></fieldset>;
}

function RichTextEditor({ side, value, onChange }: { side:"right"|"left"; value:string; onChange:(text:string)=>void }) {
  const editorRef=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{const editor=editorRef.current;if(editor&&editor.innerHTML!==value)editor.innerHTML=value;},[value]);
  const format=(command:string,value?:string)=>{editorRef.current?.focus();document.execCommand(command,false,value);onChange(editorRef.current?.innerHTML||"");};
  return <section className={`rich-editor ${side}`}><header><span className="ear-code">{side==="right"?"R":"L"}</span><strong>گوش {side==="right"?"راست":"چپ"}</strong></header><div className="rich-toolbar" dir="ltr"><button type="button" title="Bold" onMouseDown={e=>{e.preventDefault();format("bold");}}><b>B</b></button><button type="button" title="Underline" onMouseDown={e=>{e.preventDefault();format("underline");}}><u>U</u></button></div><div ref={editorRef} className="rich-input" contentEditable suppressContentEditableWarning dir="auto" onInput={e=>onChange(e.currentTarget.innerHTML)} data-placeholder="گزارش برای پزشک را وارد کنید..."/></section>;
}
