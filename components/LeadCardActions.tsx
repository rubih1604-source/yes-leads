"use client";

import { useState } from "react";
import StatusSheet from "./StatusSheet";

export default function LeadCardActions({
  leadId,
  phone,
  status,
}: {
  leadId: string;
  phone: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="actions">
        <a className="btn call" href={`tel:${phone}`}>
          התקשר
        </a>
        <button className="btn primary" onClick={() => setOpen(true)}>
          שנה סטטוס
        </button>
      </div>
      {open && (
        <StatusSheet
          leadId={leadId}
          current={status}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
