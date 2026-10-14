const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const url = process.argv[2];
const output = process.argv[3];
app.disableHardwareAcceleration();
const timeout = setTimeout(() => { console.error('UI smoke timed out'); app.exit(1); }, 20000);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1280, height: 900,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  let failure;
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) failure = message;
  });
  await window.loadURL(url);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await window.webContents.executeJavaScript('Boolean(document.querySelector(".login-card input"))')) break;
    if (attempt === 49) throw new Error(failure || 'React login did not render');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await window.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
  if (failure) throw new Error(failure);
  if (output) writeFileSync(output, (await window.webContents.capturePage()).toPNG());
  clearTimeout(timeout);
  console.log('PASS: React login rendered in Electron 22 / Chromium 108.');
  app.exit(0);
}).catch((error) => { console.error(error); app.exit(1); });
