import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateRecoveryCode(): string {
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export function formatForDisplay(code: string): string {
  return [code.slice(0, 4), code.slice(4, 8), code.slice(8, 12), code.slice(12, 16)].join("-");
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function verifyRecoveryCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
