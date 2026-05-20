import { safeStorage } from "electron";

// v2: safeStorage.encryptString(plain) base64-wrapped for text storage in SQLite.
// v1 (legacy) used AES-256-GCM with a key derived from safeStorage.encryptString(SEED) — broken
// on Windows because DPAPI returns non-deterministic ciphertext, so the derived key was
// different on every call and decryption always failed the GCM tag check. v1 blobs cannot
// be recovered; callers see SECRET_UNREADABLE and must re-enter the secret.

export class SecretUnreadableError extends Error {
  code = "SECRET_UNREADABLE" as const;
  constructor() {
    super("SECRET_UNREADABLE");
  }
}

export function encryptSecret(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("safeStorage unavailable — cannot encrypt secrets");
  }
  return "v2:" + safeStorage.encryptString(plain).toString("base64");
}

export function decryptSecret(blob: string): string {
  if (blob.startsWith("v2:")) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("safeStorage unavailable — cannot decrypt secrets");
    }
    return safeStorage.decryptString(Buffer.from(blob.slice(3), "base64"));
  }
  if (blob.startsWith("v1:")) {
    throw new SecretUnreadableError();
  }
  throw new Error("Unknown cipher version");
}
