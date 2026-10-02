import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDirectory = process.env.AUDIOLOGY_DATA_DIR
  ? path.resolve(process.env.AUDIOLOGY_DATA_DIR)
  : path.join(/* turbopackIgnore: true */ process.cwd(), "data");

export const storagePaths = {
  root: dataDirectory,
  database: path.join(dataDirectory, "audiology.sqlite"),
  images: path.join(dataDirectory, "images"),
  pdfs: path.join(dataDirectory, "pdfs"),
  factors: path.join(dataDirectory, "factors"),
  header: path.join(dataDirectory, "header"),
  logs: path.join(dataDirectory, "logs"),
  license: path.join(dataDirectory, "license.json"),
};

type DatabaseGlobal = typeof globalThis & { audiologyDatabase?: DatabaseSync };

export function getDb() {
  const databaseGlobal = globalThis as DatabaseGlobal;
  if (databaseGlobal.audiologyDatabase) return databaseGlobal.audiologyDatabase;

  mkdirSync(storagePaths.images, { recursive: true });
  mkdirSync(storagePaths.pdfs, { recursive: true });
  mkdirSync(storagePaths.factors, { recursive: true });
  mkdirSync(storagePaths.header, { recursive: true });
  mkdirSync(storagePaths.logs, { recursive: true });

  const database = new DatabaseSync(storagePaths.database);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = DELETE");
  const hasOtoscopyResults = Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'otoscopy_results'")
      .get(),
  );
  database.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL DEFAULT '',
      national_id TEXT NOT NULL DEFAULT '',
      doctor_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('draft', 'completed')),
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS records_updated_at_idx ON records(updated_at DESC);
    CREATE INDEX IF NOT EXISTS records_national_id_idx ON records(national_id);

    CREATE TABLE IF NOT EXISTS patient_notes (
      record_id TEXT PRIMARY KEY,
      note TEXT NOT NULL DEFAULT '',
      reminder_text TEXT NOT NULL DEFAULT '',
      remind_at INTEGER,
      reminder_read INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS patient_notes_remind_at_idx ON patient_notes(remind_at);

    CREATE TABLE IF NOT EXISTS patient_reminders (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      reminder_text TEXT NOT NULL,
      remind_at INTEGER NOT NULL,
      reminder_read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS patient_reminders_record_id_idx ON patient_reminders(record_id);
    CREATE INDEX IF NOT EXISTS patient_reminders_remind_at_idx ON patient_reminders(remind_at);

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('image', 'pdf')),
      slot TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS files_record_id_idx ON files(record_id);

    CREATE TABLE IF NOT EXISTS otoscopy_results (
      value TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_credentials (
      username TEXT PRIMARY KEY CHECK (username = 'admin'),
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);
  `);
  database.prepare("INSERT OR IGNORE INTO app_migrations (version, applied_at) VALUES (1, ?)").run(Date.now());
  database.exec(`
    INSERT OR IGNORE INTO patient_reminders
      (id, record_id, reminder_text, remind_at, reminder_read, created_at, updated_at)
    SELECT record_id || '-legacy', record_id, reminder_text, remind_at, reminder_read, updated_at, updated_at
    FROM patient_notes
    WHERE reminder_text <> '' AND remind_at IS NOT NULL;
  `);
  if (!hasOtoscopyResults) {
    const insertResult = database.prepare(
      "INSERT INTO otoscopy_results (value, created_at) VALUES (?, ?)",
    );
    insertResult.run("Normal TM", Date.now());
    insertResult.run("O4", Date.now() + 1);
  }

  databaseGlobal.audiologyDatabase = database;
  return database;
}
