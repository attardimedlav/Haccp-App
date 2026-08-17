import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, Paperclip, FileText, Download, FolderOpen } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const DOC_TYPES = ["Piano di autocontrollo", "Planimetria", "Certificato corsi", "Altro"];
export const PLAN_TYPE = "Piano di autocontrollo";

function AttachmentLink({ path }) {
  const [url, setUrl] = useState(null);
  if (!path) return <span className="none-label">Nessun file allegato</span>;
  if (!url) { getAttachmentUrl(path).then(setUrl); return <span className="none-label">Caricamento allegato…</span>; }
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} /><span className="attachment-name">{path.split("/").pop()}</span><Download size={14} />
    </a>
  );
}

export default function Documenti() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("haccp_documents", company?.id);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [title, setTitle] = useState("");
  const [reviewDate, setReviewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
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
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company.id, file);
      await add({ document_type: docType, title, review_date: reviewDate, note, attachment_path });
      setTitle(""); setNote(""); setFile(null);
      const input = document.getElementById("doc-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il caricamento: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Documenti</h2>
          <p className="sub">Il piano di autocontrollo HACCP, planimetrie e altri documenti dell'attività, con la data dell'ultima revisione.</p>
        </div>
      </div>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form">
          <select value={docType} onChange={(e) => setDocType(e.target.value)}>
            {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="text" placeholder="Titolo documento" required value={title} onChange={(e) => setTitle(e.target.value)} className="note-input" />
          <label className="field-label">Data revisione
            <input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
          </label>
        </div>
        <input type="text" placeholder="Nota (opzionale)" value={note} onChange={(e) => setNote(e.target.value)} className="full-input" />
        <label className="file-drop" htmlFor="doc-file-input">
          <Paperclip size={15} /><span>{file ? file.name : "Allega file (PDF o immagine)"}</span>
          <input id="doc-file-input" type="file" accept=".pdf,image/*" onChange={onFileChange} hidden />
        </label>
        {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> {busy ? "Salvataggio…" : "Registra documento"}
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun documento caricato.</p></div>
      ) : (
        <ul className="dish-list">
          {items.map((item) => (
            <li key={item.id} className="dish-row">
              <div className="dish-top">
                <div>
                  <FolderOpen size={13} style={{ marginRight: 6, verticalAlign: -2 }} color="#2F6F4E" />
                  <strong>{item.title}</strong>
                  <span className="lot-tag">{item.document_type}</span>
                </div>
                <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
              </div>
              <div className="traccia-meta">
                <span className="doc-type-tag">Revisionato il {new Date(item.review_date).toLocaleDateString("it-IT")}</span>
              </div>
              {item.note && <p className="pest-note">{item.note}</p>}
              <AttachmentLink path={item.attachment_path} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
