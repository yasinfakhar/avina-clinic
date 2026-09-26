import { clearSession, clearSessionCookie } from "@/app/server/auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  clearSession(request);
  return Response.json({ authenticated: false }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
