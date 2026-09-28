import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

if (existsSync(path.resolve(".env.desktop"))) process.loadEnvFile(path.resolve(".env.desktop"));
const compatibilityLibraries = path.resolve(".certificates", "libssl11");
if (existsSync(path.join(compatibilityLibraries, "libcrypto.so.1.1"))) {
  process.env.LD_LIBRARY_PATH = [compatibilityLibraries, process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter);
}

const requestedVersion = process.argv[2];
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(requestedVersion || "")) {
  throw new Error("Usage: npm run release:windows -- x.y.z");
}
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
if (manifest.version !== requestedVersion) {
  throw new Error(`package.json version is ${manifest.version}; set it to ${requestedVersion} before building`);
}

execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:desktop"], { stdio: "inherit", env: process.env });

const source = path.resolve("release");
const destination = path.resolve("windows");
const files = readdirSync(source).filter((name) => name === "latest.yml" || name.endsWith(".exe") || name.endsWith(".blockmap"));
if (!files.includes("latest.yml") || !files.some((name) => name.endsWith(".exe"))) {
  throw new Error("electron-builder did not produce latest.yml and a Windows installer");
}
mkdirSync(destination, { recursive: true });
for (const name of readdirSync(destination)) {
  if (name === "latest.yml" || name.endsWith(".exe") || name.endsWith(".blockmap")) rmSync(path.join(destination, name), { force: true });
}
for (const name of files) cpSync(path.join(source, name), path.join(destination, name));
if (!existsSync(path.join(destination, "latest.yml"))) throw new Error("Windows export failed");
console.log(`Windows ${requestedVersion} exported to ${destination}`);
