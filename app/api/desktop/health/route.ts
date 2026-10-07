import { getDb } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = process.env.AVINA_INTERNAL_TOKEN;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) return new Response(null, { status: 404 });
  getDb().prepare("SELECT COUNT(*) FROM records").get();
  return Response.json({ ready: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const token = process.env.AVINA_INTERNAL_TOKEN;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) return new Response(null, { status: 404 });
  if (process.listenerCount("SIGTERM") === 0) return new Response(null, { status: 503 });
  // Invoke Next's shutdown handler inside the server process. Unlike taskkill
  // on Windows, production Next drains in-flight HTTP requests before exiting.
  setTimeout(() => process.emit("SIGTERM", "SIGTERM"), 100).unref();
  return Response.json({ stopping: true });
}
