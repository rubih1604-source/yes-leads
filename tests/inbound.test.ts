/**
 * בדיקות לקריאת הודעה נכנסת מטקסטר.
 * ה-payload הראשון הוא העתק של מה שטקסטר באמת שלח ב-29.7.26.
 */
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

// המבנה האמיתי שהגיע מטקסטר
const real = {
  _method: "POST",
  eventName: "newIncomingMessage",
  eventData: {
    chat: {
      _id: "6a2538aadb2af8c33fffca2a",
      agent: { uid: "", displayName: "" },
      title: "RH",
      status: 4,
      crmData: { leadId: "42326384", accountId: "11587" },
      channelInfo: {
        id: "972528908209",
        name: "whatsapp",
        accountId: "972503336897",
      },
      lastMessage: { text: "כן מעוניין תתקשר", type: "text", forwarded: false },
      unreadCount: 10,
    },
    message: {
      _id: "6a69c615040390a2b0ad0990",
      text: "כן מעוניין תתקשר",
      type: "text",
      status: 2,
      incoming: true,
      outgoing: false,
      direction: "incoming",
      channelInfo: { id: "wamid.HBgMOTcyNTI4OTA4MjA5FQIAEhgUM0FFRDYzNERBRTEzOTlDMERFQjkA" },
      parent_chat: "6a2538aadb2af8c33fffca2a",
      chatChannelInfo: {
        id: "972528908209",
        name: "whatsapp",
        accountId: "972503336897",
      },
    },
  },
};

const mapped = mapInboundMessage(real);

console.log("\nה-payload האמיתי של טקסטר");
check("מספר הלקוח (לא המספר העסקי)", mapped.phone, "972528908209");
check("תוכן ההודעה", mapped.text, "כן מעוניין תתקשר");
check("מזהה ההודעה - לא הטלפון", mapped.messageId, "6a69c615040390a2b0ad0990");
check("מזהה הצ'אט", mapped.chatId, "6a2538aadb2af8c33fffca2a");
check("שם מכותרת הצ'אט", mapped.senderName, "RH");
check("מזוהה כנכנסת", mapped.isOutgoing, false);

console.log("\nהמלכודות שנפלנו בהן");
check('השם אינו "whatsapp"', mapped.senderName === "whatsapp", false);
check("מזהה ההודעה אינו הטלפון", mapped.messageId === mapped.phone, false);
check("לא נלקח המספר העסקי 972503336897", mapped.phone === "972503336897", false);

console.log("\nהודעה יוצאת מסוננת");
const outgoing = JSON.parse(JSON.stringify(real));
outgoing.eventData.message.outgoing = true;
outgoing.eventData.message.incoming = false;
outgoing.eventData.message.direction = "outgoing";
check("outgoing מזוהה", mapInboundMessage(outgoing).isOutgoing, true);

console.log("\nשם שהוא בעצם מספר לא נשמר כשם");
const numericTitle = JSON.parse(JSON.stringify(real));
numericTitle.eventData.chat.title = "972528908209";
check("כותרת מספרית -> null", mapInboundMessage(numericTitle).senderName, null);

console.log("\nגיבוי למבנה שטוח");
check(
  "מבנה פשוט עדיין עובד",
  mapInboundMessage({ from: "0501234567", text: "הסר" }).phone,
  "0501234567"
);
check(
  "טקסט במבנה פשוט",
  mapInboundMessage({ from: "0501234567", text: "הסר" }).text,
  "הסר"
);

console.log("\nלא נשבר על קלט זר");
check("אובייקט ריק", mapInboundMessage({}).phone, null);
check("null", mapInboundMessage(null).phone, null);
check("מחרוזת", mapInboundMessage("שלום").phone, null);

console.log(`\n${"=".repeat(40)}`);
console.log(`עברו: ${passed}   נכשלו: ${failed}`);
console.log("=".repeat(40) + "\n");
