import React, { useState } from "react";
import { Plus, Trash2, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

// Macchina del ghiaccio: registro di pulizia e sanificazione.
// Si accende da Configurazione (has_ice_machine), solo dal consulente, che
// imposta anche ogni quanti giorni va fatta la pulizia (ice_machine_cleaning_days)
// secondo il manuale del produttore della macchina di quel cliente.
// Il ghiaccio a contatto con bevande e alimenti e' esso stesso un alimento.

const TIPI = [
  "Pulizia e sanificazione ordinaria",
  "Sostituzione filtro acqua",
  "Decalcificazione",
  "Manutenzione del tecnico",
  "Pulizia straordinaria",
  "Altro",
];
// Solo questi interventi azzerano il conteggio dei giorni.
const TIPI_CHE_CONTANO = ["Pulizia e sanificazione ordinaria", "Pulizia straordinaria"];

const oggi = () => new Date().toISOString().slice(0, 10);

function fmtData(iso) {
  if (!iso) return "";
  const [a, m, g] = iso.slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

function giorniTra(isoDa, isoA) {
  return Math.round((new Date(isoA) - new Date(isoDa)) / 86400000);
}

export default function MacchinaGhiaccio() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("ice_machine_logs", company?.id);
  const { items: sanificanti } = useTable("sanitizers", company?.id);
  const intervallo = company?.ice_machine_cleaning_days || 30;

  const [data, setData] = useState(oggi());
  const [tipo, setTipo] = useState(TIPI[0]);
  const [sanificante, setSanificante] = useState("");
  const [operatore, setOperatore] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const ultimaPulizia = [...items]
    .filter((i) => TIPI_CHE_CONTANO.includes(i.intervention_type))
    .sort((a, b) => (a.intervention_date < b.intervention_date ? 1 : -1))[0];
  const giorni = ultimaPulizia ? giorniTra(ultimaPulizia.intervention_date, oggi()) : null;
  const inRitardo = giorni === null || giorni > intervallo;
  const prossima = ultimaPulizia
    ? (() => { const d = new Date(ultimaPulizia.intervention_date); d.setDate(d.getDate() + intervallo); return d.toISOString().slice(0, 10); })()
    : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!operatore.trim()) return;
    setBusy(true);
    await add({ intervention_date: data, intervention_type: tipo, sanitizer: sanificante || null, operator: operatore, notes: note || null });
    setOperatore(""); setNote(""); setData(oggi());
    setBusy(false);
  };

  const ordinati = [...items].sort((a, b) => (a.intervention_date < b.intervention_date ? 1 : -1));

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Macchina del ghiaccio</h2>
          <p className="sub">Registro di pulizia e sanificazione. Il ghiaccio a contatto con bevande e alimenti è esso stesso un alimento.</p>
        </div>
      </div>

      <div className={"dish-row" + (inRitardo ? " row-warn" : "")} style={{ margin: "16px 0", display: "flex", gap: 10, alignItems: "flex-start" }}>
        {inRitardo ? <AlertTriangle size={18} color="#B3432E" style={{ flexShrink: 0 }} /> : <CheckCircle2 size={18} color="#2F6F4E" style={{ flexShrink: 0 }} />}
        <div style={{ fontSize: 13.5 }}>
          {ultimaPulizia ? (
            <>
              <strong>Ultima pulizia il {fmtData(ultimaPulizia.intervention_date)}</strong> ({giorni === 0 ? "oggi" : `${giorni} giorni fa`}).
              {" "}{inRitardo
                ? <span style={{ color: "#B3432E" }}>Andava ripetuta entro il {fmtData(prossima)}: è in ritardo.</span>
                : <>Prossima entro il {fmtData(prossima)}.</>}
            </>
          ) : (
            <strong style={{ color: "#B3432E" }}>Nessuna pulizia registrata.</strong>
          )}
          <div className="sub" style={{ marginTop: 2 }}>Frequenza impostata: ogni {intervallo} giorni.</div>
        </div>
      </div>

      <p className="login-info" style={{ marginBottom: 16, display: "block" }}>
        <span style={{ display: "flex", gap: 6, fontWeight: 600, marginBottom: 4 }}><Info size={14} style={{ flexShrink: 0, marginTop: 1 }} /> Buone pratiche di igiene</span>
        La paletta è dedicata e si ripone fuori dal contenitore del ghiaccio, mai lasciata dentro. Il ghiaccio si prende solo con la paletta, mai con le mani o con il bicchiere. Nel contenitore non si conserva nient'altro (bottiglie, frutta, alimenti). Coperchio sempre chiuso. La macchina va collegata ad acqua potabile, con i controlli registrati in Acque potabili. Pulizia, sanificazione, filtri e decalcificazione vanno fatti come indica il manuale del produttore.
      </p>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form" style={{ margin: 0 }}>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPI.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {sanificanti.length > 0 && (
            <select value={sanificante} onChange={(e) => setSanificante(e.target.value)}>
              <option value="">Sanificante usato</option>
              {sanificanti.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          )}
        </div>
        <div className="row-form" style={{ margin: 0 }}>
          <input type="text" placeholder="Operatore" required value={operatore} onChange={(e) => setOperatore(e.target.value)} className="note-input" />
          {company?.haccp_manager && (
            <button type="button" className="link-btn" onClick={() => setOperatore(company.haccp_manager)}>Usa responsabile HACCP</button>
          )}
          <input type="text" placeholder="Note (facoltative)" value={note} onChange={(e) => setNote(e.target.value)} className="note-input" />
        </div>
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> Registra intervento
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : ordinati.length === 0 ? (
        <div className="empty"><p>Nessun intervento registrato.</p></div>
      ) : (
        <ul className="log-list">
          {ordinati.map((item) => (
            <li key={item.id} className="log-row">
              <CheckCircle2 size={15} color="#2F6F4E" />
              <span className="log-main"><strong>{item.intervention_type}</strong></span>
              {item.sanitizer && <span className="log-unit">{item.sanitizer}</span>}
              <span className="log-note">{item.operator}{item.notes ? ` — ${item.notes}` : ""}</span>
              <span className="log-time">{fmtData(item.intervention_date)}</span>
              <button className="icon-btn" onClick={() => { if (window.confirm("Eliminare questo intervento?")) remove(item.id); }} aria-label="Elimina"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
