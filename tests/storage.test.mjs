import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const directory = mkdtempSync(path.join(tmpdir(), "audiology-storage-"));
process.env.AUDIOLOGY_DATA_DIR = directory;
const { closeDb, getDb, storagePaths } = await import("../db/index.ts");
const { formatTehranDate, formatTehranDateTime, tehranDateFilePart } = await import("../app/tehran-time.ts");
const { formatJalali, jalaliDateTimeToIso, todayJalali } = await import("../app/jalali-date.ts");
const { otoscopyImageName } = await import("../app/api/uploads/images/naming.ts");

test("initializes the SQLite database and backup directories", () => {
  const database = getDb();
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
  assert.ok(tables.some((table) => table.name === "records"));
  assert.ok(tables.some((table) => table.name === "files"));
  assert.ok(tables.some((table) => table.name === "otoscopy_results"));
  assert.ok(tables.some((table) => table.name === "patient_notes"));
  assert.ok(tables.some((table) => table.name === "patient_reminders"));
  assert.equal(existsSync(storagePaths.images), true);
  assert.equal(existsSync(storagePaths.pdfs), true);
  assert.equal(existsSync(storagePaths.factors), true);
  assert.equal(existsSync(storagePaths.database), true);
});

test("seeds reusable otoscopy results in persistent storage", () => {
  const rows = getDb().prepare("SELECT value FROM otoscopy_results ORDER BY created_at").all();
  assert.deepEqual(rows.map((row) => row.value), ["Normal TM", "O4"]);
});

test("formats update timestamps using the Persian calendar and Tehran time", () => {
  assert.equal(
    formatTehranDateTime("2024-03-20T20:00:00.000Z"),
    "۱۴۰۳/۰۱/۰۱، ۲۳:۳۰",
  );
});

test("formats a stored visit date in the Persian calendar", () => {
  assert.equal(formatTehranDate("2024-03-20T21:00:00.000Z"), "۱۴۰۳/۰۱/۰۲");
});

test("creates a Tehran Jalali date suitable for report filenames", () => {
  assert.equal(tehranDateFilePart("2024-03-20T21:00:00.000Z"), "1403-01-02");
});

test("converts a Jalali reminder to the matching Tehran instant", () => {
  const instant = jalaliDateTimeToIso("۱۴۰۵/۰۷/۱۱", "09:00");
  assert.equal(instant, "2026-10-03T05:30:00.000Z");
  assert.equal(formatTehranDate(instant), "۱۴۰۵/۰۷/۱۱");
});

test("uses today's Tehran date as the reminder default", () => {
  const today = todayJalali();
  assert.equal(formatJalali(today.jy, today.jm, today.jd), formatTehranDate());
});

test("uses the patient national ID in permanent otoscopy image filenames", () => {
  assert.equal(
    otoscopyImageName(" ۰۰۱۲۳۴۵۶۷۸ ", "right", "original", ".jpg", 123456),
    "0012345678-right-original-123456.jpg",
  );
});

test("closes and reopens the shared database for desktop maintenance", () => {
  const previous = getDb();
  closeDb();
  const reopened = getDb();
  assert.notEqual(reopened, previous);
  assert.ok(reopened.prepare("SELECT 1 AS ready").get().ready);
});

test.after(() => {
  getDb().close();
  rmSync(directory, { recursive: true, force: true });
});
