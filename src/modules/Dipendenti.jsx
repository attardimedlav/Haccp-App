import React, { useState } from "react";
import { Plus, Trash2, User, Pencil, Check, X } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import { SECURITY_ROLE_OPTIONS } from "./Organigramma";
import { generateNominaAttachment, findRlsName, findDatoreName } from "../utils/nominaTemplates";

// Verifica di un codice fiscale. NON lo genera: il codice fiscale vero lo
// assegna l'Agenzia delle Entrate e, nei casi di omocodia, sostituisce cifre
// con lettere, quindi un codice calcolato sarebbe una proposta e non una
// fonte. Qui si controlla soltanto quello che l'utente ha scritto, che e'
// dove nascono gli errori: una lettera battuta due volte, o il codice di
// un'altra persona incollato per sbaglio.
//
// Il carattere di controllo funziona anche sui codici omocodici, perche' si
// calcola sul codice cosi' com'e', lettere comprese.

const DISPARI = {
  "0":1,"1":0,"2":5,"3":7,"4":9,"5":13,"6":15,"7":17,"8":19,"9":21,
  A:1,B:0,C:5,D:7,E:9,F:13,G:15,H:17,I:19,J:21,K:2,L:4,M:18,N:20,
  O:11,P:3,Q:6,R:8,S:12,T:14,U:16,V:10,W:22,X:25,Y:24,Z:23,
};
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const VOCALI = "AEIOU";

function pari(c) {
  return c >= "0" && c <= "9" ? c.charCodeAt(0) - 48 : ALFABETO.indexOf(c);
}

// Via accenti, apostrofi, spazi e trattini: "BORZI'" -> BORZI, "D'URSO" ->
// DURSO, "LO PRESTI" -> LOPRESTI. E' cosi' che si formano le prime sei lettere.
function soloLettere(s) {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z]/g, "");
}

function terna(testo, isNome) {
  const t = soloLettere(testo);
  const cons = [...t].filter((c) => !VOCALI.includes(c));
  const voc = [...t].filter((c) => VOCALI.includes(c));
  // Nel nome, se le consonanti sono almeno quattro si prendono la prima, la
  // terza e la quarta. Nel cognome sempre le prime tre.
  const scelte = isNome && cons.length >= 4 ? [cons[0], cons[2], cons[3]] : cons.slice(0, 3);
  return (scelte.join("") + voc.join("") + "XXX").slice(0, 3);
}

function caratteroControllo(primi15) {
  let tot = 0;
  for (let i = 0; i < 15; i++) {
    const c = primi15[i];
    tot += i % 2 === 0 ? DISPARI[c] : pari(c);
  }
  return ALFABETO[tot % 26];
}

// Ritorna { livello: "ok" | "avviso" | "errore" | "", messaggio }
// "errore"  = il codice non puo' essere giusto (lunghezza o carattere di controllo)
// "avviso"  = il codice e' formalmente valido ma non sembra di questa persona
function verificaCf(cf, nome, cognome) {
  const v = String(cf || "").toUpperCase().replace(/\s/g, "");
  if (!v) return { livello: "", messaggio: "" };

  // Ai soggetti non residenti l'Agenzia assegna un codice numerico di 11
  // cifre: e' legittimo e non si verifica con questo algoritmo.
  if (/^\d{11}$/.test(v)) {
    return { livello: "ok", messaggio: "Codice numerico a 11 cifre da soggetto non residente: non verificabile." };
  }

  if (v.length !== 16) {
    return { livello: "errore", messaggio: `Sono ${v.length} caratteri invece di 16.` };
  }
  if (!/^[A-Z0-9]{16}$/.test(v)) {
    return { livello: "errore", messaggio: "Contiene caratteri non ammessi." };
  }

  const atteso = caratteroControllo(v.slice(0, 15));
  if (atteso !== v[15]) {
    return {
      livello: "errore",
      messaggio: `Carattere di controllo errato: l'ultima lettera dovrebbe essere ${atteso}, non ${v[15]}. Quasi sempre e' un carattere sbagliato o di troppo nel resto del codice.`,
    };
  }

  if (soloLettere(cognome) && soloLettere(nome)) {
    const attesoCognome = terna(cognome, false);
    const attesoNome = terna(nome, true);
    if (v.slice(0, 3) !== attesoCognome || v.slice(3, 6) !== attesoNome) {
      return {
        livello: "avviso",
        messaggio: `Il codice e' formalmente valido, ma le prime sei lettere (${v.slice(0, 6)}) non corrispondono a ${cognome} ${nome}: dovrebbero essere ${attesoCognome}${attesoNome}. Controlla che sia la persona giusta, oppure che il cognome in anagrafica sia quello di nascita.`,
      };
    }
  }

  return { livello: "ok", messaggio: "Codice fiscale valido." };
}

