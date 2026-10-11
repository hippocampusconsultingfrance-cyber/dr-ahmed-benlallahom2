import { randomBytes } from "node:crypto";

// 32 unambiguous uppercase characters (no I, O, 0, 1): a random byte masked to
// 5 bits maps uniformly onto this alphabet, so every character carries 5 bits.
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Unpredictable public reference such as `BRIEF` + 12 chars (60 bits) or `CV` + 16 chars (80 bits). */
export function secureReference(prefix: string, randomLength: number): string {
  const bytes = randomBytes(randomLength);
  let suffix = "";
  for (let index = 0; index < bytes.length; index++) suffix += REFERENCE_ALPHABET[bytes[index] & 31];
  return `${prefix}${suffix}`;
}
