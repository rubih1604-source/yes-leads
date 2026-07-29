/** בדיקות לקריאת הודעה נכנסת מטקסטר */
import { mapInboundMessage } from "../lib/texter-mapping";

let passed = 0, failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else {
    failed++;
    console.log(`  ✗ ${label}`);
    console.log(`      התקבל:  ${JSON.stringify(actual)}`);
    console.log(`      ציפינו: ${JSON.stringify(expected)}`);
  }
}

console.log("\nזיהוי הודעה נכנסת");

check(
  "מבנה שטוח פשוט",
  mapInboundMessage({ from: "972501234567", text: "כן מעוניין", messageId: "abc" }),
  { phone: "972501234567", text: "כן מעוניין", messageId: "abc", senderName: null, isOutgoing: false }
);

check(
  "מבנה מקונן",
  mapInboundMessage({
    event: "message",
    message: { id: "wamid.X", body: "מתי אפשר לדבר?" },
    contact: { phone: "0501234567", pushName: "חיים" },
  }),
  { phone: "0501234567", text: "מתי אפשר לדבר?", messageId: "wamid.X", senderName: "חיים", isOutgoing: false }
);

check(
  "שדה waId",
  mapInboundMessage({ waId: "972521234567", content: "הסר" }).phone,
  "972521234567"
);

console.log("\nסינון הודעות שאנחנו שלחנו");
check("fromMe true", mapInboundMessage({ from: "97250", text: "היי", fromMe: true }).isOutgoing, true);
check("direction outgoing", mapInboundMessage({ from: "97250", text: "היי", direction: "outgoing" }).isOutgoing, true);
check("direction incoming", mapInboundMessage({ from: "97250", text: "היי", direction: "incoming" }).isOutgoing, false);
check("בלי סימון = נכנסת", mapInboundMessage({ from: "97250", text: "היי" }).isOutgoing, false);

console.log("\nלא נשבר על מבנה לא מוכר");
check("אובייקט זר", mapInboundMessage({ nothing: "here" }), { phone: null, text: null, messageId: null, senderName: null, isOutgoing: false });
check("null", mapInboundMessage(null), { phone: null, text: null, messageId: null, senderName: null, isOutgoing: false });

console.log(`\n${"=".repeat(40)}`);
console.log(`עברו: ${passed}   נכשלו: ${failed}`);
console.log("=".repeat(40) + "\n");
