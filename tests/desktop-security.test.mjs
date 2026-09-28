import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateHeaderImage } from "../app/server/header-image.ts";
import { fingerprintFromIdentity, verifyActivationToken } from "../electron/licensing.mjs";

function signedToken(payload, privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(`${header}.${body}`), privateKey).toString("base64url");
  return `${header}.${body}.${signature}`;
}

test("accepts only structurally valid 2170x230 header images", () => {
  const valid = Buffer.from(readFileSync(new URL("../public/header.png", import.meta.url)));
  valid.writeUInt32BE(2170, 16);
  valid.writeUInt32BE(230, 20);
  assert.equal(validateHeaderImage(valid, "image/png").extension, ".png");
  assert.throws(() => validateHeaderImage(valid, "image/jpeg"), /معتبر نیست/);
  const wrongSize = Buffer.from(valid); wrongSize.writeUInt32BE(100, 16); wrongSize.writeUInt32BE(100, 20);
  assert.throws(() => validateHeaderImage(wrongSize, "image/png"), /۲۱۷۰×۲۳۰/);
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
