import React, { useState, useEffect } from "react";
import { CheckCircle2, CalendarClock, Download } from "lucide-react";
import { useAuth } from "../AuthContext";
import { downloadReminderICS } from "../hooks/useReminders";

export default function Configurazione() {
  const { company, updateCompany, error } = useAuth();
  const [name, setName] = useState("");
  const [consultantName, setConsultantName] = useState("");
  const [consultantEmail, setConsultantEmail] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [hasWaterTank, setHasWaterTank] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name || "");
      setConsultantName(company.consultant_name || "");
      setConsultantEmail(company.consultant_email || "");
      setOwnerEmail(company.owner_email || "");
      setHasWaterTank(!!company.has_water_tank);
    }
  }, [company]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await updateCompany({
      name,
      consultant_name: consultantName,
      consultant_email: consultantEmail,
      owner_email: ownerEmail,
      has_water_tank: hasWaterTank,
    });
    setBusy(false);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Configurazione</h2>
          <p className="sub">Dati dell'attività e del consulente HACCP che fornisce il servizio.</p>
        </div>
      </div>

      <form onSubmit={submit} className="config-form">
        <fieldset className="config-group">
          <legend>Attività</legend>
          <input type="text" placeholder="Ragione sociale / nome attività" value={name} onChange={(e) => setName(e.target.value)} className="full-input" />
          <input type="email" placeholder="Email del titolare" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="full-input" style={{ marginTop: 10 }} />
          <label className="checkbox-row" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={hasWaterTank} onChange={(e) => setHasWaterTank(e.target.checked)} />
            L'attività ha una vasca di accumulo dell'acqua
          </label>
        </fieldset>

        <fieldset className="config-group">
          <legend>Fornitore del servizio (consulente HACCP)</legend>
          <input type="text" placeholder="Nome e cognome" value={consultantName} onChange={(e) => setConsultantName(e.target.value)} className="full-input" />
          <input type="email" placeholder="Email" value={consultantEmail} onChange={(e) => setConsultantEmail(e.target.value)} className="full-input" style={{ marginTop: 10 }} />
        </fieldset>

        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <CheckCircle2 size={16} /> Salva configurazione
        </button>
        {saved && <span className="saved-note"><CheckCircle2 size={13} /> Salvato</span>}
        {!saved && error && <p className="login-error" style={{ marginTop: 4 }}>Errore nel salvataggio: {error}</p>}
      </form>

      <div className="reminder-block">
        <div className="reminder-head">
          <CalendarClock size={17} color="#2F6F4E" />
          <div>
            <h3>Promemoria compilazione sul telefono</h3>
            <p className="sub">Scarica il file e aprilo con l'app Calendario del telefono (Google, Apple o Outlook). Il calendario avvisa da solo, anche ad app chiusa — non serve un server.</p>
          </div>
        </div>
        <ul className="reminder-list">
          <li>Ogni giorno alle 8:00 — temperature e sanificazione</li>
          <li>Ogni lunedì alle 8:00 — monitoraggio infestanti</li>
        </ul>
        <button type="button" className="btn-primary" onClick={() => downloadReminderICS(name)}>
          <Download size={16} /> Scarica promemoria (.ics)
        </button>
      </div>
    </div>
  );
}
