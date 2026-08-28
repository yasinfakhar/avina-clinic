import { rmSync } from "node:fs";
import path from "node:path";
import { getDb, storagePaths } from "@/db";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const row = getDb().prepare("SELECT data, updated_at FROM records WHERE id = ?").get(id) as
    | { data: string; updated_at: number }
    | undefined;
  if (!row) return Response.json({ error: "Record not found" }, { status: 404 });

  return Response.json({
    record: {
      ...JSON.parse(row.data),
      updatedAt: new Date(row.updated_at).toISOString(),
    },
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const database = getDb();
  const files = database.prepare("SELECT category, stored_name FROM files WHERE record_id = ?").all(id) as Array<{ category: "image" | "pdf"; stored_name: string }>;

  database.prepare("DELETE FROM records WHERE id = ?").run(id);
  for (const file of files) {
    const directory = file.category === "image" ? storagePaths.images : storagePaths.pdfs;
    rmSync(path.join(directory, file.stored_name), { force: true });
  }

  return Response.json({ deleted: true });
}
