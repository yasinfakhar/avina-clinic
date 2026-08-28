import { existsSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { getDb, storagePaths } from "@/db";
import { tehranDateFilePart } from "@/app/tehran-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chromiumCandidates = [
  process.env.CHROME_BIN,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/snap/bin/chromium",
].filter((candidate): candidate is string => Boolean(candidate));

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

export async function POST(request: Request) {
  const { recordId } = (await request.json()) as { recordId?: string };
  if (!recordId) {
    return Response.json({ error: "recordId is required" }, { status: 400 });
  }

  const database = getDb();
  const row = database
    .prepare("SELECT national_id FROM records WHERE id = ?")
    .get(recordId) as { national_id: string } | undefined;
  if (!row) return Response.json({ error: "Record not found" }, { status: 404 });
  if (!row.national_id.trim()) {
    return Response.json({ error: "National ID is required" }, { status: 400 });
  }

  const executablePath = chromiumCandidates.find(existsSync);
  if (!executablePath) {
    return Response.json(
      { error: "Chromium is required to generate reports" },
      { status: 500 },
    );
  }

  const storedName = `${safeFilePart(row.national_id)}-${tehranDateFilePart()}.pdf`;
  const outputPath = path.join(storagePaths.pdfs, storedName);
  const temporaryPath = `${outputPath}.${Date.now()}.tmp.pdf`;
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    const reportUrl = new URL(request.url);
    reportUrl.pathname = "/";
    reportUrl.search = `?printRecord=${encodeURIComponent(recordId)}`;
    await page.goto(reportUrl.toString(), { waitUntil: "networkidle0" });
    await page.waitForSelector(".print-report-ready", { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMediaType("print");
    await page.pdf({
      path: temporaryPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    console.error("PDF generation failed", error);
    return Response.json({ error: "PDF generation failed" }, { status: 500 });
  } finally {
    await browser?.close();
  }

  renameSync(temporaryPath, outputPath);

  const previousFiles = database
    .prepare("SELECT stored_name FROM files WHERE category = 'pdf' AND slot = 'report' AND (record_id = ? OR stored_name = ?)")
    .all(recordId, storedName) as Array<{ stored_name: string }>;
  for (const file of previousFiles) {
    if (file.stored_name !== storedName) {
      rmSync(path.join(storagePaths.pdfs, file.stored_name), { force: true });
    }
  }
  database
    .prepare("DELETE FROM files WHERE category = 'pdf' AND slot = 'report' AND (record_id = ? OR stored_name = ?)")
    .run(recordId, storedName);
  database
    .prepare(`INSERT INTO files (record_id, category, slot, stored_name, original_name, mime_type, size, created_at)
      VALUES (?, 'pdf', 'report', ?, ?, 'application/pdf', ?, ?)`)
    .run(recordId, storedName, storedName, statSync(outputPath).size, Date.now());

  return Response.json({
    url: `/api/files/pdfs/${storedName}`,
    fileName: storedName,
  });
}
