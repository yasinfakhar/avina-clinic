import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("PDF generation forwards the authenticated session to the print page", () => {
  const route = readFileSync(
    new URL("../app/api/reports/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /request\.headers\.get\("cookie"\)/);
  assert.match(route, /page\.setExtraHTTPHeaders\(\{ cookie \}\)/);
  assert.ok(
    route.indexOf("setExtraHTTPHeaders") < route.indexOf("page.goto"),
    "the cookie must be forwarded before the print page is loaded",
  );
});
