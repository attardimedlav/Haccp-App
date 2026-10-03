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

// Primo rilascio e aggiornamento sono due righe diverse nel database, ma per
// chi legge sono la storia di una sola formazione: separate, un corso base
// scaduto sembra una posizione scoperta anche quando il rinnovo c'è già.
//
// I titoli non sono mai scritti allo stesso modo ("Formazione alimentaristi -
// Rischio 2 (Cat. A)", "Corso Alimentaristi … — aggiornamento"), quindi la
// famiglia del corso si riconosce dalle parole e non dal titolo esatto.
function famigliaCorso(titolo) {
  const t = String(titolo || "").toLowerCase();
  if (/aliment/.test(t)) return "Alimentaristi (HACCP)";
  if (/primo soccorso/.test(t)) return "Primo soccorso";
  if (/antincendi|incendi/.test(t)) return "Antincendio";
  if (/\brls\b|rappresentante dei lavoratori/.test(t)) return "RLS";
  if (/preposto/.test(t)) return "Preposto";
  if (/rspp/.test(t)) return "RSPP";
  if (/\bhaccp\b/.test(t)) return "HACCP";
  return pulisci(titolo).replace(/\s*[—-]\s*aggiornamento\s*$/i, "") || "Altro corso";
}

const eAggiornamento = (titolo) => /aggiornament/i.test(String(titolo || ""));

function fmtData(iso) {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
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
        body: { file_base64: b64, media_type, tipo: "attestato", company_id: company?.id },
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
      if (primo?.data_rilascio) setIssueDate(primo.data_rilascio);
      if (primo?.validita_anni && VALIDITY_OPTIONS.includes(Number(primo.validita_anni))) {
        setValidityYears(Number(primo.validita_anni));
      }
      setScadenzaLetta(primo?.data_scadenza || "");
      if (primo?.ente) setEnte(primo.ente);

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

  // Una scheda per persona e per famiglia di corso, con dentro gli attestati in
  // ordine di rilascio: il primo è il rilascio iniziale, quelli dopo i rinnovi.
  const schede = (() => {
    const mappa = new Map();
    items.forEach((it) => {
      const persona = pulisci(it.employee_name) || "Senza nominativo";
      const famiglia = famigliaCorso(it.course);
      const chiave = persona.toLowerCase() + "|" + famiglia.toLowerCase();
      if (!mappa.has(chiave)) mappa.set(chiave, { chiave, persona, famiglia, righe: [] });
      mappa.get(chiave).righe.push(it);
    });
    return [...mappa.values()]
      .map((g) => {
        const righe = [...g.righe].sort((a, b) => new Date(a.issue_date || 0) - new Date(b.issue_date || 0));
        // Lo stato della persona è quello dell'attestato che scade più tardi:
        // se il rinnovo c'è, il corso base scaduto non è una mancanza.
        const valido = righe.reduce((best, r) => {
          if (!r.expiry) return best;
          return !best || new Date(r.expiry) > new Date(best.expiry) ? r : best;
        }, null);
        return { chiave: g.chiave, persona: g.persona, famiglia: g.famiglia, righe, valido };
      })
      // Chi è scoperto sta in cima: è l'unica cosa su cui si deve intervenire.
      .sort((a, b) => {
        const sa = a.valido && !isExpired(a.valido.expiry) ? 1 : 0;
        const sb = b.valido && !isExpired(b.valido.expiry) ? 1 : 0;
        return sa - sb || a.persona.localeCompare(b.persona, "it");
      });
  })();

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
          {schede.map((s) => {
            const scaduto = !s.valido || isExpired(s.valido.expiry);
            const inScadenza = !!s.valido && isExpiringSoon(s.valido.expiry);
            return (
              <li key={s.chiave} className={"dish-row" + (scaduto ? " row-warn" : "")}>
                <div className="dish-top">
                  <div style={{ minWidth: 0 }}>
                    <strong>{s.persona}</strong>
                    <span className="lot-tag">{s.famiglia}</span>
                  </div>
                  <span className={"pill " + (scaduto ? "pill-alert" : inScadenza ? "pill-warn" : "pill-ok")}>
                    {!s.valido
                      ? "Senza scadenza"
                      : scaduto
                        ? "Scaduto il " + fmtData(s.valido.expiry)
                        : inScadenza
                          ? "In scadenza il " + fmtData(s.valido.expiry)
                          : "Valido fino al " + fmtData(s.valido.expiry)}
                  </span>
                </div>

                <ul className="tr-list">
                  {s.righe.map((item, i) => (
                    <li key={item.id} className="tr-item">
                      <div className="tr-item-top">
                        <span className="tr-kind">
                          {i === 0 && !eAggiornamento(item.course) ? "Primo rilascio" : "Aggiornamento"}
                        </span>
                        {item.issue_date && <span className="doc-type-tag">del {fmtData(item.issue_date)}</span>}
                        {item.validity_years && (
                          <span className="doc-type-tag">
                            {item.validity_years} {item.validity_years === 1 ? "anno" : "anni"}
                          </span>
                        )}
                        {item.expiry && <span className="doc-type-tag">fino al {fmtData(item.expiry)}</span>}
                        <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina attestato">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <p className="pest-note" style={{ margin: "4px 0 0" }}>{item.course}</p>
                      {item.training_body && (
                        <p className="pest-note" style={{ margin: "2px 0 0" }}>{item.training_body}</p>
                      )}
                      <AttachmentLink path={item.attachment_path} />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
