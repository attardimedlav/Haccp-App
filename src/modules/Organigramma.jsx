import React, { useState } from "react";
import { Plus, Trash2, UserPlus, Award } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { ROLE_OPTIONS, expiryInfo, addYears } from "./SicurezzaLavoro";

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
  const [busyPerson, setBusyPerson] = useState(false);

  const submitPerson = async (e) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setBusyPerson(true);
    await addEmployee({ first_name: firstName, last_name: lastName, job_role: jobRole || null, department: department || null });
    setFirstName(""); setLastName(""); setJobRole(""); setDepartment("");
    setBusyPerson(false);
    setShowAddPerson(false);
  };

  // --- Assegnazione rapida di un ruolo di sicurezza a una persona ---
  const [assigningFor, setAssigningFor] = useState(null);
  const [assignRole, setAssignRole] = useState(ROLE_OPTIONS[0]);
  const [assignIssueDate, setAssignIssueDate] = useState("");
  const [assignYears, setAssignYears] = useState("");
  const [assignExpiry, setAssignExpiry] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  const startAssign = (empId) => {
    setAssigningFor(empId);
    setAssignRole(ROLE_OPTIONS[0]);
    setAssignIssueDate(new Date().toISOString().slice(0, 10));
    setAssignYears("");
    setAssignExpiry("");
  };

  const handleAssignIssueChange = (value) => {
    setAssignIssueDate(value);
    if (assignYears) setAssignExpiry(addYears(value, assignYears));
  };
  const handleAssignYearsChange = (value) => {
    setAssignYears(value);
    if (assignIssueDate) setAssignExpiry(addYears(assignIssueDate, value));
  };

  const submitAssign = async (emp) => {
    if (!assignIssueDate) return;
    setAssignBusy(true);
    await addAppointment({
      role: assignRole,
      person_name: `${emp.first_name} ${emp.last_name}`,
      issue_date: assignIssueDate,
      validity_years: assignYears === "" ? null : Number(assignYears),
      expiry_date: assignExpiry || null,
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
                      <label className="field-label">Data rilascio
                        <input type="date" value={assignIssueDate} onChange={(e) => handleAssignIssueChange(e.target.value)} />
                      </label>
                      <label className="field-label">Anni validità (opzionale)
                        <input type="number" min="0" step="1" placeholder="es. 5" value={assignYears} onChange={(e) => handleAssignYearsChange(e.target.value)} className="num" />
                      </label>
                    </div>
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
