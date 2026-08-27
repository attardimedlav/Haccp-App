import React, { useState } from "react";
import { Plus, Trash2, UserPlus, Award } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import { ROLE_OPTIONS, expiryInfo } from "./SicurezzaLavoro";

export const SECURITY_ROLE_OPTIONS = [
  "Dipendente",
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

  // --- Nuova persona ---
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [department, setDepartment] = useState("");
  const [securityRole, setSecurityRole] = useState("Dipendente");
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
      const todayStr = new Date().toISOString().slice(0, 10);
      await addAppointment({
        role: securityRole,
        person_name: `${firstName} ${lastName}`,
        nomina_issue_date: todayStr,
        issue_date: null,
        validity_years: null,
        expiry_date: null,
        nomina_attachment_path: null,
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
    await addAppointment({
      role: assignRole,
      person_name: `${emp.first_name} ${emp.last_name}`,
      nomina_issue_date: assignIssueDate,
      issue_date: null,
      validity_years: null,
      expiry_date: null,
      nomina_attachment_path: null,
      attestato_attachment_path: null,
      note: "",
    });
    setAssignBusy(false);
    setAssigningFor(null);
  };

  const rolesFor = (emp) => appointments.filter((a) => a.person_name === `${emp.first_name} ${emp.last_name}`);

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
            <p className="sub" style={{ marginTop: -6 }}>
              Verrà creata automaticamente anche la relativa nomina in "Nomine e Attestati", con data di oggi.
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={busyPerson} style={{ alignSelf: "flex-start" }}>
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
                      const info = expiryInfo(r.expiry_date);
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
                        {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
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
    </div>
  );
}
