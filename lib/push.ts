/**
 * ============================================================
 *  התראות דחיפה - בלי ייבוא בכלל
 * ============================================================
 *
 *  מימוש מלא של Web Push (RFC 8291 + VAPID) על Web Crypto,
 *  שזמין גלובלית ב-Node 18 ומעלה.
 *
 *  למה בלי import: הקובץ נטען דרך instrumentation, ושם
 *  webpack לא יודע לפתור מודולים של Node - לא "crypto"
 *  ולא "node:crypto". Web Crypto לא דורש ייבוא כלל, ולכן
 *  הבעיה פשוט לא קיימת.
 *
 *  משתני סביבה:
 *    VAPID_PUBLIC_KEY   - גם בצד הדפדפן
 *    VAPID_PRIVATE_KEY
 *    VAPID_SUBJECT      - mailto של בעל האפליקציה
 */

import { db } from "./db";

export type PushMessage = {
  title: string;
  body?: string;
  url?: string;
  urgent?: boolean;
  tag?: string;
};

export function pushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim()
  );
}

// ---------- קידוד ----------

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

// ---------- VAPID ----------

/**
 * חותם את ה-JWT שמוכיח לשרת הדחיפה מי אנחנו.
 * ECDSA עם SHA-256 מחזיר כאן r||s גולמי - בדיוק הפורמט
 * ש-VAPID מצפה לו.
 */
async function vapidToken(endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin;

  const header = b64url(
    new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))
  );

  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com",
      })
    )
  );

  const publicRaw = fromB64url(process.env.VAPID_PUBLIC_KEY!.trim());
  const privateRaw = fromB64url(process.env.VAPID_PRIVATE_KEY!.trim());

  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: b64url(privateRaw),
      x: b64url(publicRaw.subarray(1, 33)),
      y: b64url(publicRaw.subarray(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(`${header}.${payload}`)
    )
  );

  return `${header}.${payload}.${b64url(signature)}`;
}

// ---------- הצפנת התוכן ----------

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toBuffer(ikm), "HKDF", false, [
    "deriveBits",
  ]);

  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: toBuffer(salt), info: toBuffer(info) },
    key,
    length * 8
  );

  return new Uint8Array(bits);
}

/**
 * מצפין את גוף ההודעה לפי aes128gcm.
 * רק המכשיר שנרשם יכול לפענח - גם שרת הדחיפה לא.
 */
async function encrypt(
  payload: string,
  p256dh: string,
  auth: string
): Promise<Uint8Array> {
  const clientPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);

  const pair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  )) as CryptoKeyPair;

  const localPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey)
  );

  const clientKey = await crypto.subtle.importKey(
    "raw",
    toBuffer(clientPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientKey },
      pair.privateKey,
      256
    )
  );

  const encoder = new TextEncoder();

  const ikm = await hkdf(
    authSecret,
    shared,
    concat(encoder.encode("WebPush: info\0"), clientPublic, localPublic),
    32
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const cek = await hkdf(
    salt,
    ikm,
    encoder.encode("Content-Encoding: aes128gcm\0"),
    16
  );

  const nonce = await hkdf(
    salt,
    ikm,
    encoder.encode("Content-Encoding: nonce\0"),
    12
  );

  const aesKey = await crypto.subtle.importKey(
    "raw",
    toBuffer(cek),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));

  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toBuffer(nonce) },
      aesKey,
      toBuffer(plaintext)
    )
  );

  // כותרת: salt, גודל רשומה, אורך המפתח, המפתח עצמו
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = localPublic.length;

  return concat(header, localPublic, encrypted);
}

// ---------- שליחה ----------

/**
 * שולח לכל המכשירים הרשומים.
 *
 * מנוי שנדחה עם 404 או 410 כבר לא תקף - המכשיר הוסר או
 * ההרשאה בוטלה - ולכן מוחקים אותו כדי לא לנסות שוב לנצח.
 */
export async function sendPush(message: PushMessage): Promise<number> {
  if (!pushConfigured()) return 0;

  const subs = await db.pushSubscription.findMany().catch(() => []);
  if (subs.length === 0) return 0;

  const payload = JSON.stringify({
    title: message.title,
    body: message.body ?? "",
    url: message.url ?? "/today",
    urgent: message.urgent === true,
    tag: message.tag,
  });

  let sent = 0;

  for (const sub of subs) {
    try {
      const body = await encrypt(payload, sub.p256dh, sub.auth);
      const token = await vapidToken(sub.endpoint);

      const response = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          TTL: "86400",
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          Authorization: `vapid t=${token}, k=${process.env.VAPID_PUBLIC_KEY!.trim()}`,
          Urgency: message.urgent ? "high" : "normal",
        },
        body: toBuffer(body),
      });

      if (response.ok) {
        sent++;
      } else if (response.status === 404 || response.status === 410) {
        await db.pushSubscription
          .delete({ where: { id: sub.id } })
          .catch(() => null);
      } else {
        console.error("[push] נדחה:", response.status, await response.text());
      }
    } catch (err) {
      console.error("[push] שליחה נכשלה:", err);
    }
  }

  return sent;
}
