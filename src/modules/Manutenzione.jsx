import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, Paperclip, FileText, Download, Wrench, CalendarClock } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

// Gli interventi ricorrenti dell'autocontrollo: taratura dei termometri,
// filtri dell'acqua e delle cappe, guarnizioni dei frigoriferi, affilatura
// della lama dell'affettatrice. La manutenzione di legge delle attrezzature
// di lavoro sta invece sotto Sicurezza sul lavoro.
const TIPI = [
  "Manutenzione ordinaria",
  "Manutenzione straordinaria",
  "Taratura o verifica del termometro",
  "Sostituzione filtro",
  "Sanificazione impianto",
  "Controllo guarnizioni",
  "Affilatura lama affettatrice",
  "Riparazione dopo guasto",
  "Altro",
];

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

export default function Manutenzione() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("maintenance_logs", company?.id);
  const { items: unita } = useTable("temperature_units", company?.id);
  const [equipment, setEquipment] = useState("");
  const [type, setType] = useState(TIPI[0]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [performedBy, setPerformedBy] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextDue, setNextDue] = useState("");
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
    if (!equipment.trim()) return;
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company.id, file);
      await add({
        equipment,
        intervention_type: type,
        intervention_date: date,
        performed_by: performedBy,
        outcome,
        next_due: nextDue || null,
        notes,
        attachment_path,
      });
      setEquipment(""); setPerformedBy(""); setOutcome(""); setNextDue(""); setNotes(""); setFile(null);
      const input = document.getElementById("manut-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il salvataggio: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const oggi = new Date().toISOString().slice(0, 10);
  const scadute = items.filter((i) => i.next_due && i.next_due < oggi).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Manutenzione impianti e attrezzature</h2>
          <p className="sub">
            Manutenzione ordinaria a cura del personale interno, straordinaria a cura di ditte qualificate.
            Comprende la taratura dei termometri, i filtri, le guarnizioni e l'affilatura della lama.
          </p>
        </div>
        {scadute > 0 && (
          <div className="pill pill-alert"><AlertTriangle size={14} /> {scadute} {scadute === 1 ? "scadenza superata" : "scadenze superate"}</div>
        )}
      </div>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form">
          <input
            type="text"
            list="manut-attrezzature"
            placeholder="Attrezzatura o impianto"
            required
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            className="note-input"
          />
          <datalist id="manut-attrezzature">
            {unita.map((u) => <option key={u.id} value={u.label} />)}
          </datalist>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TIPI.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="field-label">Data intervento
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="row-form">
          <input type="text" placeholder="Eseguito da (interno o ditta)" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} className="note-input" />
          <input type="text" placeholder="Esito dell'intervento" value={outcome} onChange={(e) => setOutcome(e.target.value)} className="note-input" />
          <label className="field-label">Prossima scadenza
            <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          </label>
        </div>
        <input type="text" placeholder="Nota (opzionale)" value={notes} onChange={(e) => setNotes(e.target.value)} className="full-input" />
        <label className="file-drop" htmlFor="manut-file-input">
          <Paperclip size={15} /><span>{file ? file.name : "Allega rapporto di intervento (opzionale)"}</span>
          <input id="manut-file-input" type="file" accept=".pdf,image/*" onChange={onFileChange} hidden />
        </label>
        {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> {busy ? "Salvataggio…" : "Registra intervento"}
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun intervento registrato.</p></div>
      ) : (
        <ul className="dish-list">
          {items.map((item) => {
            const scaduta = item.next_due && item.next_due < oggi;
            return (
              <li key={item.id} className={"dish-row" + (scaduta ? " row-warn" : "")}>
                <div className="dish-top">
                  <div>
                    <Wrench size={13} style={{ marginRight: 6, verticalAlign: -2 }} color="#2F6F4E" />
                    <strong>{item.equipment}</strong>
                    <span className="lot-tag">{item.intervention_type}</span>
                  </div>
                  <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                </div>
                <div className="traccia-meta">
                  <span className="doc-type-tag">{new Date(item.intervention_date).toLocaleDateString("it-IT")}</span>
                  {item.performed_by && <span className="doc-type-tag">{item.performed_by}</span>}
                  {item.outcome && <span className="doc-type-tag">{item.outcome}</span>}
                  {item.next_due && (
                    <span className="doc-type-tag" style={scaduta ? { background: "#FBEEEC", color: "#B3432E" } : undefined}>
                      <CalendarClock size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                      prossima {new Date(item.next_due).toLocaleDateString("it-IT")}
                    </span>
                  )}
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
