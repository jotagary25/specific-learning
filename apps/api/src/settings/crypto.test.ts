import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto.ts";

const KEY = "0f".repeat(32);

describe("secret encryption (AES-256-GCM)", () => {
  it("round-trips and uses a fresh IV every time", () => {
    const a = encryptSecret("ollama-key-ABCD", KEY);
    const b = encryptSecret("ollama-key-ABCD", KEY);

    expect(decryptSecret(a, KEY)).toBe("ollama-key-ABCD");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toContain("ollama");
    expect(Buffer.from(a.iv, "base64")).toHaveLength(12);
    expect(Buffer.from(a.tag, "base64")).toHaveLength(16);
  });

  it("detects a tampered ciphertext, tag or IV", () => {
    const sealed = encryptSecret("ollama-key-ABCD", KEY);
    const flip = (b64: string) => {
      const bytes = Buffer.from(b64, "base64");
      bytes[0] = (bytes[0] ?? 0) ^ 0xff;
      return bytes.toString("base64");
    };

    expect(() => decryptSecret({ ...sealed, ciphertext: flip(sealed.ciphertext) }, KEY)).toThrow();
    expect(() => decryptSecret({ ...sealed, tag: flip(sealed.tag) }, KEY)).toThrow();
    expect(() => decryptSecret({ ...sealed, iv: flip(sealed.iv) }, KEY)).toThrow();
  });

  it("fails with another key", () => {
    const sealed = encryptSecret("ollama-key-ABCD", KEY);
    expect(() => decryptSecret(sealed, "1e".repeat(32))).toThrow();
  });
});
