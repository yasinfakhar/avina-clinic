import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// npm-cli.js avoids invoking a shell or a detached .cmd wrapper.
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
run(process.execPath, [npm, 'ci', '--no-audit', '--no-fund', '--ignore-scripts', '--fetch-timeout=15000', '--fetch-retries=0'], path.join(root, 'legacy'));
// Install Electron's pinned runtime explicitly; native SQLite is rebuilt by builder.
run(process.execPath, [path.join(root, 'legacy/node_modules/electron/install.js')]);
run(process.execPath, ['--env-file-if-exists=.env.desktop', 'scripts/build-windows7.mjs', '--dir']);
run(process.execPath, ['scripts/verify-windows7.mjs']);
