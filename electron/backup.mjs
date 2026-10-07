import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function backupName(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `avina_backup_${value('year')}-${value('month')}-${value('day')}_${value('hour')}-${value('minute')}-${value('second')}.zip`;
}

export function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function readablePowerShellError(value) {
  const source = String(value || '');
  const xmlMessages = [...source.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)].map((match) => match[1]);
  const message = (xmlMessages.length ? xmlMessages.join(' ') : source)
    .replace(/_x([0-9a-fA-F]{4})_/g, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
  const locked = message.match(/The process cannot access the file ['"]([^'"]+)['"] because it is being used by another process/i);
  if (locked) return `فایل دیتابیس هنوز توسط برنامه در حال استفاده است: ${locked[1]}`;
  return message || 'PowerShell بدون ارائهٔ جزئیات متوقف شد.';
}

export function archive(action, source, destination) {
  if (process.platform !== 'win32') throw new Error('این قابلیت فعلاً در نسخهٔ ویندوز فعال است.');
  const script = readFileSync(new URL('./backup-archive.ps1', import.meta.url), 'utf8');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, AVINA_ARCHIVE_ACTION: action, AVINA_ARCHIVE_SOURCE: source, AVINA_ARCHIVE_DESTINATION: destination },
    });
    let error = '';
    child.stderr.on('data', (chunk) => { error = (error + chunk).slice(-4000); });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`عملیات ZIP ناموفق بود. ${readablePowerShellError(error)}`)));
  });
}

export function validateData(directory) {
  const dbPath = path.join(directory, 'audiology.sqlite');
  if (!existsSync(dbPath)) throw new Error('فایل ZIP باید پوشهٔ data و دیتابیس آوینا را داشته باشد.');
  // Reject filesystem links, including links in a local source directory.
  const inspect = (folder) => {
    for (const name of readdirSync(folder)) {
      const file = path.join(folder, name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('وجود لینک در پوشهٔ اطلاعات مجاز نیست.');
      if (stat.isDirectory()) inspect(file);
    }
  };
  inspect(directory);
  // Read/write open permits SQLite to recover an interrupted transaction first.
  const db = new DatabaseSync(dbPath);
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('دیتابیس بکاپ سالم نیست.');
    for (const table of ['records', 'files', 'app_settings', 'admin_credentials', 'auth_sessions']) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) throw new Error('ساختار دیتابیس بکاپ معتبر نیست.');
    }
    for (const file of db.prepare('SELECT category, stored_name, size FROM files').all()) {
      const folder = file.category === 'image' ? 'images' : file.category === 'pdf' ? 'pdfs' : null;
      if (!folder || typeof file.stored_name !== 'string' || path.basename(file.stored_name) !== file.stored_name || !existsSync(path.join(directory, folder, file.stored_name))) throw new Error('فایل‌های پیوست بکاپ کامل یا معتبر نیستند.');
      const stat = statSync(path.join(directory, folder, file.stored_name));
      if (!stat.isFile() || stat.size !== file.size) throw new Error('اندازهٔ فایل پیوست با دیتابیس مطابقت ندارد.');
    }
  } finally { db.close(); }
}

export function createBackupStore(userDirectory) {
  const data = path.join(userDirectory, 'data');
  const historyFile = path.join(userDirectory, 'backup-history.json');
  const marker = path.join(userDirectory, 'restore-pending.json');
  const recoveryRoot = path.join(userDirectory, 'backup-recovery');
  const history = () => {
    if (!existsSync(historyFile)) return [];
    const entries = JSON.parse(readFileSync(historyFile, 'utf8'));
    if (!Array.isArray(entries)) throw new Error('تاریخچهٔ بکاپ معتبر نیست.');
    return entries;
  };
  const record = (file, kind) => {
    const entries = history();
    const entry = { id: randomUUID(), path: file, name: path.basename(file), createdAt: new Date().toISOString(), size: statSync(file).size, kind };
    const temporary = `${historyFile}.tmp`;
    writeFileSync(temporary, JSON.stringify([entry, ...entries.filter((item) => item.path !== file)], null, 2));
    renameSync(temporary, historyFile);
    return entry;
  };
  const save = async (file, kind = 'manual') => {
    if (isWithin(data, file) || isWithin(realpathSync(data), realpathSync(path.dirname(file)))) throw new Error('محل ذخیرهٔ بکاپ باید خارج از پوشهٔ data باشد.');
    validateData(data);
    const temporary = path.join(path.dirname(file), `.avina-${randomUUID()}.zip`);
    try {
      await archive('create', data, temporary);
      renameSync(temporary, file);
    } finally { rmSync(temporary, { force: true }); }
    return record(file, kind);
  };
  const stage = async (file) => {
    mkdirSync(recoveryRoot, { recursive: true });
    const directory = mkdtempSync(path.join(recoveryRoot, 'restore-'));
    try {
      await archive('extract', file, directory);
      validateData(path.join(directory, 'data'));
      return directory;
    } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
  };
  const recover = () => {
    if (!existsSync(marker)) return;
    const { previous } = JSON.parse(readFileSync(marker, 'utf8'));
    if (!isWithin(recoveryRoot, previous) || path.dirname(previous) !== recoveryRoot) throw new Error('مسیر بازیابی اضطراری معتبر نیست.');
    if (existsSync(previous)) {
      if (existsSync(data)) renameSync(data, path.join(recoveryRoot, `failed-${randomUUID()}`));
      renameSync(previous, data);
    }
    rmSync(marker);
  };
  const replace = (staged) => {
    if (path.dirname(staged) !== recoveryRoot) throw new Error('Invalid restore staging directory');
    const restored = path.join(staged, 'data');
    // Activation belongs to this machine, not to the source of the archive.
    rmSync(path.join(restored, 'license.json'), { force: true });
    if (existsSync(path.join(data, 'license.json'))) cpSync(path.join(data, 'license.json'), path.join(restored, 'license.json'));
    const db = new DatabaseSync(path.join(restored, 'audiology.sqlite'));
    try { db.exec('DELETE FROM auth_sessions'); } finally { db.close(); }
    const previous = path.join(recoveryRoot, `previous-${randomUUID()}`);
    writeFileSync(marker, JSON.stringify({ previous }));
    renameSync(data, previous);
    renameSync(restored, data);
    return previous;
  };
  return {
    data, recoveryRoot, history: () => history().map((item) => ({ ...item, available: existsSync(item.path) })), save, stage, replace, recover,
    commit: () => rmSync(marker, { force: true }),
    cleanStage: (directory) => { if (path.dirname(directory) !== recoveryRoot) throw new Error('Invalid staging path'); rmSync(directory, { recursive: true, force: true }); },
  };
}
