import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "yl_session";

function sign(value: string): string {
  const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function makeSessionValue(): string {
  const payload = "ok";
  return `${payload}.${sign(payload)}`;
}

export function isValidSession(raw: string | undefined): boolean {
  if (!raw) return false;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function isLoggedIn(): boolean {
  return isValidSession(cookies().get(COOKIE_NAME)?.value);
}

export const SESSION_COOKIE = COOKIE_NAME;
