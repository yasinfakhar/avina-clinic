import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, renameSync, rmSync, statfsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { LicenseManager } from "./license.mjs";

let window;
let server;
let dataDirectory;
const desktopToken = crypto.randomBytes(32).toString("hex");
const development = process.argv.includes("--dev");

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

function configPath() { return path.join(app.getPath("userData"), "desktop-config.json"); }
function readConfig() {
  try { return JSON.parse(readFileSync(configPath(), "utf8")); } catch { return {}; }
}
function writeConfig(config) {
  mkdirSync(path.dirname(configPath()), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(config, null, 2), { mode: 0o600 });
}
function ensureDataDirectory() {
  const configured = readConfig().dataDirectory;
  dataDirectory = configured || path.join(app.getPath("documents"), "Avina Audiology Data");
  for (const part of ["", "images", "pdfs", "settings", "backups"]) mkdirSync(path.join(dataDirectory, part), { recursive: true });
  writeConfig({ ...readConfig(), dataDirectory });
  return dataDirectory;
}
function directorySize(root) {
  let total = 0;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full); else total += statSync(full).size;
    }
  }
  return total;
}
function backup(reason = "manual") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(dataDirectory, "backups", `${reason}-${stamp}`);
  mkdirSync(destination, { recursive: true });
  for (const name of ["audiology.sqlite", "audiology.sqlite-wal", "audiology.sqlite-shm", "images", "pdfs", "settings"]) {
    const source = path.join(dataDirectory, name);
    if (existsSync(source)) cpSync(source, path.join(destination, name), { recursive: true, errorOnExist: true });
  }
  return destination;
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => { const { port } = socket.address(); socket.close(() => resolve(port)); });
    socket.on("error", reject);
  });
}
async function startLocalServer() {
  if (development) {
    server = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev"], { cwd: app.getAppPath(), env: { ...process.env, AUDIOLOGY_DATA_DIR: dataDirectory, AUDIOLOGY_DESKTOP_TOKEN: desktopToken }, stdio: "inherit" });
    return 5173;
  }
  const port = await freePort();
  server = spawn(process.execPath, [path.join(process.resourcesPath, "app.asar", "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: app.getAppPath(), env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", AUDIOLOGY_DATA_DIR: dataDirectory, AUDIOLOGY_DESKTOP_TOKEN: desktopToken }, stdio: "pipe",
  });
  server.on("exit", (code) => { if (code && !app.isQuitting) dialog.showErrorBox("Local server stopped", `Exit code ${code}`); });
  return port;
}
async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The local application server did not start");
}
function sendUpdate(status) { window?.webContents.send("updates:status", status); }

app.whenReady().then(async () => {
  ensureDataDirectory();
  let runtimeConfig = {};
  try { runtimeConfig = JSON.parse(readFileSync(path.join(app.getAppPath(), "electron", "runtime-config.json"), "utf8")); } catch {}
  const license = new LicenseManager({ file: path.join(app.getPath("userData"), "license.sealed"), serverUrl: process.env.AUDIOLOGY_LICENSE_SERVER_URL || runtimeConfig.licenseServerUrl, publicKey: process.env.AUDIOLOGY_LICENSE_PUBLIC_KEY || runtimeConfig.licensePublicKey, version: app.getVersion() });
  const port = await startLocalServer();
  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  window = new BrowserWindow({ width: 1440, height: 960, show: false, webPreferences: { preload: path.join(app.getAppPath(), "electron", "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await window.webContents.session.cookies.set({ url, name: "audiology-desktop-token", value: desktopToken, httpOnly: true, sameSite: "strict", secure: false });
  await window.loadURL(url);
  window.once("ready-to-show", () => window.show());

  ipcMain.handle("desktop:info", () => ({ version: app.getVersion(), dataDirectory, platform: process.platform, arch: process.arch }));
  ipcMain.handle("license:status", () => license.status());
  ipcMain.handle("license:login", (_event, credentials) => license.login(String(credentials?.username || ""), String(credentials?.password || "")));
  ipcMain.handle("license:deactivate", () => license.deactivate());
  ipcMain.handle("storage:choose-directory", async () => (await dialog.showOpenDialog(window, { properties: ["openDirectory", "createDirectory"] })).filePaths[0] || null);
  ipcMain.handle("storage:open-directory", () => shell.openPath(dataDirectory));
  ipcMain.handle("storage:backup", (_event, { reason }) => ({ path: backup(reason) }));
  ipcMain.handle("storage:move-directory", async (_event, { destination }) => {
    if (!path.isAbsolute(destination) || destination === dataDirectory) throw new Error("Invalid destination");
    const required = directorySize(dataDirectory);
    if (statfsSync(path.dirname(destination)).bavail * statfsSync(path.dirname(destination)).bsize < required * 1.2) throw new Error("Insufficient disk space");
    const temporary = `${destination}.moving-${crypto.randomUUID()}`;
    cpSync(dataDirectory, temporary, { recursive: true, errorOnExist: true });
    if (directorySize(temporary) !== required) { rmSync(temporary, { recursive: true, force: true }); throw new Error("Copy verification failed"); }
    renameSync(temporary, destination);
    writeConfig({ ...readConfig(), dataDirectory: destination, previousDataDirectory: dataDirectory });
    app.relaunch(); app.exit(0);
  });
  ipcMain.handle("settings:choose-header", async () => {
    const result = await dialog.showOpenDialog(window, { properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] });
    const source = result.filePaths[0]; if (!source) return null;
    const extension = path.extname(source).toLowerCase();
    for (const old of ["png", "jpg", "jpeg", "webp"]) rmSync(path.join(dataDirectory, "settings", `header.${old}`), { force: true });
    const destination = path.join(dataDirectory, "settings", `header${extension}`); cpSync(source, destination); return { path: destination };
  });
  ipcMain.handle("settings:remove-header", () => { for (const ext of ["png", "jpg", "jpeg", "webp"]) rmSync(path.join(dataDirectory, "settings", `header.${ext}`), { force: true }); return true; });
  ipcMain.handle("updates:check", async () => { if (!app.isPackaged) return { state: "development" }; return autoUpdater.checkForUpdates(); });
  ipcMain.handle("updates:install", () => { backup("pre-update"); autoUpdater.quitAndInstall(); });
  autoUpdater.autoDownload = true;
  autoUpdater.on("checking-for-update", () => sendUpdate({ state: "checking" }));
  autoUpdater.on("update-available", (info) => sendUpdate({ state: "available", info }));
  autoUpdater.on("update-not-available", (info) => sendUpdate({ state: "current", info }));
  autoUpdater.on("download-progress", (progress) => sendUpdate({ state: "downloading", progress }));
  autoUpdater.on("update-downloaded", (info) => sendUpdate({ state: "downloaded", info }));
  autoUpdater.on("error", (error) => sendUpdate({ state: "error", message: error.message }));
  if (app.isPackaged) setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 15_000);
});

app.on("before-quit", () => { app.isQuitting = true; server?.kill(); });
app.on("window-all-closed", () => app.quit());
