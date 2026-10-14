import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

const root = path.resolve(import.meta.dirname, '..');
const packaged = process.argv.includes('--packaged');
const stage = packaged ? path.join(root, 'release-win7/win-unpacked/resources/app.asar') : path.join(root, 'legacy/stage');
const electron = packaged ? path.join(root, 'release-win7/win-unpacked/Avina Audiology.exe') : path.join(root, 'legacy/node_modules/electron/dist/electron.exe');
const directory = mkdtempSync(path.join(tmpdir(), 'avina-win7-smoke-'));
const listener = net.createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(electron, [path.join(stage, 'server/server.cjs')], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port), AUDIOLOGY_DATA_DIR: directory,
    AVINA_INTERNAL_TOKEN: 'smoke-internal', INITIAL_ADMIN_PASSWORD: 'smoke-password-123' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let logs = '';
child.stdout.on('data', (value) => { logs = (logs + value).slice(-10000); });
child.stderr.on('data', (value) => { logs = (logs + value).slice(-10000); });
const finished = once(child, 'exit');
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Legacy server exited: ${logs}`);
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, `Server startup timed out: ${logs}`);
  const html = await (await fetch(origin)).text();
  assert(html.includes('/assets/app.js'));
  assert.equal((await fetch(`${origin}/assets/app.css`)).status, 200);
  assert.equal((await fetch(`${origin}/api/records`)).status, 401);
  assert.equal((await fetch(`${origin}/api/desktop/health`)).status, 404);
  const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'smoke-password-123' }) });
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { cookie, 'content-type': 'application/json' };
  const record = { id: 'A-win7-smoke', status: 'draft', fullName: 'آزمایش ویندوز ۷', nationalId: '1234567890' };
  const saved = await fetch(`${origin}/api/records`, { method: 'POST', headers, body: JSON.stringify(record) });
  assert.equal(saved.status, 200, await saved.clone().text());
  const loaded = await (await fetch(`${origin}/api/records/${record.id}`, { headers })).json();
  assert(JSON.stringify(loaded).includes(record.fullName));
  const form = new FormData();
  form.set('recordId', record.id);
  form.set('file', new Blob(['%PDF-1.4\nsmoke'], { type: 'application/pdf' }), 'smoke.pdf');
  const uploaded = await fetch(`${origin}/api/uploads/pdfs`, { method: 'POST', headers: { cookie }, body: form });
  assert.equal(uploaded.status, 200, await uploaded.clone().text());
  const file = await uploaded.json();
  assert.equal((await fetch(new URL(file.url, origin), { headers: { cookie } })).status, 200);
  if (process.argv.includes('--ui')) {
    const uiEnvironment = { ...process.env, ELECTRON_ENABLE_LOGGING: '1', ELECTRON_LOG_FILE: path.join(root, 'release-win7/ui-smoke.log') };
    delete uiEnvironment.ELECTRON_RUN_AS_NODE;
    const ui = spawn(path.join(root, 'legacy/node_modules/electron/dist/electron.exe'), [path.join(root, 'legacy/ui-smoke'), origin, path.join(root, 'release-win7/win7-login-smoke.png')], {
      env: uiEnvironment, stdio: 'inherit', windowsHide: true,
    });
    const [uiCode] = await once(ui, 'exit');
    assert.equal(uiCode, 0, 'Chromium 108 UI smoke failed');
  }
  const healthHeaders = { authorization: 'Bearer smoke-internal' };
  assert.equal((await fetch(`${origin}/api/desktop/health`, { headers: healthHeaders })).status, 200);
  const shutdown = await fetch(`${origin}/api/desktop/health`, { method: 'POST', headers: healthHeaders });
  assert.equal(shutdown.status, 200);
  const outcome = await Promise.race([finished, new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), 5000).unref())]);
  assert.equal(outcome[0], 0, logs);
  console.log('PASS: Electron 22 / Node 16 startup, CSS, authentication, SQLite CRUD, multipart PDF, dynamic file route, health and clean shutdown.');
  console.log('Windows 7 SP1 VM validation remains required.');
} finally {
  if (child.exitCode === null) { child.kill(); await finished; }
  rmSync(directory, { recursive: true, force: true });
}
