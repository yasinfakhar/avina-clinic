import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import electronUpdater from "electron-updater";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, cpSync, writeFileSync, appendFileSync, renameSync, rmSync, statSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { activateLicense, machineFingerprint, readActivation } from "./licensing.mjs";
import { getReleaseNotesForVersion } from "./release-notes.mjs";

const { autoUpdater } = electronUpdater;

const electronDirectory = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.resolve(electronDirectory, "..");
const dataDirectory = path.join(app.getPath("userData"), "data");
const logDirectory = path.join(dataDirectory, "logs");
const startupLog = path.join(logDirectory, "desktop.log");
const acknowledgedReleaseFile = path.join(dataDirectory, "acknowledged-release.json");
const pendingReleaseFile = path.join(dataDirectory, "pending-release.json");
mkdirSync(logDirectory, { recursive: true });
function log(message, error) {
  const detail = error instanceof Error ? `${error.stack || error.message}` : error ? String(error) : "";
  try { appendFileSync(startupLog, `${new Date().toISOString()} ${message}${detail ? `\n${detail}` : ""}\n`); } catch {}
}
log(`Starting ${app.getName()} ${app.getVersion()} (${process.platform}-${process.arch}, packaged=${app.isPackaged})`);
const licenseFile = path.join(dataDirectory, "license.json");
const releaseConfigPath = path.join(electronDirectory, "release-config.json");
const releaseConfig = existsSync(releaseConfigPath) ? JSON.parse(readFileSync(releaseConfigPath, "utf8")) : {};
const licenseServiceUrl = process.env.LICENSE_SERVICE_URL || releaseConfig.licenseServiceUrl || "";
const licensePublicKey = (process.env.LICENSE_PUBLIC_KEY || releaseConfig.licensePublicKey || "").replace(/\\n/g, "\n");
const updateBaseUrl = process.env.UPDATE_BASE_URL || releaseConfig.updateBaseUrl || "";
let serverProcess;
let appWindow;
let localOrigin;
let quittingForUpdate = false;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => resolve(address.port)); });
    server.on("error", reject);
  });
}

async function waitForServer(origin) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { const response = await fetch(origin); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Local application server did not start");
}

async function startServer() {
  const port = await freePort();
  localOrigin = `http://127.0.0.1:${port}`;
  const packagedServer = path.join(process.resourcesPath, "standalone", "server.js");
  const script = app.isPackaged ? packagedServer : path.join(applicationRoot, "node_modules", "next", "dist", "bin", "next");
  const args = app.isPackaged ? [script] : [script, "dev", "-p", String(port), "-H", "127.0.0.1"];
  serverProcess = spawn(process.execPath, args, {
    cwd: app.isPackaged ? path.dirname(script) : applicationRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: app.isPackaged ? path.join(process.resourcesPath, "standalone", "runtime_modules") : process.env.NODE_PATH, PORT: String(port), HOSTNAME: "127.0.0.1", AUDIOLOGY_DATA_DIR: dataDirectory, INITIAL_ADMIN_PASSWORD: process.env.INITIAL_ADMIN_PASSWORD || releaseConfig.initialAdminPassword || "ChangeMe!2026", LICENSE_SERVICE_URL: licenseServiceUrl, LICENSE_PUBLIC_KEY: licensePublicKey },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  serverProcess.stdout?.on("data", (value) => console.log(`[server] ${value}`));
  serverProcess.stderr?.on("data", (value) => { console.error(`[server] ${value}`); log("Local server stderr", value); });
  serverProcess.on("error", (error) => log("Local server process error", error));
  serverProcess.on("exit", (code, signal) => log(`Local server exited code=${code} signal=${signal}`));
  await waitForServer(localOrigin);
  log(`Local server ready at ${localOrigin}`);
}

function waitForProcessExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopServer() {
  const child = serverProcess;
  serverProcess = undefined;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  log(`Stopping local server pid=${child.pid}`);
  if (process.platform === "win32" && child.pid) {
    const taskkillExitCode = await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("error", () => resolve(-1));
      killer.once("exit", (code) => resolve(code ?? -1));
    });
    log(`taskkill completed for local server pid=${child.pid}, exitCode=${taskkillExitCode}`);
  } else {
    child.kill("SIGTERM");
    if (await waitForProcessExit(child, 4_000)) return;
    child.kill("SIGKILL");
  }

  if (!(await waitForProcessExit(child, 4_000))) {
    throw new Error(`Local application server pid=${child.pid} did not stop`);
  }
}

