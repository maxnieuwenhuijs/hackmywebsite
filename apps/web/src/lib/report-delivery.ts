import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";

const PEPPER = process.env.DELIVERY_CODE_PEPPER || "local-dev-pepper";
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function createDeliveryCode() {
  const devCode = process.env.DEV_DELIVERY_CODE?.trim();
  if (process.env.ALLOW_DEV_EMAIL === "1" && devCode) return devCode.toUpperCase();
  let raw = "";
  const bytes = randomBytes(12);
  for (const byte of bytes) raw += ALPHABET[byte % ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export function hashDeliveryCode(code: string) {
  return createHmac("sha256", PEPPER).update(code.trim().toUpperCase()).digest("hex");
}

export function hashDeliveryToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createDeliveryToken() {
  return randomBytes(32).toString("base64url");
}

export function safeHexEqual(left: string, right: string) {
  if (left.length !== right.length || left.length % 2 !== 0) return false;
  try {
    return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
  } catch {
    return false;
  }
}

export function reportStorageRoot() {
  return path.resolve(process.env.REPORT_STORAGE_DIR || path.join(process.cwd(), "data", "reports"));
}

export function assertStoragePath(filePath: string) {
  const root = reportStorageRoot();
  const resolved = path.resolve(filePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Report storage path is outside the configured root");
  }
  return resolved;
}
