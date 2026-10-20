/**
 * ============================================================
 *  גוף הבקשה של הוובוק היוצא
 * ============================================================
 *
 *  מופרד מהשליחה בכוונה, ולא רק לנוחות: המסך שמגדיר את
 *  הוובוק הוא קומפוננטת דפדפן, ואם הוא היה מייבא את קובץ
 *  השליחה - הוא היה גורר איתו את המסד לחבילת הדפדפן.
 *  זו בדיוק התקלה שמחקה בעבר את ההתראות.
 *
 *  כאן אין מסד ואין רשת. חישוב טהור בלבד.
 */

import {
  buildPayload,
  renderTemplate,
  type DeliveryLead,
} from "./delivery-payload";

/**
 * בניית גוף הבקשה.
 *
 * מופרד מהשליחה כדי שיהיה אפשר לבדוק אותו: מה שנשלח לצד
 * שלישי הוא מה שהוא יעבוד לפיו, ואסור שיהיה כאן ניחוש.
 */
export function hookBody(args: {
  lead: DeliveryLead;
  at: Date;
  statusName: string;
  template?: string | null;
}): string {
  const payload = {
    ...buildPayload(args.lead, args.at),
    status: args.statusName,
  };

  const template = args.template?.trim();

  if (template) return renderTemplate(template, payload);

  return JSON.stringify(payload);
}

/** האסימונים שאפשר להשתמש בהם בתבנית של הוובוק */
export function hookTokens(): string[] {
  return [
    "full_name",
    "first_name",
    "last_name",
    "phone",
    "email",
    "address",
    "campaign",
    "ad",
    "form",
    "supplier_question",
    "fb_leadid",
    "created_at",
    "status",
  ];
}
