import { getSetting, setSetting } from "@/app/server/settings";
import { DEFAULT_WELCOME_TEMPLATE, normalizeSender } from "@/app/server/kavenegar";

export function smsSettings() {
  return {
    apiKey: getSetting("sms_api_key") || "",
    sender: getSetting("sms_sender") || "",
    welcomeEnabled: getSetting("sms_welcome_enabled") === "true",
    template: getSetting("sms_template") ?? DEFAULT_WELCOME_TEMPLATE,
  };
}

export function publicSmsSettings() {
  const { apiKey, ...settings } = smsSettings();
  return { ...settings, hasApiKey: Boolean(apiKey) };
}

export function saveSmsSettings(input: Record<string, unknown>) {
  const current = smsSettings();
  if (typeof input.sender !== "string" || typeof input.template !== "string" || typeof input.welcomeEnabled !== "boolean" || (input.apiKey !== undefined && typeof input.apiKey !== "string")) throw new Error("تنظیمات پیامک معتبر نیست.");
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : current.apiKey;
  const sender = normalizeSender(input.sender);
  const template = input.template.trim();
  if (apiKey && !/^[a-zA-Z0-9]{10,512}$/.test(apiKey)) throw new Error("فرمت کلید API معتبر نیست.");
  if (!template || template.length > 1700) throw new Error("متن الگو باید بین ۱ تا ۱۷۰۰ کاراکتر باشد.");
  if (input.welcomeEnabled && !apiKey) throw new Error("برای ارسال خودکار، کلید API را وارد کنید.");
  setSetting("sms_api_key", apiKey);
  setSetting("sms_sender", sender);
  setSetting("sms_template", template);
  setSetting("sms_welcome_enabled", String(input.welcomeEnabled));
  return publicSmsSettings();
}
