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
};

type DatabaseGlobal = typeof globalThis & { audiologyDatabase?: DatabaseSync };

export function getDb() {
  const databaseGlobal = globalThis as DatabaseGlobal;
  if (databaseGlobal.audiologyDatabase) return databaseGlobal.audiologyDatabase;

  mkdirSync(storagePaths.images, { recursive: true });
  mkdirSync(storagePaths.pdfs, { recursive: true });

  const database = new DatabaseSync(storagePaths.database);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = DELETE");
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
  `);

  databaseGlobal.audiologyDatabase = database;
  return database;
}
