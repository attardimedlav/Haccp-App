import React, { useState } from "react";
import { Plus, Trash2, Paperclip, FileText, Download, AlertTriangle, Wand2, UserPlus } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";
import { supabase } from "../supabaseClient";

const VALIDITY_OPTIONS = [1, 2, 3, 5];
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const FUNZIONE_LETTURA = "clever-responder";

function addYears(dateStr, years) {
  if (!dateStr || !years) return "";
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

const pulisci = (s) => String(s || "").trim().replace(/\s+/g, " ");
const stessoNome = (a, b) =>
  pulisci(a).toLowerCase().split(" ").sort().join(" ") ===
  pulisci(b).toLowerCase().split(" ").sort().join(" ");

// Stessa conversione usata per bolle, etichette e registrazione sanitaria:
// i PDF passano interi, le foto si rimpiccioliscono a 2000 px prima di partire.
function fileInBase64(file) {
  return new Promise((resolve, reject) => {
    if (file.type === "application/pdf") {
      const r = new FileReader();
      r.onload = () => resolve({ data: String(r.result).split(",")[1], media_type: "application/pdf" });
      r.onerror = reject;
      r.readAsDataURL(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const lato = 2000;
      const scala = Math.min(1, lato / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scala);
      canvas.height = Math.round(img.height * scala);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], media_type: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Immagine non leggibile")); };
    img.src = url;
  });
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
  // Le persone sono le stesse della sezione sicurezza sul lavoro: qui si
  // leggono per scegliere chi ha fatto il corso, e chi non c'è si aggiunge
  // all'elenco invece di restare un nome scritto a mano.
  const { items: dipendenti, add: addDipendente, reload: ricaricaDipendenti } = useTable("employees", company?.id);

  const [name, setName] = useState("");
  const [course, setCourse] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [validityYears, setValidityYears] = useState(2);
  const [scadenzaLetta, setScadenzaLetta] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leggendo, setLeggendo] = useState(false);
  const [letto, setLetto] = useState("");
  const [creaDipendente, setCreaDipendente] = useState(true);
  const [ente, setEnte] = useState("");

  const computedExpiry = scadenzaLetta || addYears(issueDate, validityYears);
  const nomiInElenco = dipendenti.map((d) => `${d.first_name || ""} ${d.last_name || ""}`.trim());
  const inElenco = nomiInElenco.some((n) => stessoNome(n, name));
  const personaNuova = pulisci(name).length > 0 && !inElenco;

  // L'attestato dice già tutto: si allega, l'app lo legge e compila la scheda.
  // Quello che è stato letto resta modificabile, la lettura non è un vincolo.
  const onFileChange = async (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    setLetto("");
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) { setError("File troppo grande (limite 8 MB)."); setFile(null); e.target.value = ""; return; }
    setFile(f);
    setLeggendo(true);
    try {
      const { data: b64, media_type } = await fileInBase64(f);
      const { data, error: err } = await supabase.functions.invoke(FUNZIONE_LETTURA, {
        body: { file_base64: b64, media_type, tipo: "attestato" },
      });
      if (err) throw new Error(err.message || "Lettura non riuscita");
      if (data?.errore) throw new Error(data.errore);

      // La function risponde con un elenco: qui interessa il primo attestato,
      // il caricamento in blocco di più partecipanti si fa da Nomine e Attestati.
      const primo = Array.isArray(data?.attestati) ? (data.attestati[0] || {}) : data;
      const quanti = Array.isArray(data?.attestati) ? data.attestati.length : 1;

      const persona = pulisci([primo?.nome, primo?.cognome].filter(Boolean).join(" "));
      if (persona) {
        // Se la persona è già in elenco si usa il nome come sta scritto lì,
        // così non nascono due grafie della stessa persona.
        const gia = nomiInElenco.find((n) => stessoNome(n, persona));
        setName(gia || persona);
      }
      if (primo?.corso) setCourse(primo.aggiornamento ? `${primo.corso} — aggiornamento` : primo.corso);
      if (primo?.data_rilascio) setIssueDate(data.data_rilascio);
      if (primo?.validita_anni && VALIDITY_OPTIONS.includes(Number(primo.validita_anni))) {
        setValidityYears(Number(primo.validita_anni));
      }
      setScadenzaLetta(primo?.data_scadenza || "");
      if (primo?.ente) setEnte(data.ente);

      const letti = [persona && "nominativo", primo?.corso && "corso", primo?.data_rilascio && "data"].filter(Boolean);
      setLetto(letti.length ? `Letto dall'attestato: ${letti.join(", ")}. Controlla prima di salvare.` : "");
      if (quanti > 1) {
        setError(`Nel file ci sono ${quanti} attestati: qui si registra il primo. Per caricarli tutti insieme usa Sicurezza sul lavoro → Nomine e Attestati.`);
      }
      if (!persona || !primo?.corso) {
        setError("Dall'attestato non è stato letto tutto: completa a mano quello che manca.");
      }
    } catch (e2) {
      setError("Lettura non riuscita: " + e2.message + " — puoi comunque compilare a mano.");
    } finally {
      setLeggendo(false);
    }
  };

  const svuota = () => {
    setName(""); setCourse(""); setIssueDate(""); setValidityYears(2);
    setScadenzaLetta(""); setFile(null); setLetto(""); setEnte(""); setCreaDipendente(true);
    const input = document.getElementById("formazione-file-input");
    if (input) input.value = "";
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !course.trim()) return;
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company.id, file);

      // La persona entra nell'elenco del personale: da lì la vedono anche la
      // sezione sicurezza sul lavoro, l'organigramma e le visite mediche.
      let employee_id = dipendenti.find((d) => stessoNome(`${d.first_name || ""} ${d.last_name || ""}`, name))?.id || null;
      if (!employee_id && creaDipendente) {
        const pezzi = pulisci(name).split(" ");
        const creato = await addDipendente({
          first_name: pezzi[0],
          last_name: pezzi.slice(1).join(" ") || pezzi[0],
          security_role: "Dipendente",
        });
        if (creato?.id) employee_id = creato.id;
        await ricaricaDipendenti();
      }

      await add({
        employee_name: pulisci(name),
        employee_id,
        course,
        issue_date: issueDate || null,
        validity_years: validityYears,
        expiry: computedExpiry || null,
        attachment_path,
        training_body: ente || null,
      });
      svuota();
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
          <p className="sub">Allega l'attestato: nominativo, corso e data si leggono da soli. La scadenza si calcola dalla data di rilascio e dagli anni di validità.</p>
        </div>
      </div>

      <form onSubmit={submit} className="traccia-form">
        <label className="file-drop" htmlFor="formazione-file-input">
          <Paperclip size={15} />
          <span>{leggendo ? "Lettura dell'attestato in corso…" : file ? file.name : "Allega attestato (PDF o foto) — lo leggo io"}</span>
          <input id="formazione-file-input" type="file" accept=".pdf,image/*" onChange={onFileChange} hidden disabled={leggendo} />
        </label>
        {letto && <span className="file-ok"><Wand2 size={13} /> {letto}</span>}

        <div className="row-form">
          <input
            type="text" placeholder="Nome e cognome" required list="formazione-dipendenti"
            value={name} onChange={(e) => setName(e.target.value)} className="note-input"
          />
          <datalist id="formazione-dipendenti">
            {nomiInElenco.filter(Boolean).map((n) => <option key={n} value={n} />)}
          </datalist>
          <input type="text" placeholder="Corso" required value={course} onChange={(e) => setCourse(e.target.value)} className="note-input" />
        </div>

        {personaNuova && (
          <label className="check-row">
            <input type="checkbox" checked={creaDipendente} onChange={(e) => setCreaDipendente(e.target.checked)} />
            <span><UserPlus size={13} /> Aggiungi <strong>{pulisci(name)}</strong> all'elenco del personale, così compare anche nella sezione sicurezza sul lavoro</span>
          </label>
        )}

        <div className="validity-row">
          <label className="field-label">Data rilascio
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </label>
          <div className="field-label">Validità
            <div className="chip-grid">
              {VALIDITY_OPTIONS.map((y) => (
                <button type="button" key={y} className={"chip" + (validityYears === y ? " chip-on" : "")} onClick={() => { setValidityYears(y); setScadenzaLetta(""); }}>{y} {y === 1 ? "anno" : "anni"}</button>
              ))}
            </div>
          </div>
          <label className="field-label">{scadenzaLetta ? "Scadenza sull'attestato" : "Scadenza calcolata"}
            <input type="text" readOnly value={computedExpiry ? new Date(computedExpiry).toLocaleDateString("it-IT") : "—"} className="computed-field" />
          </label>
        </div>

        {ente && <span className="sub">Ente formatore letto dall'attestato: {ente}</span>}
        {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
        <button type="submit" className="btn-primary" disabled={busy || leggendo} style={{ alignSelf: "flex-start" }}>
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
                  {item.training_body && <span className="doc-type-tag">{item.training_body}</span>}
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
