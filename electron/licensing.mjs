import { createHash, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import machineIdPackage from "node-machine-id";
const { machineIdSync } = machineIdPackage;

export function machineFingerprint() {
  const raw = `${process.platform}|${process.arch}|${machineIdSync(true)}`;
  return createHash("sha256").update(`audiology-desktop-v1|${raw}`).digest("hex");
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
    return payload;
  } catch { return null; }
}

export function readActivation(file, publicKey) {
  try {
    const stored = JSON.parse(readFileSync(file, "utf8"));
    return verifyActivationToken(stored.token, publicKey) ? stored : null;
  } catch { return null; }
}

export async function activateLicense({ licenseKey, serviceUrl, publicKey, licenseFile, appVersion }) {
  if (!/^https:\/\//i.test(serviceUrl)) throw new Error("نشانی سرویس مجوز باید HTTPS باشد.");
  const fingerprint = machineFingerprint();
  const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/v1/activations`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey, machineFingerprint: fingerprint, appVersion, platform: `${process.platform}-${process.arch}` }),
  });
  const body = await response.json();
  if (!response.ok || !body.token || !verifyActivationToken(body.token, publicKey, fingerprint)) throw new Error(body.error || "فعال‌سازی مجوز ناموفق بود.");
  writeFileSync(licenseFile, JSON.stringify({ token: body.token, activatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  return verifyActivationToken(body.token, publicKey, fingerprint);
}
