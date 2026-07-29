/** בדיקות להמרת זמן בעריכת חוקים */
function toMinutes(amount: number, unit: string): number {
  if (unit === "days") return amount * 60 * 24;
  if (unit === "hours") return amount * 60;
  return amount;
}
function splitDelay(minutes: number): { amount: number; unit: string } {
  if (minutes % (60 * 24) === 0 && minutes >= 60 * 24)
    return { amount: minutes / (60 * 24), unit: "days" };
  if (minutes % 60 === 0 && minutes >= 60)
    return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes, unit: "minutes" };
}

let passed = 0, failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}  התקבל ${JSON.stringify(actual)} ציפינו ${JSON.stringify(expected)}`); }
}

console.log("\nהמרת זמן");
check("5 דקות", toMinutes(5, "minutes"), 5);
check("28 שעות", toMinutes(28, "hours"), 1680);
check("30 יום", toMinutes(30, "days"), 43200);

console.log("\nפירוק חזרה לעריכה");
check("5 דקות", splitDelay(5), { amount: 5, unit: "minutes" });
check("60 דקות = שעה", splitDelay(60), { amount: 1, unit: "hours" });
check("1680 דקות = 28 שעות", splitDelay(1680), { amount: 28, unit: "hours" });
check("43200 דקות = 30 יום", splitDelay(43200), { amount: 30, unit: "days" });
check("90 דקות נשאר בדקות", splitDelay(90), { amount: 90, unit: "minutes" });

console.log("\nהלוך ושוב");
for (const m of [5, 60, 1680, 3120, 43200, 90]) {
  const s = splitDelay(m);
  check(`${m} דקות -> ${s.amount} ${s.unit} -> ${m}`, toMinutes(s.amount, s.unit), m);
}

console.log(`\n${"=".repeat(40)}`);
console.log(`עברו: ${passed}   נכשלו: ${failed}`);
console.log("=".repeat(40) + "\n");
