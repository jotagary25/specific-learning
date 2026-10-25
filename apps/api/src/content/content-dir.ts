import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo `content/` folder (apps/api/src/content → ../../../../content). */
const DEFAULT_CONTENT_DIR = fileURLToPath(new URL("../../../../content", import.meta.url));

/** Content root: `CONTENT_DIR` when set (relative to cwd), otherwise the repo `content/` folder. */
export function resolveContentDir(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.CONTENT_DIR?.trim();
  return fromEnv ? resolve(fromEnv) : DEFAULT_CONTENT_DIR;
}
