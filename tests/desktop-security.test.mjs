import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateHeaderImage } from "../app/server/header-image.ts";
import { fingerprintFromIdentity, verifyActivationToken } from "../electron/licensing.mjs";
import { getReleaseNotesForVersion } from "../electron/release-notes.mjs";

function signedToken(payload, privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(`${header}.${body}`), privateKey).toString("base64url");
  return `${header}.${body}.${signature}`;
}

test("accepts structurally valid 2480px-wide header images up to 400px high", () => {
  const valid = Buffer.from(readFileSync(new URL("../public/header.png", import.meta.url)));
  valid.writeUInt32BE(2480, 16);
  valid.writeUInt32BE(400, 20);
  assert.equal(validateHeaderImage(valid, "image/png").extension, ".png");
  const shorter = Buffer.from(valid); shorter.writeUInt32BE(100, 20);
  assert.equal(validateHeaderImage(shorter, "image/png").height, 100);
  assert.throws(() => validateHeaderImage(valid, "image/jpeg"), /معتبر نیست/);
  const tooTall = Buffer.from(valid); tooTall.writeUInt32BE(401, 20);
  assert.throws(() => validateHeaderImage(tooTall, "image/png"), /حداکثر ۴۰۰/);
  const wrongWidth = Buffer.from(valid); wrongWidth.writeUInt32BE(100, 16);
  assert.throws(() => validateHeaderImage(wrongWidth, "image/png"), /عرض.*۲۴۸۰/);
  assert.throws(() => validateHeaderImage(Buffer.from("not an image"), "image/png"), /معتبر نیست/);
});

test("activation tokens are signed and bound to one fingerprint", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const payload = { status: "active", machineFingerprint: "device-a", licenseId: "lic-1", deviceId: "dev-1" };
  const token = signedToken(payload, privateKey);
  assert.deepEqual(verifyActivationToken(token, publicKey, "device-a"), payload);
  assert.equal(verifyActivationToken(token, publicKey, "device-b"), null);
  assert.equal(verifyActivationToken(`${token}x`, publicKey, "device-a"), null);
});

test("machine fingerprint has the server's expected SHA-256 format", () => {
  const identity = { platform: "win32", arch: "x64", machineId: "cloned-machine-guid", systemUuid: "11111111-2222-3333-4444-555555555555" };
  assert.match(fingerprintFromIdentity(identity), /^[a-f0-9]{64}$/);
  assert.equal(fingerprintFromIdentity(identity), fingerprintFromIdentity(identity));
  assert.notEqual(fingerprintFromIdentity(identity), fingerprintFromIdentity({ ...identity, systemUuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }));
});

test("electron-updater CommonJS interop exposes autoUpdater", () => {
  const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
  assert.match(main, /import electronUpdater from "electron-updater"/);
  assert.doesNotMatch(main, /import\s*\{\s*autoUpdater\s*\}\s*from\s*"electron-updater"/);
});

test("self-hosted Windows updates use manifest hash verification without CA trust", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.build.win.verifyUpdateCodeSignature, false);
  assert.match(manifest.build.publish.url, /^https:\/\//);
});

test("Windows installer checks only the Avina executable during upgrades", () => {
  const installer = readFileSync(new URL("../build/installer.nsh", import.meta.url), "utf8");
  assert.match(installer, /!macro customCheckAppRunning/);
  assert.match(installer, /taskkill\.exe.*APP_EXECUTABLE_FILENAME/);
  assert.doesNotMatch(installer, /StartsWith\('\$INSTDIR'/);
});

test("Windows releases always use one fixed all-users installation", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.build.nsis.perMachine, true);
  assert.equal(manifest.build.nsis.allowElevation, true);
  assert.equal(manifest.build.nsis.allowToChangeInstallationDirectory, false);
});

test("automatic updates wait for the bundled server to stop before installation", () => {
  const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
  assert.match(main, /async function stopServer\(\)/);
  assert.match(main, /taskkill\.exe.*\["\/PID", String\(child\.pid\), "\/T", "\/F"\]/s);
  assert.match(main, /did not stop/);
  assert.match(main, /await stopServer\(\);\s*autoUpdater\.quitAndInstall/);
});

test("invoice PDFs are saved through a validated desktop IPC channel", () => {
  const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
  const preload = readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  assert.match(main, /ipcMain\.handle\("invoice:save-pdf"/);
  assert.match(main, /event\.sender !== appWindow\.webContents/);
  assert.match(main, /path\.join\(dataDirectory, "factors"\)/);
  assert.match(preload, /saveInvoicePdf: \(recordId\) => ipcRenderer\.invoke\("invoice:save-pdf", recordId\)/);
});

test("shows release notes once on the first launch of an installed version", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "audiology-release-notes-"));
  const pending = path.join(directory, "pending.json");
  const acknowledged = path.join(directory, "acknowledged.json");
  const release = { version: "1.2.3", changelog: "- New feature", update_date: "2026-09-28", url: "https://example.com" };

  try {
    writeFileSync(pending, JSON.stringify(release));
    assert.deepEqual(getReleaseNotesForVersion(pending, acknowledged, "1.2.3"), release);

    writeFileSync(acknowledged, JSON.stringify({ version: "1.2.3" }));
    assert.equal(getReleaseNotesForVersion(pending, acknowledged, "1.2.3"), null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
