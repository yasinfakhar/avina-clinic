const EXPECTED_WIDTH = 2480;
const EXPECTED_HEIGHT = 230;

function png(buffer: Buffer) {
  if (buffer.length < 45 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a" || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  let offset = 8; let hasEnd = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset); const end = offset + 12 + length;
    if (end > buffer.length) return null;
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IEND") { hasEnd = length === 0 && end === buffer.length; break; }
    offset = end;
  }
  return hasEnd ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), extension: ".png", mime: "image/png" } : null;
}

function jpeg(buffer: Buffer) {
  if (buffer.length < 16 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1]; if (marker === 0xda) break;
    const length = buffer.readUInt16BE(offset + 2); if (length < 2 || offset + 2 + length > buffer.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), extension: ".jpg", mime: "image/jpeg" };
    offset += 2 + length;
  }
  return null;
}

function webp(buffer: Buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP" || buffer.readUInt32LE(4) + 8 !== buffer.length) return null;
  const kind = buffer.toString("ascii", 12, 16);
  if (kind === "VP8X") return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3), extension: ".webp", mime: "image/webp" };
  if (kind === "VP8L") { const bits = buffer.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, extension: ".webp", mime: "image/webp" }; }
  if (kind === "VP8 " && buffer.toString("hex", 23, 26) === "9d012a") return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff, extension: ".webp", mime: "image/webp" };
  return null;
}

export function validateHeaderImage(buffer: Buffer, declaredType: string) {
  const details = png(buffer) || jpeg(buffer) || webp(buffer);
  if (!details || details.mime !== declaredType) throw new Error("نوع یا محتوای تصویر معتبر نیست.");
  if (details.width !== EXPECTED_WIDTH || details.height !== EXPECTED_HEIGHT) throw new Error("ابعاد تصویر سربرگ باید دقیقاً ۲۴۸۰×۲۳۰ پیکسل باشد.");
  return details;
}
