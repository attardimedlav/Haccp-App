import React, { useState } from "react";
import { Plus, Trash2, Thermometer } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

export default function Attrezzature() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("temperature_units", company?.id);
  const [label, setLabel] = useState("");
  const [minTemp, setMinTemp] = useState("");
  const [maxTemp, setMaxTemp] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim() || minTemp === "" || maxTemp === "") return;
    setBusy(true);
    await add({ label, min_temp: parseFloat(minTemp), max_temp: parseFloat(maxTemp) });
    setLabel(""); setMinTemp(""); setMaxTemp("");
    setBusy(false);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Attrezzature</h2>
          <p className="sub">Elenco personalizzato di frigo, freezer e banchi di questa azienda, con il relativo range di temperatura consentito.</p>
        </div>
      </div>

      <form onSubmit={submit} className="row-form">
        <input type="text" placeholder="Nome (es. Frigo 3)" required value={label} onChange={(e) => setLabel(e.target.value)} className="note-input" />
        <input type="number" step="0.1" placeholder="Min °C" required value={minTemp} onChange={(e) => setMinTemp(e.target.value)} className="num" />
        <input type="number" step="0.1" placeholder="Max °C" required value={maxTemp} onChange={(e) => setMaxTemp(e.target.value)} className="num" />
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
              <span className="log-note">{item.min_temp}°C — {item.max_temp}°C</span>
              <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
