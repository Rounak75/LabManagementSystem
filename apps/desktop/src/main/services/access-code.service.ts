// Phase 3d Plan A — patient portal access code.
// 6-char codes from a confusable-safe charset (no 0/O/1/I), bcrypt-hashed.
// Printed on the visit receipt; verified at portal login.

import * as crypto from "node:crypto";
import bcrypt from "bcryptjs";

export const ACCESS_CODE_CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ACCESS_CODE_LENGTH = 6;
const BCRYPT_ROUNDS = 10;

export function generatePlaintextCode(): string {
  const bytes = crypto.randomBytes(ACCESS_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) {
    // noUncheckedIndexedAccess: bytes[i] is always defined because i < ACCESS_CODE_LENGTH.
    const b = bytes[i] as number;
    out += ACCESS_CODE_CHARSET[b % ACCESS_CODE_CHARSET.length];
  }
  return out;
}

export async function hashCode(plain: string): Promise<string> {
  return bcrypt.hash(plain.toUpperCase(), BCRYPT_ROUNDS);
}

export async function verifyCode(input: string, hash: string): Promise<boolean> {
  return bcrypt.compare(input.toUpperCase(), hash);
}

export async function generateAndHash(): Promise<{ plaintext: string; hash: string }> {
  const plaintext = generatePlaintextCode();
  const hash = await hashCode(plaintext);
  return { plaintext, hash };
}