// --- Rinomina di una persona -------------------------------------------------
//
// In Cardine una persona non ha una chiave: nomine, visite mediche e corsi
// HACCP sono collegati all'anagrafica confrontando nome e cognome come
// stringa. Cambiare il nome solo qui in "Dipendenti" quindi non rinomina la
// persona, la sdoppia: le sue visite e i suoi attestati restano attaccati al
// nome vecchio e spariscono dalla sua scheda.
//
// work_safety_trainings non compare in questo elenco di proposito: gli
// attestati sono legati alla nomina per appointment_id, quindi seguono da soli.
const TABELLE_COLLEGATE = [
  { table: "work_safety_appointments", column: "person_name", label: "nomine e attestati di sicurezza" },
  { table: "medical_visits", column: "employee_name", label: "visite mediche" },
  { table: "training_records", column: "employee_name", label: "corsi HACCP" },
];

// Stessa normalizzazione degli spazi che useTable applica in scrittura: uno
// spazio invisibile in coda spezza il collegamento senza dare nessun errore.
function pulisci(s) {
  return String(s || "").trim().replace(/[ \t]+/g, " ");
}

function nomeCompleto(nome, cognome) {
  return `${pulisci(nome)} ${pulisci(cognome)}`.trim();
}

// Quante righe sono agganciate a questo nome. Si conta sui dati gia' caricati
// in pagina, cosi' il numero si puo' mostrare prima di salvare.
function conteggioCollegamenti(nome, { nomine = [], visite = [], corsiHaccp = [] }) {
  const n = pulisci(nome);
  return {
    nomine: nomine.filter((r) => pulisci(r.person_name) === n).length,
    visite: visite.filter((r) => pulisci(r.employee_name) === n).length,
    corsiHaccp: corsiHaccp.filter((r) => pulisci(r.employee_name) === n).length,
  };
}

async function spostaCollegamenti(companyId, da, a, soloQueste) {
  const elenco = soloQueste || TABELLE_COLLEGATE;
  const fatte = [];
  for (const t of elenco) {
    const { error } = await supabase
      .from(t.table)
      .update({ [t.column]: a })
      .eq("company_id", companyId)
      .eq(t.column, da);
    if (error) return { ok: false, errore: `${t.label}: ${error.message}`, fatte };
    fatte.push(t);
  }
  return { ok: true, fatte };
}

// Ordine voluto: prima si spostano i collegamenti, poi si cambia l'anagrafica.
// Se il primo passo fallisce non e' stato toccato niente. Se fallisce il
// secondo, i collegamenti tornano com'erano: meglio un salvataggio non
// riuscito che una persona spezzata in due.
async function rinominaPersona({ companyId, employeeId, nomeVecchio, nome, cognome, altriCampi = {} }) {
  const nuovo = nomeCompleto(nome, cognome);
  const vecchio = pulisci(nomeVecchio);
  if (!pulisci(nome) || !pulisci(cognome)) {
    return { ok: false, errore: "Nome e cognome non possono restare vuoti." };
  }

  const cambiaNome = nuovo !== vecchio;
  let spostati = { ok: true, fatte: [] };

  if (cambiaNome) {
    spostati = await spostaCollegamenti(companyId, vecchio, nuovo);
    if (!spostati.ok) return { ok: false, errore: spostati.errore };
  }

  const { error } = await supabase
    .from("employees")
    .update({ first_name: pulisci(nome), last_name: pulisci(cognome), ...altriCampi })
    .eq("id", employeeId)
    .eq("company_id", companyId);

  if (error) {
    if (cambiaNome) await spostaCollegamenti(companyId, nuovo, vecchio, spostati.fatte);
    return { ok: false, errore: error.message };
  }

  return { ok: true, nuovo, cambiaNome };
}

