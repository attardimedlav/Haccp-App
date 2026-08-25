import React, { useState, useEffect } from "react";
import { CheckCircle2, CalendarClock, Download, Wrench, Droplets, Settings2, RefreshCw, Lock } from "lucide-react";
import { useAuth } from "../AuthContext";
import { downloadReminderICS } from "../hooks/useReminders";
import { getSubscriptionStatus, pillClassFor } from "../subscriptionStatus";
import Attrezzature from "./Attrezzature";
import Sanificanti from "./Sanificanti";

const SUB_TABS = [
  { id: "generale", label: "Generale", icon: Settings2 },
  { id: "attrezzature", label: "Attrezzature", icon: Wrench },
  { id: "sanificanti", label: "Sanificanti", icon: Droplets },
];

function addOneYear(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default function Configurazione() {
  const { company, updateCompany, error, homeCompanyId } = useAuth();
  const [name, setName] = useState("");
  const [consultantName, setConsultantName] = useState("");
  const [consultantEmail, setConsultantEmail] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [hasWaterTank, setHasWaterTank] = useState(false);
  const [haccpManager, setHaccpManager] = useState("");
  const [subscriptionStart, setSubscriptionStart] = useState("");
  const [subscriptionEnd, setSubscriptionEnd] = useState("");
  const [subscriptionAmount, setSubscriptionAmount] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState("attivo");
  const [subscriptionNote, setSubscriptionNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subTab, setSubTab] = useState("generale");

  // Solo chi entra come consulente in un'azienda cliente (non la propria) può gestire l'abbonamento.
  const canManageSubscription = !!(company && homeCompanyId && company.id !== homeCompanyId);

  useEffect(() => {
    if (company) {
      setName(company.name || "");
      setConsultantName(company.consultant_name || "");
      setConsultantEmail(company.consultant_email || "");
      setOwnerEmail(company.owner_email || "");
      setHasWaterTank(!!company.has_water_tank);
      setHaccpManager(company.haccp_manager || "");
      setSubscriptionStart(company.subscription_start || "");
      setSubscriptionEnd(company.subscription_end || "");
      setSubscriptionAmount(
        company.subscription_amount === null || company.subscription_amount === undefined
          ? ""
          : String(company.subscription_amount)
      );
      setSubscriptionStatus(company.subscription_status || "attivo");
      setSubscriptionNote(company.subscription_note || "");
    }
  }, [company]);

  const buildPayload = (overrides = {}) => ({
    name,
    consultant_name: consultantName,
    consultant_email: consultantEmail,
    owner_email: ownerEmail,
    has_water_tank: hasWaterTank,
    haccp_manager: haccpManager,
    subscription_start: subscriptionStart || null,
    subscription_end: subscriptionEnd || null,
    subscription_amount: subscriptionAmount === "" ? null : Number(subscriptionAmount),
    subscription_status: subscriptionStatus,
    subscription_note: subscriptionNote,
    ...overrides,
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await updateCompany(buildPayload());
    setBusy(false);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  // Quando cambia la data di inizio, la scadenza si ricalcola sempre da sola: +1 anno.
  const handleStartChange = (value) => {
    setSubscriptionStart(value);
    setSubscriptionEnd(addOneYear(value));
  };

  const renewFromToday = async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const newEnd = addOneYear(todayStr);
    setBusy(true);
    const ok = await updateCompany(buildPayload({
      subscription_start: todayStr,
      subscription_end: newEnd,
      subscription_status: "attivo",
    }));
    setBusy(false);
    if (ok) {
      setSubscriptionStart(todayStr);
      setSubscriptionEnd(newEnd);
      setSubscriptionStatus("attivo");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  const subStatus = getSubscriptionStatus(company);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Configurazione</h2>
          <p className="sub">Dati dell'attività, del consulente HACCP e impostazioni generali.</p>
        </div>
      </div>

      <div className="config-subtabs">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={"config-subtab" + (subTab === t.id ? " active" : "")}
            onClick={() => setSubTab(t.id)}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {subTab === "attrezzature" && <Attrezzature />}
      {subTab === "sanificanti" && <Sanificanti />}

      {subTab === "generale" && (
        <>
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
              <legend>Responsabile del sistema HACCP</legend>
              <input
                type="text"
                placeholder="Nome e cognome del responsabile HACCP"
                value={haccpManager}
                onChange={(e) => setHaccpManager(e.target.value)}
                className="full-input"
              />
              <p className="sub" style={{ marginTop: 6 }}>
                Questo nome comparirà come scelta rapida nei campi operatore/responsabile delle schede.
              </p>
            </fieldset>

            <fieldset className="config-group">
              <legend>Fornitore del servizio (consulente HACCP)</legend>
              <input type="text" placeholder="Nome e cognome" value={consultantName} onChange={(e) => setConsultantName(e.target.value)} className="full-input" />
              <input type="email" placeholder="Email" value={consultantEmail} onChange={(e) => setConsultantEmail(e.target.value)} className="full-input" style={{ marginTop: 10 }} />
            </fieldset>

            <fieldset className="config-group">
              <legend>Abbonamento</legend>

              {subStatus && (
                <div style={{ marginBottom: 12 }}>
                  <span className={"pill " + pillClassFor(subStatus.state)}>{subStatus.label}</span>
                </div>
              )}

              {!canManageSubscription && (
                <p className="sub" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <Lock size={13} /> Questa sezione può essere modificata solo dal tuo consulente HACCP.
                </p>
              )}

              <div className="config-grid-2">
                <label className="field-label">
                  Inizio abbonamento
                  <input
                    type="date"
                    value={subscriptionStart}
                    onChange={(e) => handleStartChange(e.target.value)}
                    className="full-input"
                    disabled={!canManageSubscription}
                  />
                </label>
                <label className="field-label">
                  Scadenza abbonamento (calcolata: +1 anno)
                  <input
                    type="date"
                    value={subscriptionEnd}
                    className="full-input computed-field"
                    disabled
                    readOnly
                  />
                </label>
              </div>
              <div className="config-grid-2" style={{ marginTop: 10 }}>
                <label className="field-label">
                  Importo (€)
                  <input
                    type="number" step="0.01" min="0"
                    value={subscriptionAmount}
                    onChange={(e) => setSubscriptionAmount(e.target.value)}
                    className="full-input"
                    disabled={!canManageSubscription}
                  />
                </label>
                <label className="field-label">
                  Stato
                  <select
                    value={subscriptionStatus}
                    onChange={(e) => setSubscriptionStatus(e.target.value)}
                    className="full-input"
                    disabled={!canManageSubscription}
                  >
                    <option value="attivo">Attivo</option>
                    <option value="scaduto">Scaduto</option>
                    <option value="sospeso">Sospeso</option>
                  </select>
                </label>
              </div>
              <textarea
                placeholder="Note (es. modalità di pagamento, riferimento fattura...)"
                value={subscriptionNote}
                onChange={(e) => setSubscriptionNote(e.target.value)}
                className="full-input"
                style={{ marginTop: 10, minHeight: 70 }}
                disabled={!canManageSubscription}
              />

              {canManageSubscription && (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={renewFromToday}
                    disabled={busy}
                    style={{ marginTop: 12 }}
                  >
                    <RefreshCw size={15} /> Rinnova da oggi (+1 anno)
                  </button>
                  <p className="sub" style={{ marginTop: 6 }}>
                    Imposta l'inizio a oggi, calcola la scadenza tra 12 mesi e riporta lo stato su Attivo — salva subito.
                  </p>
                </>
              )}
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
        </>
      )}
    </div>
  );
}
