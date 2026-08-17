import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, CheckCircle2, Paperclip, FileText, Download, Pencil, X, Check } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";


const MAX_FILE_BYTES = 8 * 1024 * 1024;
const NC_CATEGORIES = ["Cucina", "Sala", "Bagni", "Magazzino", "Attrezzature", "Frigoriferi", "Alimenti", "Allerta sanitaria"];

function AttachmentLink({ path }) {
  const [url, setUrl] = useState(null);
  if (!path) return <span className="none-label">Nessun documento allegato</span>;
  if (!url) { getAttachmentUrl(path).then(setUrl); return <span className="none-label">Caricamento allegato…</span>; }
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} /><span className="attachment-name">{path.split("/").pop()}</span><Download size={14} />
    </a>
  );
}

export default function NonConformita() {
  const { company } = useAuth();
  const { items, add, remove, update, loading } = useTable("non_conformities", company?.id);
  const [area, setArea] = useState(NC_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [detectedDate, setDetectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [responsible, setResponsible] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editAction, setEditAction] = useState("");
  const [editResolvedDate, setEditResolvedDate] = useState("");

  const onFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    if (f && f.size > MAX_FILE_BYTES) { setError("File troppo grande (limite 8 MB)."); setFile(null); e.target.value = ""; return; }
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company.id, file);
      await add({ area, description, detected_date: detectedDate, responsible, attachment_path });
      setDescription(""); setResponsible(""); setFile(null);
      const input = document.getElementById("nc-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il caricamento: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditAction(item.corrective_action || "");
    setEditResolvedDate(item.resolved_date || new Date().toISOString().slice(0, 10));
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (id) => {
    if (!editAction.trim()) return;
    await update(id, { corrective_action: editAction, resolved_date: editResolvedDate });
    setEditingId(null);
  };

  const openCount = items.filter((i) => !i.resolved_date).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Non conformità e azioni correttive</h2>
          <p className="sub">Registra ogni deviazione rilevata e, appena risolta, l'azione correttiva adottata.</p>
        </div>
        {openCount > 0 && <div className="pill pill-alert"><AlertTriangle size={14} /> {openCount} {openCount === 1 ? "aperta" : "aperte"}</div>}
      </div>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form">
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            {NC_CATEGORIES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <label className="field-label">Data rilevazione
            <input type="date" value={detectedDate} onChange={(e) => setDetectedDate(e.target.value)} />
          </label>
          <input type="text" placeholder="Responsabile" value={responsible} onChange={(e) => setResponsible(e.target.value)} className="note-input" />
        </div>
        <input type="text" placeholder="Descrizione della non conformità" required value={description} onChange={(e) => setDescription(e.target.value)} className="full-input" />
        <label className="file-drop" htmlFor="nc-file-input">
          <Paperclip size={15} /><span>{file ? file.name : "Allega foto/documento (opzionale)"}</span>
          <input id="nc-file-input" type="file" accept=".pdf,image/*" onChange={onFileChange} hidden />
        </label>
        {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> {busy ? "Salvataggio…" : "Registra non conformità"}
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessuna non conformità registrata.</p></div>
      ) : (
        <ul className="dish-list">
          {items.map((item) => {
            const resolved = !!item.resolved_date;
            const isEditing = editingId === item.id;
            return (
              <li key={item.id} className={"dish-row" + (!resolved ? " row-warn" : "")}>
                <div className="dish-top">
                  <div>
                    <strong>{item.area}</strong>
                    <span className="lot-tag" style={!resolved ? { background: "#FBEEEC", color: "#B3432E" } : undefined}>
                      {resolved ? "Risolta" : "Aperta"}
                    </span>
                  </div>
                  <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                </div>
                <div className="traccia-meta">
                  <span className="doc-type-tag">Rilevata {new Date(item.detected_date).toLocaleDateString("it-IT")}</span>
                  {item.responsible && <span className="doc-type-tag">{item.responsible}</span>}
                </div>
                <p className="pest-note">{item.description}</p>
                <AttachmentLink path={item.attachment_path} />

                {isEditing ? (
                  <div className="nc-edit-block">
                    <textarea placeholder="Azione correttiva adottata" value={editAction} onChange={(e) => setEditAction(e.target.value)} className="full-input nc-textarea" />
                    <div className="row-form" style={{ margin: "8px 0" }}>
                      <label className="field-label">Data risoluzione
                        <input type="date" value={editResolvedDate} onChange={(e) => setEditResolvedDate(e.target.value)} />
                      </label>
                      <button className="btn-primary" onClick={() => saveEdit(item.id)}><Check size={14} /> Salva</button>
                      <button className="icon-btn" onClick={cancelEdit} aria-label="Annulla"><X size={14} /></button>
                    </div>
                  </div>
                ) : resolved ? (
                  <div className="nc-resolved">
                    <CheckCircle2 size={13} color="#2F6F4E" />
                    <span>Risolta il {new Date(item.resolved_date).toLocaleDateString("it-IT")}: {item.corrective_action}</span>
                    <button className="icon-btn" onClick={() => startEdit(item)} aria-label="Modifica"><Pencil size={13} /></button>
                  </div>
                ) : (
                  <button type="button" className="btn-primary nc-resolve-btn" onClick={() => startEdit(item)}>
                    <Pencil size={14} /> Registra azione correttiva
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
