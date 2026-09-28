import assert from "node:assert/strict";
import test from "node:test";
import { dataUrlToBlob } from "../app/image-data.ts";

test("converts a base64 image data URL without a network request", async () => {
  const blob = dataUrlToBlob("data:image/jpeg;base64,/9j/2Q==");

  assert.equal(blob.type, "image/jpeg");
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [255, 216, 255, 217]);
});

test("rejects malformed or non-base64 data URLs", () => {
  assert.throws(() => dataUrlToBlob("https://example.test/image.jpg"), /Invalid image data URL/);
  assert.throws(() => dataUrlToBlob("data:image/jpeg,plain"), /Invalid image data URL/);
});
