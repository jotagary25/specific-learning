import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type SealedSecret = { ciphertext: string; iv: string; tag: string };

const ALGORITHM = "aes-256-gcm";
const AAD = Buffer.from("english-course/secret/v1");

function keyFrom(appSecretHex: string): Buffer {
  const key = Buffer.from(appSecretHex, "hex");
  if (key.length !== 32) throw new Error("APP_SECRET must be 32 bytes (64 hex chars)");
  return key;
}

/** AES-256-GCM with a random 96-bit IV; fields are base64. */
export function encryptSecret(plaintext: string, appSecretHex: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyFrom(appSecretHex), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/** Throws when the data was tampered with or the key is wrong. */
export function decryptSecret(sealed: SealedSecret, appSecretHex: string): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    keyFrom(appSecretHex),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