function secureWindowOptions() {
  return { preload: path.join(electronDirectory, "preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true };
}

function lockWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const allowed = localOrigin ? url.startsWith(localOrigin) : url.startsWith("file:");
    if (!allowed) event.preventDefault();
  });
  window.webContents.on("did-fail-load", (_event, code, description, url) => log(`Window failed to load ${url}: ${code} ${description}`));
  window.webContents.on("render-process-gone", (_event, details) => log("Renderer process exited", JSON.stringify(details)));
  window.webContents.on("console-message", (_event, level, message) => { if (level >= 2) log(`Renderer console level=${level}`, message); });
}

async function createApplicationWindow() {
  await startServer();
  appWindow = new BrowserWindow({ width: 1440, height: 940, minWidth: 1024, minHeight: 700, show: false, backgroundColor: "#f5f7fb", webPreferences: secureWindowOptions() });
  lockWindow(appWindow); appWindow.once("ready-to-show", () => { log("Application window ready"); appWindow.show(); }); await appWindow.loadURL(localOrigin);
}

async function createActivationWindow() {
  appWindow = new BrowserWindow({ width: 620, height: 600, resizable: false, backgroundColor: "#f2f5fa", webPreferences: secureWindowOptions() });
  lockWindow(appWindow); await appWindow.loadFile(path.join(electronDirectory, "activation.html")); appWindow.show(); log("Activation window opened");
}

async function offerLegacyImport() {
  if (existsSync(path.join(dataDirectory, "audiology.sqlite"))) return;
  const answer = await dialog.showMessageBox({ type: "question", buttons: ["ادامه بدون انتقال", "انتخاب پوشه"], defaultId: 0, cancelId: 0, title: "انتقال اطلاعات قبلی", message: "آیا می‌خواهید پوشه data نسخه قبلی را انتخاب و منتقل کنید؟" });
  if (answer.response !== 1) return;
  const selected = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "انتخاب پوشه data نسخه قبلی" });
  if (selected.canceled || !selected.filePaths[0] || !existsSync(path.join(selected.filePaths[0], "audiology.sqlite"))) { await dialog.showErrorBox("پوشه نامعتبر", "فایل audiology.sqlite در پوشه انتخاب‌شده پیدا نشد."); return; }
  mkdirSync(dataDirectory, { recursive: true });
  for (const name of ["audiology.sqlite", "images", "pdfs", "factors"]) { const source = path.join(selected.filePaths[0], name); if (existsSync(source)) cpSync(source, path.join(dataDirectory, name), { recursive: true, errorOnExist: true }); }
}

function sendUpdate(state, extra = {}) { if (appWindow && !appWindow.isDestroyed()) appWindow.webContents.send("update:status", { state, ...extra }); }

