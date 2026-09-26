const required = ["INITIAL_ADMIN_PASSWORD", "LICENSE_SERVICE_URL", "LICENSE_PUBLIC_KEY", "UPDATE_BASE_URL", "CSC_LINK", "CSC_KEY_PASSWORD"];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);
for (const key of ["LICENSE_SERVICE_URL", "UPDATE_BASE_URL"]) if (!/^https:\/\//i.test(process.env[key])) throw new Error(`${key} must use HTTPS`);
if (process.env.INITIAL_ADMIN_PASSWORD.length < 10) throw new Error("INITIAL_ADMIN_PASSWORD must be at least 10 characters");
console.log("Production release configuration is valid.");
