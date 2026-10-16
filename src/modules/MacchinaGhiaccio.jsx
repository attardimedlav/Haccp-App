import React, { useState } from "react";
import { Plus, Trash2, Info } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

// Macchina del ghiaccio: registro di pulizia e sanificazione.
// Si accende da Configurazione (has_ice_machine), solo dal consulente, che
// imposta anche ogni quanti giorni va fatta la pulizia (ice_machine_cleaning_days)
// secondo il manuale del produttore della macchina di quel cliente.
// Il ghiaccio a contatto con bevande e alimenti e' esso stesso un alimento.

// Che cosa resta qui dentro, dal 16/10/2026.
//
// La pulizia ordinaria e l'ispezione del contenitore sono passate nel piano
// di pulizia, cioe' nella scheda Sanificazione: sono operazioni ricorrenti
// con una frequenza, e una frequenza genera un avviso in Panoramica solo se
// e' una riga del piano. Averle anche qui significava due registri per la
// stessa cosa, e chi spuntava l'una lasciava l'altra scoperta.
//
// Qui restano gli interventi che una frequenza non ce l'hanno: quelli della
// ditta esterna e la pulizia straordinaria, che si fa quando succede
// qualcosa - un guasto, un'anomalia nel ghiaccio, un fermo prolungato.
const TIPI = [
  "Intervento di ditta esterna",
  "Pulizia straordinaria",
  "Sostituzione filtro acqua",
  "Decalcificazione",
  "Altro",
];

const oggi = () => new Date().toISOString().slice(0, 10);

function fmtData(iso) {
  if (!iso) return "";
  const [a, m, g] = iso.slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

export default function MacchinaGhiaccio() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("ice_machine_logs", company?.id);
  const { items: sanificanti } = useTable("sanitizers", company?.id);

  const [data, setData] = useState(oggi());
  const [tipo, setTipo] = useState(TIPI[0]);
  const [sanificante, setSanificante] = useState("");
  const [operatore, setOperatore] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

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
          <p className="sub">Interventi straordinari e della ditta esterna. Il ghiaccio a contatto con bevande e alimenti è esso stesso un alimento.</p>
        </div>
      </div>

      <p className="login-info" style={{ margin: "16px 0" }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        L'ispezione del contenitore e la pulizia ordinaria si registrano in <strong>Sanificazione</strong>,
        insieme a tutte le altre pulizie: lì hanno la loro frequenza e i loro avvisi. Qui si annota
        quello che non ha una cadenza — l'intervento della ditta esterna e la pulizia straordinaria.
      </p>

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
