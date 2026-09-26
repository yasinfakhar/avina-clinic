import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const directory = mkdtempSync(path.join(tmpdir(), "avina-license-test-"));
const port = 18787;
const adminToken = "test-admin-token-with-more-than-24-characters";
const child = spawn(process.execPath, ["src/server.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port), DATA_DIR: directory, LICENSE_ADMIN_TOKEN: adminToken },
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("license service did not start");
}
async function api(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  return { response, body: await response.json() };
}
const adminHeaders = { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" };

test("creates, binds, recovers, resets, and revokes a license", async () => {
  await waitForServer();
  const created = await api("/admin/licenses", { method: "POST", headers: adminHeaders, body: JSON.stringify({ label: "Test clinic" }) });
  assert.equal(created.response.status, 201); assert.match(created.body.licenseKey, /^AVINA-/);
  const machineFingerprint = "a".repeat(64);
  const activated = await api("/v1/activations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ licenseKey: created.body.licenseKey, machineFingerprint, appVersion: "1.0.0", platform: "win32-x64" }) });
  assert.equal(activated.response.status, 200); assert.ok(activated.body.token);
  const rejected = await api("/v1/activations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ licenseKey: created.body.licenseKey, machineFingerprint: "b".repeat(64) }) });
  assert.equal(rejected.response.status, 409);
  const code = await api("/admin/recovery-codes", { method: "POST", headers: adminHeaders, body: JSON.stringify({ licenseId: created.body.id }) });
  assert.equal(code.response.status, 201);
  const recovered = await api("/v1/password-recovery/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.body.code, machineFingerprint, activationToken: activated.body.token }) });
  assert.equal(recovered.response.status, 200); assert.ok(recovered.body.recoveryToken);
  assert.equal((await api(`/admin/licenses/${created.body.id}/reset-device`, { method: "POST", headers: adminHeaders })).response.status, 200);
  assert.equal((await api(`/admin/licenses/${created.body.id}/revoke`, { method: "POST", headers: adminHeaders })).response.status, 200);
}, { timeout: 15_000 });

test.after(async () => {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  rmSync(directory, { recursive: true, force: true });
});
