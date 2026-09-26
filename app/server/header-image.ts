import sharp from "sharp";

const EXPECTED_WIDTH = 2171;
const EXPECTED_HEIGHT = 341;
const accepted = new Map([
  ["png", { extension: ".png", mime: "image/png" }],
  ["jpeg", { extension: ".jpg", mime: "image/jpeg" }],
  ["webp", { extension: ".webp", mime: "image/webp" }],
]);

export async function validateHeaderImage(buffer: Buffer, declaredType: string) {
  try {
    const image = sharp(buffer, { failOn: "error", limitInputPixels: 20_000_000 });
    const metadata = await image.metadata();
    const format = metadata.format ? accepted.get(metadata.format) : undefined;
    if (!format || format.mime !== declaredType) throw new Error("type");
    if (metadata.width !== EXPECTED_WIDTH || metadata.height !== EXPECTED_HEIGHT) throw new Error("dimensions");
    await image.clone().raw().toBuffer();
    return format;
  } catch (error) {
    if (error instanceof Error && error.message === "dimensions") throw new Error("ابعاد تصویر سربرگ باید دقیقاً ۲۱۷۱×۳۴۱ پیکسل باشد.");
    throw new Error("نوع یا محتوای تصویر معتبر نیست.");
  }
}
