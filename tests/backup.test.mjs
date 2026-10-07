import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { archive, backupName, createBackupStore, isWithin, validateData } from '../electron/backup.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'avina-backup-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const user = path.join(root, 'user');
  const data = path.join(user, 'data');
  mkdirSync(path.join(data, 'images'), { recursive: true });
  const db = new DatabaseSync(path.join(data, 'audiology.sqlite'));
  db.exec(`CREATE TABLE records(id TEXT); INSERT INTO records VALUES ('original');
    CREATE TABLE files(category TEXT, stored_name TEXT, size INTEGER);
    CREATE TABLE app_settings(key TEXT, value TEXT);
    CREATE TABLE admin_credentials(username TEXT);
    CREATE TABLE auth_sessions(token_hash TEXT); INSERT INTO auth_sessions VALUES ('old-session');`);
  db.close();
  writeFileSync(path.join(data, 'license.json'), 'this-machine');
  return { root, user, data, store: createBackupStore(user) };
}

// A stored, empty ZIP entry is enough to test hostile filenames before extraction.
function emptyZip(name) {
  const filename = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6); central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + filename.length, 12); end.writeUInt32LE(local.length + filename.length, 16);
  return Buffer.concat([local, filename, central, filename, end]);
}

test('backup filename uses Tehran date and time, and containment respects sibling directories', () => {
  assert.equal(backupName(new Date('2026-10-07T21:00:00Z')), 'avina_backup_2026-10-08_00-30-00.zip');
  assert.equal(isWithin('C:/app/data', 'C:/app/data/backup.zip'), true);
  assert.equal(isWithin('C:/app/data', 'C:/app/data-old/backup.zip'), false);
});

test('invalid databases and missing attachments are rejected', (t) => {
  const { data } = fixture(t);
  validateData(data);
  const db = new DatabaseSync(path.join(data, 'audiology.sqlite'));
  db.exec("INSERT INTO files VALUES ('image', 'missing.png', 10)"); db.close();
  assert.throws(() => validateData(data), /پیوست/);
  writeFileSync(path.join(data, 'audiology.sqlite'), 'broken');
  assert.throws(() => validateData(data));
});

test('ZIP roundtrip replaces data, preserves local license and clears sessions; rollback survives a new store', { skip: process.platform !== 'win32' }, async (t) => {
  const { root, user, data, store } = fixture(t);
  writeFileSync(path.join(data, 'images', 'تصویر.png'), 'image-bytes');
  const zip = path.join(root, 'بکاپ پرونده.zip');
  await store.save(zip);
  assert.equal(store.history()[0].available, true);
  writeFileSync(path.join(data, 'license.json'), 'new-local-license');
  writeFileSync(path.join(data, 'extra.txt'), 'must disappear');
  const staged = await store.stage(zip);
  store.replace(staged);
  assert.equal(readFileSync(path.join(data, 'license.json'), 'utf8'), 'new-local-license');
  assert.equal(existsSync(path.join(data, 'extra.txt')), false);
  assert.equal(readFileSync(path.join(data, 'images', 'تصویر.png'), 'utf8'), 'image-bytes');
  const restoredDb = new DatabaseSync(path.join(data, 'audiology.sqlite'));
  assert.equal(restoredDb.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0);
  restoredDb.close();
  createBackupStore(user).recover();
  assert.equal(readFileSync(path.join(data, 'extra.txt'), 'utf8'), 'must disappear');
  store.cleanStage(staged);
  const committed = await store.stage(zip);
  store.replace(committed); store.commit(); store.cleanStage(committed);
  createBackupStore(user).recover();
  assert.equal(existsSync(path.join(data, 'extra.txt')), false);
  assert.equal(store.history().length, 1);
  renameSync(zip, `${zip}.moved`);
  assert.equal(store.history()[0].available, false);
});

test('backup cannot be stored inside live data', async (t) => {
  const { data, store } = fixture(t);
  await assert.rejects(store.save(path.join(data, 'backup.zip')), /خارج/);
});

test('unsafe ZIP paths and non-Avina archives leave live data untouched', { skip: process.platform !== 'win32' }, async (t) => {
  const { root, data, store } = fixture(t);
  for (const name of ['data/../../outside.txt', 'data\\..\\outside.txt', 'data/a:stream', 'data/CON.txt', 'other/file']) {
    const zip = path.join(root, 'unsafe.zip');
    writeFileSync(zip, emptyZip(name));
    await assert.rejects(store.stage(zip));
  }
  assert.equal(readFileSync(path.join(data, 'license.json'), 'utf8'), 'this-machine');
  assert.equal(existsSync(path.join(root, 'outside.txt')), false);
  const invalid = path.join(root, 'invalid'); mkdirSync(invalid);
  writeFileSync(path.join(invalid, 'not-a-database'), 'test');
  const zip = path.join(root, 'invalid.zip'); await archive('create', invalid, zip);
  await assert.rejects(store.stage(zip));
});
