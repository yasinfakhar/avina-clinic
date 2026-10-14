import { createHash, randomBytes, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import machineIdPackage from "node-machine-id";
const { machineIdSync } = machineIdPackage;

function windowsSystemUuid() {
  if (process.platform !== "win32") return "";
  try {
    const output = execFileSync("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
      "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID",
    ], { encoding: "utf8", windowsHide: true, timeout: 5_000 }).trim().toLowerCase();
    if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(output)
      && output !== "00000000-0000-0000-0000-000000000000"
      && output !== "ffffffff-ffff-ffff-ffff-ffffffffffff") return output;
  } catch {}
  return "";
}

export function fingerprintFromIdentity({ platform, arch, machineId, systemUuid = "" }) {
  const raw = `${platform}|${arch}|${machineId}|${systemUuid}`;
  return createHash("sha256").update(`audiology-desktop-v2|${raw}`).digest("hex");
}

let cachedMachineFingerprint;

export function machineFingerprint() {
  // Hardware identity is stable during a session. Repeated synchronous WMI
  // and registry queries block Electron's main process during trial checks.
  if (cachedMachineFingerprint) return cachedMachineFingerprint;
  cachedMachineFingerprint = fingerprintFromIdentity({
    platform: process.platform,
    arch: process.arch,
    machineId: machineIdSync(true),
    systemUuid: windowsSystemUuid(),
  });
  return cachedMachineFingerprint;
}

function decodePart(value) {
  return Buffer.from(value, "base64url");
}

export function verifyActivationToken(token, publicKey, fingerprint = machineFingerprint()) {
  if (!token || !publicKey) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const valid = verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, decodePart(parts[2]));
    if (!valid) return null;
    const payload = JSON.parse(decodePart(parts[1]).toString("utf8"));
    if (payload.status !== "active" || payload.machineFingerprint !== fingerprint || !payload.licenseId || !payload.deviceId) return null;
    if (payload.licenseType === "trial" && (!Number.isFinite(payload.expiresAt) || !Number.isFinite(payload.serverTime) || payload.expiresAt <= payload.serverTime)) return null;
    return payload;
  } catch { return null; }
}

export function readActivation(file, publicKey, { allowTrial = false } = {}) {
  try {
    const stored = JSON.parse(readFileSync(file, "utf8"));
    const payload = verifyActivationToken(stored.token, publicKey);
    return payload && (allowTrial || payload.licenseType !== "trial") ? stored : null;
  } catch { return null; }
}

async function licenseRequest(url, options) {
  try {
    const response = await fetch(url, options);
    const body = await response.json();
    return { response, body };
  } catch {
    throw new Error("ارتباط با سرویس مجوز برقرار نشد. اینترنت را وصل کنید و کلید مجوز را دوباره وارد کنید.");
  }
}

export async function activateLicense({ licenseKey, serviceUrl, publicKey, licenseFile, appVersion }) {
  if (!/^https:\/\//i.test(serviceUrl)) throw new Error("نشانی سرویس مجوز باید HTTPS باشد.");
  const fingerprint = machineFingerprint();
  const { response, body } = await licenseRequest(`${serviceUrl.replace(/\/$/, "")}/v1/activations`, {
    signal: AbortSignal.timeout(10_000), method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey, machineFingerprint: fingerprint, appVersion, platform: `${process.platform}-${process.arch}` }),
  });
  if (!response.ok || !body.token || !verifyActivationToken(body.token, publicKey, fingerprint)) throw new Error(body.error || "فعال‌سازی مجوز ناموفق بود.");
  writeFileSync(licenseFile, JSON.stringify({ token: body.token, activatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  return verifyActivationToken(body.token, publicKey, fingerprint);
}

export async function checkTrial({ serviceUrl, publicKey, licenseFile }) {
  const stored = readActivation(licenseFile, publicKey, { allowTrial: true });
  if (!stored) throw new Error("مجوز معتبر نیست.");
  const fingerprint = machineFingerprint();
  const payload = verifyActivationToken(stored.token, publicKey, fingerprint);
  if (payload.licenseType !== "trial") return payload;
  if (!serviceUrl.toLowerCase().startsWith("https://")) throw new Error("نشانی سرویس مجوز باید HTTPS باشد.");
  const nonce = randomBytes(24).toString("hex");
  const { response, body } = await licenseRequest(serviceUrl.replace(/\/$/, "") + "/v1/trials/check", {
    signal: AbortSignal.timeout(10_000), method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activationToken: stored.token, machineFingerprint: fingerprint, nonce }),
  });
  const verified = verifyActivationToken(body.token, publicKey, fingerprint);
  if (!response.ok || !verified || verified.licenseType !== "trial" || verified.nonce !== nonce) throw new Error(body.error || "برای ادامه استفاده آزمایشی، اینترنت را وصل کنید و کلید آزمایشی را دوباره وارد کنید.");
  return verified;
}
