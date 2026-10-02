import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { requireSession } from "@/app/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NoteRow = { record_id: string; note: string; updated_at: number };
type ReminderRow = { id: string; record_id: string; reminder_text: string; remind_at: number; reminder_read: number };
type IncomingReminder = { id?: string; text?: string; remindAt?: string | null };

function allNotes() {
  const database = getDb();
  const notes = database.prepare("SELECT record_id, note, updated_at FROM patient_notes ORDER BY updated_at DESC").all() as NoteRow[];
  const reminders = database.prepare("SELECT id, record_id, reminder_text, remind_at, reminder_read FROM patient_reminders ORDER BY remind_at").all() as ReminderRow[];
  return notes.map((note) => ({
    recordId: note.record_id,
    note: note.note,
    reminders: reminders.filter((item) => item.record_id === note.record_id).map((item) => ({
      id: item.id, text: item.reminder_text,
      remindAt: new Date(item.remind_at).toISOString(), read: Boolean(item.reminder_read),
    })),
    updatedAt: new Date(note.updated_at).toISOString(),
  }));
}

export async function GET(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  return Response.json({ notes: allNotes() });
}

export async function POST(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const body = await request.json() as { recordId?: string; note?: string; reminders?: IncomingReminder[] };
  const database = getDb();
  if (!body.recordId || !database.prepare("SELECT 1 FROM records WHERE id = ?").get(body.recordId)) {
    return Response.json({ error: "Patient record not found" }, { status: 404 });
  }
  const reminders = (body.reminders || []).map((item) => ({ id: item.id || randomUUID(), text: (item.text || "").trim(), remindAt: item.remindAt ? Date.parse(item.remindAt) : Number.NaN }));
  if (reminders.some((item) => !item.text || !Number.isFinite(item.remindAt))) return Response.json({ error: "Every reminder needs text, date, and time" }, { status: 400 });
  const now = Date.now();
  database.exec("BEGIN");
  try {
    database.prepare(`INSERT INTO patient_notes (record_id, note, reminder_text, remind_at, reminder_read, updated_at)
      VALUES (?, ?, '', NULL, 0, ?) ON CONFLICT(record_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`).run(body.recordId, (body.note || "").trim(), now);
    database.prepare("DELETE FROM patient_reminders WHERE record_id = ?").run(body.recordId);
    const insert = database.prepare(`INSERT INTO patient_reminders (id, record_id, reminder_text, remind_at, reminder_read, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`);
    for (const item of reminders) insert.run(item.id, body.recordId, item.text, item.remindAt, now, now);
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return Response.json({ note: allNotes().find((item) => item.recordId === body.recordId) });
}

export async function PATCH(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const body = await request.json() as { reminderId?: string };
  if (!body.reminderId) return Response.json({ error: "Reminder ID is required" }, { status: 400 });
  getDb().prepare("UPDATE patient_reminders SET reminder_read = 1 WHERE id = ?").run(body.reminderId);
  return Response.json({ updated: true });
}
