import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const standalone = path.resolve(".next/standalone");
if (!existsSync(path.join(standalone, "server.js"))) throw new Error("Next.js standalone server was not produced");
mkdirSync(path.join(standalone, ".next"), { recursive: true });
cpSync(path.resolve(".next/static"), path.join(standalone, ".next/static"), { recursive: true });
cpSync(path.resolve("public"), path.join(standalone, "public"), { recursive: true });

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
