import React, { useState } from "react";
import { Plus, Trash2, Thermometer } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

export const EQUIPMENT_TYPES = [
  { id: "frigorifero", label: "Frigorifero", min: 0, max: 4 },
  { id: "congelatore", label: "Congelatore", min: -22, max: -18 },
  { id: "abbattitore_positivo", label: "Abbattitore positivo", min: 0, max: 3 },
  { id: "abbattitore_negativo", label: "Abbattitore negativo", min: -22, max: -18 },
];

export default function Attrezzature() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("temperature_units", company?.id);
  const [label, setLabel] = useState("");
  const [type, setType] = useState(EQUIPMENT_TYPES[0].id);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    const t = EQUIPMENT_TYPES.find((o) => o.id === type);
    setBusy(true);
    await add({ label, equipment_type: t.id, min_temp: t.min, max_temp: t.max });
    setLabel("");
    setBusy(false);
  };

  const typeLabel = (item) => {
    const t = EQUIPMENT_TYPES.find((o) => o.id === item.equipment_type);
    return t ? t.label : "Personalizzato";
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Attrezzature</h2>
          <p className="sub">Elenco personalizzato di frigo, freezer e banchi di questa azienda. Il range di temperatura è impostato automaticamente in base al tipo scelto e non è modificabile a mano.</p>
        </div>
      </div>
      <form onSubmit={submit} className="row-form">
        <input type="text" placeholder="Nome (es. Frigo 3)" required value={label} onChange={(e) => setLabel(e.target.value)} className="note-input" />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {EQUIPMENT_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label} ({t.min}°C — {t.max}°C)</option>
          ))}
        </select>
        <button type="submit" className="btn-primary" disabled={busy}><Plus size={16} /> Aggiungi</button>
      </form>
      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessuna attrezzatura configurata. Aggiungine una per iniziare a registrare le temperature.</p></div>
      ) : (
        <ul className="log-list">
          {items.map((item) => (
            <li key={item.id} className="log-row">
              <Thermometer size={15} color="#2F6F4E" />
              <span className="log-main"><strong>{item.label}</strong></span>
              <span className="log-unit">{typeLabel(item)}</span>
              <span className="log-note">{item.min_temp}°C — {item.max_temp}°C</span>
              <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
