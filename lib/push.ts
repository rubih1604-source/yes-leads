/**
 * ============================================================
 *  התראות דחיפה - בלי תלות בחבילות חיצוניות
 * ============================================================
 *
 *  מימוש מלא של Web Push (RFC 8291 + VAPID) על crypto המובנה
 *  של Node. בלי להוסיף שום חבילה, ולכן בלי סיכון שהפריסה
 *  תיפול בגלל התקנה.
 *
 *  משתני סביבה:
 *    VAPID_PUBLIC_KEY   - גם בצד הדפדפן
 *    VAPID_PRIVATE_KEY
 *    VAPID_SUBJECT      - mailto של בעל האפליקציה
 */

/**
 * node: במפורש.
 *
 * בלי הקידומת Next מנסה לפתור את crypto כמודול דפדפן
 * כשהקובץ נטען דרך instrumentation, והבנייה נופלת עם
 * "Can't resolve 'crypto'".
 */
import crypto from "node:crypto";
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

// ---------- עזרי קידוד ----------

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

// ---------- VAPID ----------

/** בונה מפתח פרטי בפורמט שה-crypto יודע לחתום איתו */
function privateKeyObject(d: Buffer, publicRaw: Buffer) {
  return crypto.createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: b64url(d),
      x: b64url(publicRaw.subarray(1, 33)),
      y: b64url(publicRaw.subarray(33, 65)),
    },
    format: "jwk",
  });
}

/** חתימת ה-JWT שמוכיחה לשרת הדחיפה מי אנחנו */
function vapidHeader(endpoint: string): string {
  const audience = new URL(endpoint).origin;

  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com",
      })
    )
  );

  const publicRaw = fromB64url(process.env.VAPID_PUBLIC_KEY!.trim());
  const privateRaw = fromB64url(process.env.VAPID_PRIVATE_KEY!.trim());

  const signature = crypto.sign(
    "sha256",
    Buffer.from(`${header}.${payload}`),
    { key: privateKeyObject(privateRaw, publicRaw), dsaEncoding: "ieee-p1363" }
  );

  return `${header}.${payload}.${b64url(signature)}`;
}

// ---------- הצפנת התוכן ----------

function hkdf(
  salt: Buffer,
  ikm: Buffer,
  info: Buffer,
  length: number
): Buffer {
  const prk = crypto.createHmac("sha256", salt).update(ikm).digest();
  const output = crypto
    .createHmac("sha256", prk)
    .update(Buffer.concat([info, Buffer.from([1])]))
    .digest();
  return output.subarray(0, length);
}

/**
 * מצפין את גוף ההודעה לפי aes128gcm.
 * רק המכשיר שנרשם יכול לפענח אותה - גם שרת הדחיפה לא.
 */
function encrypt(payload: string, p256dh: string, auth: string) {
  const clientPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);

  const local = crypto.createECDH("prime256v1");
  local.generateKeys();
  const localPublic = local.getPublicKey();
  const shared = local.computeSecret(clientPublic);

  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    clientPublic,
    localPublic,
  ]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);

  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const plaintext = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  // כותרת: salt, גודל רשומה, אורך המפתח, המפתח עצמו
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(localPublic.length, 20);

  return Buffer.concat([header, localPublic, encrypted]);
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
      const body = encrypt(payload, sub.p256dh, sub.auth);

      const response = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          TTL: "86400",
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          Authorization: `vapid t=${vapidHeader(sub.endpoint)}, k=${process.env.VAPID_PUBLIC_KEY!.trim()}`,
          Urgency: message.urgent ? "high" : "normal",
        },
        body,
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
