import { requireSession } from "@/app/server/auth";
import { publicSettings, setSetting } from "@/app/server/settings";
export const runtime = "nodejs";
export async function GET(request: Request) { const denied = requireSession(request); return denied || Response.json(publicSettings()); }
export async function PATCH(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const { audiologistName } = await request.json() as { audiologistName?: string };
  const name = audiologistName?.trim();
  if (!name) return Response.json({ error: "نام شنوایی‌شناس الزامی است." }, { status: 400 });
  setSetting("audiologist_name", name);
  return Response.json(publicSettings());
}
