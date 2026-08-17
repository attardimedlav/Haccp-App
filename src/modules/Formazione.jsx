import React, { useState } from "react";
import { Plus, Trash2, Paperclip, FileText, Download, AlertTriangle } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

const VALIDITY_OPTIONS = [1, 2, 3, 5];
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function addYears(dateStr, years) {
  if (!dateStr || !years) return "";
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function AttachmentLink({ path }) {
  const [url, setUrl] = useState(null);
  if (!path) return <span className="none-label">Nessun attestato allegato</span>;
  if (!url) {
    getAttachmentUrl(path).then(setUrl);
    return <span className="none-label">Caricamento allegato…</span>;
  }
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} /><span className="attachment-name">{path.split("/").pop()}</span><Download size={14} />
    </a>
  );
}

export default function Formazione() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("training_records", company?.id);
  const [name, setName] = useState("");
  const [course, setCourse] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [validityYears, setValidityYears] = useState(2);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const computedExpiry = addYears(issueDate, validityYears);

  const onFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    if (f && f.size > MAX_FILE_BYTES) { setError("File troppo grande (limite 8 MB)."); setFile(null); e.target.value = ""; return; }
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !course.trim()) return;
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company.id, file);
      await add({ employee_name: name, course, issue_date: issueDate || null, validity_years: validityYears, expiry: computedExpiry || null, attachment_path });
      setName(""); setCourse(""); setIssueDate(""); setValidityYears(2); setFile(null);
      const input = document.getElementById("formazione-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il caricamento: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const isExpired = (expiry) => expiry && new Date(expiry) < new Date();
  const isExpiringSoon = (expiry) => {
    if (!expiry) return false;
    const days = (new Date(expiry) - new Date()) / 86400000;
    return days < 60 && days >= 0;
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Formazione staff</h2>
          <p className="sub">Data di rilascio + anni di validità: la scadenza si calcola da sola.</p>
        </div>
      </div>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form">
          <input type="text" placeholder="Nome dipendente" required value={name} onChange={(e) => setName(e.target.value)} className="note-input" />
          <input type="text" placeholder="Corso" required value={course} onChange={(e) => setCourse(e.target.value)} className="note-input" />
        </div>
        <div className="validity-row">
          <label className="field-label">Data rilascio
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </label>
          <div className="field-label">Validità
            <div className="chip-grid">
              {VALIDITY_OPTIONS.map((y) => (
                <button type="button" key={y} className={"chip" + (validityYears === y ? " chip-on" : "")} onClick={() => setValidityYears(y)}>{y} {y === 1 ? "anno" : "anni"}</button>
              ))}
            </div>
          </div>
          <label className="field-label">Scadenza calcolata
            <input type="text" readOnly value={computedExpiry ? new Date(computedExpiry).toLocaleDateString("it-IT") : "—"} className="computed-field" />
          </label>
        </div>
        <label className="file-drop" htmlFor="formazione-file-input">
          <Paperclip size={15} /><span>{file ? file.name : "Allega attestato (PDF o immagine)"}</span>
          <input id="formazione-file-input" type="file" accept=".pdf,image/*" onChange={onFileChange} hidden />
        </label>
        {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> {busy ? "Salvataggio…" : "Aggiungi"}
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun corso registrato.</p></div>
      ) : (
        <ul className="dish-list">
          {items.map((item) => {
            const expired = isExpired(item.expiry);
            const soon = isExpiringSoon(item.expiry);
            return (
              <li key={item.id} className="dish-row">
                <div className="dish-top">
                  <div><strong>{item.employee_name}</strong><span className="lot-tag">{item.course}</span></div>
                  <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                </div>
                <div className="traccia-meta">
                  {item.issue_date && <span className="doc-type-tag">Rilasciato {new Date(item.issue_date).toLocaleDateString("it-IT")} · {item.validity_years} {item.validity_years === 1 ? "anno" : "anni"}</span>}
                  {item.expiry && (
                    <span className="doc-type-tag" style={{ color: expired ? "#B3432E" : soon ? "#C58A2A" : "#6E7C73" }}>
                      {expired ? "Scaduto" : soon ? "In scadenza" : "Valido"} · {new Date(item.expiry).toLocaleDateString("it-IT")}
                    </span>
                  )}
                </div>
                <AttachmentLink path={item.attachment_path} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
