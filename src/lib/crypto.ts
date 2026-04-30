// AES-256-GCM encryption/decryption for user LLM API keys.
// Users bring their own API keys (BYOK model) — keys are encrypted at rest.
// ENCRYPTION_SECRET must be a 32-byte (256-bit) hex string set in server env vars.

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits — recommended for AES-GCM
const TAG_LENGTH = 128; // bits

function getSecret(): string {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error("ENCRYPTION_SECRET is not configured");
  if (secret.length !== 64) throw new Error("ENCRYPTION_SECRET must be a 64-character hex string (32 bytes)");
  return secret;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const keyBytes = Buffer.from(secret, "hex");
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string containing: iv (12 bytes) + ciphertext + auth tag.
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey(getSecret());
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    encoded
  );

  // Prepend IV to ciphertext for storage (iv + ciphertext + auth tag)
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);

  return Buffer.from(combined).toString("base64");
}

/**
 * Decrypts a base64-encoded AES-256-GCM ciphertext produced by `encrypt()`.
 * Returns the original plaintext string.
 */
export async function decrypt(ciphertext: string): Promise<string> {
  const key = await deriveKey(getSecret());
  const combined = Buffer.from(ciphertext, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}
