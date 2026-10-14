"use client";

import { useEffect, useState } from "react";
import styles from "./TrialBadge.module.css";

export function TrialBadge() {
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.desktop?.licenseStatus().then((license) => {
      if (!cancelled && license.active && license.licenseType === "trial" && Number.isFinite(license.expiresAt)) {
        setExpiresAt(license.expiresAt!);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (expiresAt === null) return null;
  const deadline = new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(expiresAt));

  return <aside className={styles.badge} dir="rtl" aria-label="اعتبار نسخه آزمایشی">
    <strong>نسخه آزمایشی</strong>
    <span>اعتبار تا {deadline} (به وقت تهران)</span>
  </aside>;
}
