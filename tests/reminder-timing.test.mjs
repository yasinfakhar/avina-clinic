import assert from "node:assert/strict";
import test from "node:test";
import { nextReminderDelay } from "../app/reminder-timing.ts";
import { jalaliDateTimeToIso } from "../app/jalali-date.ts";

test("successive reminders each get their own deadline, including simultaneous reminders", () => {
  const reminders = [1000, 1000, 2500].map((time) => ({ read: false, remindAt: new Date(time).toISOString() }));
  assert.equal(nextReminderDelay(reminders, 0), 1000);
  assert.equal(nextReminderDelay(reminders, 1000), 1500);
  assert.equal(nextReminderDelay(reminders, 2500), null);
});

test("read, overdue and invalid reminders do not block the next deadline", () => {
  assert.equal(nextReminderDelay([
    { read: true, remindAt: new Date(100).toISOString() },
    { read: false, remindAt: "invalid" },
    { read: false, remindAt: new Date(200).toISOString() },
    { read: false, remindAt: new Date(1000).toISOString() },
  ], 500), 500);
  assert.equal(nextReminderDelay([{ read: false, remindAt: new Date(3_000_000_000).toISOString() }], 0), 2_147_000_000);
});

test("Persian reminder date and time use Tehran time independently of Windows timezone", () => {
  assert.equal(jalaliDateTimeToIso("۱۴۰۵/۰۷/۲۱", "09:00"), "2026-10-13T05:30:00.000Z");
  assert.equal(jalaliDateTimeToIso("۱۴۰۵/۰۷/۲۱", "00:00"), "2026-10-12T20:30:00.000Z");
});
