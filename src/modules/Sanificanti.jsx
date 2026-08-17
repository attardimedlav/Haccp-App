import React, { useState } from "react";
import { Plus, Trash2, SprayCan } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

export default function Sanificanti() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("sanitizers", company?.id);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await add({ name, note });
    setName(""); setNote("");
    setBusy(false);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Sanificanti</h2>
          <p className="sub">Elenco dei prodotti usati da questa azienda per la sanificazione. Configuralo una volta, poi lo trovi nel menu a tendina della sezione Sanificazione.</p>
        </div>
      </div>

      <form onSubmit={submit} className="row-form">
        <input type="text" placeholder="Nome prodotto" required value={name} onChange={(e) => setName(e.target.value)} className="note-input" />
        <input type="text" placeholder="Nota (opzionale, es. diluizione)" value={note} onChange={(e) => setNote(e.target.value)} className="note-input" />
        <button type="submit" className="btn-primary" disabled={busy}><Plus size={16} /> Aggiungi</button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun sanificante configurato. Aggiungine uno per iniziare a usarlo nella sezione Sanificazione.</p></div>
      ) : (
        <ul className="log-list">
          {items.map((item) => (
            <li key={item.id} className="log-row">
              <SprayCan size={15} color="#2F6F4E" />
              <span className="log-main"><strong>{item.name}</strong></span>
              {item.note && <span className="log-note">{item.note}</span>}
              <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
