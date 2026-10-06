import { verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { machineFingerprint } from "@/electron/licensing.mjs";
import { storagePaths } from "@/db";
import { setAdminPassword, validateNewPassword } from "@/app/server/auth";

export const runtime = "nodejs";
const attempts = new Map<string, number>();
function verifyRecoveryToken(token: string, publicKey: string, expectedFingerprint: string) {
  const parts = token.split("."); if (parts.length !== 3) return false;
  try {
    if (!verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], "base64url"))) return false;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.purpose === "password-recovery" && payload.machineFingerprint === expectedFingerprint && Number(payload.exp) * 1000 > Date.now();
  } catch { return false; }
}

export async function POST(request: Request) {
  const key = request.headers.get("x-forwarded-for") || "local";
  const count = attempts.get(key) || 0;
  if (count >= 5) return Response.json({ error: "تعداد تلاش‌ها بیش از حد مجاز است." }, { status: 429 });
  attempts.set(key, count + 1);
  const { code, newPassword } = await request.json() as { code?: string; newPassword?: string };
  if (!code) return Response.json({ error: "کد بازیابی را وارد کنید." }, { status: 400 });
  if (!newPassword || !validateNewPassword(newPassword)) return Response.json({ error: "رمز جدید باید حداقل ۱۰ نویسه و شامل حرف انگلیسی و عدد باشد." }, { status: 400 });
  const service = process.env.LICENSE_SERVICE_URL || ""; const publicKey = (process.env.LICENSE_PUBLIC_KEY || "").replace(/\\n/g, "\n");
  if (!/^https:\/\//i.test(service) || !publicKey) return Response.json({ error: "سرویس بازیابی پیکربندی نشده است." }, { status: 503 });
  let activationToken = ""; try { activationToken = JSON.parse(readFileSync(storagePaths.license, "utf8")).token; } catch {}
  try {
    const currentFingerprint = machineFingerprint();
    const response = await fetch(`${service.replace(/\/$/, "")}/v1/password-recovery/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, machineFingerprint: currentFingerprint, activationToken }) });
    const body = await response.json() as { recoveryToken?: string; error?: string };
    if (!response.ok || !body.recoveryToken || !verifyRecoveryToken(body.recoveryToken, publicKey, currentFingerprint)) throw new Error(body.error);
    setAdminPassword(newPassword); attempts.delete(key); return Response.json({ changed: true });
  } catch { return Response.json({ error: "کد بازیابی تأیید نشد." }, { status: 400 }); }
}
