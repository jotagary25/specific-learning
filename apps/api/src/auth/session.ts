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

const mac = (key: Buffer, expiresAt: number) =>
  createHmac("sha256", key).update(`v1.${expiresAt}`).digest();

/** Token format: `<expiresAtMs>.<base64url HMAC>`. */
export function signSession(key: Buffer, expiresAt: number): string {
  return `${expiresAt}.${mac(key, expiresAt).toString("base64url")}`;
}

export function verifySession(key: Buffer, token: string, now: number): boolean {
  const match = /^(\d{1,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match?.[1] || !match[2]) return false;
  const expiresAt = Number(match[1]);
  const given = Buffer.from(match[2], "base64url");
  const expected = mac(key, expiresAt);
  return given.length === expected.length && timingSafeEqual(given, expected) && now < expiresAt;
}
