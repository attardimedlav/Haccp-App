import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, Pencil, Check, X } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function Temperature() {
  const { company } = useAuth();
  const { items, add, remove, update, loading } = useTable("temperature_logs", company?.id);
  const { items: units, loading: unitsLoading } = useTable("temperature_units", company?.id);
  const [unitLabel, setUnitLabel] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editNote, setEditNote] = useState("");

  React.useEffect(() => {
    if (units.length > 0 && !unitLabel) setUnitLabel(units[0].label);
  }, [units, unitLabel]);

  const unitDef = units.find((u) => u.label === unitLabel);

  const submit = async (e) => {
    e.preventDefault();
    if (value === "" || !unitLabel) return;
    setBusy(true);
    await add({ unit: unitLabel, value: parseFloat(value), note });
    setValue("");
    setNote("");
    setBusy(false);
  };

  const outOfRange = (item) => {
    const u = units.find((x) => x.label === item.unit);
    if (!u) return false;
    return item.value < u.min_temp || item.value > u.max_temp;
  };
  const deviations = items.filter(outOfRange).length;

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditValue(String(item.value));
    setEditNote(item.note || "");
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (id) => {
    if (editValue === "") return;
    await update(id, { value: parseFloat(editValue), note: editNote });
    setEditingId(null);
  };

  if (!unitsLoading && units.length === 0) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Temperature frigoriferi</h2>
            <p className="sub">Non hai ancora configurato nessuna attrezzatura.</p>
          </div>
        </div>
        <div className="empty">
          <p>Vai su Configurazione → Attrezzature e aggiungi i tuoi frigo/freezer prima di registrare una temperatura.</p>
        </div>
      </div>
    );
  }

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
        <select value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)}>
          {units.map((u) => <option key={u.id} value={u.label}>{u.label} ({u.min_temp}–{u.max_temp}°C)</option>)}
        </select>
        <input type="number" step="0.1" placeholder="°C" required value={value} onChange={(e) => setValue(e.target.value)} className="num" />
        <input type="text" placeholder="Nota (opzionale)" value={note} onChange={(e) => setNote(e.target.value)} className="note-input" />
        <button type="submit" className="btn-primary" disabled={busy}><Plus size={16} /> Registra</button>
      </form>

      {unitDef && (
        <div className="range-hint">Range consentito per {unitDef.label}: <strong>{unitDef.min_temp}°C — {unitDef.max_temp}°C</strong></div>
      )}

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessuna lettura registrata.</p></div>
      ) : (
        <ul className="log-list">
          {items.map((item) => {
            const bad = outOfRange(item);
            const isEditing = editingId === item.id;
            if (isEditing) {
              return (
                <li key={item.id} className="log-row editing">
                  <span className="dot" />
                  <input type="number" step="0.1" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="num edit-input" autoFocus />
                  <span className="log-unit">{item.unit}</span>
                  <input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Nota" className="note-input edit-input" />
                  <button className="icon-btn icon-btn-ok" onClick={() => saveEdit(item.id)} aria-label="Salva"><Check size={14} /></button>
                  <button className="icon-btn" onClick={cancelEdit} aria-label="Annulla"><X size={14} /></button>
                </li>
              );
            }
            return (
              <li key={item.id} className={"log-row" + (bad ? " bad" : "")}>
                <span className="dot" />
                <span className="log-main">
                  <strong className="mono">{Number(item.value).toFixed(1)}°C</strong>
                  <span className="log-unit">{item.unit}</span>
                </span>
                {item.note && <span className="log-note">{item.note}</span>}
                <span className="log-time">{fmtDate(item.created_at)}</span>
                <button className="icon-btn" onClick={() => startEdit(item)} aria-label="Modifica"><Pencil size={14} /></button>
                <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
