"use client";

import { useEffect, useState } from "react";

type Settings = { hasApiKey: boolean; sender: string; template: string; welcomeEnabled: boolean };

export function SmsSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/settings/sms", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const body = await response.json() as Settings;
      if (active) { setSettings(body); setMessage(""); }
    }).catch(() => { if (active) setMessage("دریافت تنظیمات پیامک ناموفق بود."); });
    return () => { active = false; };
  }, [reload]);

  const update = (patch: Partial<Settings>) => { setSettings((previous) => previous && { ...previous, ...patch }); setDirty(true); };
  async function perform(action: "save" | "balance" | "test") {
    if (!settings || busy) return;
    setBusy(true); setMessage("");
    if (action === "balance") setBalance(null);
    try {
      const response = await fetch("/api/settings/sms", {
        method: action === "save" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "save" ? { sender: settings.sender, template: settings.template, welcomeEnabled: settings.welcomeEnabled, ...(apiKey.trim() ? { apiKey } : {}) } : { action, phone, name }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "درخواست ناموفق بود.");
      if (action === "save") { setSettings(body); setApiKey(""); setDirty(false); setBalance(null); setMessage("تنظیمات پیامک ذخیره شد."); }
      if (action === "balance") setBalance(body.balance);
      if (action === "test") { setMessage(body.message); setBalance(null); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "ارتباط برقرار نشد."); }
    finally { setBusy(false); }
  }

  return <article className="form-card sms-settings">
    <h2>پیامک کاوه‌نگار</h2>
    {!settings ? <><p role="status">{message || "در حال دریافت تنظیمات…"}</p>{message && <button className="secondary" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</button>}</> : <>
      <fieldset disabled={busy}>
        <label>کلید API<input type="password" dir="ltr" autoComplete="new-password" value={apiKey} maxLength={512} placeholder={settings.hasApiKey ? "کلید ذخیره شده؛ برای تغییر، کلید جدید وارد کنید" : "API Key کاوه‌نگار"} onChange={(event) => { setApiKey(event.target.value); setDirty(true); }} /></label>
        <small>{settings.hasApiKey ? "کلید API ذخیره شده است." : "کلید API را از پنل کاوه‌نگار دریافت کنید."}</small>
        <label>شماره خط فرستنده (اختیاری)<input dir="ltr" value={settings.sender} placeholder="خط پیش‌فرض حساب کاوه‌نگار" onChange={(event) => update({ sender: event.target.value })} /></label>
        <small>شماره خط پیامکی فعال و مجاز حساب خود را از پنل کاوه‌نگار کپی کنید. شماره موبایل خودتان را در بخش تست وارد کنید. خالی گذاشتن این فیلد فقط وقتی درست است که خط پیش‌فرض معتبر در حساب کاوه‌نگار تنظیم شده باشد.</small>
        <label className="sms-toggle"><input type="checkbox" checked={settings.welcomeEnabled} onChange={(event) => update({ welcomeEnabled: event.target.checked })} />ارسال خودکار پیامک خوش‌آمدگویی پس از ثبت نهایی پرونده جدید</label>
        <label>متن پیامک خوش‌آمدگویی<textarea rows={4} maxLength={1700} value={settings.template} onChange={(event) => update({ template: event.target.value })} /></label>
        <small><bdi>{"{name}"}</bdi> با نام بیمار جایگزین می‌شود.</small>
        <p className="sms-preview">پیش‌نمایش: {settings.template.replaceAll("{name}", name.trim() || "نام بیمار")}</p>
        <button type="button" className="primary" onClick={() => void perform("save")}>ذخیره تنظیمات پیامک</button>
        <hr />
        <p>اعتبار باقی‌مانده: <strong>{balance === null ? "—" : `${balance.toLocaleString("fa-IR")} ریال`}</strong></p>
        <button type="button" className="secondary" disabled={dirty || !settings.hasApiKey} onClick={() => void perform("balance")}>دریافت اعتبار</button>
        <label>شماره موبایل خودتان برای تست<input type="tel" dir="ltr" value={phone} placeholder="09123456789" onChange={(event) => setPhone(event.target.value)} /></label>
        <label>نام برای تست جایگذاری<input value={name} maxLength={100} placeholder="کاربر آزمایشی" onChange={(event) => setName(event.target.value)} /></label>
        <small>تست، متن ذخیره‌شده را به شماره بالا ارسال می‌کند و از اعتبار حساب کسر می‌شود.</small>
        <button type="button" className="secondary" disabled={dirty || !settings.hasApiKey || !phone.trim()} onClick={() => void perform("test")}>ارسال پیامک آزمایشی</button>
        {dirty && <small>برای تست و دریافت اعتبار، ابتدا تغییرات را ذخیره کنید.</small>}
      </fieldset>
      <p role="status" aria-live="polite">{busy ? "در حال انجام درخواست…" : message}</p>
    </>}
  </article>;
}
