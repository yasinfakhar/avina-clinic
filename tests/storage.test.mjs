import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const directory = mkdtempSync(path.join(tmpdir(), "audiology-storage-"));
process.env.AUDIOLOGY_DATA_DIR = directory;
const { getDb, storagePaths } = await import("../db/index.ts");
const { formatTehranDateTime, tehranDateFilePart } = await import("../app/tehran-time.ts");

test("initializes the SQLite database and backup directories", () => {
  const database = getDb();
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
  assert.ok(tables.some((table) => table.name === "records"));
  assert.ok(tables.some((table) => table.name === "files"));
  assert.equal(existsSync(storagePaths.images), true);
  assert.equal(existsSync(storagePaths.pdfs), true);
  assert.equal(existsSync(storagePaths.database), true);
});

test("formats update timestamps using the Persian calendar and Tehran time", () => {
  assert.equal(
    formatTehranDateTime("2024-03-20T20:00:00.000Z"),
    "۱۴۰۳/۰۱/۰۱، ۲۳:۳۰",
  );
});

test("creates a Tehran Jalali date suitable for report filenames", () => {
  assert.equal(tehranDateFilePart("2024-03-20T21:00:00.000Z"), "1403-01-02");
});

test.after(() => {
  getDb().close();
  rmSync(directory, { recursive: true, force: true });
});
