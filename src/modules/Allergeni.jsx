import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

const ALLERGENS = ["Glutine", "Latte", "Uova", "Soia", "Frutta a guscio", "Pesce", "Crostacei", "Sedano", "Senape", "Solfiti", "Arachidi", "Sesamo", "Lupini", "Molluschi"];

export default function Allergeni() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("allergen_dishes", company?.id);
  const [dish, setDish] = useState("");
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  const toggle = (a) => setSelected((s) => s.includes(a) ? s.filter((x) => x !== a) : [...s, a]);

  const submit = async (e) => {
    e.preventDefault();
    if (!dish.trim()) return;
    setBusy(true);
    await add({ dish, allergens: selected });
    setDish(""); setSelected([]);
    setBusy(false);
  };

  return (
    <div className="panel">
      <div className="panel-head allergeni-panel-head">
        <div>
          <h2>Registro allergeni</h2>
          <p className="sub">Associa gli allergeni presenti a ogni piatto del menu.</p>
        </div>
      </div>

      <form onSubmit={submit} className="traccia-form">
        <input type="text" placeholder="Nome piatto" required value={dish} onChange={(e) => setDish(e.target.value)} className="note-input" style={{ maxWidth: 320 }} />
        <div className="chip-grid">
          {ALLERGENS.map((a) => (
            <button type="button" key={a} className={"chip" + (selected.includes(a) ? " chip-on" : "")} onClick={() => toggle(a)}>{a}</button>
          ))}
        </div>
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> Aggiungi al registro
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun piatto registrato.</p></div>
      ) : (
        <ul className="dish-list allergeni-screen-list">
          {items.map((item) => (
            <li key={item.id} className="dish-row">
              <div className="dish-top">
                <strong>{item.dish}</strong>
                <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
              </div>
              {item.allergens && item.allergens.length > 0 ? (
                <div className="chip-grid">
                  {item.allergens.map((a) => <span key={a} className="chip chip-static">{a}</span>)}
                </div>
              ) : <span className="none-label">Nessun allergene dichiarato</span>}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="print-only">
          <div className="print-allergen-header">
            <h1>I nostri piatti e i loro allergeni</h1>
            {company?.name && <p className="print-allergen-company">{company.name}</p>}
            <p className="print-allergen-legal">
              Ai sensi del Regolamento UE n. 1169/2011, indichiamo la presenza dei seguenti allergeni nei piatti che prepariamo.
            </p>
          </div>
          <div className="print-allergen-grid">
            {items.map((item) => (
              <div key={item.id} className="print-allergen-card">
                <h3>{item.dish}</h3>
                {item.allergens && item.allergens.length > 0 ? (
                  <div className="print-allergen-badges">
                    {item.allergens.map((a) => (
                      <span key={a} className="print-allergen-badge">{a}</span>
                    ))}
                  </div>
                ) : (
                  <span className="print-allergen-none">Nessun allergene dichiarato</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
