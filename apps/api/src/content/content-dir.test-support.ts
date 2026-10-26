import { fileURLToPath } from "node:url";

/** The repo `content/` folder (apps/api/src/content → ../../../../content), for tests only. */
export const REPO_CONTENT_DIR = fileURLToPath(new URL("../../../../content", import.meta.url));
