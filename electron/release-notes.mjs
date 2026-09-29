import { readFileSync } from "node:fs";

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function getReleaseNotesForVersion(pendingFile, acknowledgedFile, currentVersion) {
  const release = readJson(pendingFile);
  if (release?.version !== currentVersion || typeof release.changelog !== "string") return null;

  const acknowledged = readJson(acknowledgedFile);
  if (acknowledged?.version === currentVersion) return null;

  return release;
}
