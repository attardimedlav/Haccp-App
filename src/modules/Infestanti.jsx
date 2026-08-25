import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, Paperclip, FileText, Download } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";
import { SAN_AREAS } from "./Sanificazione";

const PEST_OUTCOMES = [
  { id: "nessuna", label: "Nessuna traccia" },
  { id: "tracce", label: "Tracce rilevate" },
  { id: "intervento", label: "Intervento eseguito" },
];
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function AttachmentLink({ path }) {
  const [url, setUrl] = useState(null);
  if (!path) return <span className="none-label">Nessun report allegato</span>;
  if (!url) {
    getAttachmentUrl(path).then(setUrl);
    return <span className="none-label">Caricamento allegato…</span>;
  }
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} />
      <span className="attachment-name">{path.split("/").pop()}</span>
      <Download size={14} />
    </a>
  );
}

export default function Infestanti() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("pest_logs", company?.id);
  const [area, setArea] = useState(SAN_AREAS[0]);
  const [outcome, setOutcome] = useState(PEST_OUTCOMES[0].id);
  const [operator, setOperator] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    if (f && f.size > MAX_FILE_BYTES) {
      setError("File troppo grande (limite 8 MB).");
      setFile(null);
      e.target.value = "";
      return;
    }
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!operator.trim()) return;
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company.id, file);
      await add({ area, outcome, operator, note, attachment_path });
      setOperator(""); setNote(""); setFile(null);
      const input = document.getElementById("infestanti-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il caricamento: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const alerts = items.filter((i) => i.outcome === "tracce").length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Monitoraggio infestanti</h2>
          <p className="sub">Controlli periodici per area, con esito e report della ditta esterna.</p>
        </div>
        {alerts > 0 && <div className="pill pill-alert"><AlertTriangle size={14} /> {alerts} con tracce rilevate</div>}
      </div>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form">
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            {SAN_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {PEST_OUTCOMES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <input type="text" placeholder="Operatore / ditta esterna" required value={operator} onChange={(e) => setOperator(e.target.value)} className="note-input" />
          {company?.haccp_manager && (
            <button
              type="button"
              className="link-btn"
              onClick={() => setOperator(company.haccp_manager)}
            >
              Usa responsabile HACCP
            </button>
          )}
        </div>
        <input type="text" placeholder="Nota (opzionale)" value={note} onChange={(e) => setNote(e.target.value)} className="full-input" />
        <label className="file-drop" htmlFor="infestanti-file-input">
          <Paperclip size={15} />
          <span>{file ? file.name : "Allega report intervento (PDF o immagine)"}</span>
          <input id="infestanti-file-input" type="file" accept=".pdf,image/*" onChange={onFileChange} hidden />
        </label>
        {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> {busy ? "Salvataggio…" : "Registra controllo"}
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun controllo registrato.</p></div>
      ) : (
        <ul className="dish-list">
          {items.map((item) => {
            const outcomeDef = PEST_OUTCOMES.find((o) => o.id === item.outcome) || PEST_OUTCOMES[0];
            const warn = item.outcome === "tracce";
            return (
              <li key={item.id} className={"dish-row" + (warn ? " row-warn" : "")}>
                <div className="dish-top">
                  <div>
                    <strong>{item.area}</strong>
                    <span className="lot-tag" style={warn ? { background: "#FBEEEC", color: "#B3432E" } : undefined}>{outcomeDef.label}</span>
                  </div>
                  <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                </div>
                <div className="traccia-meta">
                  <span className="doc-type-tag">{item.operator}</span>
                  <span className="log-time">{fmtDate(item.created_at)}</span>
                </div>
                {item.note && <p className="pest-note">{item.note}</p>}
                <AttachmentLink path={item.attachment_path} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