export default function Dipendenti() {
  const { company } = useAuth();
  const { items, add, remove, loading, reload } = useTable("employees", company?.id);
  const { items: appointments, add: addAppointment, reload: reloadAppointments } = useTable("work_safety_appointments", company?.id);
  // Servono solo per contare i collegamenti prima di rinominare una persona.
  const { items: medicalVisits, reload: reloadVisits } = useTable("medical_visits", company?.id);
  const { items: trainingRecords, reload: reloadCorsi } = useTable("training_records", company?.id);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [department, setDepartment] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [securityRole, setSecurityRole] = useState("Dipendente");
  const [nominaDate, setNominaDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  // --- Modifica di una persona gia' in elenco ---
  const [editId, setEditId] = useState(null);
  const [eNome, setENome] = useState("");
  const [eCognome, setECognome] = useState("");
  const [eCf, setECf] = useState("");
  const [eMansione, setEMansione] = useState("");
  const [eReparto, setEReparto] = useState("");
  const [eBusy, setEBusy] = useState(false);
  const [eErr, setEErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setBusy(true);
    await add({
      first_name: firstName,
      last_name: lastName,
      tax_code: taxCode ? taxCode.toUpperCase() : null,
      job_role: jobRole || null,
      department: department || null,
      hire_date: hireDate || null,
      security_role: securityRole,
    });

    if (securityRole !== "Dipendente") {
      const nominaDateToUse = nominaDate || new Date().toISOString().slice(0, 10);
      // Se esiste un modello per questo ruolo (es. "RSPP Datore di Lavoro"), la
      // nomina viene generata da sola in Word e allegata subito: non blocca il
      // salvataggio se la generazione fallisce, in quel caso resta da allegare a mano.
      const nomina_attachment_path = await generateNominaAttachment({
        role: securityRole,
        company,
        personName: `${firstName} ${lastName}`,
        nominaDate: nominaDateToUse,
        rlsName: findRlsName(appointments),
        datoreName: findDatoreName(appointments, items),
      });
      await addAppointment({
        role: securityRole,
        person_name: `${firstName} ${lastName}`,
        nomina_issue_date: nominaDateToUse,
        issue_date: null,
        validity_years: null,
        expiry_date: null,
        nomina_attachment_path,
        attestato_attachment_path: null,
        note: "",
      });
    }

    // Avviso email al consulente: non blocca il salvataggio se fallisce, è solo un promemoria.
    try {
      const { data, error: fnError } = await supabase.functions.invoke("rapid-endpoint", {
        body: { company_id: company.id, first_name: firstName, last_name: lastName, job_role: jobRole || null },
      });
      if (fnError) console.error("Notifica nuovo dipendente - errore dalla function:", fnError);
      else console.log("Notifica nuovo dipendente - risposta:", data);
    } catch (err) {
      console.error("Notifica nuovo dipendente non inviata:", err);
    }

    setFirstName(""); setLastName(""); setTaxCode(""); setJobRole(""); setDepartment(""); setHireDate(""); setSecurityRole("Dipendente");
    setNominaDate(new Date().toISOString().slice(0, 10));
    setBusy(false);
  };

  // Il controllo gira mentre si scrive: gli errori si vedono quando si e'
  // ancora davanti al documento da cui si sta copiando, non un mese dopo.
  const cfNuovo = verificaCf(taxCode, firstName, lastName);
  const cfModifica = verificaCf(eCf, eNome, eCognome);

  const apriModifica = (emp) => {
    setEditId(emp.id);
    setENome(emp.first_name || "");
    setECognome(emp.last_name || "");
    setECf(emp.tax_code || "");
    setEMansione(emp.job_role || "");
    setEReparto(emp.department || "");
    setEErr("");
  };

  const chiudiModifica = () => { setEditId(null); setEErr(""); };

  const salvaModifica = async (emp) => {
    const vecchio = nomeCompleto(emp.first_name, emp.last_name);
    const nuovo = nomeCompleto(eNome, eCognome);
    if (!nuovo) { setEErr("Nome e cognome non possono restare vuoti."); return; }

    // Se il nome nuovo e' gia' di un'altra persona, rinominare unirebbe le due
    // posizioni senza dare errore: visite e attestati finirebbero mescolati.
    const collisione = items.some(
      (x) => x.id !== emp.id && nomeCompleto(x.first_name, x.last_name) === nuovo
    );
    if (collisione) {
      setEErr(`In elenco c'e' gia' ${nuovo}. Due persone non possono avere lo stesso nome: le loro visite e i loro attestati si mescolerebbero.`);
      return;
    }

    setEBusy(true);
    const esito = await rinominaPersona({
      companyId: company.id,
      employeeId: emp.id,
      nomeVecchio: vecchio,
      nome: eNome,
      cognome: eCognome,
      altriCampi: {
        tax_code: pulisci(eCf).toUpperCase() || null,
        job_role: pulisci(eMansione) || null,
        department: pulisci(eReparto) || null,
      },
    });
    setEBusy(false);

    if (!esito.ok) { setEErr(esito.errore); return; }
    await Promise.all([reload(), reloadAppointments(), reloadVisits(), reloadCorsi()]);
    chiudiModifica();
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Dipendenti</h2>
          <p className="sub">Anagrafica del personale, riusata nei menu a tendina delle schede che richiedono un nominativo (es. Sicurezza sul lavoro). Ogni nuovo inserimento avvisa via email il consulente.</p>
        </div>
      </div>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form">
          <input type="text" placeholder="Nome" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="note-input" />
          <input type="text" placeholder="Cognome" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="note-input" />
          <input type="text" placeholder="Codice fiscale (opzionale)" value={taxCode}
            onChange={(e) => setTaxCode(e.target.value.toUpperCase())} maxLength={16}
            className="note-input" style={{ textTransform: "uppercase" }} />
        </div>
        {cfNuovo.livello && (
          <p className={"cf-esito cf-" + cfNuovo.livello}>{cfNuovo.messaggio}</p>
        )}
        <div className="row-form">
          <input type="text" placeholder="Mansione (opzionale)" value={jobRole} onChange={(e) => setJobRole(e.target.value)} className="note-input" />
          <input type="text" placeholder="Reparto (opzionale)" value={department} onChange={(e) => setDepartment(e.target.value)} className="note-input" />
          <label className="field-label">Data assunzione (opzionale)
            <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
          </label>
        </div>
        <label className="field-label">Ruolo di sicurezza
          <select value={securityRole} onChange={(e) => setSecurityRole(e.target.value)}>
            {SECURITY_ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        {securityRole !== "Dipendente" && (
          <>
            <label className="field-label">Data nomina
              <input type="date" value={nominaDate} onChange={(e) => setNominaDate(e.target.value)} />
            </label>
            <p className="sub" style={{ marginTop: -6 }}>
              Verrà creata automaticamente anche la relativa nomina in "Sicurezza sul lavoro → Nomine e Attestati", con questa data
              (utile per registrare nomine già fatte in passato, non solo quelle di oggi).
            </p>
          </>
        )}
        <button type="submit" className="btn-primary" disabled={busy || (securityRole !== "Dipendente" && !nominaDate)} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> Aggiungi dipendente
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun dipendente registrato. Aggiungine uno per iniziare a usarlo nelle altre sezioni.</p></div>
      ) : (
        <ul className="log-list">
          {items.map((item) => {
            const inModifica = editId === item.id;
            const legami = inModifica
              ? conteggioCollegamenti(nomeCompleto(item.first_name, item.last_name),
                  { nomine: appointments, visite: medicalVisits, corsiHaccp: trainingRecords })
              : null;
            const totaleLegami = legami ? legami.nomine + legami.visite + legami.corsiHaccp : 0;
            const cambiaNome = inModifica
              && nomeCompleto(eNome, eCognome) !== nomeCompleto(item.first_name, item.last_name);

            return (
              <li key={item.id} className={"log-row" + (inModifica ? " editing log-row-wrap" : "")}>
                <User size={15} color="#2F6F4E" />
                {inModifica ? (
                  <>
                    <input type="text" value={eNome} onChange={(e) => setENome(e.target.value)}
                      className="note-input edit-input" placeholder="Nome" aria-label="Nome" />
                    <input type="text" value={eCognome} onChange={(e) => setECognome(e.target.value)}
                      className="note-input edit-input" placeholder="Cognome" aria-label="Cognome" />
                    <input type="text" value={eCf} onChange={(e) => setECf(e.target.value.toUpperCase())}
                      maxLength={16} className="note-input edit-input" placeholder="Codice fiscale"
                      aria-label="Codice fiscale" style={{ textTransform: "uppercase" }} />
                    <input type="text" value={eMansione} onChange={(e) => setEMansione(e.target.value)}
                      className="note-input edit-input" placeholder="Mansione" aria-label="Mansione" />
                    <input type="text" value={eReparto} onChange={(e) => setEReparto(e.target.value)}
                      className="note-input edit-input" placeholder="Reparto" aria-label="Reparto" />
                    <button className="icon-btn icon-btn-ok" onClick={() => salvaModifica(item)}
                      disabled={eBusy} aria-label="Salva"><Check size={15} /></button>
                    <button className="icon-btn" onClick={chiudiModifica} disabled={eBusy}
                      aria-label="Annulla"><X size={15} /></button>
                    <p className="dip-edit-note">
                      {eBusy
                        ? "Salvataggio in corso…"
                        : cambiaNome
                          ? (totaleLegami > 0
                              ? `Salvando, insieme al nome si spostano i suoi collegamenti — nomine e attestati di sicurezza: ${legami.nomine} · visite mediche: ${legami.visite} · corsi HACCP: ${legami.corsiHaccp} — così restano attaccati alla persona.`
                              : "Questa persona non ha ancora nomine, visite o corsi collegati.")
                          : "Le persone sono collegate a nomine, visite e corsi tramite nome e cognome: cambiandoli, i collegamenti vengono spostati insieme."}
                    </p>
                    {cfModifica.livello && cfModifica.livello !== "ok" && (
                      <p className={"cf-esito cf-" + cfModifica.livello}>{cfModifica.messaggio}</p>
                    )}
                    {eErr && <p className="dip-edit-err">{eErr}</p>}
                  </>
                ) : (
                  <>
                    <span className="log-main"><strong>{item.first_name} {item.last_name}</strong></span>
                    {item.tax_code
                      ? (() => {
                          const v = verificaCf(item.tax_code, item.first_name, item.last_name);
                          return (
                            <span className={"log-cf" + (v.livello === "errore" || v.livello === "avviso" ? " log-cf-dubbio" : "")}
                              title={v.messaggio}>
                              {item.tax_code}
                            </span>
                          );
                        })()
                      : <span className="log-cf log-cf-manca">codice fiscale mancante</span>}
                    {item.job_role && <span className="log-unit">{item.job_role}</span>}
                    {item.department && <span className="log-note">{item.department}</span>}
                    <button className="icon-btn" onClick={() => apriModifica(item)}
                      aria-label="Modifica nome e mansione"><Pencil size={14} /></button>
                    <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
