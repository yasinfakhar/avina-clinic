import { getDb } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredRecord = {
  id: string;
  fullName?: string;
  nationalId?: string;
  doctorName?: string;
  status?: "draft" | "completed";
  updatedAt?: string;
};

export async function GET() {
  const rows = getDb().prepare("SELECT data, updated_at FROM records ORDER BY updated_at DESC").all() as Array<{ data: string; updated_at: number }>;
  return Response.json({
    records: rows.map((row) => ({
      ...JSON.parse(row.data),
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const record = (await request.json()) as StoredRecord;
  const status = record.status;
  if (!record.id || !status || !["draft", "completed"].includes(status)) {
    return Response.json({ error: "Invalid patient record" }, { status: 400 });
  }

  const updatedAt = Date.now();
  const storedRecord = {
    ...record,
    updatedAt: new Date(updatedAt).toISOString(),
  };
  const serialized = JSON.stringify(storedRecord);
  if (serialized.includes("data:image/")) {
    return Response.json({ error: "Images must be uploaded separately" }, { status: 400 });
  }

  getDb().prepare(`
    INSERT INTO records (id, full_name, national_id, doctor_name, status, data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      full_name = excluded.full_name,
      national_id = excluded.national_id,
      doctor_name = excluded.doctor_name,
      status = excluded.status,
      data = excluded.data,
      updated_at = excluded.updated_at
  `).run(
    record.id,
    record.fullName || "",
    record.nationalId || "",
    record.doctorName || "",
    status,
    serialized,
    updatedAt,
  );

  return Response.json({ record: storedRecord });
}
