import { existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { getDb, storagePaths } from "@/db";
import { requireSession } from "@/app/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvoiceItem = { id: string; name: string; price: number };
type Invoice = { honorific: "سرکار خانم" | "جناب آقای"; patientName: string; date: string; items: InvoiceItem[] };

const chromiumCandidates = [process.env.CHROME_BIN, process.env.PUPPETEER_EXECUTABLE_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/snap/bin/chromium"].filter((candidate): candidate is string => Boolean(candidate));

function validInvoice(value: unknown): value is Invoice {
  if (!value || typeof value !== "object") return false;
  const invoice = value as Partial<Invoice>;
  return (invoice.honorific === "سرکار خانم" || invoice.honorific === "جناب آقای") &&
    typeof invoice.patientName === "string" && Boolean(invoice.patientName.trim()) && invoice.patientName.length <= 200 &&
    typeof invoice.date === "string" && Boolean(invoice.date.trim()) && invoice.date.length <= 40 &&
    Array.isArray(invoice.items) && invoice.items.length > 0 && invoice.items.length <= 50 &&
    invoice.items.every((item) => item && typeof item.id === "string" && typeof item.name === "string" && Boolean(item.name.trim()) && item.name.length <= 200 && Number.isSafeInteger(item.price) && item.price >= 0);
}

export async function POST(request: Request) {
  const denied = requireSession(request); if (denied) return denied;
  const { recordId, invoice } = await request.json() as { recordId?: string; invoice?: unknown };
  if (!recordId || !/^A-[A-Za-z0-9_-]+$/.test(recordId) || !validInvoice(invoice)) return Response.json({ error: "اطلاعات فاکتور معتبر نیست." }, { status: 400 });
  const row = getDb().prepare("SELECT national_id FROM records WHERE id = ?").get(recordId) as { national_id: string } | undefined;
  if (!row) return Response.json({ error: "پرونده پیدا نشد." }, { status: 404 });
  const executablePath = chromiumCandidates.find(existsSync);
  if (!executablePath) return Response.json({ error: "مرورگر تولید PDF پیدا نشد." }, { status: 500 });

  const safeId = String(row.national_id || recordId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const storedName = `${safeId}-${timestamp}.pdf`;
  const outputPath = path.join(storagePaths.factors, storedName);
  const temporaryPath = `${outputPath}.tmp`;
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    const cookie = request.headers.get("cookie");
    if (cookie) await page.setExtraHTTPHeaders({ cookie });
    const invoiceUrl = new URL(request.url);
    invoiceUrl.pathname = "/";
    invoiceUrl.search = "";
    invoiceUrl.searchParams.set("printInvoice", JSON.stringify(invoice));
    await page.goto(invoiceUrl.toString(), { waitUntil: "networkidle0" });
    await page.waitForSelector(".invoice-print-mode", { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMediaType("print");
    await page.pdf({ path: temporaryPath, width: "148mm", height: "210mm", margin: { top: 0, right: 0, bottom: 0, left: 0 }, printBackground: true, preferCSSPageSize: true });
    renameSync(temporaryPath, outputPath);
    return Response.json({ fileName: storedName });
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    console.error("Invoice PDF generation failed", error);
    return Response.json({ error: "ذخیره PDF فاکتور ناموفق بود." }, { status: 500 });
  } finally {
    await browser?.close();
  }
}
