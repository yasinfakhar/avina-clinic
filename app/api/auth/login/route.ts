import { adminState, createSession, sessionCookie, verifyPassword } from "@/app/server/auth";

export const runtime = "nodejs";
const attempts = new Map<string, { count: number; blockedUntil: number }>();

export async function POST(request: Request) {
  const key = request.headers.get("x-forwarded-for") || "local";
  const attempt = attempts.get(key);
  if (attempt && attempt.blockedUntil > Date.now()) return Response.json({ error: "Too many attempts" }, { status: 429 });
  const { username, password } = await request.json() as { username?: string; password?: string };
  const admin = adminState();
  if (username !== "admin" || !password || !verifyPassword(password, admin.password_salt, admin.password_hash)) {
    const count = (attempt?.count || 0) + 1;
    attempts.set(key, { count, blockedUntil: count >= 5 ? Date.now() + 60_000 : 0 });
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }
  attempts.delete(key);
  const session = createSession();
  return Response.json({ authenticated: true, onboardingRequired: Boolean(admin.must_change_password) }, {
    headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt), "Cache-Control": "no-store" },
  });
}
