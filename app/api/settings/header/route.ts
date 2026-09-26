import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { storagePaths } from "@/db";
import { requireSession } from "@/app/server/auth";
import { validateHeaderImage } from "@/app/server/header-image";
import { getSetting, setSetting } from "@/app/server/settings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const name = getSetting("header_file");
  if (!name) return Response.redirect(new URL("/header.png", request.url));
  try {
    const data = readFileSync(path.join(storagePaths.header, path.basename(name)));
    const type = name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return new Response(data, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
export async function POST(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const form = await request.formData(); const file = form.get("header");
  if (!(file instanceof File) || file.size > 10 * 1024 * 1024) return Response.json({ error: "تصویر معتبر نیست یا حجم آن زیاد است." }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  let details; try { details = await validateHeaderImage(buffer, file.type); } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
  const finalName = `header-${Date.now()}${details.extension}`; const finalPath = path.join(storagePaths.header, finalName); const temporary = `${finalPath}.tmp`;
  writeFileSync(temporary, buffer); renameSync(temporary, finalPath);
  const previous = getSetting("header_file"); setSetting("header_file", finalName);
  if (previous && previous !== finalName) rmSync(path.join(storagePaths.header, path.basename(previous)), { force: true });
  return Response.json({ headerUrl: `/api/settings/header?v=${Date.now()}` });
}
