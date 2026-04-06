import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, originalHash] = storedHash.split(":");
  if (!salt || !originalHash) {
    return false;
  }

  const derivedKey = scryptSync(password, salt, 64);
  const originalBuffer = Buffer.from(originalHash, "hex");

  if (derivedKey.length !== originalBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, originalBuffer);
}
