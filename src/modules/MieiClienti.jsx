import React, { useState } from "react";
import { Building2, ArrowRight, User, FileWarning, Plus, AlertTriangle, X } from "lucide-react";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import { getSubscriptionStatus, pillClassFor } from "../subscriptionStatus";

function legalMissingLabel(c) {
  if (!c) return null;
  const missingTos = !c.tos_accepted_at;
  const missingDpa = !c.dpa_signed_at;
  if (!missingTos && !missingDpa) return null;
  if (missingTos && missingDpa) return "Termini e Accordo mancanti";
  if (missingTos) return "Termini mancanti";
  return "Accordo mancante";
}

const CAMPI_VUOTI = {
  name: "", owner_email: "", piva: "", pec: "",
  sede_legale: "", sede_operativa: "", codice_ateco: "",
  tipologia_attivita: "", forma_giuridica: "", numero_rea: "",
  active_haccp: true, active_work_safety: true,
  active_equipment_checks: true, active_medical_surveillance: true,
};

export default function MieiClienti({ goTo }) {
  const { company, homeCompanyId, homeCompanyName, consultantCompanies, switchCompany, reloadClienti } = useAuth();
  const enter = async (id) => {
    const ok = await switchCompany(id);
    if (ok) goTo("dashboard");
  };

  // --- nuovo cliente ---------------------------------------------------------
  // La creazione passa dalla funzione crea_azienda_cliente sul database, non da
  // una insert: le policy non permettono all'app di scrivere in "companies" per
  // una riga che non esiste ancora, ne' in "consultant_companies". La funzione
  // fa le due cose insieme, cosi' un'azienda non puo' nascere scollegata dal
  // consulente — errore gia' commesso creandole a mano.
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [campi, setCampi] = useState(CAMPI_VUOTI);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [creata, setCreata] = useState(null);

  const set = (k, v) => setCampi((c) => ({ ...c, [k]: v }));

  const apri = () => { setCampi(CAMPI_VUOTI); setErrore(""); setCreata(null); setNuovoAperto(true); };

  const crea = async () => {
    if (!campi.name.trim()) { setErrore("La ragione sociale è obbligatoria."); return; }
    setBusy(true); setErrore("");
    const { data, error } = await supabase.rpc("crea_azienda_cliente", {
      p_name: campi.name,
      p_owner_email: campi.owner_email,
      p_piva: campi.piva,
      p_pec: campi.pec,
      p_sede_legale: campi.sede_legale,
      p_sede_operativa: campi.sede_operativa,
      p_codice_ateco: campi.codice_ateco,
      p_tipologia_attivita: campi.tipologia_attivita,
      p_forma_giuridica: campi.forma_giuridica,
      p_numero_rea: campi.numero_rea,
      p_active_haccp: campi.active_haccp,
      p_active_work_safety: campi.active_work_safety,
      p_active_equipment_checks: campi.active_equipment_checks,
      p_active_medical_surveillance: campi.active_medical_surveillance,
    });
    setBusy(false);
    if (error) { setErrore(error.message); return; }
    setCreata({ id: data, nome: campi.name.trim() });
    setNuovoAperto(false);
    if (reloadClienti) await reloadClienti();
  };

  const homeSub = company?.id === homeCompanyId ? getSubscriptionStatus(company) : null;
  const homeLegalMissing = company?.id === homeCompanyId ? legalMissingLabel(company) : null;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>I miei clienti</h2>
          <p className="sub">Passa da un'azienda all'altra senza rifare il login. Stai visualizzando: <strong>{company?.name}</strong>.</p>
        </div>
        {!nuovoAperto && (
          <button className="btn-primary" onClick={apri}><Plus size={15} /> Aggiungi cliente</button>
        )}
      </div>

      {creata && (
        <div className="cliente-creato">
          <span><strong>{creata.nome}</strong> è stata creata ed è collegata a te.</span>
          <button className="btn-primary" onClick={() => enter(creata.id)}>Entra <ArrowRight size={14} /></button>
        </div>
      )}

      {nuovoAperto && (
        <div className="corso-panel" style={{ marginBottom: 18 }}>
          <div className="panel-head">
            <div>
              <h3 style={{ margin: "0 0 6px" }}>Nuovo cliente</h3>
              <p className="sub" style={{ margin: 0 }}>
                I dati si leggono dalla visura camerale. Solo la ragione sociale è obbligatoria:
                il resto si può completare dopo, in Configurazione.
              </p>
            </div>
            <button type="button" className="icon-btn" onClick={() => setNuovoAperto(false)} aria-label="Chiudi"><X size={16} /></button>
          </div>

          <input type="text" className="full-input" placeholder="Ragione sociale"
            value={campi.name} onChange={(e) => set("name", e.target.value)} style={{ marginTop: 10 }} />
          <div className="row-form">
            <input type="text" className="note-input" placeholder="Partita IVA / codice fiscale"
              value={campi.piva} onChange={(e) => set("piva", e.target.value)} />
            <input type="text" className="note-input" placeholder="Numero REA"
              value={campi.numero_rea} onChange={(e) => set("numero_rea", e.target.value)} />
            <input type="text" className="note-input" placeholder="Forma giuridica"
              value={campi.forma_giuridica} onChange={(e) => set("forma_giuridica", e.target.value)} />
          </div>
          <div className="row-form" style={{ marginTop: 0 }}>
            <input type="email" className="note-input" placeholder="Email del titolare (per gli avvisi di scadenza)"
              value={campi.owner_email} onChange={(e) => set("owner_email", e.target.value)} />
            <input type="text" className="note-input" placeholder="PEC"
              value={campi.pec} onChange={(e) => set("pec", e.target.value)} />
          </div>
          <input type="text" className="full-input" placeholder="Sede legale"
            value={campi.sede_legale} onChange={(e) => set("sede_legale", e.target.value)} style={{ marginBottom: 8 }} />
          <input type="text" className="full-input" placeholder="Sede operativa (lascia vuoto se coincide con la legale)"
            value={campi.sede_operativa} onChange={(e) => set("sede_operativa", e.target.value)} />
          <div className="row-form">
            <input type="text" className="note-input" placeholder="Codice ATECO"
              value={campi.codice_ateco} onChange={(e) => set("codice_ateco", e.target.value)} />
            <input type="text" className="note-input" placeholder="Attività svolta"
              value={campi.tipologia_attivita} onChange={(e) => set("tipologia_attivita", e.target.value)} />
          </div>

          <p className="corso-sezione">Moduli attivi</p>
          <div className="moduli-scelta">
            {[
              ["active_haccp", "HACCP — autocontrollo alimentare"],
              ["active_work_safety", "Sicurezza sul lavoro"],
              ["active_equipment_checks", "Attrezzature"],
              ["active_medical_surveillance", "Sorveglianza sanitaria"],
            ].map(([k, etichetta]) => (
              <label key={k} className="corso-check">
                <input type="checkbox" checked={campi[k]} onChange={(e) => set(k, e.target.checked)} />
                <span>{etichetta}</span>
              </label>
            ))}
          </div>
          <p className="sub" style={{ margin: "8px 0 0" }}>
            Si possono cambiare in qualsiasi momento da Configurazione. Spegnere un modulo nasconde
            le sue schede, non cancella nulla.
          </p>

          {errore && <p className="corso-avviso"><AlertTriangle size={14} /> {errore}</p>}

          <div className="row-form" style={{ marginTop: 14 }}>
            <button type="button" className="btn-primary" onClick={crea} disabled={busy}>
              <Plus size={15} /> {busy ? "Creazione…" : "Crea il cliente"}
            </button>
            <button type="button" className="link-btn" onClick={() => setNuovoAperto(false)}>Annulla</button>
          </div>
        </div>
      )}
      <ul className="dish-list">
        {homeCompanyId && (
          <li className={"dish-row client-row" + (company?.id === homeCompanyId ? " client-row-active" : "")}>
            <div className="client-row-info">
              <User size={16} color="#2F6F4E" />
              <div>
                <strong>La tua azienda</strong>
                <span className="log-note" style={{ display: "block" }}>{homeCompanyName}</span>
              </div>
              {homeSub && <span className={"pill " + pillClassFor(homeSub.state)}>{homeSub.label}</span>}
              {homeLegalMissing && (
                <span className="pill pill-warn"><FileWarning size={12} /> {homeLegalMissing}</span>
              )}
            </div>
            {company?.id !== homeCompanyId && (
              <button className="btn-primary" onClick={() => enter(homeCompanyId)}>
                Entra <ArrowRight size={14} />
              </button>
            )}
          </li>
        )}
        {consultantCompanies.map((c) => {
          const sub = getSubscriptionStatus(c);
          const legalMissing = legalMissingLabel(c);
          return (
            <li key={c.id} className={"dish-row client-row" + (company?.id === c.id ? " client-row-active" : "")}>
              <div className="client-row-info">
                <Building2 size={16} color="#2F6F4E" />
                <strong>{c.name}</strong>
                {sub && <span className={"pill " + pillClassFor(sub.state)}>{sub.label}</span>}
                {legalMissing && (
                  <span className="pill pill-warn"><FileWarning size={12} /> {legalMissing}</span>
                )}
              </div>
              {company?.id !== c.id && (
                <button className="btn-primary" onClick={() => enter(c.id)}>
                  Entra <ArrowRight size={14} />
                </button>
              )}
            </li>
          );
        })}
        {consultantCompanies.length === 0 && (
          <div className="empty"><p>Non hai ancora clienti collegati al tuo account consulente.</p></div>
        )}
      </ul>
    </div>
  );
}
