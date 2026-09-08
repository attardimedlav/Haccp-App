import React, { useState } from "react";
import { Plus, Trash2, FileDown, Save, X, AlertTriangle } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { scaricaRegistro } from "../utils/registroCorso";

// Corso di formazione organizzato dall'azienda stessa (art. 37 D.Lgs. 81/08,
// Accordo Stato-Regioni 17/04/2025, Rep. Atti n. 59/CSR).
//
// L'Accordo consente al datore di lavoro di erogare la formazione ai propri
// lavoratori, a tre condizioni: docenti con i requisiti del D.I. 6/03/2013,
// un progetto formativo con un responsabile (ruolo distinto da quello del
// docente), e la documentazione del corso — registro presenze, frequenza
// minima del 90%, verifica finale con verbale, attestato.
//
// Questo pannello raccoglie i dati una volta sola: da qui escono tutti i
// documenti, che altrimenti si compilerebbero quattro volte a mano.

const CLASSI = {
  Basso: { ore: 8, generale: 4, specifica: 4 },
  Medio: { ore: 12, generale: 4, specifica: 8 },
  Alto: { ore: 16, generale: 4, specifica: 12 },
};

// I contenuti della formazione generale sono fissati dall'art. 37 c. 1 lett. a
// e sono gli stessi per qualunque azienda: si possono precompilare. Quelli
// della formazione specifica dipendono dai rischi della singola attivita' e
// vanno scritti caso per caso: precompilarli sarebbe un falso.
const ARGOMENTI_GENERALE = [
  "Concetti di base in materia di salute e sicurezza sul lavoro: pericolo, rischio, prevenzione, protezione.",
  "Organizzazione della prevenzione aziendale: datore di lavoro, dirigenti, preposti, RSPP, RLS, medico competente, lavoratori.",
  "Diritti, doveri e responsabilita' dei soggetti aziendali.",
  "Concetti di danno, infortunio, malattia professionale, near miss.",
  "Misure generali di tutela previste dal D.Lgs. 81/08.",
  "Organi di vigilanza, controllo e assistenza.",
].join("\n");

function nuovaSessione(o = {}) {
  return {
    key: Math.random().toString(36).slice(2),
    data: o.data || "",
    oraInizio: o.oraInizio || "09:00",
    oraFine: o.oraFine || "13:00",
    ore: o.ore ?? 4,
    modulo: o.modulo || "",
    argomenti: o.argomenti || "",
    docente: o.docente || "",
  };
}

