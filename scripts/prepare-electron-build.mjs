import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const standalone = path.resolve(".next/standalone");
if (!existsSync(path.join(standalone, "server.js"))) throw new Error("Next.js standalone server was not produced");
mkdirSync(path.join(standalone, ".next"), { recursive: true });
cpSync(path.resolve(".next/static"), path.join(standalone, ".next/static"), { recursive: true });
cpSync(path.resolve("public"), path.join(standalone, "public"), { recursive: true });

// electron-builder deliberately filters directories named node_modules from
// extraResources. Copy the complete traced server to a staging directory and
// rename that directory; NODE_PATH points to it when Electron starts the server.
const electronStandalone = path.resolve(".next/electron-standalone");
rmSync(electronStandalone, { recursive: true, force: true });
cpSync(standalone, electronStandalone, { recursive: true, dereference: true });
renameSync(path.join(electronStandalone, "node_modules"), path.join(electronStandalone, "runtime_modules"));

// Next's file tracer can include only package.json for dependencies that its
// CommonJS runtime loads dynamically. Hydrate every traced top-level package
// after staging so the Windows build contains all of those untraced files.
const runtimeModules = path.join(electronStandalone, "runtime_modules");
const copyCompleteRuntimePackage = (packageName) => {
  const source = path.resolve("node_modules", packageName);
  const destination = path.join(runtimeModules, ...packageName.split("/"));
  if (!existsSync(source)) throw new Error(`Required runtime package is missing: ${packageName}`);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, dereference: true });
};

const runtimePackages = readdirSync(runtimeModules, { withFileTypes: true }).flatMap((entry) => {
  if (entry.name.startsWith(".")) return [];
  if (!entry.name.startsWith("@")) return [entry.name];
  return readdirSync(path.join(runtimeModules, entry.name), { withFileTypes: true })
    .filter((child) => child.isDirectory() || child.isSymbolicLink())
    .map((child) => `${entry.name}/${child.name}`);
});
for (const packageName of runtimePackages) copyCompleteRuntimePackage(packageName);

// pnpm leaves absolute helper symlinks under .pnpm/node_modules in Next's
// traced output. All top-level runtime packages above are now fully hydrated,
// so this metadata is unnecessary and broken once packaged on another path.
rmSync(path.join(runtimeModules, ".pnpm"), { recursive: true, force: true });

const requiredRuntimeFiles = [
  "@swc/helpers/package.json",
  "@swc/helpers/cjs/_interop_require_default.cjs",
  "@next/env/package.json",
  "@next/env/dist/index.js",
];
for (const file of requiredRuntimeFiles) {
  if (!existsSync(path.join(runtimeModules, ...file.split("/")))) {
    throw new Error(`Electron runtime staging is incomplete: ${file}`);
  }
}

const required = ["INITIAL_ADMIN_PASSWORD", "LICENSE_SERVICE_URL", "LICENSE_PUBLIC_KEY", "UPDATE_BASE_URL"];
if (process.env.RELEASE_BUILD === "1") {
  for (const key of [...required, "CSC_LINK", "CSC_KEY_PASSWORD"]) if (!process.env[key]) throw new Error(`${key} is required for a production release`);
}
for (const key of ["LICENSE_SERVICE_URL", "UPDATE_BASE_URL"]) if (process.env[key] && !/^https:\/\//i.test(process.env[key])) throw new Error(`${key} must use HTTPS`);
if (required.every((key) => process.env[key])) writeFileSync(path.resolve("electron/release-config.json"), JSON.stringify({
  initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD,
  licenseServiceUrl: process.env.LICENSE_SERVICE_URL,
  licensePublicKey: process.env.LICENSE_PUBLIC_KEY,
  updateBaseUrl: process.env.UPDATE_BASE_URL,
}, null, 2));
