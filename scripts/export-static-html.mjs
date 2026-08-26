import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const projectRoot = process.env.SITES_PROJECT_ROOT ?? process.cwd();
const workerPath = `${projectRoot}/dist/server/index.js`;
const outputPath = `${projectRoot}/dist/client/index.html`;
const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("static-export", `${process.pid}-${Date.now()}`);

const worker = await import(workerUrl.href);
const response = await worker.default.fetch(
  new Request("http://localhost/", { headers: { accept: "text/html" } }),
  {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  },
  {
    waitUntil() {},
    passThroughOnException() {},
  },
);

if (!response.ok) {
  throw new Error(`Static HTML export failed with status ${response.status}`);
}

await mkdir(`${projectRoot}/dist/client`, { recursive: true });
const html = (await response.text()).replace(
  /\/(?:[^/"'()\s]+\/)*\.vinext\/fonts\//g,
  "/assets/_vinext_fonts/",
);
await writeFile(outputPath, html);
console.log("Exported static website: dist/client/index.html");
