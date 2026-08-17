import React from "react";
import { useAuth } from "./AuthContext";

export default function PrintHeader({ sectionLabel }) {
  const { company } = useAuth();
  const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <div className="print-only print-header">
      <div className="print-header-top">
        <strong>{sectionLabel}</strong>
        <span>Stampato il {today}</span>
      </div>
      {company && (company.name || company.consultant_name) && (
        <div className="print-header-sub">
          {company.name && <span>Attività: {company.name}</span>}
          {company.consultant_name && (
            <span>Servizio HACCP a cura di {company.consultant_name}{company.consultant_email ? ` · ${company.consultant_email}` : ""}</span>
          )}
        </div>
      )}
    </div>
  );
}
