import React, { useState } from "react";
import { Plus, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { operazioniDiArea, daAvvisare, etichettaFrequenza, SOGLIA_AVVISO_GIORNI } from "../utils/pianoPulizie";

export const SAN_AREAS = ["Cucina", "Sala", "Bagni", "Magazzino", "Attrezzature", "Frigoriferi"];

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function Sanificazione() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("sanitization_logs", company?.id);
  const { items: sanitizers, loading: sanitizersLoading } = useTable("sanitizers", company?.id);
  // Il piano di pulizia decide che cosa si può registrare e ogni quanto:
  // l'operatore sceglie fra le operazioni previste per quell'area invece di
  // dichiarare genericamente "ho pulito la cucina". Senza l'operazione una
  // passata ai piani di lavoro farebbe risultare in regola anche la cappa,
  // che si pulisce una volta al mese.
  const { items: piano } = useTable("cleaning_plan", company?.id);

  const [area, setArea] = useState(SAN_AREAS[0]);
  const [operazione, setOperazione] = useState("");
  const [sanitizer, setSanitizer] = useState("");
  const [operator, setOperator] = useState("");
  const [busy, setBusy] = useState(false);

  const responsabile = (company?.haccp_manager || "").trim();
  React.useEffect(() => {
    if (responsabile) setOperator((prec) => (prec ? prec : responsabile));
  }, [responsabile]);

  React.useEffect(() => {
    if (sanitizers.length > 0 && !sanitizer) setSanitizer(sanitizers[0].name);
  }, [sanitizers, sanitizer]);

  // Nel menu compaiono solo le pulizie periodiche. Quella ordinaria di ogni
  // giorno è la voce vuota, già selezionata: registrare la pulizia di fine
  // turno resta un clic, come prima.
  const previste = operazioniDiArea(piano, area)
    .filter((r) => Number(r.frequency_days) >= SOGLIA_AVVISO_GIORNI);

  // Cambiando area si torna alla pulizia ordinaria: è quella che si
  // registra quasi sempre.
  React.useEffect(() => {
    setOperazione("");
  }, [area]);

  const submit = async (e) => {
    e.preventDefault();
    if (!operator.trim()) return;
    setBusy(true);
    await add({
      area,
      operation: operazione || null,
      operator,
      sanitizer: sanitizer || null,
    });
    setOperator(responsabile);
    setBusy(false);
  };

  // In cima quello che è in ritardo: è la ragione per cui si apre la scheda.
  const inRitardo = daAvvisare(piano, items);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Sanificazione</h2>
          <p className="sub">Registra ogni intervento di pulizia e sanificazione previsto dal piano.</p>
        </div>
        {inRitardo.length > 0 && (
          <div className="pill pill-alert"><AlertTriangle size={14} /> {inRitardo.length} in ritardo</div>
        )}
      </div>

      {inRitardo.length > 0 && (
        <div className="nc-edit-block" style={{ marginBottom: 12 }}>
          <p className="field-label" style={{ color: "#B3432E", margin: "0 0 6px" }}>
            <AlertTriangle size={13} /> Da recuperare:
          </p>
          {inRitardo.slice(0, 6).map((s) => (
            <p key={s.riga.id} className="pest-note" style={{ margin: "2px 0" }}>
              • {s.riga.area} — {s.riga.operation} ({s.label.toLowerCase()})
            </p>
          ))}
          {inRitardo.length > 6 && (
            <p className="range-hint">e altre {inRitardo.length - 6}: le trovi tutte nel piano, in Configurazione.</p>
          )}
        </div>
      )}

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form" style={{ marginTop: 0 }}>
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            {SAN_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {previste.length > 0 ? (
            <select value={operazione} onChange={(e) => setOperazione(e.target.value)} className="note-input">
              <option value="">Pulizia ordinaria dell'area</option>
              {previste.map((r) => (
                <option key={r.id} value={r.operation}>
                  {r.operation} — {etichettaFrequenza(r.frequency_days).toLowerCase()}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text" className="note-input" placeholder="Che cosa è stato pulito"
              value={operazione} onChange={(e) => setOperazione(e.target.value)}
            />
          )}
          {!sanitizersLoading && sanitizers.length > 0 && (
            <select value={sanitizer} onChange={(e) => setSanitizer(e.target.value)}>
              {sanitizers.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          )}
          <input
            type="text" placeholder="Operatore" required value={operator}
            onChange={(e) => setOperator(e.target.value)} className="note-input"
          />
          <button type="submit" className="btn-primary" disabled={busy}><Plus size={16} /> Registra</button>
        </div>
      </form>

      {previste.length === 0 && (
        <p className="range-hint">
          Per quest'area il piano di pulizia non prevede ancora nulla: lo imposti in
          Configurazione → Piano pulizie. Finché è vuoto puoi registrare scrivendo a mano
          che cosa hai pulito, ma non nascono avvisi di scadenza.
        </p>
      )}
      {!sanitizersLoading && sanitizers.length === 0 && (
        <p className="range-hint">
          Nessun sanificante configurato: vai su Configurazione → Sanificanti per aggiungerne uno
          (opzionale, puoi comunque registrare senza specificarlo).
        </p>
      )}

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun intervento registrato.</p></div>
      ) : (
        <ul className="log-list">
          {items.map((item) => (
            <li key={item.id} className="log-row">
              <CheckCircle2 size={15} color="#2F6F4E" />
              <span className="log-main">
                <strong>{item.area}</strong>
                {item.operation ? " — " + item.operation : ""}
              </span>
              {item.sanitizer && <span className="log-unit">{item.sanitizer}</span>}
              <span className="log-note">{item.operator}</span>
              <span className="log-time">{fmtDate(item.created_at)}</span>
              <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