async function fetchReleaseCatalog() {
  const catalogUrl = new URL("../", updateBaseUrl.endsWith("/") ? updateBaseUrl : `${updateBaseUrl}/`).toString();
  const response = await fetch(catalogUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Update service returned ${response.status}`);
  const data = await response.json();
  if (!data.latest || typeof data.latest.version !== "string") return { latest: null, releases: [] };
  return data;
}

function configureUpdater() {
  autoUpdater.autoDownload = true; autoUpdater.allowDowngrade = false;
  if (updateBaseUrl) autoUpdater.setFeedURL({ provider: "generic", url: updateBaseUrl });
  autoUpdater.on("checking-for-update", () => sendUpdate("checking"));
  autoUpdater.on("update-available", (info) => sendUpdate("downloading", { message: info.version }));
  autoUpdater.on("update-not-available", () => sendUpdate("up-to-date"));
  autoUpdater.on("download-progress", (progress) => sendUpdate("downloading", { percent: Math.round(progress.percent) }));
  autoUpdater.on("update-downloaded", () => sendUpdate("ready"));
  autoUpdater.on("error", (error) => sendUpdate("error", { message: error.message }));
}

async function generateReport(recordId) {
  if (typeof recordId !== "string" || !/^A-[A-Za-z0-9_-]+$/.test(recordId)) throw new Error("Invalid record ID");
  const hidden = new BrowserWindow({ show: false, webPreferences: secureWindowOptions() }); lockWindow(hidden);
  try {
    await hidden.loadURL(`${localOrigin}/?printRecord=${encodeURIComponent(recordId)}`);
    await hidden.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const started = Date.now(); const timer = setInterval(() => {
        if (document.querySelector('.print-report-ready')) {
          const images = [...document.images];
          Promise.all([
            document.fonts.ready,
            ...images.map((image) => image.complete
              ? (image.naturalWidth ? Promise.resolve() : Promise.reject(new Error('Report image failed to load')))
              : new Promise((imageResolve, imageReject) => {
                  image.addEventListener('load', imageResolve, { once: true });
                  image.addEventListener('error', () => imageReject(new Error('Report image failed to load')), { once: true });
                }))
          ]).then(() => { clearInterval(timer); resolve(); }, (error) => { clearInterval(timer); reject(error); });
        }
        else if (Date.now() - started > 30000) { clearInterval(timer); reject(new Error('Report timed out')); }
      }, 100);
    })`);
    const pdf = await hidden.webContents.printToPDF({ printBackground: true, pageSize: "A4", preferCSSPageSize: true });
    const database = new DatabaseSync(path.join(dataDirectory, "audiology.sqlite"));
    const row = database.prepare("SELECT national_id FROM records WHERE id = ?").get(recordId);
    if (!row) throw new Error("Record not found");
    const safeId = String(row.national_id || recordId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
    const date = new Date().toISOString().slice(0, 10); const storedName = `${safeId}-${date}.pdf`;
    const output = path.join(dataDirectory, "pdfs", storedName); const temporary = `${output}.tmp`;
    mkdirSync(path.dirname(output), { recursive: true }); writeFileSync(temporary, pdf); renameSync(temporary, output);
    const old = database.prepare("SELECT stored_name FROM files WHERE record_id = ? AND category = 'pdf' AND slot = 'report'").all(recordId);
    database.prepare("DELETE FROM files WHERE record_id = ? AND category = 'pdf' AND slot = 'report'").run(recordId);
    database.prepare(`INSERT INTO files (record_id, category, slot, stored_name, original_name, mime_type, size, created_at) VALUES (?, 'pdf', 'report', ?, ?, 'application/pdf', ?, ?)`)
      .run(recordId, storedName, storedName, statSync(output).size, Date.now());
    for (const file of old) if (file.stored_name !== storedName) rmSync(path.join(dataDirectory, "pdfs", file.stored_name), { force: true });
    database.close(); return { url: `/api/files/pdfs/${storedName}`, fileName: storedName, outputPath: output };
  } finally { hidden.destroy(); }
}

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("license:status", () => {
  const stored = readActivation(licenseFile, licensePublicKey);
  const payload = stored ? JSON.parse(Buffer.from(stored.token.split(".")[1], "base64url").toString("utf8")) : null;
  return payload ? { active: true, licenseId: payload.licenseId, deviceId: payload.deviceId, fingerprint: machineFingerprint() } : { active: false, fingerprint: machineFingerprint() };
});
ipcMain.handle("license:fingerprint", () => machineFingerprint());
ipcMain.handle("license:activate", async (_event, licenseKey) => {
  if (typeof licenseKey !== "string" || licenseKey.length < 8 || licenseKey.length > 200) throw new Error("کلید مجوز معتبر نیست.");
  const result = await activateLicense({ licenseKey, serviceUrl: licenseServiceUrl, publicKey: licensePublicKey, licenseFile, appVersion: app.getVersion() });
  appWindow.destroy(); await offerLegacyImport(); await createApplicationWindow(); return result;
});
ipcMain.handle("update:check", async () => {
  if (!app.isPackaged) return sendUpdate("development");
  try {
    if (!/^https:\/\//i.test(updateBaseUrl)) throw new Error("Update URL is not configured securely");
    const catalog = await fetchReleaseCatalog();
    if (catalog.latest?.version && catalog.latest.version !== app.getVersion()) writeFileSync(pendingReleaseFile, JSON.stringify(catalog.latest), { mode: 0o600 });
    sendUpdate("catalog", { currentVersion: app.getVersion(), latest: catalog.latest, releases: catalog.releases });
    await autoUpdater.checkForUpdates();
    return { checked: true };
  } catch (error) {
    log("Update check failed", error);
    sendUpdate("error", { message: error instanceof Error ? error.message : String(error) });
    return { checked: false };
  }
});
ipcMain.handle("update:release-notes", async () => {
  return getReleaseNotesForVersion(pendingReleaseFile, acknowledgedReleaseFile, app.getVersion());
});
ipcMain.handle("update:acknowledge-release", (_event, version) => {
  if (version !== app.getVersion()) throw new Error("Invalid release version");
  writeFileSync(acknowledgedReleaseFile, JSON.stringify({ version, acknowledgedAt: new Date().toISOString() }), { mode: 0o600 });
  rmSync(pendingReleaseFile, { force: true });
  return true;
});
ipcMain.on("update:install", () => {
  void (async () => {
    quittingForUpdate = true;
    sendUpdate("installing");
    await stopServer();
    autoUpdater.quitAndInstall(false, true);
  })().catch((error) => {
    quittingForUpdate = false;
    log("Unable to stop local server before update", error);
    sendUpdate("error", { message: error instanceof Error ? error.message : String(error) });
  });
});
ipcMain.handle("report:generate", (_event, recordId) => generateReport(recordId));
ipcMain.handle("report:generate-open", async (_event, recordId) => {
  const report = await generateReport(recordId);
  const error = await shell.openPath(report.outputPath);
  if (error) throw new Error(`Could not open generated PDF: ${error}`);
  return { url: report.url, fileName: report.fileName };
});
function isValidInvoice(invoice) {
  return invoice && typeof invoice === "object" &&
    (invoice.honorific === "سرکار خانم" || invoice.honorific === "جناب آقای") &&
    typeof invoice.patientName === "string" && invoice.patientName.trim() && invoice.patientName.length <= 200 &&
    typeof invoice.date === "string" && invoice.date.trim() && invoice.date.length <= 40 &&
    Array.isArray(invoice.items) && invoice.items.length > 0 && invoice.items.length <= 50 &&
    invoice.items.every((item) => item && typeof item.id === "string" && typeof item.name === "string" && item.name.trim() && item.name.length <= 200 && Number.isSafeInteger(item.price) && item.price >= 0);
}

ipcMain.handle("invoice:save-pdf", async (event, recordId, invoice) => {
  if (typeof recordId !== "string" || !/^A-[A-Za-z0-9_-]+$/.test(recordId)) throw new Error("Invalid record ID");
  if (!isValidInvoice(invoice)) throw new Error("Invalid invoice");
  if (!appWindow || appWindow.isDestroyed() || event.sender !== appWindow.webContents) throw new Error("Invalid invoice window");
  const database = new DatabaseSync(path.join(dataDirectory, "audiology.sqlite"));
  const hidden = new BrowserWindow({ show: false, webPreferences: secureWindowOptions() });
  lockWindow(hidden);
  try {
    const row = database.prepare("SELECT national_id FROM records WHERE id = ?").get(recordId);
    if (!row) throw new Error("Record not found");
    const invoiceUrl = new URL(localOrigin);
    invoiceUrl.searchParams.set("printInvoice", JSON.stringify(invoice));
    await hidden.loadURL(invoiceUrl.toString());
    await hidden.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const started = Date.now(); const timer = setInterval(() => {
        const ready = document.querySelector('.invoice-print-mode');
        if (ready) {
          const images = [...document.images];
          Promise.all([
            document.fonts.ready,
            ...images.map((image) => image.complete
              ? (image.naturalWidth ? Promise.resolve() : Promise.reject(new Error('Invoice image failed to load')))
              : new Promise((imageResolve, imageReject) => {
                  image.addEventListener('load', imageResolve, { once: true });
                  image.addEventListener('error', () => imageReject(new Error('Invoice image failed to load')), { once: true });
                }))
          ]).then(() => { clearInterval(timer); requestAnimationFrame(() => requestAnimationFrame(resolve)); }, (error) => { clearInterval(timer); reject(error); });
        } else if (Date.now() - started > 30000) { clearInterval(timer); reject(new Error('Invoice timed out')); }
      }, 100);
    })`);
    const pdf = await hidden.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: 148000, height: 210000 },
      preferCSSPageSize: false,
    });
    const safeId = String(row.national_id || recordId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storedName = `${safeId}-${timestamp}.pdf`;
    const directory = path.join(dataDirectory, "factors");
    const output = path.join(directory, storedName);
    const temporary = `${output}.tmp`;
    mkdirSync(directory, { recursive: true });
    writeFileSync(temporary, pdf);
    renameSync(temporary, output);
    const openError = await shell.openPath(output);
    if (openError) throw new Error(`Could not open generated invoice PDF: ${openError}`);
    return { fileName: storedName };
  } finally {
    hidden.destroy();
    database.close();
  }
});

app.on("before-quit", () => { if (serverProcess && !serverProcess.killed) serverProcess.kill("SIGTERM"); });
app.on("window-all-closed", () => { if (process.platform !== "darwin" || quittingForUpdate) app.quit(); });

process.on("uncaughtException", (error) => { log("Uncaught exception", error); dialog.showErrorBox("Avina Audiology startup error", `${error.message}\n\nLog: ${startupLog}`); });
process.on("unhandledRejection", (error) => { log("Unhandled rejection", error); dialog.showErrorBox("Avina Audiology startup error", `${error}\n\nLog: ${startupLog}`); });

async function bootstrap() {
  try {
    await app.whenReady();
    mkdirSync(dataDirectory, { recursive: true });
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (localOrigin && details.url.startsWith(localOrigin)) callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:"] } });
      else callback({ responseHeaders: details.responseHeaders });
    });
    configureUpdater();
    if (readActivation(licenseFile, licensePublicKey) || (!app.isPackaged && (!licenseServiceUrl || !licensePublicKey))) { await offerLegacyImport(); await createApplicationWindow(); }
    else await createActivationWindow();
  } catch (error) {
    log("Bootstrap failed", error);
    await app.whenReady().catch(() => {});
    dialog.showErrorBox("Avina Audiology startup error", `${error instanceof Error ? error.message : error}\n\nLog: ${startupLog}`);
    app.quit();
  }
}

void bootstrap();
