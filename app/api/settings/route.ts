import { requireSession } from "@/app/server/auth";
import { publicSettings, setSetting } from "@/app/server/settings";
import { normalizePrintThemeColor } from "@/app/theme-color";
export const runtime = "nodejs";
export async function GET(request: Request) { const denied = requireSession(request); return denied || Response.json(publicSettings()); }
export async function PATCH(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const { audiologistName, printThemeColor } = await request.json() as { audiologistName?: string; printThemeColor?: string };
  const name = audiologistName?.trim();
  if (!name) return Response.json({ error: "نام شنوایی‌شناس الزامی است." }, { status: 400 });
  const themeColor = normalizePrintThemeColor(printThemeColor);
  if (!themeColor) return Response.json({ error: "کد تم رنگی باید با فرمت #RRGGBB باشد." }, { status: 400 });
  setSetting("audiologist_name", name);
  setSetting("print_theme_color", themeColor);
  return Response.json(publicSettings());
}
