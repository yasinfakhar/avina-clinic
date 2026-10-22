import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const requestedVersion = process.argv[2];
if (process.argv.length !== 3 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(requestedVersion || "")) {
  throw new Error("Usage: npm run release:win7 -- x.y.z");
}
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
if (manifest.version !== requestedVersion) {
  throw new Error(`package.json version is ${manifest.version}; set it to ${requestedVersion} before building`);
}
execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:win7"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
const installer = path.join(root, "release-win7", `Avina-Audiology-Win7-Setup-${requestedVersion}.exe`);
if (!existsSync(installer)) throw new Error(`Windows 7 installer was not produced: ${installer}`);
console.log(`Windows 7 ${requestedVersion} installer: ${installer}`);
