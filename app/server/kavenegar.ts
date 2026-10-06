export const DEFAULT_WELCOME_TEMPLATE = "{name} عزیز، به کلینیک آوینا خوش آمدید.";

export function normalizeSender(value: string) {
  const sender = value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/[\s\u200e\u200f\u202a-\u202e\u2066-\u2069()-]/g, "");
  if (sender && !/^\+?\d{3,20}$/.test(sender)) throw new Error("شماره خط پیامکی را از پنل کاوه‌نگار کپی کنید؛ فقط شماره خط مجاز است.");
  return sender;
}

export function normalizeMobile(value: string) {
  const digits = value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/[\s()-]/g, "");
  const mobile = digits.replace(/^(?:\+98|0098|98)(?=9)/, "0").replace(/^9(?=\d{9}$)/, "09");
  if (!/^09\d{9}$/.test(mobile)) throw new Error("شماره موبایل معتبر وارد کنید.");
  return mobile;
}

export function welcomeMessage(template: string, name: string) {
  const message = template.replaceAll("{name}", name.trim()).trim();
  if (!message || message.length > 1800) throw new Error("متن پیامک باید بین ۱ تا ۱۸۰۰ کاراکتر باشد.");
  return message;
}

export async function kavenegarRequest<T>(apiKey: string, method: "sms/send" | "account/info", params?: URLSearchParams): Promise<T> {
  if (!apiKey) throw new Error("ابتدا کلید API کاوه‌نگار را ذخیره کنید.");
  let response: Response;
  let body: { return?: { status?: number }; entries?: T };
  try {
    response = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/${method}.json`, {
      method: params ? "POST" : "GET", body: params, cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    body = await response.json();
  } catch {
    throw new Error("ارتباط با کاوه‌نگار برقرار نشد؛ اینترنت را بررسی کنید. وضعیت ارسال ممکن است نامشخص باشد.");
  }
  if (!response.ok || body.return?.status !== 200) {
    const status = body.return?.status || response.status;
    if (status === 412) {
      throw new Error(params?.get("sender")
        ? "کاوه‌نگار شماره خط فرستنده واردشده را نپذیرفت (کد ۴۱۲). شماره خط پیامکی فعال و مجاز همین حساب را از پنل کاوه‌نگار وارد و ذخیره کنید؛ شماره موبایل گیرنده را در بخش تست بنویسید."
        : "کاوه‌نگار خط پیش‌فرض حساب را نپذیرفت (کد ۴۱۲). در تنظیمات پیامک، شماره یک خط پیامکی فعال و مجاز از پنل کاوه‌نگار را در «شماره خط فرستنده» وارد و ذخیره کنید، یا خط پیش‌فرض را در پنل کاوه‌نگار اصلاح کنید.");
    }
    const errors: Record<number, string> = { 401: "حساب کاوه‌نگار غیرفعال است.", 403: "کلید API کاوه‌نگار معتبر نیست.", 411: "شماره گیرنده معتبر نیست.", 412: "شماره فرستنده معتبر نیست.", 413: "متن پیامک معتبر نیست.", 418: "اعتبار کاوه‌نگار کافی نیست.", 426: "شماره گیرنده دریافت پیامک تبلیغاتی را مسدود کرده است." };
    throw new Error(errors[status] || `درخواست کاوه‌نگار ناموفق بود (کد ${status}).`);
  }
  if (!body.entries) throw new Error("پاسخ کاوه‌نگار معتبر نیست.");
  return body.entries;
}

export async function sendSms(apiKey: string, sender: string, phone: string, message: string) {
  const params = new URLSearchParams({ receptor: normalizeMobile(phone), message: welcomeMessage(message, "{name}") });
  const normalizedSender = normalizeSender(sender);
  if (normalizedSender) params.set("sender", normalizedSender);
  const entries = await kavenegarRequest<Array<{ messageid: number; status: number }>>(apiKey, "sms/send", params);
  if (!Array.isArray(entries) || !entries[0]?.messageid || [6, 11, 13, 14, 100].includes(entries[0].status)) throw new Error("کاوه‌نگار ارسال پیامک را تأیید نکرد.");
  return entries[0].messageid;
}
