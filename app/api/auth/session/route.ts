import { adminState, getSession } from "@/app/server/auth";
import { publicSettings } from "@/app/server/settings";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const authenticated = Boolean(getSession(request));
  if (!authenticated) return Response.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
  const admin = adminState();
  return Response.json({ authenticated: true, onboardingRequired: Boolean(admin.must_change_password), settings: publicSettings() }, { headers: { "Cache-Control": "no-store" } });
}
