import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { validateHeaderImage } from "../app/server/header-image.ts";
import { verifyActivationToken } from "../electron/licensing.mjs";

function signedToken(payload, privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(`${header}.${body}`), privateKey).toString("base64url");
  return `${header}.${body}.${signature}`;
}

test("accepts only fully decodable 2171x341 header images", async () => {
  const valid = await sharp({ create: { width: 2171, height: 341, channels: 3, background: "white" } }).png().toBuffer();
  assert.equal((await validateHeaderImage(valid, "image/png")).extension, ".png");
  await assert.rejects(validateHeaderImage(valid, "image/jpeg"), /معتبر نیست/);
  const wrongSize = await sharp({ create: { width: 100, height: 100, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(validateHeaderImage(wrongSize, "image/png"), /۲۱۷۱×۳۴۱/);
  await assert.rejects(validateHeaderImage(Buffer.from("not an image"), "image/png"), /معتبر نیست/);
});

test("activation tokens are signed and bound to one fingerprint", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const payload = { status: "active", machineFingerprint: "device-a", licenseId: "lic-1", deviceId: "dev-1" };
  const token = signedToken(payload, privateKey);
  assert.deepEqual(verifyActivationToken(token, publicKey, "device-a"), payload);
  assert.equal(verifyActivationToken(token, publicKey, "device-b"), null);
  assert.equal(verifyActivationToken(`${token}x`, publicKey, "device-a"), null);
});

test("electron-updater CommonJS interop exposes autoUpdater", () => {
  const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
  assert.match(main, /import electronUpdater from "electron-updater"/);
  assert.doesNotMatch(main, /import\s*\{\s*autoUpdater\s*\}\s*from\s*"electron-updater"/);
});