export default function CorsoFormazione({ righeFormazione, employees, onChiudi }) {
  const { company } = useAuth();
  const { items: docenti, add: addDocente } = useTable("trainers", company?.id);
  const { add: addCorso } = useTable("training_courses", company?.id);
  const { add: addSessione } = useTable("training_course_sessions", company?.id);
  const { add: addPartecipante } = useTable("training_course_participants", company?.id);

  // Chi non ha mai fatto il corso, o ce l'ha scaduto, parte gia' spuntato:
  // e' esattamente l'elenco di chi la formazione la deve fare.
  const daFormare = new Set(
    (righeFormazione || []).filter((r) => r.cls === "pill-alert" || r.cls === "pill-warn").map((r) => r.name)
  );
  const [scelti, setScelti] = useState(daFormare);

  const [classe, setClasse] = useState("Alto");
  const [titolo, setTitolo] = useState("Corso di formazione dei lavoratori — settore di rischio alto");
  const [oreTotali, setOreTotali] = useState(16);
  const [sede, setSede] = useState(company?.sede_operativa || company?.sede_legale || "");
  const [organizzatore, setOrganizzatore] = useState(company?.name || "");
  const [responsabile, setResponsabile] = useState("");
  const [legale, setLegale] = useState("");
  const [sessioni, setSessioni] = useState([nuovaSessione({ modulo: "Formazione Generale", argomenti: ARGOMENTI_GENERALE })]);

  const [nuovoDocente, setNuovoDocente] = useState("");
  const [nuovaQualifica, setNuovaQualifica] = useState("");
  const [docenteOpen, setDocenteOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState("");

  const cambiaClasse = (c) => {
    setClasse(c);
    setOreTotali(CLASSI[c]?.ore || 16);
    setTitolo(`Corso di formazione dei lavoratori — settore di rischio ${c.toLowerCase()}`);
  };

  const toggle = (nome) => {
    const s = new Set(scelti);
    if (s.has(nome)) s.delete(nome); else s.add(nome);
    setScelti(s);
  };

  const datiPartecipanti = (righeFormazione || [])
    .filter((r) => scelti.has(r.name))
    .map((r) => {
      const emp = (employees || []).find((e) => `${e.first_name} ${e.last_name}`.trim() === r.name);
      return { nome: r.name, codiceFiscale: emp?.tax_code || "", mansione: emp?.job_role || "", employee_id: emp?.id || null };
    });

  const senzaCf = datiPartecipanti.filter((p) => !p.codiceFiscale);
  const oreProgrammate = sessioni.reduce((n, s) => n + (Number(s.ore) || 0), 0);

  const datiDocumento = () => ({
    azienda: company?.name || "",
    organizzatore,
    sede,
    responsabileProgetto: responsabile,
    legaleRappresentante: legale,
    titolo: (titolo || "").toUpperCase(),
    classeRischio: classe.toLowerCase(),
    oreTotali,
    sessioni: sessioni.map((s) => ({
      data: s.data, oraInizio: s.oraInizio, oraFine: s.oraFine,
      ore: s.ore, modulo: s.modulo, argomenti: s.argomenti, docente: s.docente,
    })),
    partecipanti: datiPartecipanti,
  });

  const controlla = () => {
    if (datiPartecipanti.length === 0) return "Seleziona almeno un lavoratore.";
    if (!responsabile.trim()) return "Manca il responsabile del progetto formativo: l'Accordo lo richiede.";
    if (sessioni.some((s) => !s.data)) return "Ogni giornata deve avere una data.";
    if (sessioni.some((s) => !s.docente)) return "Ogni modulo deve avere un docente.";
    return "";
  };

  const scarica = async () => {
    const problema = controlla();
    if (problema) { setErrore(problema); return; }
    setErrore(""); setEsito("");
    try {
      await scaricaRegistro(datiDocumento(),
        `Registro_presenze_${(company?.name || "corso").replace(/[^a-zA-Z0-9]+/g, "_")}.docx`);
    } catch (e) {
      setErrore("Non sono riuscito a generare il registro: " + (e?.message || e));
    }
  };

  const salva = async () => {
    const problema = controlla();
    if (problema) { setErrore(problema); return; }
    setErrore(""); setEsito(""); setBusy(true);

    const corso = await addCorso({
      title: titolo,
      risk_class: classe,
      total_hours: oreTotali,
      venue: sede,
      organizer: organizzatore,
      project_manager: responsabile,
      status: "in preparazione",
      note: "",
    });

    if (!corso) { setBusy(false); setErrore("Salvataggio del corso non riuscito."); return; }

    for (let i = 0; i < sessioni.length; i++) {
      const s = sessioni[i];
      await addSessione({
        course_id: corso.id,
        session_date: s.data || null,
        start_time: s.oraInizio || null,
        end_time: s.oraFine || null,
        hours: Number(s.ore) || null,
        module_title: s.modulo,
        topics: s.argomenti,
        teacher_name: s.docente,
        sort_order: i,
      });
    }
    for (const p of datiPartecipanti) {
      await addPartecipante({
        course_id: corso.id,
        employee_id: p.employee_id,
        person_name: p.nome,
        tax_code: p.codiceFiscale || null,
        job_role: p.mansione || null,
      });
    }
    setBusy(false);
    setEsito(`Corso salvato con ${datiPartecipanti.length} partecipanti e ${sessioni.length} moduli.`);
  };

  const salvaDocente = async () => {
    if (!nuovoDocente.trim()) return;
    await addDocente({ full_name: nuovoDocente, qualification: nuovaQualifica });
    setNuovoDocente(""); setNuovaQualifica(""); setDocenteOpen(false);
  };

  const aggiornaSessione = (key, campo, valore) =>
    setSessioni(sessioni.map((s) => (s.key === key ? { ...s, [campo]: valore } : s)));

  return (
    <div className="corso-panel">
      <div className="panel-head">
        <div>
          <h3 style={{ margin: "0 0 6px" }}>Corso di formazione dei lavoratori</h3>
          <p className="sub" style={{ margin: 0 }}>
            Organizzato dall'azienda ai sensi dell'art. 37 D.Lgs. 81/08 e dell'Accordo Stato-Regioni
            del 17/04/2025. Da qui esce il registro presenze.
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onChiudi} aria-label="Chiudi"><X size={16} /></button>
      </div>

      {/* --- 1. chi va formato --- */}
      <p className="corso-sezione">1 · Chi partecipa</p>
      <p className="sub" style={{ margin: "0 0 10px" }}>
        Chi non ha mai fatto il corso o ce l'ha scaduto è già spuntato. Puoi aggiungere o togliere chiunque.
      </p>
      <ul className="corso-elenco">
        {(righeFormazione || []).map((r) => (
          <li key={r.key}>
            <label className="corso-check">
              <input type="checkbox" checked={scelti.has(r.name)} onChange={() => toggle(r.name)} />
              <span className="corso-nome">{r.name}</span>
              <span className={"pill " + r.cls}>{r.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="sub" style={{ margin: "8px 0 0" }}>
        Selezionati: <strong>{datiPartecipanti.length}</strong>
        {datiPartecipanti.length > 30 && " — attenzione: l'Accordo fissa il massimo a 30 partecipanti per corso."}
      </p>
      {senzaCf.length > 0 && (
        <p className="corso-avviso">
          <AlertTriangle size={14} /> {senzaCf.length === 1 ? "Manca il codice fiscale di " : "Mancano i codici fiscali di "}
          {senzaCf.map((p) => p.nome).join(", ")}. Nel registro la casella resterà vuota, e senza codice
          fiscale l'attestato non è valido: inseriscilo in Dipendenti.
        </p>
      )}

      {/* --- 2. il corso --- */}
      <p className="corso-sezione">2 · Il corso</p>
      <div className="row-form">
        <label className="field-label">Classe di rischio
          <select value={classe} onChange={(e) => cambiaClasse(e.target.value)}>
            {Object.keys(CLASSI).map((c) => <option key={c} value={c}>{c} — {CLASSI[c].ore} ore</option>)}
          </select>
        </label>
        <label className="field-label">Ore totali
          <input type="number" min="1" value={oreTotali} onChange={(e) => setOreTotali(e.target.value)} className="num" />
        </label>
      </div>
      <input type="text" value={titolo} onChange={(e) => setTitolo(e.target.value)}
        className="full-input" placeholder="Titolo del corso" style={{ marginBottom: 8 }} />
      <input type="text" value={sede} onChange={(e) => setSede(e.target.value)}
        className="full-input" placeholder="Sede di svolgimento" style={{ marginBottom: 8 }} />
      <input type="text" value={organizzatore} onChange={(e) => setOrganizzatore(e.target.value)}
        className="full-input" placeholder="Soggetto organizzatore" style={{ marginBottom: 8 }} />
      <div className="row-form" style={{ margin: 0 }}>
        <input type="text" value={responsabile} onChange={(e) => setResponsabile(e.target.value)}
          className="note-input" placeholder="Responsabile del progetto formativo" />
        <input type="text" value={legale} onChange={(e) => setLegale(e.target.value)}
          className="note-input" placeholder="Legale rappresentante (firma il registro)" />
      </div>
      <p className="sub" style={{ margin: "6px 0 0" }}>
        Responsabile del progetto formativo e docente sono due ruoli distinti: possono essere la stessa
        persona, ma vanno indicati entrambi.
      </p>

      {/* --- 3. docenti --- */}
      <p className="corso-sezione">3 · Docenti</p>
      {docenti.length === 0 && !docenteOpen && (
        <p className="none-label" style={{ margin: "0 0 8px" }}>Nessun docente in elenco.</p>
      )}
      {docenti.length > 0 && (
        <ul className="corso-docenti">
          {docenti.map((d) => (
            <li key={d.id}>
              <strong>{d.full_name}</strong>
              {d.qualification && <span className="log-note"> — {d.qualification}</span>}
            </li>
          ))}
        </ul>
      )}
      {docenteOpen ? (
        <div className="row-form" style={{ marginTop: 8 }}>
          <input type="text" value={nuovoDocente} onChange={(e) => setNuovoDocente(e.target.value)}
            className="note-input" placeholder="Nome e cognome del docente" />
          <input type="text" value={nuovaQualifica} onChange={(e) => setNuovaQualifica(e.target.value)}
            className="note-input" placeholder="Qualifica (requisiti D.I. 6/03/2013)" />
          <button type="button" className="btn-primary" onClick={salvaDocente}><Plus size={14} /> Salva</button>
          <button type="button" className="link-btn" onClick={() => setDocenteOpen(false)}>Annulla</button>
        </div>
      ) : (
        <button type="button" className="link-btn" onClick={() => setDocenteOpen(true)}>+ Aggiungi docente</button>
      )}

      {/* --- 4. giornate --- */}
      <p className="corso-sezione">4 · Giornate e moduli</p>
      <p className="sub" style={{ margin: "0 0 10px" }}>
        Una riga per ogni foglio del registro. Ore programmate: <strong>{oreProgrammate}</strong> su {oreTotali}.
        {oreProgrammate !== Number(oreTotali) && " I due numeri non coincidono."}
      </p>
      {sessioni.map((s, i) => (
        <div key={s.key} className="corso-sessione">
          <div className="row-form" style={{ margin: 0 }}>
            <label className="field-label">Data
              <input type="date" value={s.data} onChange={(e) => aggiornaSessione(s.key, "data", e.target.value)} />
            </label>
            <label className="field-label">Dalle
              <input type="time" value={s.oraInizio} onChange={(e) => aggiornaSessione(s.key, "oraInizio", e.target.value)} />
            </label>
            <label className="field-label">Alle
              <input type="time" value={s.oraFine} onChange={(e) => aggiornaSessione(s.key, "oraFine", e.target.value)} />
            </label>
            <label className="field-label">Ore
              <input type="number" min="1" step="0.5" value={s.ore} className="num"
                onChange={(e) => aggiornaSessione(s.key, "ore", e.target.value)} />
            </label>
            <button type="button" className="icon-btn" aria-label="Elimina modulo"
              onClick={() => setSessioni(sessioni.filter((x) => x.key !== s.key))}><Trash2 size={14} /></button>
          </div>
          <div className="row-form" style={{ marginTop: 8 }}>
            <input type="text" value={s.modulo} className="note-input" placeholder={`Titolo del modulo ${i + 1}`}
              onChange={(e) => aggiornaSessione(s.key, "modulo", e.target.value)} />
            <select value={s.docente} onChange={(e) => aggiornaSessione(s.key, "docente", e.target.value)}>
              <option value="">Docente…</option>
              {docenti.map((d) => <option key={d.id} value={d.full_name}>{d.full_name}</option>)}
            </select>
          </div>
          <textarea className="full-input nc-textarea" value={s.argomenti}
            placeholder="Argomenti trattati, uno per riga"
            onChange={(e) => aggiornaSessione(s.key, "argomenti", e.target.value)} style={{ marginTop: 8 }} />
        </div>
      ))}
      <button type="button" className="link-btn" onClick={() => setSessioni([...sessioni, nuovaSessione()])}>
        + Aggiungi una giornata o un modulo
      </button>

      {errore && <p className="corso-avviso"><AlertTriangle size={14} /> {errore}</p>}
      {esito && <p className="corso-esito">{esito}</p>}

      <div className="row-form" style={{ marginTop: 16 }}>
        <button type="button" className="btn-primary" onClick={scarica}>
          <FileDown size={15} /> Scarica il registro presenze
        </button>
        <button type="button" className="link-btn" onClick={salva} disabled={busy}>
          <Save size={14} /> {busy ? "Salvataggio…" : "Salva il corso in archivio"}
        </button>
      </div>
    </div>
  );
}
