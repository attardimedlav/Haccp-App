import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, Paperclip, FileText, Download, Flame } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

// I motivi sono quelli riconosciuti dal manuale: la sostituzione programmata
// e i cinque segni sensoriali di degradazione, piu' la misura dei composti
// polari quando l'azienda ha il kit rapido.
const MOTIVI = [
  "Sostituzione programmata",
  "Colore scuro",
  "Odore acre",
  "Fumo alla temperatura di esercizio",
  "Schiuma persistente",
  "Aumento della viscosità",
  "Composti polari prossimi al limite",
  "Altro",
];

// Limite della Circolare del Ministero della Sanità n. 1 dell'11/01/1991:
// oltre il 25% di composti polari totali l'olio non è più utilizzabile.
const LIMITE_POLARI = 25;

function AttachmentLink({ path }) {
  const [url, setUrl] = useState(null);
  if (!path) return null;
  if (!url) { getAttachmentUrl(path).then(setUrl); return <span className="none-label">Caricamento allegato…</span>; }
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} /><span className="attachment-name">{path.split("/").pop()}</span><Download size={14} />
    </a>
  );
}

export default function OlioFrittura() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("frying_oil_logs", company?.id);
  const [changeDate, setChangeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fryer, setFryer] = useState("");
  const [reason, setReason] = useState(MOTIVI[0]);
  const [liters, setLiters] = useState("");
  const [polar, setPolar] = useState("");
  const [oilType, setOilType] = useState("");
  const [operator, setOperator] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    if (f && f.size > MAX_FILE_BYTES) { setError("File troppo grande (limite 8 MB)."); setFile(null); e.target.value = ""; return; }
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company.id, file);
      await add({
        change_date: changeDate,
        fryer,
        reason,
        liters: liters === "" ? null : Number(liters),
        polar_compounds: polar === "" ? null : Number(polar),
        oil_type: oilType,
        operator,
        notes,
        attachment_path,
      });
      setLiters(""); setPolar(""); setNotes(""); setFile(null);
      const input = document.getElementById("olio-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il salvataggio: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const ultimo = items.length > 0
    ? [...items].sort((a, b) => (a.change_date < b.change_date ? 1 : -1))[0]
    : null;
  const giorniDaUltimo = ultimo
    ? Math.floor((Date.now() - new Date(ultimo.change_date).getTime()) / 86400000)
    : null;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Olio di frittura</h2>
          <p className="sub">
            Si registra ogni sostituzione dell'olio. Il controllo sensoriale quotidiano è buona prassi e non si registra:
            questo registro è la documentazione che l'azienda esibisce in caso di controllo strumentale sull'olio in uso.
          </p>
        </div>
        {giorniDaUltimo !== null && (
          <div className="pill">
            <Flame size={14} /> ultimo cambio {giorniDaUltimo === 0 ? "oggi" : `${giorniDaUltimo} giorni fa`}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form">
          <label className="field-label">Data della sostituzione
            <input type="date" value={changeDate} onChange={(e) => setChangeDate(e.target.value)} />
          </label>
          <input type="text" placeholder="Friggitrice (se più di una)" value={fryer} onChange={(e) => setFryer(e.target.value)} className="note-input" />
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {MOTIVI.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="row-form">
          <input type="number" step="0.5" min="0" placeholder="Litri sostituiti" value={liters} onChange={(e) => setLiters(e.target.value)} className="note-input" />
          <input type="number" step="0.1" min="0" max="100" placeholder="Composti polari % (se misurati)" value={polar} onChange={(e) => setPolar(e.target.value)} className="note-input" />
          <input type="text" placeholder="Tipo di olio (opzionale)" value={oilType} onChange={(e) => setOilType(e.target.value)} className="note-input" />
        </div>
        {polar !== "" && Number(polar) >= LIMITE_POLARI && (
          <p className="file-error">
            <AlertTriangle size={13} /> {polar}% di composti polari: oltre il limite del {LIMITE_POLARI}% l'olio non è utilizzabile
            (Circolare Min. Sanità n. 1 dell'11/01/1991). Il fritto prodotto con questo olio non va somministrato.
          </p>
        )}
        <div className="row-form">
          <input type="text" placeholder="Operatore" value={operator} onChange={(e) => setOperator(e.target.value)} className="note-input" />
          <input type="text" placeholder="Nota (opzionale)" value={notes} onChange={(e) => setNotes(e.target.value)} className="note-input" />
        </div>
        <label className="file-drop" htmlFor="olio-file-input">
          <Paperclip size={15} /><span>{file ? file.name : "Allega il documento di conferimento dell'olio esausto (opzionale)"}</span>
          <input id="olio-file-input" type="file" accept=".pdf,image/*" onChange={onFileChange} hidden />
        </label>
        {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> {busy ? "Salvataggio…" : "Registra sostituzione"}
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessuna sostituzione registrata.</p></div>
      ) : (
        <ul className="dish-list">
          {items.map((item) => {
            const fuoriLimite = item.polar_compounds !== null && item.polar_compounds >= LIMITE_POLARI;
            return (
              <li key={item.id} className={"dish-row" + (fuoriLimite ? " row-warn" : "")}>
                <div className="dish-top">
                  <div>
                    <Flame size={13} style={{ marginRight: 6, verticalAlign: -2 }} color="#2F6F4E" />
                    <strong>{new Date(item.change_date).toLocaleDateString("it-IT")}</strong>
                    <span className="lot-tag">{item.reason}</span>
                  </div>
                  <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                </div>
                <div className="traccia-meta">
                  {item.fryer && <span className="doc-type-tag">{item.fryer}</span>}
                  {item.liters !== null && item.liters !== undefined && <span className="doc-type-tag">{item.liters} litri</span>}
                  {item.polar_compounds !== null && item.polar_compounds !== undefined && (
                    <span className="doc-type-tag" style={fuoriLimite ? { background: "#FBEEEC", color: "#B3432E" } : undefined}>
                      composti polari {item.polar_compounds}%
                    </span>
                  )}
                  {item.oil_type && <span className="doc-type-tag">{item.oil_type}</span>}
                  {item.operator && <span className="doc-type-tag">{item.operator}</span>}
                </div>
                {item.notes && <p className="pest-note">{item.notes}</p>}
                <AttachmentLink path={item.attachment_path} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
