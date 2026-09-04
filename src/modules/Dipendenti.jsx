import React, { useState } from "react";
import { Plus, Trash2, User, Pencil, Check, X } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import { SECURITY_ROLE_OPTIONS } from "./Organigramma";
import { generateNominaAttachment, findRlsName, findDatoreName } from "../utils/nominaTemplates";
import { rinominaPersona, nomeCompleto, conteggioCollegamenti, pulisci } from "../utils/rinominaPersona";

export default function Dipendenti() {
  const { company } = useAuth();
  const { items, add, remove, loading, reload } = useTable("employees", company?.id);
  const { items: appointments, add: addAppointment, reload: reloadAppointments } = useTable("work_safety_appointments", company?.id);
  // Servono solo per contare i collegamenti prima di rinominare una persona.
  const { items: medicalVisits, reload: reloadVisits } = useTable("medical_visits", company?.id);
  const { items: trainingRecords, reload: reloadCorsi } = useTable("training_records", company?.id);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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

    setFirstName(""); setLastName(""); setJobRole(""); setDepartment(""); setHireDate(""); setSecurityRole("Dipendente");
    setNominaDate(new Date().toISOString().slice(0, 10));
    setBusy(false);
  };

  const apriModifica = (emp) => {
    setEditId(emp.id);
    setENome(emp.first_name || "");
    setECognome(emp.last_name || "");
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
      altriCampi: { job_role: pulisci(eMansione) || null, department: pulisci(eReparto) || null },
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
        </div>
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
                    {eErr && <p className="dip-edit-err">{eErr}</p>}
                  </>
                ) : (
                  <>
                    <span className="log-main"><strong>{item.first_name} {item.last_name}</strong></span>
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
