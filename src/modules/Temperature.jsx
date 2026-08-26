import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, CheckCircle2, Pencil, Check, X, Refrigerator } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { EQUIPMENT_TYPES } from "./Attrezzature";

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
  const [inRange, setInRange] = useState(null); // null = non ancora scelto
  const [note, setNote] = useState("");
  const [operator, setOperator] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editInRange, setEditInRange] = useState(true);

  React.useEffect(() => {
    if (units.length > 0 && !unitLabel) setUnitLabel(units[0].label);
  }, [units, unitLabel]);

  const unitDef = units.find((u) => u.label === unitLabel);
  const unitTypeLabel = unitDef?.equipment_type
    ? (EQUIPMENT_TYPES.find((t) => t.id === unitDef.equipment_type)?.label || "")
    : "";

  const submit = async (e) => {
    e.preventDefault();
    if (!unitLabel || inRange === null || !operator.trim()) return;
    if (inRange === false && !note.trim()) return; // nota obbligatoria se fuori range
    setBusy(true);
    await add({
      unit: unitLabel,
      value: value === "" ? null : parseFloat(value),
      note,
      operator,
      in_range: inRange,
    });
    setValue(""); setNote(""); setInRange(null); setOperator("");
    setBusy(false);
  };

  // Righe storiche create prima dell'introduzione del flag: si ricorre al confronto numerico.
  const isInRange = (item) => {
    if (item.in_range !== null && item.in_range !== undefined) return item.in_range;
    const u = units.find((x) => x.label === item.unit);
    if (!u || item.value === null || item.value === undefined) return true;
    return !(item.value < u.min_temp || item.value > u.max_temp);
  };
  const deviations = items.filter((i) => !isInRange(i)).length;

  const groupedByUnit = units.map((u) => ({
    unit: u,
    readings: items.filter((i) => i.unit === u.label),
  }));

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditValue(item.value === null || item.value === undefined ? "" : String(item.value));
    setEditNote(item.note || "");
    setEditInRange(isInRange(item));
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (id) => {
    if (!editInRange && !editNote.trim()) return;
    await update(id, {
      value: editValue === "" ? null : parseFloat(editValue),
      note: editNote,
      in_range: editInRange,
    });
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
          <p className="sub">Conferma ad ogni controllo se la temperatura rientra nel range consentito.</p>
        </div>
        {deviations > 0 && <div className="pill pill-alert"><AlertTriangle size={14} /> {deviations} fuori range</div>}
      </div>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form">
          <select value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)}>
            {units.map((u) => <option key={u.id} value={u.label}>{u.label} ({u.min_temp}–{u.max_temp}°C)</option>)}
          </select>
          <input type="number" step="0.1" placeholder="°C (facoltativo)" value={value} onChange={(e) => setValue(e.target.value)} className="num" />
        </div>

        {unitDef && (
          <div className="range-hint" style={{ marginBottom: 4 }}>
            Range consentito per {unitDef.label}{unitTypeLabel && ` (${unitTypeLabel})`}: <strong>{unitDef.min_temp}°C — {unitDef.max_temp}°C</strong>
          </div>
        )}

        <div className="chip-grid">
          <button type="button" className={"chip" + (inRange === true ? " chip-on" : "")} onClick={() => setInRange(true)}>
            <CheckCircle2 size={13} /> Nel range
          </button>
          <button type="button" className={"chip" + (inRange === false ? " chip-on" : "")} onClick={() => setInRange(false)}>
            <AlertTriangle size={13} /> Fuori range
          </button>
        </div>

        <input
          type="text"
          placeholder={inRange === false ? "Nota (obbligatoria se fuori range)" : "Nota (opzionale)"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="full-input"
        />

        <div className="row-form" style={{ margin: "0 0 4px" }}>
          <input type="text" placeholder="Operatore" required value={operator} onChange={(e) => setOperator(e.target.value)} className="note-input" />
          {company?.haccp_manager && (
            <button type="button" className="link-btn" onClick={() => setOperator(company.haccp_manager)}>
              Usa responsabile HACCP
            </button>
          )}
        </div>

        <button type="submit" className="btn-primary" disabled={busy || inRange === null} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> Registra
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessuna lettura registrata.</p></div>
      ) : (
        <ul className="log-list temp-screen-list">
          {items.map((item) => {
            const bad = !isInRange(item);
            const isEditing = editingId === item.id;
            if (isEditing) {
              return (
                <li key={item.id} className="log-row editing">
                  <span className="dot" />
                  <button type="button" className={"chip" + (editInRange ? " chip-on" : "")} onClick={() => setEditInRange(true)}>Nel range</button>
                  <button type="button" className={"chip" + (!editInRange ? " chip-on" : "")} onClick={() => setEditInRange(false)}>Fuori range</button>
                  <input type="number" step="0.1" placeholder="°C" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="num edit-input" />
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
                  {bad ? (
                    <strong className="mono" style={{ color: "#B3432E" }}>Fuori range</strong>
                  ) : (
                    <strong className="mono" style={{ color: "#2F6F4E" }}>Nel range</strong>
                  )}
                  <span className="log-unit">{item.unit}</span>
                </span>
                {item.value !== null && item.value !== undefined && (
                  <span className="log-note mono">{Number(item.value).toFixed(1)}°C</span>
                )}
                {item.operator && <span className="log-note">{item.operator}</span>}
                {item.note && <span className="log-note">{item.note}</span>}
                <span className="log-time">{fmtDate(item.created_at)}</span>
                <button className="icon-btn" onClick={() => startEdit(item)} aria-label="Modifica"><Pencil size={14} /></button>
                <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="print-only">
        {groupedByUnit.map(({ unit, readings }) => (
          <div key={unit.id} className="print-fridge-page">
            <div className="print-fridge-header">
              <Refrigerator size={30} />
              <div>
                <h3 style={{ margin: 0 }}>{unit.label}</h3>
                <p style={{ margin: "2px 0 0", fontSize: 12 }}>
                  Range consentito: {unit.min_temp}°C — {unit.max_temp}°C
                </p>
              </div>
            </div>
            {readings.length === 0 ? (
              <p style={{ fontSize: 12.5 }}>Nessuna lettura registrata per questo impianto.</p>
            ) : (
              <table className="print-fridge-table">
                <thead>
                  <tr>
                    <th>Data e ora</th>
                    <th>Esito</th>
                    <th>°C</th>
                    <th>Operatore</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.created_at)}</td>
                      <td>{isInRange(r) ? "Nel range" : "Fuori range"}</td>
                      <td>{r.value !== null && r.value !== undefined ? Number(r.value).toFixed(1) : "—"}</td>
                      <td>{r.operator || "—"}</td>
                      <td>{r.note || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
