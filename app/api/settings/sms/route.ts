import { requireSession } from "@/app/server/auth";
import { publicSmsSettings, saveSmsSettings, smsSettings } from "@/app/server/sms-settings";
import { kavenegarRequest, sendSms, welcomeMessage } from "@/app/server/kavenegar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  return Response.json(publicSmsSettings());
}

export async function PATCH(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  try {
    const input = await request.json();
    if (!input || typeof input !== "object") throw new Error("تنظیمات معتبر نیست.");
    return Response.json(saveSmsSettings(input));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ذخیره ناموفق بود." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  try {
    const input = await request.json();
    const settings = smsSettings();
    if (input?.action === "balance") {
      const result = await kavenegarRequest<{ remaincredit: number }>(settings.apiKey, "account/info");
      if (typeof result.remaincredit !== "number" || !Number.isFinite(result.remaincredit)) throw new Error("اعتبار دریافتی معتبر نیست.");
      return Response.json({ balance: result.remaincredit });
    }
    if (input?.action !== "test" || typeof input.phone !== "string" || typeof input.name !== "string" || input.name.length > 100) return Response.json({ error: "درخواست معتبر نیست." }, { status: 400 });
    await sendSms(settings.apiKey, settings.sender, input.phone, welcomeMessage(settings.template, input.name || "کاربر آزمایشی"));
    return Response.json({ message: "پیامک آزمایشی به کاوه‌نگار تحویل داده شد." });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "درخواست ناموفق بود." }, { status: 400 });
  }
}
