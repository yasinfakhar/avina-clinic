import { getDb } from "@/db";
import { requireSession } from "@/app/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const rows = getDb()
    .prepare("SELECT value FROM otoscopy_results ORDER BY created_at, value")
    .all() as Array<{ value: string }>;
  return Response.json({ results: rows.map((row) => row.value) });
}

export async function POST(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const body = (await request.json()) as { value?: unknown };
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!value || value.length > 200) {
    return Response.json({ error: "Invalid otoscopy result" }, { status: 400 });
  }
  getDb()
    .prepare("INSERT OR IGNORE INTO otoscopy_results (value, created_at) VALUES (?, ?)")
    .run(value, Date.now());
  return Response.json({ value });
}

export async function DELETE(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const value = new URL(request.url).searchParams.get("value")?.trim() || "";
  if (!value) {
    return Response.json({ error: "Invalid otoscopy result" }, { status: 400 });
  }
  getDb().prepare("DELETE FROM otoscopy_results WHERE value = ?").run(value);
  return Response.json({ deleted: true });
}
