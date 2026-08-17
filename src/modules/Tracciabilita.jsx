import React, { useState } from "react";
import { Plus, Trash2, Paperclip, FileText, Download, AlertTriangle } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

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

export default function Tracciabilita() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("traceability_logs", company?.id);
  const [productName, setProductName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [lot, setLot] = useState("");
  const [docType, setDocType] = useState("DDT");
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
    if (!productName.trim() || !supplier.trim() || !lot.trim()) return;
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company.id, file);
      await add({ product_name: productName, supplier, lot, doc_type: docType, attachment_path });
      setProductName(""); setSupplier(""); setLot(""); setFile(null);
      const input = document.getElementById("traccia-file-input");
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
          <h2>Fornitori e rintracciabilità</h2>
          <p className="sub">Allega DDT, fatture o etichette: il lotto resta collegato al documento di origine.</p>
        </div>
      </div>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form">
          <input type="text" placeholder="Nome commerciale del prodotto" required value={productName} onChange={(e) => setProductName(e.target.value)} className="note-input" />
          <input type="text" placeholder="Fornitore" required value={supplier} onChange={(e) => setSupplier(e.target.value)} className="note-input" />
        </div>
        <div className="row-form">
          <input type="text" placeholder="Numero lotto" required value={lot} onChange={(e) => setLot(e.target.value)} />
          <select value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="DDT">Bolla (DDT)</option>
            <option value="Fattura">Fattura</option>
            <option value="Etichetta">Etichetta</option>
            <option value="Altro">Altro</option>
          </select>
        </div>
        <label className="file-drop" htmlFor="traccia-file-input">
          <Paperclip size={15} /><span>{file ? file.name : "Allega documento (PDF o immagine)"}</span>
          <input id="traccia-file-input" type="file" accept=".pdf,image/*" onChange={onFileChange} hidden />
        </label>
        {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> {busy ? "Salvataggio…" : "Registra lotto"}
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun documento di tracciabilità registrato.</p></div>
      ) : (
        <ul className="dish-list">
          {items.map((item) => (
            <li key={item.id} className="dish-row">
              <div className="dish-top">
                <div><strong>{item.product_name}</strong><span className="lot-tag">Lotto {item.lot}</span></div>
                <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
              </div>
              <div className="traccia-meta">
                <span className="doc-type-tag">{item.supplier}</span>
                <span className="doc-type-tag">{item.doc_type}</span>
                <span className="log-time">{fmtDate(item.created_at)}</span>
              </div>
              <AttachmentLink path={item.attachment_path} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
