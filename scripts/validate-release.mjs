const required = ["INITIAL_ADMIN_PASSWORD", "LICENSE_SERVICE_URL", "LICENSE_PUBLIC_KEY", "UPDATE_BASE_URL", "CSC_LINK", "CSC_KEY_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing release configuration: ${missing.join(", ")}. Add them to .env.desktop.`);
for (const key of ["LICENSE_SERVICE_URL", "UPDATE_BASE_URL"]) if (!/^https:\/\//i.test(process.env[key])) throw new Error(`${key} must use HTTPS`);
if (process.env.INITIAL_ADMIN_PASSWORD.length < 10) throw new Error("INITIAL_ADMIN_PASSWORD must be at least 10 characters");
console.log("Production release configuration is valid.");
