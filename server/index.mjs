import http from "node:http";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { verify, hash } from "@node-rs/argon2";

function secret(name) {
  const file = process.env[`${name}_FILE`];
  const value = file ? readFileSync(file, "utf8").trim() : process.env[name];
  if (!value) throw new Error(`${name} or ${name}_FILE is required`);
  return value;
}
const databaseUrl = secret("DATABASE_URL");
const adminApiToken = secret("ADMIN_API_TOKEN");
const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : undefined });
const privateKey = crypto.createPrivateKey(secret("LICENSE_PRIVATE_KEY").replaceAll("\\n", "\n"));
const publicKey = crypto.createPublicKey(secret("LICENSE_PUBLIC_KEY").replaceAll("\\n", "\n"));
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const attempts = new Map();

const b64 = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
function signedLicense(payload) {
  const header = b64({ alg: "EdDSA", typ: "JWT", kid: "license-v1" });
  const body = b64(payload); const input = `${header}.${body}`;
  return `${input}.${crypto.sign(null, Buffer.from(input), privateKey).toString("base64url")}`;
}
function json(response, status, value) { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" }); response.end(JSON.stringify(value)); }
async function body(request) { const chunks = []; for await (const chunk of request) { chunks.push(chunk); if (chunks.reduce((n, x) => n + x.length, 0) > 64 * 1024) throw new Error("BODY_TOO_LARGE"); } return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
function fingerprint(key) { return crypto.createHash("sha256").update(crypto.createPublicKey(key).export({ type: "spki", format: "der" })).digest("hex"); }
function audit(client, actorType, actorId, eventType, targetId, metadata = {}) { return client.query("INSERT INTO audit_events(actor_type,actor_id,event_type,target_id,metadata) VALUES($1,$2,$3,$4,$5)", [actorType, actorId, eventType, targetId, metadata]); }
function throttled(ip) { const now = Date.now(); const active = (attempts.get(ip) || []).filter((at) => now - at < 15 * 60_000); attempts.set(ip, active); return active.length >= 10; }
function failed(ip) { attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]); }
function admin(request) { const provided = request.headers.authorization?.replace(/^Bearer /, "") || ""; return provided.length === adminApiToken.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(adminApiToken)); }
async function issueLicense(client, clinic, device) {
  const now = new Date(); const expires = new Date(now.getTime() + clinic.offline_days * 86_400_000);
  const release = await client.query("SELECT * FROM releases WHERE channel=$1 AND platform=$2 AND architecture=$3 ORDER BY published_at DESC LIMIT 1", [clinic.update_channel, device.platform, device.architecture]);
  return signedLicense({ iss: "avina-license", sub: clinic.id, aud: "avina-desktop", deviceId: device.id, fingerprint: device.public_key_fingerprint, iat: Math.floor(now.getTime()/1000), exp: Math.floor(expires.getTime()/1000), serverTime: now.toISOString(), minimumVersion: release.rows[0]?.minimum_version || "0.1.0", mandatoryAfter: release.rows[0]?.mandatory_after || null });
}
async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`); const ip = request.socket.remoteAddress || "unknown";
  if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ok: true, publicKey: publicKey.export({ type: "spki", format: "pem" }) });
  if (request.method === "POST" && url.pathname === "/v1/activate") {
    if (throttled(ip)) return json(response, 429, { code: "RATE_LIMITED" });
    const input = await body(request); const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query("SELECT * FROM clinics WHERE username=$1 FOR UPDATE", [input.username]); const clinic = result.rows[0];
      if (!clinic || !(await verify(clinic.password_hash, String(input.password || "")))) { failed(ip); await client.query("ROLLBACK"); return json(response, 401, { code: "INVALID_CREDENTIALS" }); }
      if (!clinic.enabled) { await client.query("ROLLBACK"); return json(response, 403, { code: "ACCOUNT_DISABLED" }); }
      if (clinic.password_change_required) { await client.query("ROLLBACK"); return json(response, 403, { code: "PASSWORD_CHANGE_REQUIRED" }); }
      const active = await client.query("SELECT count(*)::int count FROM devices WHERE clinic_id=$1 AND status='active'", [clinic.id]);
      if (active.rows[0].count >= clinic.maximum_activated_devices) { await audit(client, "clinic", clinic.id, "activation_rejected", clinic.id, { reason: "limit" }); await client.query("COMMIT"); return json(response, 409, { code: "DEVICE_LIMIT_REACHED", maximum: clinic.maximum_activated_devices }); }
      const publicKeyText = String(input.publicKey || ""); const keyFingerprint = fingerprint(publicKeyText); const id = crypto.randomUUID();
      const inserted = await client.query(`INSERT INTO devices(id,clinic_id,installation_id,public_key,public_key_fingerprint,label,platform,architecture,app_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [id, clinic.id, input.installationId, publicKeyText, keyFingerprint, String(input.label || "Computer").slice(0,100), input.platform, input.architecture, input.appVersion]);
      const license = await issueLicense(client, clinic, inserted.rows[0]); await audit(client, "clinic", clinic.id, "device_activated", id); await client.query("COMMIT");
      return json(response, 201, { license, deviceId: id });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  if (request.method === "POST" && url.pathname === "/v1/validate") {
    const input = await body(request); const result = await pool.query(`SELECT d.*, c.enabled, c.offline_days, c.update_channel, c.id clinic_id FROM devices d JOIN clinics c ON c.id=d.clinic_id WHERE d.id=$1`, [input.deviceId]); const device = result.rows[0];
    if (!device || device.status === "revoked") return json(response, 403, { code: "DEVICE_REVOKED" });
    if (!device.enabled) return json(response, 403, { code: "ACCOUNT_DISABLED" });
    const valid = crypto.verify(null, Buffer.from(String(input.challenge)), crypto.createPublicKey(device.public_key), Buffer.from(String(input.signature), "base64url"));
    if (!valid) return json(response, 403, { code: "DEVICE_KEY_MISMATCH" });
    await pool.query("UPDATE devices SET last_validated_at=now(), app_version=$2 WHERE id=$1", [device.id, input.appVersion]);
    return json(response, 200, { license: await issueLicense(pool, device, device) });
  }
  if (request.method === "POST" && url.pathname === "/v1/deactivate") {
    const input = await body(request);
    const result = await pool.query("SELECT public_key,status FROM devices WHERE id=$1", [input.deviceId]); const device = result.rows[0];
    if (!device || device.status === "revoked") return json(response, 403, { code: "DEVICE_REVOKED" });
    const valid = crypto.verify(null, Buffer.from(String(input.challenge)), crypto.createPublicKey(device.public_key), Buffer.from(String(input.signature), "base64url"));
    if (!valid) return json(response, 403, { code: "DEVICE_KEY_MISMATCH" });
    await pool.query("UPDATE devices SET status='revoked', revoked_at=now() WHERE id=$1", [input.deviceId]); return json(response, 200, { ok: true });
  }
  if (request.method === "GET" && url.pathname === "/v1/updates") {
    const result = await pool.query("SELECT version,minimum_version AS \"minimumVersion\",mandatory_after AS \"mandatoryAfter\",release_notes AS \"releaseNotes\",artifact_url AS url,sha512 FROM releases WHERE channel=$1 AND platform=$2 AND architecture=$3 ORDER BY published_at DESC LIMIT 1", [url.searchParams.get("channel") || "stable", url.searchParams.get("platform"), url.searchParams.get("arch")]);
    return result.rows[0] ? json(response, 200, result.rows[0]) : json(response, 204, {});
  }
  if (url.pathname.startsWith("/v1/admin/") && !admin(request)) return json(response, 401, { code: "INVALID_ADMIN_TOKEN" });
  if (request.method === "POST" && url.pathname === "/v1/admin/clinics") {
    const input = await body(request); const id = crypto.randomUUID(); const passwordHash = await hash(String(input.password), { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await pool.query("INSERT INTO clinics(id,username,password_hash,maximum_activated_devices,password_change_required) VALUES($1,$2,$3,$4,$5)", [id, input.username, passwordHash, input.maximumActivatedDevices || 1, input.passwordChangeRequired === true]); return json(response, 201, { id, username: input.username });
  }
  if (request.method === "GET" && url.pathname === "/v1/admin/clinics") { const result = await pool.query(`SELECT c.id,c.username,c.enabled,c.maximum_activated_devices AS "maximumActivatedDevices",c.offline_days AS "offlineDays",count(d.id) FILTER(WHERE d.status='active')::int AS "activeDevices" FROM clinics c LEFT JOIN devices d ON d.clinic_id=c.id GROUP BY c.id ORDER BY c.created_at DESC`); return json(response, 200, { clinics: result.rows }); }
  const revoke = url.pathname.match(/^\/v1\/admin\/devices\/([^/]+)\/revoke$/);
  if (request.method === "POST" && revoke) { await pool.query("UPDATE devices SET status='revoked',revoked_at=now() WHERE id=$1", [revoke[1]]); return json(response, 200, { ok: true }); }
  return json(response, 404, { code: "NOT_FOUND" });
}

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
await pool.query(schema);
http.createServer((request, response) => route(request, response).catch((error) => { console.error(error); json(response, 500, { code: "SERVER_ERROR" }); })).listen(port, host, () => console.log(`Licensing server listening on ${host}:${port}`));
