import React from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert, Clock } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { expiryInfo, MEDICO_ROLE, FORMAZIONE_ROLE } from "./SicurezzaLavoro";

// Controllo di conformità: elenca gli adempimenti del D.Lgs. 81/08 che per
// questa azienda risultano mancanti, scaduti o in scadenza.
//
// Attenzione a cosa questo strumento è e cosa non è: verifica i buchi TRA I
// DATI INSERITI NELL'APP. Non vede ciò che non è stato registrato e non
// certifica la conformità dell'azienda. Serve al consulente per non
// dimenticare niente, non a sostituire la sua valutazione: per questo
// l'avvertenza è scritta anche a schermo, così un cliente che stampa la
// pagina non la scambi per un attestato.
//
// Periodicità codificate qui sotto, aggiornate all'Accordo Stato-Regioni del
// 17 aprile 2025 (in vigore dal 24 maggio 2025):
//   lavoratori          6 ore ogni 5 anni
//   preposti            6 ore ogni 2 anni  (prima 5)
//   datore di lavoro    6 ore ogni 5 anni  (corso base 16 ore, obbligo nuovo)
//   datore di lavoro RSPP  8 ore ogni 5 anni
//   primo soccorso      3 anni (D.M. 388/2003)
//   antincendio         5 anni (D.M. 2 settembre 2021)
//   RLS                 annuale fino a 50 dipendenti (art. 37, fuori Accordo)
// La formazione dei lavoratori va erogata PRIMA dell'inizio dell'attività:
// il vecchio margine dei 60 giorni dall'assunzione non esiste più.

const RSPP_ROLES = ["RSPP Datore di Lavoro", "RSPP Esterno"];
const DATORE_ROLES = ["Datore di Lavoro", "RSPP Datore di Lavoro"];

function mesiFa(dateStr, mesi) {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  const limite = new Date();
  limite.setMonth(limite.getMonth() - mesi);
  return d < limite;
}

