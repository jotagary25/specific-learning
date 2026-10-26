import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * Session signing key derived from APP_SECRET and APP_PASSWORD (HKDF-SHA256), so the
 * encryption key is never reused for HMAC and changing the password ends every session.
 */
export function deriveSessionKey(appSecretHex: string, password: string): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(appSecretHex, "hex"),
      password,
      "english-course/session-cookie",
      32,
    ),
  );
}

const mac = (key: Buffer, epoch: number, expiresAt: number) =>
  createHmac("sha256", key).update(`v2.${epoch}.${expiresAt}`).digest();

/**
 * Token format: `<epoch>.<expiresAtMs>.<base64url HMAC>`. The epoch is the server-side
 * revocation counter: bumping it invalidates every token signed before.
 */
export function signSession(key: Buffer, expiresAt: number, epoch: number): string {
  return `${epoch}.${expiresAt}.${mac(key, epoch, expiresAt).toString("base64url")}`;
}

export function verifySession(
  key: Buffer,
  token: string,
  now: number,
  currentEpoch: number,
): boolean {
  const match = /^(\d{1,10})\.(\d{1,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match?.[1] || !match[2] || !match[3]) return false;
  const epoch = Number(match[1]);
  const expiresAt = Number(match[2]);
  const given = Buffer.from(match[3], "base64url");
  const expected = mac(key, epoch, expiresAt);
  return (
    given.length === expected.length &&
    timingSafeEqual(given, expected) &&
    epoch === currentEpoch &&
    now < expiresAt
  );
}
