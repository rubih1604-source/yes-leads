/**
 * יוצר ליד בדיקה כדי לראות שהמערכת עובדת.
 * הרצה:  npx tsx scripts/seed-test-lead.ts
 */
import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../lib/phone";

const db = new PrismaClient();

async function main() {
  const phone = normalizePhone("0521234567")!;

  const lead = await db.lead.upsert({
    where: { phone },
    update: {},
    create: {
      phone,
      firstName: "ליד",
      lastName: "בדיקה",
      status: "חדש",
      source: "בדיקה ידנית",
    },
  });

  await db.leadEvent.create({
    data: {
      leadId: lead.id,
      type: "lead_created",
      toStatus: lead.status,
      actor: "system",
    },
  });

  console.log("נוצר ליד בדיקה:", lead.phone, "|", lead.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
