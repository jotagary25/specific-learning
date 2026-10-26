import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * Session signing key derived from APP_SECRET (HKDF-SHA256), so the encryption key is never
 * reused for HMAC. Per-user revocation is the session epoch carried by each token.
 */
export function deriveSessionKey(appSecretHex: string): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(appSecretHex, "hex"),
      "english-course/session-cookie/v3",
      "english-course/session-cookie",
      32,
    ),
  );
}

export type SessionClaims = { userId: string; epoch: number; expiresAt: number };

const mac = (key: Buffer, { userId, epoch, expiresAt }: SessionClaims) =>
  createHmac("sha256", key).update(`v3.${userId}.${epoch}.${expiresAt}`).digest();

/**
 * Token format: `<userId>.<epoch>.<expiresAtMs>.<base64url HMAC>`. The epoch is the user's
 * revocation counter: bumping it invalidates every token of that user signed before.
 */
export function signSession(key: Buffer, claims: SessionClaims): string {
  return `${claims.userId}.${claims.epoch}.${claims.expiresAt}.${mac(key, claims).toString("base64url")}`;
}

const TOKEN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{1,10})\.(\d{1,16})\.([A-Za-z0-9_-]{43})$/;

/**
 * Claims of an authentic, unexpired token; undefined otherwise. The caller still compares
 * `epoch` with the user's current epoch.
 */
export function readSession(key: Buffer, token: string, now: number): SessionClaims | undefined {
  const match = TOKEN.exec(token);
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) return undefined;
  const claims = { userId: match[1], epoch: Number(match[2]), expiresAt: Number(match[3]) };
  const given = Buffer.from(match[4], "base64url");
  const expected = mac(key, claims);
  const authentic = given.length === expected.length && timingSafeEqual(given, expected);
  return authentic && now < claims.expiresAt ? claims : undefined;
}
