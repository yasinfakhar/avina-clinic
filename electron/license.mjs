import { safeStorage } from "electron";
import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { hash, verify } from "@node-rs/argon2";

const encode = (value) => Buffer.from(value).toString("base64");
const decode = (value) => Buffer.from(value, "base64");
const b64json = (value) => JSON.parse(Buffer.from(value, "base64url").toString("utf8"));

export class LicenseManager {
  constructor({ file, serverUrl, publicKey, version }) {
    this.file = file;
    this.serverUrl = serverUrl?.replace(/\/$/, "");
    this.publicKey = publicKey ? crypto.createPublicKey(publicKey.replaceAll("\\n", "\n")) : null;
    this.version = version;
  }
  load() {
    if (!existsSync(this.file) || !safeStorage.isEncryptionAvailable()) return null;
    try { return JSON.parse(safeStorage.decryptString(decode(readFileSync(this.file, "utf8")))); } catch { return null; }
  }
  save(value) { writeFileSync(this.file, encode(safeStorage.encryptString(JSON.stringify(value))), { mode: 0o600 }); }
  verifyLicense(token) {
    if (!this.publicKey) throw Object.assign(new Error("Licensing public key is not configured"), { code: "SERVER_UNAVAILABLE" });
    const [header, payload, signature] = String(token).split(".");
    if (!header || !payload || !signature || !crypto.verify(null, Buffer.from(`${header}.${payload}`), this.publicKey, Buffer.from(signature, "base64url"))) throw Object.assign(new Error("Invalid offline license"), { code: "DEVICE_KEY_MISMATCH" });
    const claims = b64json(payload); if (claims.iss !== "avina-license" || claims.aud !== "avina-desktop") throw new Error("Invalid license issuer");
    return claims;
  }
  ensureKey(state) {
    if (state?.privateKey && state?.publicKey) return state;
    const pair = crypto.generateKeyPairSync("ed25519");
    return { ...state, installationId: crypto.randomUUID(), publicKey: pair.publicKey.export({ type: "spki", format: "pem" }), privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }), protection: "os-keystore" };
  }
  async request(path, body) {
    if (!this.serverUrl?.startsWith("https://") && !this.serverUrl?.startsWith("http://127.0.0.1")) throw Object.assign(new Error("A secure licensing server is required"), { code: "SERVER_UNAVAILABLE" });
    const response = await fetch(`${this.serverUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    const result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.code || "License request failed"), result); return result;
  }
  async login(username, password) {
    let state = this.ensureKey(this.load());
    if (state.username === username && state.passwordHash && await verify(state.passwordHash, password)) {
      const claims = this.verifyLicense(state.license); const now = Date.now();
      if (state.lastWallTime && now + 5 * 60_000 < state.lastWallTime) throw Object.assign(new Error("System clock rollback detected"), { code: "OFFLINE_LICENSE_EXPIRED" });
      try {
        const challenge = crypto.randomBytes(32).toString("base64url");
        const signature = crypto.sign(null, Buffer.from(challenge), crypto.createPrivateKey(state.privateKey)).toString("base64url");
        const renewed = await this.request("/v1/validate", { deviceId: state.deviceId, challenge, signature, appVersion: this.version }); state.license = renewed.license;
      } catch {
        if (Date.now() >= claims.exp * 1000) throw Object.assign(new Error("Offline license expired"), { code: "OFFLINE_LICENSE_EXPIRED" });
      }
      state.lastWallTime = now; this.save(state); return { username, offlineUntil: new Date(this.verifyLicense(state.license).exp * 1000).toISOString(), protection: state.protection };
    }
    const activated = await this.request("/v1/activate", { username, password, installationId: state.installationId, publicKey: state.publicKey, label: os.hostname(), platform: process.platform, architecture: process.arch, appVersion: this.version });
    state = { ...state, username, passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }), license: activated.license, deviceId: activated.deviceId, lastWallTime: Date.now() };
    this.verifyLicense(state.license); this.save(state);
    return { username, offlineUntil: new Date(this.verifyLicense(state.license).exp * 1000).toISOString(), protection: state.protection };
  }
  status() { const state = this.load(); if (!state?.license) return { activated: false }; try { const claims = this.verifyLicense(state.license); return { activated: true, username: state.username, deviceId: state.deviceId, offlineUntil: new Date(claims.exp * 1000).toISOString(), protection: state.protection }; } catch { return { activated: false }; } }
  async deactivate() {
    const state = this.load(); if (!state?.deviceId) return;
    const challenge = crypto.randomBytes(32).toString("base64url");
    const signature = crypto.sign(null, Buffer.from(challenge), crypto.createPrivateKey(state.privateKey)).toString("base64url");
    await this.request("/v1/deactivate", { deviceId: state.deviceId, challenge, signature }); this.save({});
  }
}
