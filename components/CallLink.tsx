"use client";

import { useEffect, useState } from "react";
import { dialHref, DEFAULT_DIALER } from "@/lib/dialer";

/**
 * ============================================================
 *  כפתור החיוג
 * ============================================================
 *
 *  זה הרכיב היחיד במערכת שבונה קישור חיוג. כל כפתור חיוג
 *  עובר דרכו, ולכן שינוי הגדרה משנה את כולם יחד - אי אפשר
 *  שמסך אחד "יישאר מאחור".
 *
 *  למה דווקא רכיב בצד הלקוח: רק הדפדפן יודע אם אתה כרגע
 *  בנייד או במחשב. בשרת אין דרך לדעת את זה באמת.
 *
 *  עד שהדפדפן נטען, הקישור הוא `tel:` הרגיל. ככה לחיצה
 *  מהירה מאוד עדיין מחייגת, רק דרך חייגן המכשיר.
 */

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;

  // מגע + מסך צר = נייד. בודקים את שניהם כדי לא לטעות
  // במסך מגע גדול או בחלון דפדפן צר במחשב.
  const touch = navigator.maxTouchPoints > 1;
  const narrow =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 900px)").matches;

  return touch && narrow;
}

export default function CallLink({
  phone,
  mobileTemplate,
  desktopTemplate,
  className,
  children,
  title,
}: {
  /** המספר כפי שמחייגים אותו בפועל */
  phone: string;
  mobileTemplate: string;
  desktopTemplate: string;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const [href, setHref] = useState(dialHref(DEFAULT_DIALER, phone));

  useEffect(() => {
    setHref(dialHref(isMobile() ? mobileTemplate : desktopTemplate, phone));
  }, [phone, mobileTemplate, desktopTemplate]);

  return (
    <a className={className} href={href} title={title}>
      {children}
    </a>
  );
}
