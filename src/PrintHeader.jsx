import React from "react";
import { useAuth } from "./AuthContext";

// Intestazione che compare solo in stampa, in cima al registro esportato.
//
// Volutamente NON riporta il nome del consulente: il registro esportato è un
// documento dell'azienda, che lo esibisce in proprio davanti a un controllo.
// Il riferimento del consulente resta a schermo, dove serve al cliente per
// sapere chi chiamare, ma non finisce sulla carta.
//
// Il nominativo che ha senso sul registro è quello del responsabile della
// materia a cui il registro appartiene: il Responsabile HACCP sui registri di
// autocontrollo, l'RSPP su quelli di sicurezza sul lavoro.
export default function PrintHeader({ sectionLabel, responsabileLabel, responsabileName }) {
  const { company } = useAuth();
  const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <div className="print-only print-header">
      <div className="print-header-top">
        <strong>{sectionLabel}</strong>
        <span>Stampato il {today}</span>
      </div>
      {(company?.name || responsabileName) && (
        <div className="print-header-sub">
          {company?.name && <span>Attività: {company.name}</span>}
          {responsabileName && <span>{responsabileLabel}: {responsabileName}</span>}
        </div>
      )}
    </div>
  );
}
