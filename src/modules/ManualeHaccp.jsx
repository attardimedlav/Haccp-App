import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, Paperclip, BookOpen, Lock, CheckCircle2 } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment } from "../hooks/useAttachment";
import DocumentoInPagina from "../DocumentoInPagina";

const MAX_FILE_BYTES = 12 * 1024 * 1024;

const MOTIVI = [
  "Prima emissione",
  "Sostituzione del responsabile delle procedure di autocontrollo",
  "Variazione delle fasi del ciclo produttivo o nuove preparazioni",
  "Sostituzione o introduzione di attrezzature",
  "Modifica della destinazione d'uso dei locali",
  "Modifica delle normative di riferimento",
  "Revisione periodica",
  "Altro",
];

// La revisione successiva a quella più alta presente: 00 -> 01 -> 02.
function prossimaRevisione(items) {
  const numeri = items
    .map((i) => parseInt(String(i.revision).replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  if (numeri.length === 0) return "00";
  return String(Math.max(...numeri) + 1).padStart(2, "0");
}

export default function ManualeHaccp() {
  const { company, consultantCompanies } = useAuth();
  const { items, add, remove, loading } = useTable("haccp_manuals", company?.id);

  // Il manuale lo carica il consulente. Il cliente lo vede e lo scarica.
  const isConsultant = (consultantCompanies || []).length > 0;

  const [revision, setRevision] = useState("");
  const [issuedOn, setIssuedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState(MOTIVI[0]);
  const [preparedBy, setPreparedBy] = useState(company?.consultant_name || "");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Con il manuale già caricato i campi restano chiusi: si aprono solo per
  // depositare una revisione nuova.
  const [formAperto, setFormAperto] = useState(false);

  const esterno = company?.haccp_manual_source === "esterno";

  const ordinati = [...items].sort((a, b) => {
    if (a.issued_on !== b.issued_on) return a.issued_on < b.issued_on ? 1 : -1;
    return String(a.revision) < String(b.revision) ? 1 : -1;
  });
  const corrente = ordinati[0] || null;
  const precedenti = ordinati.slice(1);

  const onFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    if (f && f.size > MAX_FILE_BYTES) { setError("File troppo grande (limite 12 MB)."); setFile(null); e.target.value = ""; return; }
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    const rev = (revision || prossimaRevisione(items)).trim();
    if (!file) { setError("Allega il documento del manuale."); return; }
    setBusy(true);
    setError("");
    try {
      const file_path = await uploadAttachment(company.id, file);
      await add({
        revision: rev,
        issued_on: issuedOn,
        reason,
        prepared_by: preparedBy,
        source: esterno ? "esterno" : "app",
        file_path,
        notes,
      });
      setRevision(""); setNotes(""); setFile(null); setFormAperto(false);
      const input = document.getElementById("manuale-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il caricamento: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const intestazioneRevisione = (item, inVigore) => (
    <>
      <div className="dish-top">
        <div>
          <BookOpen size={13} style={{ marginRight: 6, verticalAlign: -2 }} color="#2F6F4E" />
          <strong>Revisione {item.revision}</strong>
          <span className="lot-tag">{inVigore ? "in vigore" : "superata"}</span>
          {item.source === "esterno" && <span className="lot-tag">manuale dell'azienda</span>}
        </div>
        {isConsultant && (
          <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
        )}
      </div>
      <div className="traccia-meta">
        <span className="doc-type-tag">emessa il {new Date(item.issued_on).toLocaleDateString("it-IT")}</span>
        {item.prepared_by && <span className="doc-type-tag">{item.prepared_by}</span>}
        {item.reason && <span className="doc-type-tag">{item.reason}</span>}
      </div>
      {item.notes && <p className="pest-note">{item.notes}</p>}
    </>
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Manuale di autocontrollo</h2>
          <p className="sub">
            {esterno
              ? "L'azienda ha un proprio manuale: qui si conserva la revisione in vigore, a disposizione dell'Autorità di controllo."
              : "Il manuale è redatto dal consulente. Qui si conserva la revisione in vigore e lo storico delle precedenti."}
          </p>
        </div>
        {corrente && (
          <div className="pill">
            <CheckCircle2 size={14} /> rev. {corrente.revision} del {new Date(corrente.issued_on).toLocaleDateString("it-IT")}
          </div>
        )}
      </div>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : !corrente ? (
        <div className="empty">
          <p>
            Nessun manuale caricato. Finché manca, l'azienda non ha il documento che l'Autorità di controllo
            chiede per primo: il piano di autocontrollo previsto dall'art. 5 del Reg. (CE) n. 852/2004.
          </p>
        </div>
      ) : (
        <>
          {/* La revisione in vigore si legge subito, documento compreso. */}
          <div className="dish-row">
            {intestazioneRevisione(corrente, true)}
            <DocumentoInPagina path={corrente.file_path} />
          </div>

          {precedenti.length > 0 && (
            <>
              <h3 className="section-title">Revisioni precedenti</h3>
              <ul className="dish-list">
                {precedenti.map((item) => (
                  <li key={item.id} className="dish-row">
                    {intestazioneRevisione(item, false)}
                    <DocumentoInPagina path={item.file_path} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {!isConsultant ? (
        <p className="sub" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 16 }}>
          <Lock size={13} /> Il manuale è redatto e aggiornato dal consulente HACCP.
        </p>
      ) : corrente && !formAperto ? (
        <button type="button" className="link-btn" style={{ marginTop: 14 }} onClick={() => setFormAperto(true)}>
          <Plus size={13} /> Deposita una nuova revisione
        </button>
      ) : (
        <>
          <h3 className="section-title">{corrente ? "Nuova revisione" : "Carica il manuale"}</h3>
          <form onSubmit={submit} className="traccia-form">
            <label className="file-drop" htmlFor="manuale-file-input">
              <Paperclip size={15} /><span>{file ? file.name : "Allega il manuale (PDF o Word, max 12 MB)"}</span>
              <input id="manuale-file-input" type="file" accept=".pdf,.doc,.docx" onChange={onFileChange} hidden />
            </label>
            <div className="row-form">
              <input
                type="text"
                placeholder={"Revisione (proposta: " + prossimaRevisione(items) + ")"}
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                className="note-input"
              />
              <label className="field-label">Data di emissione
                <input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
              </label>
              <input type="text" placeholder="Redatto da" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} className="note-input" />
            </div>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="full-input">
              {MOTIVI.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input type="text" placeholder="Nota (opzionale)" value={notes} onChange={(e) => setNotes(e.target.value)} className="full-input" />
            {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
            <div className="row-form">
              <button type="submit" className="btn-primary" disabled={busy}>
                <Plus size={16} /> {busy ? "Caricamento…" : corrente ? "Deposita la revisione" : "Carica il manuale"}
              </button>
              {corrente && (
                <button type="button" className="link-btn" onClick={() => setFormAperto(false)}>Annulla</button>
              )}
            </div>
            <p className="range-hint">
              Una revisione non sostituisce la precedente: la affianca. Lo storico è la matrice delle revisioni
              del manuale, e deve corrispondere a documenti che esistono davvero.
            </p>
          </form>
        </>
      )}
    </div>
  );
}
