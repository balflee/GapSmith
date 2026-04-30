import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt } from "../crypto";

// 64 hex chars = 32 bytes for AES-256
const TEST_SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

describe("crypto", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ENCRYPTION_SECRET;
    process.env.ENCRYPTION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENCRYPTION_SECRET;
    } else {
      process.env.ENCRYPTION_SECRET = originalEnv;
    }
  });

  it("encrypt then decrypt returns original plaintext", async () => {
    const plaintext = "sk-test-key-12345";
    const ciphertext = await encrypt(plaintext);
    const result = await decrypt(ciphertext);
    expect(result).toBe(plaintext);
  });

  it("different plaintexts produce different ciphertexts", async () => {
    const ct1 = await encrypt("key-alpha");
    const ct2 = await encrypt("key-beta");
    expect(ct1).not.toBe(ct2);
  });

  it("same plaintext produces different ciphertexts (random IV)", async () => {
    const ct1 = await encrypt("same-key");
    const ct2 = await encrypt("same-key");
    expect(ct1).not.toBe(ct2);
    // Both should decrypt to the same value
    expect(await decrypt(ct1)).toBe("same-key");
    expect(await decrypt(ct2)).toBe("same-key");
  });

  it("tampering with ciphertext causes decryption to fail", async () => {
    const ciphertext = await encrypt("secret-api-key");
    // Decode, flip a byte in the encrypted portion, re-encode
    const buf = Buffer.from(ciphertext, "base64");
    // Tamper with byte after the 12-byte IV
    buf[14] = buf[14] ^ 0xff;
    const tampered = buf.toString("base64");
    await expect(decrypt(tampered)).rejects.toThrow();
  });

  it("missing ENCRYPTION_SECRET throws", async () => {
    delete process.env.ENCRYPTION_SECRET;
    await expect(encrypt("test")).rejects.toThrow("ENCRYPTION_SECRET is not configured");
  });

  it("invalid length ENCRYPTION_SECRET throws", async () => {
    process.env.ENCRYPTION_SECRET = "tooshort";
    await expect(encrypt("test")).rejects.toThrow("ENCRYPTION_SECRET must be a 64-character hex string");
  });
});
