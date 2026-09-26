import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { storagePaths } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const formats = [["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["webp", "image/webp"]] as const;

export async function GET() {
  for (const [extension, type] of formats) {
    const file = path.join(storagePaths.root, "settings", `header.${extension}`);
    if (existsSync(file)) return new Response(readFileSync(file), { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
  }
  try {
    return new Response(readFileSync(path.join(process.cwd(), "public", "header.png")), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
