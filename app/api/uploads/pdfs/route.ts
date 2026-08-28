import { writeFileSync } from "node:fs";
import path from "node:path";
import { getDb, storagePaths } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

export async function GET(request: Request) {
  const recordId = new URL(request.url).searchParams.get("recordId");
  if (!recordId) return Response.json({ error: "recordId is required" }, { status: 400 });
  const files = getDb().prepare(`SELECT original_name AS originalName, stored_name AS storedName, size, created_at AS createdAt
    FROM files WHERE record_id = ? AND category = 'pdf' ORDER BY created_at DESC`).all(recordId);
  return Response.json({ files });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const recordId = String(form.get("recordId") || "");
  if (!(file instanceof File) || !recordId || file.type !== "application/pdf") {
    return Response.json({ error: "Invalid PDF upload" }, { status: 400 });
  }
  if (file.size > 50 * 1024 * 1024) {
    return Response.json({ error: "PDF is larger than 50 MB" }, { status: 413 });
  }

  const storedName = `${safePart(recordId)}-${Date.now()}.pdf`;
  writeFileSync(path.join(storagePaths.pdfs, storedName), Buffer.from(await file.arrayBuffer()));
  getDb().prepare(`INSERT INTO files (record_id, category, slot, stored_name, original_name, mime_type, size, created_at)
    VALUES (?, 'pdf', 'report', ?, ?, 'application/pdf', ?, ?)`
  ).run(recordId, storedName, file.name, file.size, Date.now());

  return Response.json({ url: `/api/files/pdfs/${storedName}`, originalName: file.name });
}
