import React, { useState } from "react";
import { Plus, Trash2, User } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import { SECURITY_ROLE_OPTIONS } from "./Organigramma";
import { generateNominaAttachment, findRlsName, findDatoreName } from "../utils/nominaTemplates";

export default function Dipendenti() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("employees", company?.id);
  const { items: appointments, add: addAppointment } = useTable("work_safety_appointments", company?.id);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [department, setDepartment] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [securityRole, setSecurityRole] = useState("Dipendente");
  const [nominaDate, setNominaDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

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
          {items.map((item) => (
            <li key={item.id} className="log-row">
              <User size={15} color="#2F6F4E" />
              <span className="log-main"><strong>{item.first_name} {item.last_name}</strong></span>
              {item.job_role && <span className="log-unit">{item.job_role}</span>}
              {item.department && <span className="log-note">{item.department}</span>}
              <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