export default function Conformita() {
  const { company } = useAuth();
  const { items: employees } = useTable("employees", company?.id);
  const { items: appointments } = useTable("work_safety_appointments", company?.id);
  const { items: trainings } = useTable("work_safety_trainings", company?.id);
  const { items: medicalVisits } = useTable("medical_visits", company?.id);
  const { items: dvrDocs } = useTable("dvr_documents", company?.id);
  const { items: equipmentChecks } = useTable("equipment_checks", company?.id);

  const nomeDi = (e) => `${e.first_name} ${e.last_name}`.trim();

  const ultimoCorso = (appointmentId) => {
    const lista = trainings.filter((t) => t.appointment_id === appointmentId && t.expiry_date);
    if (lista.length === 0) return null;
    return lista.reduce((best, t) => (!best || new Date(t.expiry_date) > new Date(best.expiry_date) ? t : best), null);
  };

  const nomineCon = (roles) => appointments.filter((a) => roles.includes(a.role));

  const esiti = [];
  const push = (livello, titolo, dettaglio, norma) => esiti.push({ livello, titolo, dettaglio, norma });

  // Stato formativo di una singola nomina: manca l'attestato, è scaduto,
  // sta per scadere, oppure è a posto.
  const controllaFormazione = (a, etichetta, norma) => {
    const t = ultimoCorso(a.id);
    if (!t) {
      push("grave", `${etichetta}: attestato mancante`, `${a.person_name} risulta incaricato ma non ha alcun attestato registrato.`, norma);
      return;
    }
    const info = expiryInfo(t.expiry_date);
    if (!info) return;
    if (info.cls === "pill-alert") push("scaduto", `${etichetta}: formazione scaduta`, `${a.person_name} — ${info.label}.`, norma);
    else if (info.cls === "pill-warn") push("scadenza", `${etichetta}: formazione in scadenza`, `${a.person_name} — ${info.label}.`, norma);
  };

  // --- Figure obbligatorie ---
  const rspp = nomineCon(RSPP_ROLES);
  if (rspp.length === 0) {
    push("grave", "RSPP non designato",
      "Nessuna nomina a Responsabile del Servizio di Prevenzione e Protezione. È un obbligo non delegabile del datore di lavoro.",
      "art. 17, comma 1, lett. b) D.Lgs. 81/08");
  } else {
    rspp.forEach((a) => controllaFormazione(a, "RSPP", "Accordo Stato-Regioni 17/04/2025 — aggiornamento 8 ore ogni 5 anni"));
  }

  const rls = nomineCon(["RLS"]);
  if (rls.length === 0) {
    push("grave", "RLS non presente",
      "Nessun Rappresentante dei Lavoratori per la Sicurezza. Se i lavoratori non lo hanno eletto serve il verbale di mancata elezione e il ricorso all'RLS territoriale.",
      "artt. 47 e 48 D.Lgs. 81/08");
  } else {
    rls.forEach((a) => controllaFormazione(a, "RLS", "art. 37, commi 10 e 11 — 32 ore, aggiornamento annuale fino a 50 dipendenti"));
  }

  const soccorso = nomineCon(["Addetto al Primo Soccorso"]);
  if (soccorso.length === 0) {
    push("grave", "Nessun addetto al primo soccorso",
      "L'azienda deve designare almeno un lavoratore incaricato del primo soccorso.",
      "artt. 18, comma 1, lett. b) e 45 D.Lgs. 81/08 — D.M. 388/2003");
  } else {
    soccorso.forEach((a) => controllaFormazione(a, "Primo soccorso", "D.M. 388/2003 — aggiornamento triennale"));
  }

  const antincendio = nomineCon(["Addetto Antincendio"]);
  if (antincendio.length === 0) {
    push("grave", "Nessun addetto antincendio",
      "L'azienda deve designare almeno un lavoratore incaricato della prevenzione incendi, lotta antincendio ed evacuazione.",
      "artt. 18, comma 1, lett. b) e 46 D.Lgs. 81/08 — D.M. 2 settembre 2021");
  } else {
    antincendio.forEach((a) => controllaFormazione(a, "Antincendio", "D.M. 2 settembre 2021 — aggiornamento quinquennale"));
  }

  if (company?.active_medical_surveillance && nomineCon([MEDICO_ROLE]).length === 0) {
    push("grave", "Medico competente non nominato",
      "La sorveglianza sanitaria risulta attiva ma non c'è alcuna nomina del medico competente.",
      "artt. 18, comma 1, lett. a) e 41 D.Lgs. 81/08");
  }

  nomineCon(["Preposto"]).forEach((a) =>
    controllaFormazione(a, "Preposto", "art. 37, comma 7-ter — aggiornamento biennale dall'Accordo 17/04/2025"));

  // --- Formazione dei lavoratori ---
  // Il datore di lavoro non rientra qui: ha il proprio percorso formativo.
  const lavoratori = employees.filter((e) => !DATORE_ROLES.includes(e.security_role));
  const nomineFormazione = appointments.filter((a) => a.role === FORMAZIONE_ROLE);

  lavoratori.forEach((e) => {
    const nome = nomeDi(e);
    const nomina = nomineFormazione.find((a) => (a.person_name || "").trim() === nome);
    if (!nomina) {
      push("grave", "Lavoratore senza formazione",
        `${nome}${e.job_role ? " (" + e.job_role + ")" : ""} non ha alcuna formazione generale e specifica registrata. Dal 24 maggio 2025 va erogata prima dell'inizio dell'attività lavorativa.`,
        "art. 37 D.Lgs. 81/08 — Accordo Stato-Regioni 17/04/2025");
      return;
    }
    const t = ultimoCorso(nomina.id);
    if (!t) {
      push("grave", "Lavoratore senza attestato",
        `${nome} ha la posizione aperta ma nessun attestato di formazione registrato.`,
        "art. 37 D.Lgs. 81/08");
      return;
    }
    const info = expiryInfo(t.expiry_date);
    if (info?.cls === "pill-alert") push("scaduto", "Formazione lavoratore scaduta", `${nome} — ${info.label}.`, "aggiornamento 6 ore ogni 5 anni");
    else if (info?.cls === "pill-warn") push("scadenza", "Formazione lavoratore in scadenza", `${nome} — ${info.label}.`, "aggiornamento 6 ore ogni 5 anni");
  });

  // --- Datore di lavoro ---
  const datori = employees.filter((e) => DATORE_ROLES.includes(e.security_role));
  datori.forEach((e) => {
    const nome = nomeDi(e);
    const sue = appointments.filter((a) => (a.person_name || "").trim() === nome && RSPP_ROLES.includes(a.role));
    const haAttestato = sue.some((a) => ultimoCorso(a.id));
    if (!haAttestato) {
      push("grave", "Datore di lavoro senza formazione",
        `${nome} non ha attestati registrati. Dall'Accordo del 17 aprile 2025 il corso da 16 ore per il datore di lavoro è obbligatorio per tutti, anche quando non svolge direttamente i compiti di RSPP.`,
        "art. 37 D.Lgs. 81/08 — Accordo Stato-Regioni 17/04/2025");
    }
  });

  // --- Documenti ---
  const dvr = dvrDocs.filter((d) => d.kind === "dvr");
  if (dvr.length === 0) {
    push("grave", "DVR non presente",
      "Nessun Documento di Valutazione dei Rischi caricato.",
      "artt. 17, comma 1, lett. a) e 28 D.Lgs. 81/08");
  }

  const allegati = dvrDocs.filter((d) => d.kind === "allegato");
  const cerca = (parola) => allegati.filter((d) => (d.title || "").toLowerCase().includes(parola));

  if (employees.length >= 15) {
    const riunioni = cerca("riunione periodica");
    const ultima = riunioni.reduce((m, d) => (!m || new Date(d.doc_date) > new Date(m.doc_date) ? d : m), null);
    if (!ultima) {
      push("grave", "Riunione periodica mai verbalizzata",
        `L'azienda ha ${employees.length} lavoratori: la riunione periodica è obbligatoria almeno una volta all'anno.`,
        "art. 35 D.Lgs. 81/08");
    } else if (mesiFa(ultima.doc_date, 12)) {
      push("scaduto", "Riunione periodica da rifare",
        `L'ultimo verbale è del ${new Date(ultima.doc_date).toLocaleDateString("it-IT")}: è passato più di un anno.`,
        "art. 35 D.Lgs. 81/08");
    }
  }

  if (company?.active_medical_surveillance) {
    const visite = cerca("sopralluogo del medico competente");
    const ultima = visite.reduce((m, d) => (!m || new Date(d.doc_date) > new Date(m.doc_date) ? d : m), null);
    if (!ultima) {
      push("grave", "Visita del medico competente agli ambienti mai verbalizzata",
        "Il medico competente deve visitare gli ambienti di lavoro almeno una volta all'anno, salvo diversa periodicità motivata nel DVR.",
        "art. 25, comma 1, lett. l) D.Lgs. 81/08");
    } else if (mesiFa(ultima.doc_date, 12)) {
      push("scaduto", "Visita del medico competente agli ambienti da rifare",
        `L'ultimo verbale è del ${new Date(ultima.doc_date).toLocaleDateString("it-IT")}.`,
        "art. 25, comma 1, lett. l) D.Lgs. 81/08");
    }
  }

  // --- Sorveglianza sanitaria ---
  if (company?.active_medical_surveillance) {
    lavoratori.forEach((e) => {
      const nome = nomeDi(e);
      const sue = medicalVisits.filter((v) => (v.employee_name || "").trim() === nome);
      if (sue.length === 0) {
        push("grave", "Lavoratore senza visita medica",
          `${nome}${e.job_role ? " (" + e.job_role + ")" : ""} non ha alcuna visita registrata.`,
          "art. 41 D.Lgs. 81/08");
        return;
      }
      const ultima = sue.reduce((m, v) => (!m || new Date(v.expiry_date || 0) > new Date(m.expiry_date || 0) ? v : m), null);
      const info = expiryInfo(ultima?.expiry_date);
      if (info?.cls === "pill-alert") push("scaduto", "Visita medica scaduta", `${nome} — ${info.label}.`, "art. 41 D.Lgs. 81/08");
      else if (info?.cls === "pill-warn") push("scadenza", "Visita medica in scadenza", `${nome} — ${info.label}.`, "art. 41 D.Lgs. 81/08");
    });
  }

  // --- Attrezzature ---
  if (company?.active_equipment_checks) {
    equipmentChecks.forEach((eq) => {
      const info = expiryInfo(eq.expiry_date);
      if (info?.cls === "pill-alert") push("scaduto", "Verifica attrezzatura scaduta", `${eq.equipment_type || "Attrezzatura"} — ${eq.label} — ${info.label}.`, "art. 71, comma 8 D.Lgs. 81/08");
      else if (info?.cls === "pill-warn") push("scadenza", "Verifica attrezzatura in scadenza", `${eq.equipment_type || "Attrezzatura"} — ${eq.label} — ${info.label}.`, "art. 71, comma 8 D.Lgs. 81/08");
    });
  }

  const gravi = esiti.filter((e) => e.livello === "grave");
  const scaduti = esiti.filter((e) => e.livello === "scaduto");
  const inScadenza = esiti.filter((e) => e.livello === "scadenza");

  const Gruppo = ({ icona: Icona, titolo, colore, voci }) => (
    voci.length === 0 ? null : (
      <div className="conf-gruppo">
        <p className="conf-gruppo-titolo" style={{ color: colore }}>
          <Icona size={15} /> {titolo} ({voci.length})
        </p>
        <ul className="conf-lista">
          {voci.map((v, i) => (
            <li key={i} className={"conf-voce" + (v.livello === "scadenza" ? " conf-voce-warn" : "")}>
              <p className="conf-titolo">{v.titolo}</p>
              <p className="conf-dettaglio">{v.dettaglio}</p>
              <p className="conf-norma">{v.norma}</p>
            </li>
          ))}
        </ul>
      </div>
    )
  );

  return (
    <div>
      <p className="conf-intro">
        Controllo degli adempimenti previsti dal D.Lgs. 81/08 sulla base dei dati registrati per
        <strong> {company?.name || "questa azienda"}</strong>.
      </p>

      {esiti.length === 0 ? (
        <div className="conf-ok">
          <CheckCircle2 size={18} color="#2F6F4E" />
          <span>Nessuna mancanza rilevata tra gli adempimenti verificati.</span>
        </div>
      ) : (
        <>
          <Gruppo icona={ShieldAlert} titolo="Mancanze" colore="#B3432E" voci={gravi} />
          <Gruppo icona={AlertTriangle} titolo="Scaduti" colore="#B3432E" voci={scaduti} />
          <Gruppo icona={Clock} titolo="In scadenza entro 60 giorni" colore="#9A6B12" voci={inScadenza} />
        </>
      )}

      <p className="conf-avvertenza">
        Questo controllo verifica gli adempimenti sulla base dei dati inseriti nell'applicazione.
        Non rileva ciò che non è stato registrato e non costituisce una certificazione di conformità
        dell'azienda: resta uno strumento di lavoro per il consulente e per il medico competente.
      </p>
    </div>
  );
}
