import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

const UNITS = [
  { id: "frigo1", label: "Frigo 1", min: 0, max: 4 },
  { id: "frigo2", label: "Frigo 2", min: 0, max: 4 },
  { id: "freezer", label: "Freezer", min: -22, max: -18 },
  { id: "banco", label: "Banco vetrina", min: 0, max: 4 },
];

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function Temperature() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("temperature_logs", company?.id);
  const [unit, setUnit] = useState(UNITS[0].id);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const unitDef = UNITS.find((u) => u.id === unit);

  const submit = async (e) => {
    e.preventDefault();
    if (value === "") return;
    setBusy(true);
    await add({ unit, value: parseFloat(value), note });
    setValue("");
    setNote("");
    setBusy(false);
  };

  const outOfRange = (item) => {
    const u = UNITS.find((x) => x.id === item.unit);
    if (!u) return false;
    return item.value < u.min || item.value > u.max;
  };
  const deviations = items.filter(outOfRange).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Temperature frigoriferi</h2>
          <p className="sub">Registra la lettura a ogni apertura/chiusura.</p>
        </div>
        {deviations > 0 && <div className="pill pill-alert"><AlertTriangle size={14} /> {deviations} fuori range</div>}
      </div>

      <form onSubmit={submit} className="row-form">
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label} ({u.min}–{u.max}°C)</option>)}
        </select>
        <input type="number" step="0.1" placeholder="°C" required value={value} onChange={(e) => setValue(e.target.value)} className="num" />
        <input type="text" placeholder="Nota (opzionale)" value={note} onChange={(e) => setNote(e.target.value)} className="note-input" />
        <button type="submit" className="btn-primary" disabled={busy}><Plus size={16} /> Registra</button>
      </form>

      <div className="range-hint">Range consentito per {unitDef.label}: <strong>{unitDef.min}°C — {unitDef.max}°C</strong></div>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessuna lettura registrata.</p></div>
      ) : (
        <ul className="log-list">
          {items.map((item) => {
            const bad = outOfRange(item);
            const u = UNITS.find((x) => x.id === item.unit);
            return (
              <li key={item.id} className={"log-row" + (bad ? " bad" : "")}>
                <span className="dot" />
                <span className="log-main">
                  <strong className="mono">{Number(item.value).toFixed(1)}°C</strong>
                  <span className="log-unit">{u ? u.label : item.unit}</span>
                </span>
                {item.note && <span className="log-note">{item.note}</span>}
                <span className="log-time">{fmtDate(item.created_at)}</span>
                <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
