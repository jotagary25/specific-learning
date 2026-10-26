import { resolve } from "node:path";

/** Absolute content root from the configured `CONTENT_DIR` (a relative path resolves from the cwd). */
export function resolveContentDir(contentDir: string): string {
  return resolve(contentDir);
}
