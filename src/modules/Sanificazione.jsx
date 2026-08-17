import React, { useState } from "react";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

export const SAN_AREAS = ["Cucina", "Sala", "Bagni", "Magazzino", "Attrezzature", "Frigoriferi"];

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function Sanificazione() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("sanitization_logs", company?.id);
  const [area, setArea] = useState(SAN_AREAS[0]);
  const [operator, setOperator] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!operator.trim()) return;
    setBusy(true);
    await add({ area, operator });
    setOperator("");
    setBusy(false);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Sanificazione</h2>
          <p className="sub">Registra ogni intervento di pulizia e sanificazione per area.</p>
        </div>
      </div>

      <form onSubmit={submit} className="row-form">
        <select value={area} onChange={(e) => setArea(e.target.value)}>
          {SAN_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="text" placeholder="Operatore" required value={operator} onChange={(e) => setOperator(e.target.value)} className="note-input" />
        <button type="submit" className="btn-primary" disabled={busy}><Plus size={16} /> Registra</button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun intervento registrato.</p></div>
      ) : (
        <ul className="log-list">
          {items.map((item) => (
            <li key={item.id} className="log-row">
              <CheckCircle2 size={15} color="#2F6F4E" />
              <span className="log-main"><strong>{item.area}</strong></span>
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
