import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeEnglishName,
  sanitizePersianName,
} from "../app/name-input.ts";

test("English patient names reject Persian letters", () => {
  assert.equal(sanitizeEnglishName("John رضایی Doe"), "John  Doe");
  assert.equal(sanitizeEnglishName("Mary-Jane O'Neil"), "Mary-Jane O'Neil");
});

test("Persian patient names reject English letters", () => {
  assert.equal(sanitizePersianName("علی John رضایی"), "علی  رضایی");
  assert.equal(sanitizePersianName("محمد‌رضا"), "محمد‌رضا");
});
