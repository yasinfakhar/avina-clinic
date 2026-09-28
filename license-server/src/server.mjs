import { createHash, generateKeyPairSync, randomBytes, randomInt, sign, timingSafeEqual, verify } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import http from "node:http";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const port = Number(process.env.PORT || 8787);
const dataDirectory = path.resolve(process.env.DATA_DIR || "/data");
const adminToken = process.env.LICENSE_ADMIN_TOKEN || "";
if (adminToken.length < 24) throw new Error("LICENSE_ADMIN_TOKEN must contain at least 24 characters");
mkdirSync(dataDirectory, { recursive: true });
const updateDirectory = path.join(dataDirectory, "updates", "windows");
const publicDirectory = path.resolve("public");
mkdirSync(updateDirectory, { recursive: true });

const privateKeyPath = path.join(dataDirectory, "ed25519-private.pem");
const publicKeyPath = path.join(dataDirectory, "ed25519-public.pem");
if (!existsSync(privateKeyPath) || !existsSync(publicKeyPath)) {
  const pair = generateKeyPairSync("ed25519");
  writeFileSync(privateKeyPath, pair.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writeFileSync(publicKeyPath, pair.publicKey.export({ type: "spki", format: "pem" }), { mode: 0o644 });
}
const privateKey = readFileSync(privateKeyPath, "utf8");
const publicKey = readFileSync(publicKeyPath, "utf8");

const database = new DatabaseSync(path.join(dataDirectory, "licenses.sqlite"));
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    key_hint TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK(status IN ('active', 'revoked')),
    machine_fingerprint TEXT,
    device_id TEXT,
    created_at INTEGER NOT NULL,
    activated_at INTEGER,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS recovery_codes (
    id TEXT PRIMARY KEY,
    license_id TEXT NOT NULL,
    code_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(license_id) REFERENCES licenses(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS recovery_codes_expiry_idx ON recovery_codes(expires_at);
  CREATE TABLE IF NOT EXISTS releases (
    version TEXT PRIMARY KEY,
    changelog TEXT NOT NULL,
    update_date INTEGER NOT NULL,
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published', 'draft')),
    created_at INTEGER NOT NULL
  );
`);
for (const statement of [
  "ALTER TABLE licenses ADD COLUMN app_version TEXT",
  "ALTER TABLE licenses ADD COLUMN platform TEXT",
  "ALTER TABLE licenses ADD COLUMN last_seen_at INTEGER"
]) { try { database.exec(statement); } catch (error) { if (!String(error.message).includes("duplicate column")) throw error; } }

function id(prefix) { return `${prefix}_${randomBytes(12).toString("hex")}`; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function encoded(value) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function signedToken(payload) {
  const header = encoded({ alg: "EdDSA", typ: "JWT" });
  const body = encoded(payload);
  const signature = sign(null, Buffer.from(`${header}.${body}`), privateKey).toString("base64url");
  return `${header}.${body}.${signature}`;
}
function verifyToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], "base64url"))) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch { return null; }
}
function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(body));
}
async function body(request) {
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 64 * 1024) throw new Error("Request too large"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  const expected = Buffer.from(adminToken); const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
const attempts = new Map();
function rateLimited(request, scope, limit = 12) {
  const key = `${scope}:${request.socket.remoteAddress || "unknown"}`; const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1; return current.count > limit;
}
function validFingerprint(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function newLicenseKey() {
  const value = randomBytes(20).toString("base64url").toUpperCase();
  return `AVINA-${value.match(/.{1,5}/g).join("-")}`;
}
function validVersion(value) { return typeof value === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value); }
function compareVersions(left, right) {
  const a = left.split(".").map(Number); const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}
function releaseDto(row) { return { version: row.version, changelog: row.changelog, update_date: new Date(row.update_date).toISOString(), url: row.url }; }
function releaseList() {
  return database.prepare("SELECT version, changelog, update_date, url FROM releases WHERE status = 'published'").all()
    .sort((a, b) => compareVersions(b.version, a.version)).map(releaseDto);
}
function contentType(file) {
  if (file.endsWith(".yml")) return "text/yaml; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  return "application/octet-stream";
}
function serveUpdateFile(response, name) {
  if (!/^[A-Za-z0-9._ -]+$/.test(name)) return json(response, 400, { error: "Invalid file name" });
  const file = path.join(updateDirectory, name);
  if (!existsSync(file) || !statSync(file).isFile()) return json(response, 404, { error: "File not found" });
  response.writeHead(200, { "Content-Type": contentType(file), "Content-Length": statSync(file).size, "Cache-Control": name === "latest.yml" ? "no-cache" : "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
  createReadStream(file).pipe(response); return true;
}

async function handleActivation(request, response) {
  if (rateLimited(request, "activation")) return json(response, 429, { error: "Too many activation attempts" });
  const input = await body(request);
  if (typeof input.licenseKey !== "string" || !validFingerprint(input.machineFingerprint)) return json(response, 400, { error: "Invalid activation request" });
  const license = database.prepare("SELECT * FROM licenses WHERE key_hash = ?").get(sha256(input.licenseKey.trim())) ;
  if (!license || license.status !== "active") return json(response, 403, { error: "License key is invalid or revoked" });
  if (license.machine_fingerprint && license.machine_fingerprint !== input.machineFingerprint) return json(response, 409, { error: "License key is already activated on another computer" });
  const deviceId = license.device_id || id("dev"); const now = Date.now();
  if (!license.machine_fingerprint) database.prepare("UPDATE licenses SET machine_fingerprint = ?, device_id = ?, activated_at = ?, updated_at = ? WHERE id = ?")
    .run(input.machineFingerprint, deviceId, now, now, license.id);
  database.prepare("UPDATE licenses SET app_version = ?, platform = ?, last_seen_at = ?, updated_at = ? WHERE id = ?")
    .run(validVersion(input.appVersion) ? input.appVersion : null, String(input.platform || "").slice(0, 80) || null, now, now, license.id);
  const token = signedToken({ status: "active", machineFingerprint: input.machineFingerprint, licenseId: license.id, deviceId, iat: Math.floor(now / 1000) });
  return json(response, 200, { token, licenseId: license.id, deviceId });
}

async function handleRecovery(request, response) {
  if (rateLimited(request, "recovery", 6)) return json(response, 429, { error: "Too many recovery attempts" });
  const input = await body(request); const activation = verifyToken(String(input.activationToken || ""));
  if (!activation || activation.status !== "active" || activation.machineFingerprint !== input.machineFingerprint) return json(response, 403, { error: "Invalid activation" });
  const license = database.prepare("SELECT * FROM licenses WHERE id = ?").get(activation.licenseId);
  if (!license || license.status !== "active" || license.machine_fingerprint !== input.machineFingerprint) return json(response, 403, { error: "License is not active" });
  const recovery = database.prepare("SELECT * FROM recovery_codes WHERE code_hash = ? AND license_id = ?").get(sha256(String(input.code || "").trim()), license.id);
  if (!recovery || recovery.used_at || recovery.expires_at <= Date.now()) return json(response, 400, { error: "Recovery code is invalid or expired" });
  database.prepare("UPDATE recovery_codes SET used_at = ? WHERE id = ?").run(Date.now(), recovery.id);
  const exp = Math.floor(Date.now() / 1000) + 5 * 60;
  return json(response, 200, { recoveryToken: signedToken({ purpose: "password-recovery", machineFingerprint: input.machineFingerprint, licenseId: license.id, exp }) });
}

async function handleAdmin(request, response, url) {
  if (!authorized(request)) return json(response, 401, { error: "Unauthorized" });
  const upload = url.pathname.match(/^\/admin\/update-files\/([^/]+)$/);
  if (request.method === "PUT" && upload) {
    const name = decodeURIComponent(upload[1]);
    if (!/^[A-Za-z0-9._ -]+$/.test(name) || !(name === "latest.yml" || name.endsWith(".exe") || name.endsWith(".blockmap"))) return json(response, 400, { error: "Invalid update file" });
    const declared = Number(request.headers["content-length"] || 0);
    if (!declared || declared > 2 * 1024 * 1024 * 1024) return json(response, 413, { error: "Invalid file size" });
    const target = path.join(updateDirectory, name); const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
    try { await pipeline(request, createWriteStream(temporary, { mode: 0o644 })); renameSync(temporary, target); }
    catch (error) { rmSync(temporary, { force: true }); throw error; }
    return json(response, 201, { uploaded: true, name, size: statSync(target).size });
  }
  if (request.method === "POST" && url.pathname === "/admin/licenses") {
    const input = await body(request); const key = newLicenseKey(); const licenseId = id("lic"); const now = Date.now();
    database.prepare("INSERT INTO licenses (id, key_hash, key_hint, label, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)")
      .run(licenseId, sha256(key), key.slice(-8), String(input.label || "").slice(0, 200), now, now);
    return json(response, 201, { id: licenseId, licenseKey: key, label: String(input.label || "") });
  }
  if (request.method === "GET" && url.pathname === "/admin/licenses") {
    const licenses = database.prepare("SELECT id, key_hint AS keyHint, label, status, machine_fingerprint AS machineFingerprint, device_id AS deviceId, app_version AS appVersion, platform, last_seen_at AS lastSeenAt, created_at AS createdAt, activated_at AS activatedAt, updated_at AS updatedAt FROM licenses ORDER BY created_at DESC").all();
    return json(response, 200, { licenses });
  }
  if (request.method === "GET" && url.pathname === "/admin/releases") return json(response, 200, { releases: releaseList() });
  if (request.method === "POST" && url.pathname === "/admin/releases") {
    const input = await body(request);
    if (!validVersion(input.version)) return json(response, 400, { error: "Version must use x.y.z format" });
    if (typeof input.changelog !== "string" || !input.changelog.trim() || input.changelog.length > 100_000) return json(response, 400, { error: "Changelog is required" });
    if (!existsSync(path.join(updateDirectory, "latest.yml")) || !existsSync(path.join(updateDirectory, `Avina-Audiology-Setup-${input.version}.exe`))) return json(response, 409, { error: "Upload latest.yml and the version installer before publishing" });
    const newest = releaseList()[0];
    if (newest && compareVersions(input.version, newest.version) <= 0) return json(response, 409, { error: `Version must be newer than ${newest.version}` });
    const now = Date.now(); const artifactUrl = `/avina/update/windows/Avina-Audiology-Setup-${input.version}.exe`;
    database.prepare("INSERT INTO releases (version, changelog, update_date, url, status, created_at) VALUES (?, ?, ?, ?, 'published', ?)")
      .run(input.version, input.changelog.trim(), now, artifactUrl, now);
    return json(response, 201, { release: releaseDto({ version: input.version, changelog: input.changelog.trim(), update_date: now, url: artifactUrl }) });
  }
  const action = url.pathname.match(/^\/admin\/licenses\/([^/]+)\/(revoke|reset-device)$/);
  if (request.method === "POST" && action) {
    const license = database.prepare("SELECT id FROM licenses WHERE id = ?").get(action[1]); if (!license) return json(response, 404, { error: "License not found" });
    if (action[2] === "revoke") database.prepare("UPDATE licenses SET status = 'revoked', updated_at = ? WHERE id = ?").run(Date.now(), action[1]);
    else database.prepare("UPDATE licenses SET machine_fingerprint = NULL, device_id = NULL, activated_at = NULL, updated_at = ? WHERE id = ?").run(Date.now(), action[1]);
    return json(response, 200, { updated: true });
  }
  if (request.method === "POST" && url.pathname === "/admin/recovery-codes") {
    const input = await body(request); const license = database.prepare("SELECT id, status FROM licenses WHERE id = ?").get(input.licenseId);
    if (!license || license.status !== "active") return json(response, 404, { error: "Active license not found" });
    const code = String(randomInt(10000000, 100000000)); const now = Date.now(); const expiresAt = now + 10 * 60 * 1000;
    database.prepare("INSERT INTO recovery_codes (id, license_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id("rec"), license.id, sha256(code), expiresAt, now);
    return json(response, 201, { code, expiresAt: new Date(expiresAt).toISOString() });
  }
  return json(response, 404, { error: "Not found" });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  try {
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok" });
    if (request.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin/")) {
      const file = path.join(publicDirectory, "admin.html");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'" });
      return createReadStream(file).pipe(response);
    }
    if (request.method === "GET" && url.pathname === "/v1/public-key") return json(response, 200, { algorithm: "Ed25519", publicKey });
    if (request.method === "GET" && (url.pathname === "/avina/update" || url.pathname === "/avina/update/")) {
      const releases = releaseList(); return json(response, 200, { latest: releases[0] || null, releases });
    }
    if (request.method === "GET" && url.pathname.startsWith("/avina/update/windows/")) return serveUpdateFile(response, decodeURIComponent(url.pathname.slice("/avina/update/windows/".length)));
    if (request.method === "POST" && url.pathname === "/v1/activations") return await handleActivation(request, response);
    if (request.method === "POST" && url.pathname === "/v1/password-recovery/verify") return await handleRecovery(request, response);
    if (url.pathname.startsWith("/admin/")) return await handleAdmin(request, response, url);
    return json(response, 404, { error: "Not found" });
  } catch (error) { console.error(error); return json(response, error.message === "Request too large" ? 413 : 400, { error: "Invalid request" }); }
});
server.listen(port, "0.0.0.0", () => console.log(`Avina license service listening on port ${port}`));
function shutdown() { server.close(() => { database.close(); process.exit(0); }); setTimeout(() => process.exit(1), 10_000).unref(); }
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
