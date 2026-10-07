"use client";

export function TympanometrySuggestion({
  right,
  left,
  onApply,
}: {
  right?: string;
  left?: string;
  onApply: (text: string) => void;
}) {
  const rightType = right?.trim() || "";
  const leftType = left?.trim() || "";
  const lines = rightType && rightType === leftType
    ? [`Type ${rightType} for both ears`]
    : [rightType && `RE: Type ${rightType}`, leftType && `LE: Type ${leftType}`].filter(Boolean);

  return (
    <div className="audiometry-suggestion">
      <button
        type="button"
        className="btn secondary"
        disabled={lines.length === 0}
        onClick={() => onApply(lines.map((line) => {
          const paragraph = document.createElement("p");
          paragraph.textContent = line || "";
          return paragraph.outerHTML;
        }).join(""))}
      >
        کامنت خودکار
      </button>
      <small>با زدن دکمه، پیشنهاد جایگزین کامنت فعلی می‌شود و قابل ویرایش است.</small>
    </div>
  );
}
