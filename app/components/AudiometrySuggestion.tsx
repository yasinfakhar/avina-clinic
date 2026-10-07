'use client';
import { useMemo } from 'react';
import { analyzeAudiometry } from '../audiometry-analysis';
import type { AudiometryInput, Warning } from '../audiometry-analysis';
import { composeAudiometryReport } from '../audiometry-report';
const warningLabels: Record<Warning, string> = {
  MISSING_BC: 'دادهٔ BC برای تعیین نوع افت کامل نیست',
  INSUFFICIENT_DATA: 'تعداد آستانه‌های ثبت‌شده کافی نیست',
  NO_RESPONSE_PRESENT: 'اندازه‌گیری بدون پاسخ (NR) وجود دارد',
  ISOLATED_ABG: 'شکاف هوا و استخوان منفرد نیاز به بررسی دارد',
  BORDERLINE_ABG: 'شکاف هوا و استخوان مرزی است',
  REVIEW_REQUIRED: 'تفسیر نیاز به تأیید پزشک دارد',
  INVALID_THRESHOLD: 'آستانهٔ نامعتبر وجود دارد',
  CONFLICTING_THRESHOLDS: 'آستانه‌های هوا و استخوان ناسازگار هستند',
  PARTIAL_AC: 'برخی فرکانس‌های AC ثبت نشده‌اند',
  UNMASKED_ABG: 'شکاف هوا و استخوان با BC بدون ماسک ثبت شده است',
  ISOLATED_THRESHOLD: 'افت در یک فرکانس منفرد دیده می‌شود',
};
export function AudiometrySuggestion({ right, left, onApply }: { right?: AudiometryInput; left?: AudiometryInput; onApply: (text: string) => void }) {
  const profile = useMemo(() => analyzeAudiometry(right, left), [right, left]);
  const suggestion = composeAudiometryReport(profile);
  const hasData = [...profile.rightEar.points, ...profile.leftEar.points].some(p => p.ac !== null || p.acModifier === 'NR');
  return <div className="audiometry-suggestion">
    <button type="button" className="btn secondary" disabled={!hasData} onClick={() => onApply(suggestion.split('\n').map(line => `<p>${line}</p>`).join(''))}>کامنت خودکار</button>
    <small>با زدن دکمه، پیشنهاد جایگزین کامنت فعلی می‌شود و قابل ویرایش است.</small>
    {hasData && <p dir="ltr" style={{ whiteSpace: 'pre-line' }} aria-label="Suggested audiometry comment">{suggestion}</p>}
    {hasData && profile.warnings.length > 0 && <p role="status">پیشنهاد نیاز به بررسی پزشک دارد. <span>{profile.warnings.map(w => warningLabels[w]).join(' · ')}</span></p>}
  </div>;
}

