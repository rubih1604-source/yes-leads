/** בדיקות לחילוץ מזהה צ'אט מתשובת טקסטר */
import { extractChatId, toTexterPhone } from "../lib/texter";

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

console.log("\nחילוץ מזהה צ'אט");

check(
  "המבנה מהתיעוד",
  extractChatId({ data: [{ _id: "67bf11038b24880cc966f799", title: "John Doe" }], total: 1 }),
  "67bf11038b24880cc966f799"
);
check("מערך בשורש", extractChatId([{ _id: "abc123" }]), "abc123");
check("שדה id", extractChatId({ data: [{ id: "xyz" }] }), "xyz");
check("שדה chatId", extractChatId({ chats: [{ chatId: "c-1" }] }), "c-1");
check("תשובה ריקה", extractChatId({ data: [], total: 0 }), null);
check("מבנה לא מוכר", extractChatId({ weird: true }), null);
check("null", extractChatId(null), null);

console.log("\nהמספר שנשלח לחיפוש");
check("בלי פלוס", toTexterPhone("+972506767677"), "972506767677");

console.log(`\n${"=".repeat(40)}`);
console.log(`עברו: ${passed}   נכשלו: ${failed}`);
console.log("=".repeat(40) + "\n");
