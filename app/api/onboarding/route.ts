import { renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb, storagePaths } from "@/db";
import { requireSession, setAdminPassword, validateNewPassword } from "@/app/server/auth";
import { validateHeaderImage } from "@/app/server/header-image";
import { setSetting } from "@/app/server/settings";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const password = String(form.get("password") || "");
  const confirmation = String(form.get("passwordConfirmation") || "");
  const file = form.get("header");
  if (!name || !(file instanceof File)) return Response.json({ error: "نام و تصویر سربرگ الزامی است." }, { status: 400 });
  if (password !== confirmation || !validateNewPassword(password)) return Response.json({ error: "رمز عبور باید حداقل ۱۰ نویسه و شامل حرف و عدد باشد." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: "حجم تصویر بیشتر از ۱۰ مگابایت است." }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer());
  let details;
  try { details = await validateHeaderImage(buffer, file.type); } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
  const finalName = `header-${Date.now()}${details.extension}`;
  const temporary = path.join(storagePaths.header, `${finalName}.tmp`);
  const finalPath = path.join(storagePaths.header, finalName);
  writeFileSync(temporary, buffer, { flag: "wx" });
  const database = getDb();
  try {
    database.exec("BEGIN IMMEDIATE");
    setSetting("audiologist_name", name);
    setSetting("header_file", finalName);
    setSetting("onboarding_complete", "true");
    setAdminPassword(password, false);
    renameSync(temporary, finalPath);
    database.exec("COMMIT");
  } catch {
    database.exec("ROLLBACK"); rmSync(temporary, { force: true });
    return Response.json({ error: "ذخیره تنظیمات اولیه ناموفق بود." }, { status: 500 });
  }
  return Response.json({ completed: true });
}
