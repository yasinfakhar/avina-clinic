import { requireSession } from "@/app/server/auth";
import { publicSettings, setSetting, type TestFee } from "@/app/server/settings";
import { normalizePrintThemeColor } from "@/app/theme-color";
export const runtime = "nodejs";
export async function GET(request: Request) { const denied = requireSession(request); return denied || Response.json(publicSettings()); }
export async function PATCH(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const { audiologistName, printThemeColor, testFees } = await request.json() as { audiologistName?: string; printThemeColor?: string; testFees?: TestFee[] };
  const name = audiologistName?.trim();
  if (!name) return Response.json({ error: "نام شنوایی‌شناس الزامی است." }, { status: 400 });
  const themeColor = normalizePrintThemeColor(printThemeColor);
  if (!themeColor) return Response.json({ error: "کد تم رنگی باید با فرمت #RRGGBB باشد." }, { status: 400 });
  let normalizedFees: TestFee[] | undefined;
  if (testFees !== undefined) {
    if (!Array.isArray(testFees) || !testFees.length || testFees.some((test) => !test || typeof test.id !== "string" || !test.id || typeof test.name !== "string" || !test.name.trim() || !Number.isSafeInteger(test.price) || Number(test.price) < 0)) {
      return Response.json({ error: "نام و مبلغ تست‌ها را به‌درستی وارد کنید." }, { status: 400 });
    }
    normalizedFees = testFees.map((test) => ({ id: test.id, name: test.name.trim(), price: Number(test.price) }));
  }
  setSetting("audiologist_name", name);
  setSetting("print_theme_color", themeColor);
  if (normalizedFees) setSetting("test_fees", JSON.stringify(normalizedFees));
  return Response.json(publicSettings());
}
