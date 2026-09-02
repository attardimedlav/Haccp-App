import React, { useState } from "react";
import { Plus, Trash2, UserPlus, Award, Users, Network, Stethoscope, HeartPulse, Flame, HardHat, ShieldCheck } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import { ROLE_OPTIONS, MEDICO_ROLE, expiryInfo } from "./SicurezzaLavoro";
import { generateNominaAttachment, findRlsName } from "../utils/nominaTemplates";

export const SECURITY_ROLE_OPTIONS = [
  "Dipendente",
  "Datore di Lavoro",
  "RSPP Datore di Lavoro",
  "RSPP Esterno",
  "Addetto al Primo Soccorso",
  "Addetto Antincendio",
  "Preposto",
  "RLS",
];

export default function Organigramma() {
  const { company } = useAuth();
  const { items: employees, add: addEmployee, remove: removeEmployee, loading: employeesLoading } = useTable("employees", company?.id);
  const { items: appointments, add: addAppointment } = useTable("work_safety_appointments", company?.id);
  const { items: trainings } = useTable("work_safety_trainings", company?.id);

  // La validità di un ruolo dipende dall'ultimo corso fatto, non dalla nomina:
  // la nomina di per sé non scade, scade la formazione.
  const roleStatus = (appointmentId) => {
    const withExpiry = trainings.filter((t) => t.appointment_id === appointmentId && t.expiry_date);
    if (withExpiry.length === 0) return null;
    const latest = withExpiry.reduce((best, t) =>
      !best || new Date(t.expiry_date) > new Date(best.expiry_date) ? t : best, null);
    return expiryInfo(latest.expiry_date);
  };

  // --- Nuova persona ---
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [department, setDepartment] = useState("");
  const [securityRole, setSecurityRole] = useState("Dipendente");
  const [personNominaDate, setPersonNominaDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busyPerson, setBusyPerson] = useState(false);

  const submitPerson = async (e) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setBusyPerson(true);
    await addEmployee({
      first_name: firstName,
      last_name: lastName,
      job_role: jobRole || null,
      department: department || null,
      security_role: securityRole,
    });
    if (securityRole !== "Dipendente") {
      const nominaDateToUse = personNominaDate || new Date().toISOString().slice(0, 10);
      // Se esiste un modello per questo ruolo (es. "RSPP Datore di Lavoro"), la
      // nomina viene generata da sola in Word e allegata subito: non blocca il
      // salvataggio se la generazione fallisce, in quel caso resta da allegare a mano.
      const nomina_attachment_path = await generateNominaAttachment({
        role: securityRole,
        company,
        personName: `${firstName} ${lastName}`,
        nominaDate: nominaDateToUse,
        rlsName: findRlsName(appointments),
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

    setFirstName(""); setLastName(""); setJobRole(""); setDepartment(""); setSecurityRole("Dipendente");
    setPersonNominaDate(new Date().toISOString().slice(0, 10));
    setBusyPerson(false);
    setShowAddPerson(false);
  };

  // --- Assegnazione rapida di un ruolo di sicurezza a una persona ---
  const [assigningFor, setAssigningFor] = useState(null);
  const [assignRole, setAssignRole] = useState(ROLE_OPTIONS[0]);
  const [assignIssueDate, setAssignIssueDate] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  const startAssign = (empId) => {
    setAssigningFor(empId);
    setAssignRole(ROLE_OPTIONS[0]);
    setAssignIssueDate(new Date().toISOString().slice(0, 10));
  };

  const submitAssign = async (emp) => {
    if (!assignIssueDate) return;
    setAssignBusy(true);
    const nomina_attachment_path = await generateNominaAttachment({
      role: assignRole,
      company,
      personName: `${emp.first_name} ${emp.last_name}`,
      nominaDate: assignIssueDate,
      rlsName: findRlsName(appointments),
    });
    await addAppointment({
      role: assignRole,
      person_name: `${emp.first_name} ${emp.last_name}`,
      nomina_issue_date: assignIssueDate,
      issue_date: null,
      validity_years: null,
      expiry_date: null,
      nomina_attachment_path,
      attestato_attachment_path: null,
      note: "",
    });
    setAssignBusy(false);
    setAssigningFor(null);
  };

  const rolesFor = (emp) => appointments.filter((a) => a.person_name === `${emp.first_name} ${emp.last_name}`);

  // --- Organigramma da esporre (vista per ruolo, D.Lgs. 81/08) ---
  const [view, setView] = useState("gestione");

  // I nominativi di un ruolo si prendono sia dalle nomine registrate sia dal
  // ruolo di sicurezza in anagrafica: così una persona compare anche se la sua
  // nomina non è ancora stata protocollata in "Nomine e Attestati".
  const namesFor = (roles) => {
    const wanted = new Set(Array.isArray(roles) ? roles : [roles]);
    const fromAppointments = appointments
      .filter((a) => wanted.has(a.role))
      .map((a) => (a.person_name || "").trim());
    const fromEmployees = employees
      .filter((e) => wanted.has(e.security_role))
      .map((e) => `${e.first_name} ${e.last_name}`.trim());
    return [...new Set([...fromAppointments, ...fromEmployees])].filter(Boolean);
  };

  const datoreLavoro = namesFor(["Datore di Lavoro", "RSPP Datore di Lavoro"]);
  const rspp = namesFor(["RSPP Datore di Lavoro", "RSPP Esterno"]);
  const medicoCompetente = namesFor(["Nomina Medico Competente"]);
  const primoSoccorso = namesFor(["Addetto al Primo Soccorso"]);
  const rls = namesFor(["RLS"]);
  const antincendio = namesFor(["Addetto Antincendio"]);
  const preposti = namesFor(["Preposto"]);
  // Tutte le persone in organigramma sono lavoratori, tranne il datore di lavoro.
  const lavoratori = employees
    .map((e) => `${e.first_name} ${e.last_name}`.trim())
    .filter((n) => !datoreLavoro.includes(n));

  // emptyLabel: i ruoli scoperti vanno segnalati in rosso ("Da nominare"),
  // ma per i lavoratori una casella vuota non è un'inadempienza.
  const OrgBox = ({ icon: Icon, title, note, names, tone, emptyLabel, emptyMuted }) => (
    <div className={"org-box org-box-" + tone}>
      <p className="org-box-title"><Icon size={15} /> {title}</p>
      {note && <p className="org-box-note">{note}</p>}
      {names.length > 0 ? (
        <ul className="org-names">
          {names.map((n) => <li key={n}>{n}</li>)}
        </ul>
      ) : (
        <p className={"org-empty" + (emptyMuted ? " org-empty-muted" : "")}>
          {emptyLabel || "Da nominare"}
        </p>
      )}
    </div>
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Organigramma</h2>
          <p className="sub">
            Punto di partenza per una nuova azienda: inserisci qui tutte le persone e assegna subito i loro ruoli di sicurezza
            (RSPP, RLS, addetti...). Ogni assegnazione compare automaticamente anche in "Nomine e Attestati" — è la stessa
            informazione, solo vista per persona invece che in ordine cronologico.
          </p>
        </div>
      </div>

      <div className="config-subtabs">
        <button
          type="button"
          className={"config-subtab" + (view === "gestione" ? " active" : "")}
          onClick={() => setView("gestione")}
        >
          <Users size={15} /> Gestione persone
        </button>
        <button
          type="button"
          className={"config-subtab" + (view === "schema" ? " active" : "")}
          onClick={() => setView("schema")}
        >
          <Network size={15} /> Organigramma da esporre
        </button>
      </div>

      {view === "schema" && (
        <div className="org-chart">
          <div className="org-chart-head">
            <h3>{company?.name || "Azienda"}</h3>
            {(company?.sede_legale || company?.sede_operativa) && (
              <p className="org-sede">
                Sede legale ed operativa: {company.sede_legale || company.sede_operativa}
              </p>
            )}
            <p className="org-intro">
              Organigramma delle risorse che a vari livelli sono coinvolte funzionalmente
              secondo le disposizioni contenute nel D.Lgs. 81/08.
            </p>
          </div>

          <div className="org-top">
            <p className="org-box-title"><ShieldCheck size={15} /> DATORE DI LAVORO / LEGALE RAPPRESENTANTE</p>
            {datoreLavoro.length > 0 ? (
              <ul className="org-names">
                {datoreLavoro.map((n) => <li key={n}>{n}</li>)}
              </ul>
            ) : (
              <p className="org-empty">Da nominare</p>
            )}
          </div>

          <div className="org-row org-row-2">
            <OrgBox icon={Award} tone="rspp" names={rspp}
              title="RESPONSABILE DEL SERVIZIO DI PREVENZIONE E PROTEZIONE (RSPP)" />
            <OrgBox icon={Stethoscope} tone="medico" names={medicoCompetente}
              title="MEDICO COMPETENTE" />
          </div>

          <div className="org-row org-row-3">
            <OrgBox icon={HeartPulse} tone="soccorso" names={primoSoccorso}
              title="ADDETTI AL PRIMO SOCCORSO" />
            <OrgBox icon={Users} tone="rls" names={rls}
              title="RAPPRESENTANTE DEI LAVORATORI PER LA SICUREZZA (RLS)" />
            <OrgBox icon={Flame} tone="antincendio" names={antincendio}
              title="ADDETTI ALLA PREVENZIONE INCENDI" />
          </div>

          <div className="org-row org-row-2">
            <OrgBox icon={HardHat} tone="neutro" names={preposti}
              title="PREPOSTI" note="art. 37 D.Lgs. 81/08" />
            <OrgBox icon={Users} tone="neutro" names={lavoratori}
              title="LAVORATORI" note="art. 37 D.Lgs. 81/08"
              emptyLabel="Nessun lavoratore inserito" emptyMuted />
          </div>

          <p className="org-foot">
            Documento esposto ai sensi del D.Lgs. 81/08 — valido per lavoratori, visitatori e pubblico
          </p>
          <p className="sub org-hint">
            Si compila da solo con le persone e i ruoli inseriti in "Gestione persone".
            Per stamparlo o salvarlo in PDF usa "Esporta PDF" in alto a destra.
          </p>
        </div>
      )}

      {view === "gestione" && (
      <>
      <button type="button" className="btn-primary" onClick={() => setShowAddPerson((v) => !v)} style={{ marginBottom: 16 }}>
        <UserPlus size={16} /> Aggiungi persona
      </button>

      {showAddPerson && (
        <form onSubmit={submitPerson} className="traccia-form" style={{ marginBottom: 20 }}>
          <div className="row-form">
            <input type="text" placeholder="Nome" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="note-input" />
            <input type="text" placeholder="Cognome" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="note-input" />
          </div>
          <div className="row-form">
            <input type="text" placeholder="Mansione (opzionale)" value={jobRole} onChange={(e) => setJobRole(e.target.value)} className="note-input" />
            <input type="text" placeholder="Reparto (opzionale)" value={department} onChange={(e) => setDepartment(e.target.value)} className="note-input" />
          </div>
          <label className="field-label">Ruolo di sicurezza
            <select value={securityRole} onChange={(e) => setSecurityRole(e.target.value)}>
              {SECURITY_ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {securityRole !== "Dipendente" && (
            <>
              <label className="field-label">Data nomina
                <input type="date" value={personNominaDate} onChange={(e) => setPersonNominaDate(e.target.value)} />
              </label>
              <p className="sub" style={{ marginTop: -6 }}>
                Verrà creata automaticamente anche la relativa nomina in "Nomine e Attestati", con questa data
                (utile per registrare nomine già fatte in passato, non solo quelle di oggi).
              </p>
            </>
          )}
          <button type="submit" className="btn-primary" disabled={busyPerson || (securityRole !== "Dipendente" && !personNominaDate)} style={{ alignSelf: "flex-start" }}>
            <Plus size={16} /> Salva persona
          </button>
        </form>
      )}

      {employeesLoading ? (
        <p className="sub">Caricamento…</p>
      ) : employees.length === 0 ? (
        <div className="empty"><p>Nessuna persona in organigramma. Aggiungine una per iniziare.</p></div>
      ) : (
        <ul className="dish-list">
          {employees.map((emp) => {
            const roles = rolesFor(emp);
            return (
              <li key={emp.id} className="dish-row">
                <div className="dish-top">
                  <div>
                    <strong>{emp.first_name} {emp.last_name}</strong>
                    {emp.job_role && <span className="lot-tag">{emp.job_role}</span>}
                  </div>
                  <button className="icon-btn" onClick={() => removeEmployee(emp.id)} aria-label="Elimina persona"><Trash2 size={14} /></button>
                </div>

                {roles.length > 0 && (
                  <div className="chip-grid" style={{ margin: "8px 0" }}>
                    {roles.map((r) => {
                      const info = roleStatus(r.id);
                      return (
                        <span key={r.id} className={"pill " + (info ? info.cls : "pill-ok")}>
                          <Award size={12} /> {r.role}
                        </span>
                      );
                    })}
                  </div>
                )}

                {assigningFor === emp.id ? (
                  <div className="nc-edit-block">
                    <div className="row-form">
                      <select value={assignRole} onChange={(e) => setAssignRole(e.target.value)}>
                        {/* Il medico competente non è un dipendente a cui si assegna un ruolo:
                            si nomina dalla scheda Visite Mediche. */}
                        {ROLE_OPTIONS.filter((r) => r !== MEDICO_ROLE).map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <label className="field-label">Data nomina
                        <input type="date" value={assignIssueDate} onChange={(e) => setAssignIssueDate(e.target.value)} />
                      </label>
                    </div>
                    <p className="sub" style={{ margin: "6px 0" }}>Il corso di formazione (con la sua scadenza) si aggiunge poi da "Nomine e Attestati".</p>
                    <div className="row-form" style={{ margin: "8px 0" }}>
                      <button type="button" className="btn-primary" onClick={() => submitAssign(emp)} disabled={assignBusy || !assignIssueDate}>
                        <Plus size={14} /> Assegna
                      </button>
                      <button type="button" className="link-btn" onClick={() => setAssigningFor(null)}>Annulla</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="link-btn" onClick={() => startAssign(emp.id)}>
                    + Assegna ruolo di sicurezza
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </>
      )}
    </div>
  );
}
