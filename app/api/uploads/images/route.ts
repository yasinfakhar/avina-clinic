import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb, storagePaths } from "@/db";
import { otoscopyImageName, safeNationalId } from "./naming";
import { requireSession } from "@/app/server/auth";

export const runtime = "nodejs";

const imageTypes: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function POST(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const form = await request.formData();
  const file = form.get("file");
  const recordId = String(form.get("recordId") || "");
  const side = String(form.get("side") || "");
  const variant = String(form.get("variant") || "current");
  const extension = file instanceof File ? imageTypes[file.type] : undefined;

  if (!(file instanceof File) || !recordId || !["left", "right"].includes(side) || !["current", "original"].includes(variant) || !extension) {
    return Response.json({ error: "Invalid image upload" }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return Response.json({ error: "Image is larger than 15 MB" }, { status: 413 });
  }

  const database = getDb();
  const patient = database
    .prepare("SELECT national_id FROM records WHERE id = ?")
    .get(recordId) as { national_id: string } | undefined;
  if (!patient || !safeNationalId(patient.national_id)) {
    return Response.json(
      { error: "Patient national ID is required before uploading an image" },
      { status: 400 },
    );
  }

  const slot = `${side}-${variant}`;
  const previous = database.prepare("SELECT stored_name FROM files WHERE record_id = ? AND category = 'image' AND slot = ?").get(recordId, slot) as { stored_name: string } | undefined;
  if (previous) rmSync(path.join(storagePaths.images, previous.stored_name), { force: true });

  const storedName = otoscopyImageName(
    patient.national_id,
    side as "left" | "right",
    variant as "current" | "original",
    extension,
  );
  writeFileSync(path.join(storagePaths.images, storedName), Buffer.from(await file.arrayBuffer()));
  database.prepare("DELETE FROM files WHERE record_id = ? AND category = 'image' AND slot = ?").run(recordId, slot);
  database.prepare(`INSERT INTO files (record_id, category, slot, stored_name, original_name, mime_type, size, created_at)
    VALUES (?, 'image', ?, ?, ?, ?, ?, ?)`
  ).run(recordId, slot, storedName, file.name, file.type, file.size, Date.now());

  return Response.json({ url: `/api/files/images/${storedName}`, originalName: file.name });
}

export async function DELETE(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const recordId = params.get("recordId") || "";
  const side = params.get("side") || "";
  if (!recordId || !["left", "right"].includes(side)) {
    return Response.json({ error: "Invalid image" }, { status: 400 });
  }

  const database = getDb();
  const files = database.prepare("SELECT stored_name FROM files WHERE record_id = ? AND category = 'image' AND slot IN (?, ?)")
    .all(recordId, `${side}-current`, `${side}-original`) as Array<{ stored_name: string }>;
  for (const file of files) rmSync(path.join(storagePaths.images, file.stored_name), { force: true });
  database.prepare("DELETE FROM files WHERE record_id = ? AND category = 'image' AND slot IN (?, ?)")
    .run(recordId, `${side}-current`, `${side}-original`);
  return Response.json({ deleted: true });
}
