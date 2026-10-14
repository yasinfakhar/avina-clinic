import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const requireLegacy = createRequire(path.join(root, 'legacy/package.json'));
const { build } = requireLegacy('esbuild');
const stage = path.join(root, 'legacy/stage');
// This fixed, workspace-local staging directory contains generated files only.
rmSync(stage, { recursive: true, force: true });
mkdirSync(path.join(stage, 'server/public'), { recursive: true });
mkdirSync(path.join(stage, 'electron'), { recursive: true });
const sourcePackage = JSON.parse(readFileSync('package.json', 'utf8'));
const runtimePackage = JSON.parse(readFileSync('legacy/package.json', 'utf8'));
writeFileSync(path.join(stage, 'package.json'), JSON.stringify({
  name: sourcePackage.name, productName: sourcePackage.productName,
  version: sourcePackage.version, description: sourcePackage.description,
  author: sourcePackage.author, main: 'electron/main.cjs',
  dependencies: runtimePackage.dependencies,
}, null, 2));
cpSync('public', path.join(stage, 'server/public'), { recursive: true });
cpSync('electron', path.join(stage, 'electron'), { recursive: true });
// Never inherit the modern update feed, even from an existing local build.
rmSync(path.join(stage, 'electron/app-update.yml'), { force: true });
const configFile = path.join(stage, 'electron/release-config.json');
const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
for (const [env, key] of [['LICENSE_SERVICE_URL', 'licenseServiceUrl'], ['LICENSE_PUBLIC_KEY', 'licensePublicKey'], ['INITIAL_ADMIN_PASSWORD', 'initialAdminPassword']]) {
  if (process.env[env]) config[key] = process.env[env].replace(/\\n/g, '\n');
}
if (!/^https:\/\//i.test(config.licenseServiceUrl || '') || !config.licensePublicKey) {
  throw new Error('Set LICENSE_SERVICE_URL (HTTPS) and LICENSE_PUBLIC_KEY, or prepare electron/release-config.json first.');
}
config.updateBaseUrl = '';
writeFileSync(configFile, JSON.stringify(config, null, 2));
for (const name of ['polyfills.cjs', 'server.cjs']) {
  cpSync(path.join('legacy', name), path.join(stage, name === 'server.cjs' ? 'server/server.cjs' : name));
}
// Dependencies remain isolated from the modern Electron installation.
const dependencyLock = JSON.parse(readFileSync('legacy/package-lock.json', 'utf8'));
for (const [packagePath, metadata] of Object.entries(dependencyLock.packages)) {
  if (!packagePath.startsWith('node_modules/') || packagePath.includes('/node_modules/') || metadata.dev) continue;
  const source = path.join(root, 'legacy', packagePath);
  if (!existsSync(source)) continue; // optional packages for other platforms
  cpSync(source, path.join(stage, packagePath), { recursive: true, dereference: true });
}
const aliases = {
  'node:sqlite': path.join(root, 'legacy/sqlite.cjs'),
  'electron-updater': path.join(root, 'legacy/updater.cjs'),
  'puppeteer-core': path.join(root, 'legacy/no-puppeteer.cjs'),
};
const shared = { bundle: true, platform: 'node', target: 'node16', format: 'cjs', alias: aliases,
  external: ['electron', 'better-sqlite3', 'node-machine-id', 'undici'], logLevel: 'info' };
