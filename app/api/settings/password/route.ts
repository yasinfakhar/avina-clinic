import { adminState, requireSession, setAdminPassword, validateNewPassword, verifyPassword } from "@/app/server/auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const { currentPassword, newPassword } = await request.json() as { currentPassword?: string; newPassword?: string };
  const admin = adminState();
  if (!currentPassword || !verifyPassword(currentPassword, admin.password_salt, admin.password_hash)) return Response.json({ error: "رمز عبور فعلی نادرست است." }, { status: 400 });
  if (!newPassword || !validateNewPassword(newPassword)) return Response.json({ error: "رمز جدید باید حداقل ۱۰ نویسه و شامل حرف و عدد باشد." }, { status: 400 });
  setAdminPassword(newPassword);
  return Response.json({ changed: true });
}
