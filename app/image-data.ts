export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid image data URL");

  const bytes = Uint8Array.from(atob(match[2].replace(/\s/g, "")), (character) =>
    character.charCodeAt(0),
  );
  return new Blob([bytes], { type: match[1] });
}
