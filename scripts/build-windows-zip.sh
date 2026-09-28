#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_DIR/release"
WINDOWS_DIR="$RELEASE_DIR/win-unpacked"
TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
ZIP_NAME="Avina-Audiology-Windows_${TIMESTAMP}.zip"
ZIP_PATH="$RELEASE_DIR/$ZIP_NAME"

if ! command -v npm >/dev/null 2>&1; then
  echo "خطا: npm نصب نیست یا در PATH قرار ندارد." >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "خطا: ابزار zip نصب نیست. در Ubuntu/Debian اجرا کنید: sudo apt install zip" >&2
  exit 1
fi

cd "$PROJECT_DIR"

echo "[1/2] در حال ساخت نسخه ویندوز..."
npm run build:desktop:dir

if [[ ! -d "$WINDOWS_DIR" ]]; then
  echo "خطا: پوشه خروجی ساخته نشد: $WINDOWS_DIR" >&2
  exit 1
fi

if [[ ! -f "$WINDOWS_DIR/Avina Audiology.exe" ]]; then
  echo "خطا: فایل اجرایی ویندوز در خروجی پیدا نشد." >&2
  exit 1
fi

SWC_HELPER="$WINDOWS_DIR/resources/standalone/runtime_modules/@swc/helpers/cjs/_interop_require_default.cjs"
if [[ ! -f "$SWC_HELPER" ]]; then
  echo "خطا: وابستگی زمان اجرای ویندوز ناقص است: $SWC_HELPER" >&2
  exit 1
fi

NEXT_ENV="$WINDOWS_DIR/resources/standalone/runtime_modules/@next/env/dist/index.js"
if [[ ! -f "$NEXT_ENV" ]]; then
  echo "خطا: وابستگی زمان اجرای ویندوز ناقص است: $NEXT_ENV" >&2
  exit 1
fi

echo "[2/2] در حال ساخت فایل ZIP..."
(
  cd "$RELEASE_DIR"
  zip -q -r -9 "$ZIP_NAME" "win-unpacked"
)

echo
echo "فایل ویندوز با موفقیت ساخته شد:"
echo "$ZIP_PATH"
