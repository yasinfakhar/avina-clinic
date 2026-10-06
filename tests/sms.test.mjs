import assert from "node:assert/strict";
import test, { after } from "node:test";
import { registerHooks } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeMobile, normalizeSender, welcomeMessage, sendSms } from "../app/server/kavenegar.ts";

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) return next(new URL(`../${specifier.slice(2)}${specifier === "@/db" ? "/index" : ""}.ts`, import.meta.url).href, context);
  return next(specifier, context);
} });
const directory = mkdtempSync(path.join(tmpdir(), "avina-sms-"));
process.env.AUDIOLOGY_DATA_DIR = directory;
const { getDb } = await import("../db/index.ts");
const { createSession, sessionCookie } = await import("../app/server/auth.ts");
const { saveSmsSettings, publicSmsSettings } = await import("../app/server/sms-settings.ts");
const records = await import("../app/api/records/route.ts");
const settings = await import("../app/api/settings/sms/route.ts");
const session = createSession();
const cookie = sessionCookie(session.token, session.expiresAt);
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; getDb().close(); rmSync(directory, { recursive: true, force: true }); });
const request = (url, body, method = "POST") => new Request(`http://localhost${url}`, { method, headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const config = { apiKey: "testkey123456789", sender: "", template: "سلام {name}؛ خوش آمدید {name}", welcomeEnabled: true };

test("sender accepts pasted Persian digits and distinguishes default-line rejection", async () => {
  assert.equal(normalizeSender("\u200f ۱۰۰۰ ۴۳۴۶ "), "10004346");
  assert.equal(normalizeSender("+۹۸۱۰۰۰۴۳۴۶"), "+9810004346");
  assert.equal(normalizeSender("  "), "");
  assert.throws(() => normalizeSender("10004346,10001234"));
  assert.equal(saveSmsSettings({ ...config, sender: "۱۰۰۰۴۳۴۶" }).sender, "10004346");
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.body.get("sender"), "10004346");
    return Response.json({ return: { status: 412 } }, { status: 400 });
  };
  await assert.rejects(sendSms(config.apiKey, "۱۰۰۰۴۳۴۶", "09123456789", "تست"), /واردشده/);
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.body.has("sender"), false);
    return Response.json({ return: { status: 412 } }, { status: 400 });
  };
  await assert.rejects(sendSms(config.apiKey, "", "09123456789", "تست"), /پیش‌فرض/);
});

test("normalizes Persian and international mobile numbers and rejects multiple recipients", () => {
  for (const phone of ["۰۹۱۲۳۴۵۶۷۸۹", "+989123456789", "00989123456789", "9123456789"]) assert.equal(normalizeMobile(phone), "09123456789");
  assert.throws(() => normalizeMobile("09123456789,09123456780"));
  assert.throws(() => normalizeMobile("123"));
  assert.equal(welcomeMessage("سلام {name} {name}", " علی "), "سلام علی علی");
  assert.throws(() => welcomeMessage(" ", "علی"));
});

test("settings protect the API key, preserve it on edits, and require authentication", async () => {
  assert.equal((await settings.GET(new Request("http://localhost/api/settings/sms"))).status, 401);
  saveSmsSettings(config);
  assert.equal(publicSmsSettings().hasApiKey, true);
  assert.equal("apiKey" in publicSmsSettings(), false);
  assert.equal(saveSmsSettings({ sender: "", template: config.template, welcomeEnabled: true }).hasApiKey, true);
  assert.throws(() => saveSmsSettings({ ...config, apiKey: "", welcomeEnabled: true }));
});

test("welcome SMS sends once only on first explicit final registration", async () => {
  saveSmsSettings(config);
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    // Verify record exists before any external send.
    assert.equal(getDb().prepare("SELECT status FROM records WHERE id = 'new'").get().status, "completed");
    return Response.json({ return: { status: 200 }, entries: [{ messageid: 123, status: 1 }] });
  };
  const record = { id: "new", status: "draft", fullName: "علی", phoneNumber: "۰۹۱۲۳۴۵۶۷۸۹" };
  await records.POST(request("/api/records", record));
  assert.equal(calls.length, 0);
  await records.POST(request("/api/records?finalize=true", { ...record, status: "completed" }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.body.get("message"), "سلام علی؛ خوش آمدید علی");
  assert.equal(calls[0].options.body.get("receptor"), "09123456789");
  await records.POST(request("/api/records?finalize=true", { ...record, status: "completed" }));
  await records.POST(request("/api/records", record));
  await records.POST(request("/api/records?finalize=true", { ...record, status: "completed" }));
  await records.POST(request("/api/records", { ...record, id: "imported", status: "completed" }));
  await records.POST(request("/api/records?finalize=true", { ...record, id: "imported", status: "completed" }));
  assert.equal(calls.length, 1);
});

test("provider failure preserves the record and does not retry on resubmission", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ return: { status: 418 } }, { status: 400 }); };
  const record = { id: "failed", status: "completed", fullName: "رضا", phoneNumber: "09123456789" };
  const response = await records.POST(request("/api/records?finalize=true", record));
  assert.equal(response.status, 200);
  assert.match((await response.json()).smsWarning, /اعتبار/);
  assert.equal(getDb().prepare("SELECT status FROM records WHERE id = 'failed'").get().status, "completed");
  await records.POST(request("/api/records?finalize=true", record));
  assert.equal(calls, 1);
  saveSmsSettings({ ...config, welcomeEnabled: false });
  await records.POST(request("/api/records?finalize=true", { ...record, id: "disabled" }));
  assert.equal(calls, 1);
});

test("balance uses account/info and test SMS uses the saved template", async () => {
  saveSmsSettings(config);
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("account/info.json")) return Response.json({ return: { status: 200 }, entries: { remaincredit: 150000 } });
    assert.equal(options.body.get("message"), "سلام تست؛ خوش آمدید تست");
    return Response.json({ return: { status: 200 }, entries: [{ messageid: 222, status: 1 }] });
  };
  const balance = await settings.POST(request("/api/settings/sms", { action: "balance" }));
  assert.equal((await balance.json()).balance, 150000);
  const sent = await settings.POST(request("/api/settings/sms", { action: "test", phone: "09123456789", name: "تست" }));
  assert.equal(sent.status, 200);
});

test("network errors never expose the secret URL and rejected messages are failures", async () => {
  globalThis.fetch = async () => { throw new Error("https://api.kavenegar.com/v1/SECRET/sms/send.json"); };
  await assert.rejects(sendSms("SECRET", "", "09123456789", "سلام"), (error) => !error.message.includes("SECRET"));
  globalThis.fetch = async () => Response.json({ return: { status: 200 }, entries: [{ messageid: 1, status: 14 }] });
  await assert.rejects(sendSms("SECRET", "", "09123456789", "سلام"));
});
