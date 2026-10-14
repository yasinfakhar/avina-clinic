export function nextReminderDelay(reminders: { read: boolean; remindAt: string }[], now: number) {
  const times = reminders.filter((item) => !item.read).map((item) => Date.parse(item.remindAt)).filter((time) => time > now);
  return times.length ? Math.min(Math.min(...times) - now, 2_147_000_000) : null;
}
