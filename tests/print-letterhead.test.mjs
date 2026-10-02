import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the PDF letterhead preserves the uploaded image aspect ratio", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const rule = css.match(/\.print-letterhead\{([^}]*)\}/)?.[1] ?? "";

  assert.match(rule, /width:\s*100%/);
  assert.match(rule, /height:\s*auto/);
  assert.doesNotMatch(rule, /object-fit:\s*fill/);
});

test("the PDF letterhead spans the full A4 width", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const rule = css.match(/\.print-header\{([^}]*)\}/)?.[1] ?? "";

  assert.match(rule, /width:\s*210mm/);
  assert.doesNotMatch(rule, /height:\s*400px/);
  assert.match(rule, /right:\s*-5mm/);
});

test("the PDF page does not waste vertical space above the letterhead", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const rule = css.match(/\.print-page\{([^}]*)\}/)?.[1] ?? "";

  assert.match(rule, /padding:\s*0\s+5mm\s+13mm\s+8mm/);
});
