import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(tmpdir(), "avina-license-test-"));
const port = 18787;
const adminToken = "test-admin-token-with-more-than-24-characters";
const child = spawn(process.execPath, ["src/server.mjs"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: { ...process.env, PORT: String(port), DATA_DIR: directory, LICENSE_ADMIN_TOKEN: adminToken, TRIAL_LICENSE_KEY: "AVINA-TRIAL", TRIAL_DURATION_HOURS: "3" },
  stdio: ["ignore", "pipe", "pipe"],
});

let startupError = "";
child.stdout.on("data", chunk => { startupError += chunk; });
child.stderr.on("data", chunk => { startupError += chunk; });
async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch (error) { if (attempt === 49) startupError += String(error.cause || error); }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("license service did not start: " + startupError);
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

test("publishes semantic versions and exposes the public update catalog", async () => {
  await waitForServer();
  for (const [name, chunks] of [["latest.yml", ["version: 1.1.0"]], ["Avina-Audiology-Setup-1.1.0.exe", ["fake ", "installer"]]]) {
    let offset = 0; const total = chunks.join("").length;
    for (const contents of chunks) {
      const uploaded = await api(`/admin/update-files/${name}`, { method: "PUT", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/octet-stream", "X-Upload-Offset": String(offset), "X-Upload-Total": String(total) }, body: contents });
      offset += contents.length; assert.equal(uploaded.response.status, offset === total ? 201 : 202);
    }
  }
  const first = await api("/admin/releases", { method: "POST", headers: adminHeaders, body: JSON.stringify({ version: "1.1.0", changelog: "## تغییرات\n- نسخه آزمایشی" }) });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.release.version, "1.1.0");
  const older = await api("/admin/releases", { method: "POST", headers: adminHeaders, body: JSON.stringify({ version: "1.0.9", changelog: "old" }) });
  assert.equal(older.response.status, 409);
  const catalog = await api("/avina/update");
  assert.equal(catalog.response.status, 200);
  assert.equal(catalog.body.latest.version, "1.1.0");
  assert.match(catalog.body.latest.url, /Avina-Audiology-Setup-1\.1\.0\.exe$/);
});

test("trial is persistent, uses server time, expires, and permits paid upgrade", async () => {
  await waitForServer();
  const machineFingerprint = "c".repeat(64);
  const post = (route, input) => api(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const input = { licenseKey: "AVINA-TRIAL", machineFingerprint };
  const first = await post("/v1/activations", input);
  assert.equal(first.response.status, 200);
  const payload = JSON.parse(Buffer.from(first.body.token.split(".")[1], "base64url"));
  assert.equal(payload.licenseType, "trial");
  assert.ok(Math.abs(payload.expiresAt - payload.serverTime - 3 * 3600000) < 1000);
  assert.equal((await post("/v1/activations", input)).response.status, 403);
  const checkInput = { activationToken: first.body.token, machineFingerprint, nonce: "d".repeat(48) };
  const checked = await post("/v1/trials/check", checkInput);
  assert.equal(checked.response.status, 200);
  assert.equal(JSON.parse(Buffer.from(checked.body.token.split(".")[1], "base64url")).nonce, checkInput.nonce);
  assert.equal((await post("/v1/trials/check", { ...checkInput, machineFingerprint: "e".repeat(64) })).response.status, 403);
  const db = new DatabaseSync(path.join(directory, "licenses.sqlite"));
  db.prepare("UPDATE trials SET expires_at = ? WHERE machine_fingerprint = ?").run(Date.now() - 1000, machineFingerprint); db.close();
  assert.equal((await post("/v1/trials/check", checkInput)).response.status, 403);
  assert.equal((await post("/v1/activations", input)).response.status, 403);
  const paid = await api("/admin/licenses", { method: "POST", headers: adminHeaders, body: "{}" });
  const upgrade = await post("/v1/activations", { ...input, licenseKey: paid.body.licenseKey });
  assert.equal(upgrade.response.status, 200);
  assert.equal(JSON.parse(Buffer.from(upgrade.body.token.split(".")[1], "base64url")).licenseType, undefined);
});

test.after(async () => {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  rmSync(directory, { recursive: true, force: true });
});
