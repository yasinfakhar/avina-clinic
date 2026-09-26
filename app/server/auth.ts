import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "@/db";

const COOKIE_NAME = "audiology_session";
const SESSION_AGE_MS = 12 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

export function verifyPassword(password: string, salt: string, expected: string) {
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export function ensureAdmin() {
  const database = getDb();
  const existing = database.prepare("SELECT username FROM admin_credentials WHERE username = 'admin'").get();
  if (existing) return;
  const initial = process.env.INITIAL_ADMIN_PASSWORD || "ChangeMe!2026";
  const password = hashPassword(initial);
  database.prepare(`INSERT INTO admin_credentials
    (username, password_hash, password_salt, must_change_password, updated_at)
    VALUES ('admin', ?, ?, 1, ?)`)
    .run(password.hash, password.salt, Date.now());
}

export function createSession() {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + SESSION_AGE_MS;
  const database = getDb();
  database.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(now);
  database.prepare("INSERT INTO auth_sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)")
    .run(hashToken(token), expiresAt, now);
  return { token, expiresAt };
}

function cookieValue(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  return cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
}

export function getSession(request: Request) {
  const token = cookieValue(request);
  if (!token) return null;
  const row = getDb().prepare("SELECT expires_at FROM auth_sessions WHERE token_hash = ?").get(hashToken(token)) as { expires_at: number } | undefined;
  if (!row || row.expires_at <= Date.now()) return null;
  return { token, expiresAt: row.expires_at };
}

export function requireSession(request: Request) {
  return getSession(request) ? null : Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function sessionCookie(token: string, expiresAt: number) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function clearSession(request: Request) {
  const token = cookieValue(request);
  if (token) getDb().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(hashToken(token));
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function adminState() {
  ensureAdmin();
  return getDb().prepare("SELECT password_hash, password_salt, must_change_password FROM admin_credentials WHERE username = 'admin'").get() as {
    password_hash: string; password_salt: string; must_change_password: number;
  };
}

export function setAdminPassword(password: string, mustChange = false) {
  const next = hashPassword(password);
  getDb().prepare(`UPDATE admin_credentials SET password_hash = ?, password_salt = ?,
    must_change_password = ?, updated_at = ? WHERE username = 'admin'`)
    .run(next.hash, next.salt, mustChange ? 1 : 0, Date.now());
  getDb().prepare("DELETE FROM auth_sessions").run();
}

export function validateNewPassword(password: string) {
  return password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password);
}
