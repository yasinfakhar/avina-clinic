"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import styles from "./BackupMenu.module.css";

type Backup = { id: string; path: string; name: string; createdAt: string; size: number; kind: string; available: boolean };
const subscribeDesktop = () => () => {};
const desktopAvailable = () => typeof window.desktop?.listBackups === "function" && typeof window.desktop?.createBackup === "function" && typeof window.desktop?.restoreBackup === "function" ? "ready" : window.desktop ? "restart" : "web";
const serverDesktopAvailable = () => "web";

export function BackupMenu() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const desktopState = useSyncExternalStore(subscribeDesktop, desktopAvailable, serverDesktopAvailable);
  const enabled = desktopState === "ready";
  const [backups, setBackups] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
  }, [isOpen]);

  async function refresh() {
    if (enabled && window.desktop) setBackups(await window.desktop.listBackups());
  }
  async function open() {
    setIsOpen(true);
    setMessage("");
    setBusy(true);
    try { await refresh(); } catch { setMessage("خواندن تاریخچهٔ بکاپ ناموفق بود."); }
    finally { setBusy(false); }
  }
  async function run(restoring: boolean) {
    if (!enabled || !window.desktop || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = restoring ? await window.desktop.restoreBackup() : await window.desktop.createBackup();
      if (!result.canceled) setMessage(restoring ? "بازیابی انجام شد." : "بکاپ با موفقیت ذخیره شد.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : "عملیات ناموفق بود."); }
    finally { setBusy(false); }
  }

  return <>
    <button className="settings-button backup-header-button" title="پشتیبان‌گیری و بازیابی" aria-label="پشتیبان‌گیری و بازیابی" onClick={() => void open()}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" /></svg>
    </button>
    {isOpen && createPortal(<dialog className={styles.dialog} dir="rtl" ref={dialogRef} aria-labelledby="backup-title" onClose={() => setIsOpen(false)} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="backup-dialog-heading"><h2 id="backup-title">پشتیبان‌گیری و بازیابی</h2><button className="secondary" disabled={busy} onClick={() => dialogRef.current?.close()} aria-label="بستن">×</button></div>
      <p>از اطلاعات، تصاویر و فایل‌های برنامه نسخهٔ ZIP بگیرید یا یک بکاپ قبلی را بازیابی کنید.</p>
      {!enabled && <p className="backup-message" role="status">{desktopState === "restart" ? "برای فعال‌شدن پشتیبان‌گیری، برنامه را کامل ببندید و دوباره باز کنید. اگر این پیام باقی ماند، نسخهٔ دسکتاپ باید به‌روزرسانی شود." : "پشتیبان‌گیری از فایل‌های دستگاه در نسخهٔ دسکتاپ ویندوز در دسترس است. این صفحه را در برنامهٔ آوینا باز کنید."}</p>}
      <p className="backup-hint">پیش از شروع، تغییرات پرونده‌ها را ذخیره کنید. هنگام عملیات، استفاده از برنامه موقتاً متوقف می‌شود.</p>
      <div className="backup-actions"><button className="primary" disabled={busy || !enabled} onClick={() => void run(false)}>گرفتن Backup</button><button className="secondary" disabled={busy || !enabled} onClick={() => void run(true)}>Restore از فایل ZIP</button></div>
      {busy && <p role="status">در حال انجام عملیات…</p>}
      {message && <p className="backup-message" role="status">{message}</p>}
      <h3>بکاپ‌های قبلی</h3>
      <p className="backup-hint">بکاپ‌های ساخته‌شده در این برنامه نمایش داده می‌شوند. فایل‌های جابه‌جا‌شده را می‌توانید با گزینهٔ Restore انتخاب کنید.</p>
      <div className="backup-history">
        {enabled && !busy && backups.length === 0 && <p>هنوز بکاپی ثبت نشده است.</p>}
        {backups.map((item) => <article key={item.id}>
          <strong dir="ltr">{item.name}</strong>
          <span>{new Date(item.createdAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })} · {(item.size / 1024 / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} مگابایت{item.kind === "emergency" ? " · قبل از بازیابی" : ""}</span>
          <small dir="ltr">{item.path}</small>
          {!item.available && <span className="backup-missing">فایل در مسیر قبلی در دسترس نیست.</span>}
        </article>)}
      </div>
    </dialog>, document.body)}
  </>;
}
