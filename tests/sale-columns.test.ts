import { readSaleColumns, SALE_COLUMNS, DEFAULT_SALE_COLUMNS } from "../lib/sale-report-columns";
let pass=0, fail=0;
function check(name: string, a: unknown, b: unknown) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      ציפינו: ${JSON.stringify(b)}\n      קיבלנו: ${JSON.stringify(a)}`}`);
}
check("מה שרובי ביקש", readSaleColumns("date,name,phone,email"), ["date","name","phone","email"]);
check("סדר הפוך בבחירה -> סדר קבוע בקובץ", readSaleColumns("email,phone,name,date"), ["date","name","phone","email"]);
check("בלי פרמטר -> ברירת מחדל", readSaleColumns(null), DEFAULT_SALE_COLUMNS);
check("ריק -> ברירת מחדל", readSaleColumns(""), DEFAULT_SALE_COLUMNS);
check("מפתח לא מוכר נזרק", readSaleColumns("name,שטויות,phone"), ["name","phone"]);
check("רק מפתחות לא מוכרים -> ברירת מחדל", readSaleColumns("abc,def"), DEFAULT_SALE_COLUMNS);
check("כפילות לא מכפילה עמודה", readSaleColumns("name,name,phone"), ["name","phone"]);
check("עמודה אחת מותרת", readSaleColumns("phone"), ["phone"]);
check("הכל", readSaleColumns(SALE_COLUMNS.map(c=>c.key).join(",")), SALE_COLUMNS.map(c=>c.key));
check("רווחים מסביב", readSaleColumns(" name , phone "), ["name","phone"]);
console.log(`\n${pass} עברו, ${fail} נכשלו`);
if (fail) process.exit(1);
