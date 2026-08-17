import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, Paperclip, FileText, Download, Droplet } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const CONTROL_TYPES = ["Cloro residuo", "Analisi chimico-microbiologica", "Ispezione visiva impianto", "Manutenzione filtri/addolcitori", "Altro"];
const RESULTS = ["Conforme", "Non conforme"];

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function AttachmentLink({ path }) {
  const [url, setUrl] = useState(null);
  if (!path) return <span className="none-label">Nessun referto allegato</span>;
  if (!url) { getAttachmentUrl(path).then(setUrl); return <span className="none-label">Caricamento allegato…</span>; }
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} /><span className="attachment-name">{path.split("/").pop()}</span><Download size={14} />
    </a>
  );
}

export default function AcquePotabili() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("water_controls", company?.id);
  const [samplingPoint, setSamplingPoint] = useState("");
  const [controlType, setControlType] = useState(CONTROL_TYPES[0]);
  const [controlDate, setControlDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState(RESULTS[0]);
  const [value, setValue] = useState("");
  const [lab, setLab] = useState("");
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
    if (!samplingPoint.trim()) return;
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company.id, file);
      await add({ sampling_point: samplingPoint, control_type: controlType, control_date: controlDate, result, value, lab, note, attachment_path });
      setSamplingPoint(""); setValue(""); setLab(""); setNote(""); setFile(null);
      const input = document.getElementById("acqua-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il caricamento: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const nonConformi = items.filter((i) => i.result === "Non conforme").length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Acque potabili interne</h2>
          <p className="sub">Autocontrollo della qualità dell'acqua distribuita internamente (D.Lgs. 18/2023).</p>
        </div>
        {nonConformi > 0 && <div className="pill pill-alert"><AlertTriangle size={14} /> {nonConformi} non {nonConformi === 1 ? "conforme" : "conformi"}</div>}
      </div>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form">
          <input type="text" placeholder="Punto di prelievo (es. Rubinetto cucina)" required value={samplingPoint} onChange={(e) => setSamplingPoint(e.target.value)} className="note-input" />
          <select value={controlType} onChange={(e) => setControlType(e.target.value)}>
            {CONTROL_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="row-form">
          <label className="field-label">Data controllo
            <input type="date" value={controlDate} onChange={(e) => setControlDate(e.target.value)} />
          </label>
          <select value={result} onChange={(e) => setResult(e.target.value)}>
            {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="text" placeholder="Valore rilevato (opzionale)" value={value} onChange={(e) => setValue(e.target.value)} className="note-input" />
        </div>
        <input type="text" placeholder="Laboratorio / ente incaricato (opzionale)" value={lab} onChange={(e) => setLab(e.target.value)} className="full-input" />
        <input type="text" placeholder="Nota (opzionale)" value={note} onChange={(e) => setNote(e.target.value)} className="full-input" />
        <label className="file-drop" htmlFor="acqua-file-input">
          <Paperclip size={15} /><span>{file ? file.name : "Allega referto analisi (opzionale)"}</span>
          <input id="acqua-file-input" type="file" accept=".pdf,image/*" onChange={onFileChange} hidden />
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
            const bad = item.result === "Non conforme";
            return (
              <li key={item.id} className={"dish-row" + (bad ? " row-warn" : "")}>
                <div className="dish-top">
                  <div>
                    <Droplet size={13} style={{ marginRight: 6, verticalAlign: -2 }} color="#2F6F4E" />
                    <strong>{item.sampling_point}</strong>
                    <span className="lot-tag" style={bad ? { background: "#FBEEEC", color: "#B3432E" } : undefined}>{item.result}</span>
                  </div>
                  <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                </div>
                <div className="traccia-meta">
                  <span className="doc-type-tag">{item.control_type}</span>
                  {item.value && <span className="doc-type-tag">{item.value}</span>}
                  {item.lab && <span className="doc-type-tag">{item.lab}</span>}
                  <span className="log-time">{new Date(item.control_date).toLocaleDateString("it-IT")}</span>
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
