import { getDb } from "@/db";
import { requireSession } from "@/app/server/auth";
import { smsSettings } from "@/app/server/sms-settings";
import { sendSms, welcomeMessage } from "@/app/server/kavenegar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredRecord = {
  id: string;
  fullName?: string;
  phoneNumber?: string;
  nationalId?: string;
  doctorName?: string;
  status?: "draft" | "completed";
  updatedAt?: string;
};

export async function GET(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const rows = getDb().prepare("SELECT data, updated_at FROM records ORDER BY updated_at DESC").all() as Array<{ data: string; updated_at: number }>;
  return Response.json({
    records: rows.map((row) => ({
      ...JSON.parse(row.data),
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
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

  const previous = getDb().prepare("SELECT status FROM records WHERE id = ?").get(record.id) as { status: string } | undefined;
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

  let smsWarning: string | undefined;
  // Explicit final registration only: imports, autosaves and edits never send.
  if (new URL(request.url).searchParams.get("finalize") === "true" && status === "completed" && previous?.status !== "completed") {
    const settings = smsSettings();
    if (settings.welcomeEnabled) {
      // Claim before contacting the provider; never retry an ambiguous timeout automatically.
      const claim = getDb().prepare("INSERT OR IGNORE INTO sms_welcome_attempts (record_id, created_at) VALUES (?, ?)").run(record.id, Date.now());
      if (claim.changes) {
        try {
          await sendSms(settings.apiKey, settings.sender, record.phoneNumber || "", welcomeMessage(settings.template, record.fullName || ""));
        } catch (error) {
          smsWarning = `پرونده ذخیره شد؛ پیامک خوش‌آمدگویی تأیید نشد: ${error instanceof Error ? error.message : "خطای ارسال"}`;
        }
      }
    }
  }
  return Response.json({ record: storedRecord, smsWarning });
}
