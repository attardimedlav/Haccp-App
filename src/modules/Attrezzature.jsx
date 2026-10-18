import React, { useState } from "react";
import { Plus, Trash2, Thermometer, Lock } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

// Qui stanno solo gli impianti di CONSERVAZIONE, quelli di cui si legge e si
// registra la temperatura tutti i giorni. L'abbattitore non è uno di questi:
// non conserva niente, lavora a cicli, e la sua temperatura si registra alla
// fine di ogni ciclo nella sua scheda, non una volta al giorno. Si accende con
// l'interruttore in Configurazione, non aggiungendolo fra le attrezzature.
// Le due voci "abbattitore positivo" e "abbattitore negativo" che c'erano qui
// producevano un impianto da leggere ogni sera e un avviso di registrazione
// mancante che non voleva dire niente.
// Ogni apparecchio che conserva o espone a temperatura controllata va qui:
// e' l'elenco su cui si legge la temperatura ogni giorno, ed e' anche
// l'elenco che il manuale dichiara come punto critico dello stoccaggio. Le
// vetrine mancavano, e senza di loro la vetrina dei gelati e quella della
// pasticceria - che sono il punto in cui il prodotto pronto puo' tornare
// pericoloso - non avevano dove essere registrate.
//
// I valori sono una proposta: li cambia il consulente sulla targa
// dell'apparecchio e sulla lavorazione di quell'azienda, perche' un pozzetto
// da gelateria e una vetrina da bar non lavorano alla stessa temperatura.
export const EQUIPMENT_TYPES = [
  { id: "frigorifero", label: "Frigorifero", min: 0, max: 4 },
  { id: "congelatore", label: "Congelatore", min: -22, max: -18 },
  { id: "cella_frigorifera", label: "Cella frigorifera", min: 0, max: 4 },
  { id: "vetrina_refrigerata", label: "Vetrina refrigerata", min: 0, max: 4 },
  { id: "vetrina_gelati", label: "Vetrina gelati o pozzetto", min: -20, max: -14 },
  { id: "vetrina_calda", label: "Vetrina o banco caldo", min: 60, max: 85 },
];

// Restano riconosciute in lettura per le righe già salvate: un impianto
// registrato in passato come abbattitore non deve diventare "tipo
// sconosciuto" nelle schede che lo mostrano.
export const EQUIPMENT_TYPES_STORICI = [
  ...EQUIPMENT_TYPES,
  { id: "abbattitore_positivo", label: "Abbattitore positivo", min: 0, max: 3 },
  { id: "abbattitore_negativo", label: "Abbattitore negativo", min: -22, max: -18 },
];

export default function Attrezzature() {
  const { company, consultantCompanies } = useAuth();
  const isConsultant = (consultantCompanies || []).length > 0;
  const { items, add, remove, loading } = useTable("temperature_units", company?.id);
  const [label, setLabel] = useState("");
  const [type, setType] = useState(EQUIPMENT_TYPES[0].id);
  // Il range proposto dal tipo, che resta modificabile: lo si legge sulla
  // targa dell'apparecchio.
  const [minTemp, setMinTemp] = useState(String(EQUIPMENT_TYPES[0].min));
  const [maxTemp, setMaxTemp] = useState(String(EQUIPMENT_TYPES[0].max));
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  const cambiaTipo = (id) => {
    setType(id);
    const t = EQUIPMENT_TYPES.find((o) => o.id === id);
    if (t) { setMinTemp(String(t.min)); setMaxTemp(String(t.max)); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrore("");
    if (!label.trim()) return;
    const t = EQUIPMENT_TYPES.find((o) => o.id === type);
    const minimo = Number(String(minTemp).replace(",", "."));
    const massimo = Number(String(maxTemp).replace(",", "."));
    if (Number.isNaN(minimo) || Number.isNaN(massimo)) {
      setErrore("Il range va scritto in gradi, anche negativi."); return;
    }
    if (minimo >= massimo) {
      setErrore("Il primo valore è il minimo del range e deve essere più basso del secondo."); return;
    }
    setBusy(true);
    await add({ label, equipment_type: t.id, min_temp: minimo, max_temp: massimo });
    setLabel("");
    setBusy(false);
  };

  const typeLabel = (item) => {
    const t = EQUIPMENT_TYPES_STORICI.find((o) => o.id === item.equipment_type);
    return t ? t.label : "Personalizzato";
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Attrezzature</h2>
          <p className="sub">Frigoriferi, congelatori, celle e vetrine di questa azienda: tutto ciò che conserva o espone a temperatura controllata. Scegliendo il tipo il range si compila da solo{isConsultant ? ", e si corregge sulla targa dell'apparecchio." : "."}</p>
          {!isConsultant && (
            <p className="sub" style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 6 }}>
              <Lock size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Puoi aggiungere un impianto nuovo con i limiti previsti per il suo tipo. I limiti di
                temperatura sono quelli dichiarati nel manuale: per cambiarli, scrivi al tuo
                consulente HACCP.
              </span>
            </p>
          )}
        </div>
      </div>
      <form onSubmit={submit} className="row-form">
        <input type="text" placeholder="Nome (es. Frigo 3)" required value={label} onChange={(e) => setLabel(e.target.value)} className="note-input" />
        <select value={type} onChange={(e) => cambiaTipo(e.target.value)}>
          {EQUIPMENT_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label} ({t.min}°C — {t.max}°C)</option>
          ))}
        </select>
        {/* I limiti li scrive il consulente, perche' sono gli stessi che il
            manuale dichiara come limiti critici: allargarli qui vorrebbe dire
            che l'app smette di segnalare deviazioni che il manuale considera
            tali, e i due documenti direbbero cose diverse. Il titolare puo'
            aggiungere un impianto nuovo — il frigorifero lo compra lui — ma
            con i valori previsti per quel tipo. */}
        <label className="field-label" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          da
          <input type="number" step="0.1" value={minTemp} disabled={!isConsultant}
            onChange={(e) => setMinTemp(e.target.value)}
            className="full-input" style={{ width: 80 }} aria-label="Temperatura minima" />
          a
          <input type="number" step="0.1" value={maxTemp} disabled={!isConsultant}
            onChange={(e) => setMaxTemp(e.target.value)}
            className="full-input" style={{ width: 80 }} aria-label="Temperatura massima" />
          °C
        </label>
        <button type="submit" className="btn-primary" disabled={busy}><Plus size={16} /> Aggiungi</button>
      </form>
      {errore && <span className="file-error">{errore}</span>}
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
              {/* Togliere un impianto fa sparire una riga dal registro delle
                  temperature e una voce dal manuale: non e' un gesto da
                  titolare, e non e' un gesto da fare con un click solo. */}
              {isConsultant && (
                <button className="icon-btn" aria-label="Elimina"
                  onClick={() => {
                    if (window.confirm(`Togliere «${item.label}» dagli impianti?\n\nLe letture già registrate restano, ma l'impianto non comparirà più fra quelli da controllare né nel manuale.`)) remove(item.id);
                  }}>
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
