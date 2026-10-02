import assert from "node:assert/strict";
import test from "node:test";

import { toEnglishDigits } from "../app/digits.ts";

test("converts Persian and Arabic digits to English digits", () => {
  assert.equal(toEnglishDigits("۰۹۱۲۳۴۵۶۷۸۹"), "09123456789");
  assert.equal(toEnglishDigits("١٢٣ABC۴۵۶"), "123ABC456");
});
