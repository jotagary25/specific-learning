import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from "node:crypto";

/** scrypt cost parameters; stored inside each hash so they can be raised later. */
export type ScryptParams = { N: number; r: number; p: number };

/**
 * One of the OWASP-recommended scrypt settings (N=2^15, r=8, p=3): 32 MiB per hash, so a burst
 * of parallel logins stays affordable in a small container.
 */
export const DEFAULT_SCRYPT: ScryptParams = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
/** Upper bound for parameters read back from a stored hash. */
const MAX_N = 2 ** 20;

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const options: ScryptOptions = {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 256 * params.N * params.r,
  };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/** Hash format: `scrypt$<N>$<r>$<p>$<base64 salt>$<base64 key>`, with a random salt per hash. */
export async function hashPassword(
  password: string,
  params: ScryptParams = DEFAULT_SCRYPT,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, params);
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64"), key.toString("base64")]
    .map(String)
    .join("$");
}

/** Constant-time check of `password` against a stored hash; malformed hashes never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (
    !Number.isSafeInteger(N) ||
    !Number.isSafeInteger(r) ||
    !Number.isSafeInteger(p) ||
    N === undefined ||
    r === undefined ||
    p === undefined ||
    N < 2 ||
    N > MAX_N ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 16
  ) {
    return false;
  }
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const expected = Buffer.from(parts[5] ?? "", "base64");
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;
  const given = await derive(password, salt, { N, r, p });
  return timingSafeEqual(given, expected) && password.length > 0;
}

/** Lowercased, trimmed email: the only form stored and compared. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