const routes = [];
function walk(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) walk(file);
    else if (item.name === 'route.ts') routes.push(file);
  }
}
walk(path.join(root, 'app/api'));
routes.sort();
let routeSource = 'export { closeDb } from "../db/index.ts";\n';
const routeItems = routes.map((file, index) => {
  const routePath = '/' + path.relative(path.join(root, 'app'), path.dirname(file)).split(path.sep).join('/');
  const keys = [];
  const pattern = routePath.split('/').map((part) => {
    if (part.startsWith('[')) { keys.push(part.slice(1, -1)); return '([^/]+)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  routeSource += `import * as route${index} from ${JSON.stringify(file.replaceAll('\\', '/'))};\n`;
  return `{pattern:new RegExp(${JSON.stringify('^' + pattern + '/?$')}), keys:${JSON.stringify(keys)}, handlers:route${index}}`;
});
routeSource += `export const routes = [${routeItems.join(',')}];`;
await build({ ...shared, stdin: { contents: routeSource, resolveDir: path.join(root, 'legacy'), sourcefile: 'routes.ts', loader: 'ts' }, outfile: path.join(stage, 'server/routes.cjs') });
const replacements = [
  ['const packagedServer = path.join(process.resourcesPath, "standalone", "server.js");', 'const packagedServer = path.join(app.getAppPath(), "server", "server.cjs");'],
  ['const script = app.isPackaged ? packagedServer : path.join(applicationRoot, "node_modules", "next", "dist", "bin", "next");', 'const script = packagedServer;'],
  ['const args = app.isPackaged ? [script] : [script, "dev", "-p", String(port), "-H", "127.0.0.1"];', 'const args = [script];'],
  ['cwd: app.isPackaged ? path.dirname(script) : applicationRoot,', 'cwd: process.resourcesPath,'],
  ['ipcMain.handle("update:check", async () => {', 'ipcMain.handle("update:check", async () => { return sendUpdate("error", { message: "برای به‌روزرسانی، نصاب مخصوص Win7 را دریافت کنید." });'],
  ['ipcMain.on("update:install", () => {', 'ipcMain.on("update:install", () => { return;'],
];
const mainTransform = { name: 'legacy-main', setup(builder) {
  builder.onLoad({ filter: /electron[\\/]main\.mjs$/ }, ({ path: file }) => {
    let contents = readFileSync(file, 'utf8');
    for (const [before, after] of replacements) {
      if (!contents.includes(before)) throw new Error(`Shared main changed; review legacy adaptation: ${before}`);
      contents = contents.replace(before, after);
    }
    return { contents, loader: 'js' };
  });
} };
await build({ ...shared, entryPoints: ['electron/main.mjs'], outfile: path.join(stage, 'electron/main.cjs'), plugins: [mainTransform],
  define: { 'import.meta.url': '__avinaFileUrl' },
  banner: { js: 'require("../polyfills.cjs"); const __avinaFileUrl = require("node:url").pathToFileURL(__filename).href;' } });
const cssCompat = { name: 'legacy-css', setup(builder) {
  builder.onLoad({ filter: /app[\\/]globals\.css$/ }, async ({ path: file }) => {
    const postcss = requireLegacy('postcss');
    const tailwind = requireLegacy('tailwindcss');
    const contents = readFileSync(file, 'utf8').replace('@import "tailwindcss";', '@tailwind base;\n@tailwind components;\n@tailwind utilities;');
    const result = await postcss([tailwind({ content: [path.join(root, 'app/**/*.{tsx,ts}').replaceAll('\\', '/')], corePlugins: { preflight: true } })]).process(contents, { from: file });
    return { contents: result.css, loader: 'css' };
  });
} };
await build({ entryPoints: ['legacy/client.tsx'], bundle: true, platform: 'browser', target: 'chrome108', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, minify: true, plugins: [cssCompat],
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, assetNames: 'fonts/[name]-[hash]',
  outfile: path.join(stage, 'server/public/assets/app.js'), logLevel: 'info' });
writeFileSync(path.join(stage, 'server/public/index.html'), '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Avina Audiology</title><link rel="stylesheet" href="/assets/app.css"></head><body><div id="root"></div><script defer src="/assets/app.js"></script></body></html>');
const builderConfig = {
  appId: sourcePackage.build.appId, productName: sourcePackage.productName,
  electronVersion: runtimePackage.devDependencies.electron,
  electronDist: path.join(root, 'legacy/node_modules/electron/dist'),
  directories: { output: path.join(root, 'release-win7') },
  files: ['electron/**/*', 'server/**/*', 'polyfills.cjs', 'package.json'],
  asar: true, asarUnpack: ['**/*.node'], npmRebuild: true,
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: path.join(root, 'public/avina-logo.png'),
    artifactName: 'Avina-Audiology-Win7-Setup-${version}.${ext}' },
  nsis: { ...sourcePackage.build.nsis, include: path.join(root, 'legacy/installer.nsh') },
  publish: null,
};
const builderConfigPath = path.join(stage, 'builder.json');
writeFileSync(builderConfigPath, JSON.stringify(builderConfig, null, 2));
if (process.argv.includes('--stage-only')) { console.log(`Legacy staging ready: ${stage}`); process.exit(0); }
const builderCli = path.join(root, 'node_modules/electron-builder/out/cli/cli.js');
const builderEnvironment = { ...process.env };
for (const name of ['CSC_LINK', 'WIN_CSC_LINK']) {
  const value = builderEnvironment[name];
  if (value && !path.isAbsolute(value) && existsSync(path.resolve(root, value))) {
    builderEnvironment[name] = path.resolve(root, value);
  }
}
const result = spawnSync(process.execPath, [builderCli, '--projectDir', stage, '--config', builderConfigPath, '--win', process.argv.includes('--dir') ? '--dir' : 'nsis', '--x64', '--publish', 'never'], { stdio: 'inherit', env: builderEnvironment });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
