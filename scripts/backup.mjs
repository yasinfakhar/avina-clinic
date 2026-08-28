import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const source = path.resolve(process.env.AUDIOLOGY_DATA_DIR || "data");
if (!existsSync(source)) {
  console.error(`No data directory found at ${source}`);
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.resolve(process.env.AUDIOLOGY_BACKUP_DIR || "backups");
const destination = path.join(backupRoot, `audiology-${timestamp}`);
mkdirSync(backupRoot, { recursive: true });
cpSync(source, destination, { recursive: true, errorOnExist: true });
console.log(destination);
