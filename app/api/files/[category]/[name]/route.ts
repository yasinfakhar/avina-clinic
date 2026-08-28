import { readFileSync } from "node:fs";
import path from "node:path";
import { storagePaths } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ category: string; name: string }> }) {
  const { category, name } = await context.params;
  if (!/^[a-zA-Z0-9_.-]+$/.test(name) || !["images", "pdfs"].includes(category)) {
    return new Response("Not found", { status: 404 });
  }

  const directory = category === "images" ? storagePaths.images : storagePaths.pdfs;
  try {
    const data = readFileSync(path.join(directory, name));
    const type = category === "pdfs" ? "application/pdf" : name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return new Response(data, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
