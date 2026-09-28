import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PRINT_THEME_COLOR,
  normalizePrintThemeColor,
} from "../app/theme-color.ts";

test("normalizes a valid six-digit print theme color", () => {
  assert.equal(normalizePrintThemeColor("  #1a2b3c "), "#1A2B3C");
});

test("rejects malformed or non-string print theme colors", () => {
  for (const value of ["1A2B3C", "#123", "#12345678", "#GGGGGG", "", null]) {
    assert.equal(normalizePrintThemeColor(value), null);
  }
});

test("keeps the existing report blue as the default", () => {
  assert.equal(DEFAULT_PRINT_THEME_COLOR, "#5F7DC9");
});
