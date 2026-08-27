import React, { useState } from "react";
import { Plus, Trash2, Paperclip, FileText, Download, AlertTriangle, Award, HardHat, Wrench, Stethoscope, Network, Pencil, X, Check } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";
import Organigramma from "./Organigramma";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export const ROLE_OPTIONS = [
  "RSPP Datore di Lavoro",
  "RSPP Esterno",
  "Nomina Medico Competente",
  "Addetto al Primo Soccorso",
  "Addetto Antincendio",
  "Preposto",
  "RLS",
  "Consegna DPI",
  "Formazione Generale e Specifica Lavoratori",
  "Altro",
];

export const ALLEGATO_TYPE_OPTIONS = [
  "Planimetria",
  "Verbale riunione periodica",
  "Verbale di sopralluogo del medico competente",
  "Altro",
];

export const EQUIPMENT_TYPE_OPTIONS = [
  "Patentino Carrelli Elevatori (Muletto)",
  "Patentino Piattaforme Aeree (PLE)",
  "Patentino Gru / Mezzi Agricoli",
  "Verifica Periodica Impianto di Terra (D.P.R. 462/01)",
  "Manutenzione / Controllo Periodico Attrezzatura",
  "Altro",
];

const ORGANIGRAMMA_SUB_TAB = { id: "organigramma", label: "Organigramma", icon: Network };

const BASE_SUB_TABS = [
  { id: "dvr", label: "DVR", icon: FileText },
  { id: "allegati", label: "Allegati al DVR", icon: Paperclip },
  { id: "nomine", label: "Nomine e Attestati", icon: Award },
];

const EQUIPMENT_SUB_TAB = { id: "attrezzature", label: "Attrezzature", icon: Wrench };
const MEDICAL_SUB_TAB = { id: "visitemediche", label: "Visite Mediche", icon: Stethoscope };

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function addYears(dateStr, years) {
  if (!dateStr || !years) return "";
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + Number(years));
  return d.toISOString().slice(0, 10);
}

export function expiryInfo(expiryDate) {
  if (!expiryDate) return null;
  const end = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((end - today) / 86400000);
  const dateLabel = fmtDate(expiryDate);
  if (diffDays < 0) return { label: `Scaduto il ${dateLabel}`, cls: "pill-alert" };
  if (diffDays <= 60) return { label: `Scade il ${dateLabel} (tra ${diffDays}g)`, cls: "pill-warn" };
  return { label: `Valido fino al ${dateLabel}`, cls: "pill-ok" };
}

function AttachmentLink({ path }) {
  const [url, setUrl] = useState(null);
  if (!path) return <span className="none-label">Nessun file allegato</span>;
  if (!url) { getAttachmentUrl(path).then(setUrl); return <span className="none-label">Caricamento allegato…</span>; }
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} /><span className="attachment-name">{path.split("/").pop()}</span><Download size={14} />
    </a>
  );
}

export default function SicurezzaLavoro({ subTab, setSubTab }) {
  const { company } = useAuth();
  const { items: dvrDocs, add: addDvrDoc, remove: removeDvrDoc, loading: dvrLoading } = useTable("dvr_documents", company?.id);
  const { items: appointments, add: addAppointment, remove: removeAppointment, update: updateAppointment, loading: appointmentsLoading } = useTable("work_safety_appointments", company?.id);
  const { items: equipmentChecks, add: addEquipmentCheck, remove: removeEquipmentCheck, loading: equipmentLoading } = useTable("equipment_checks", company?.id);
  const { items: medicalVisits, add: addMedicalVisit, remove: removeMedicalVisit, loading: medicalLoading } = useTable("medical_visits", company?.id);
  const { items: employees } = useTable("employees", company?.id);

  const showEquipmentTab = !!company?.active_equipment_checks;
  const showMedicalTab = !!company?.active_medical_surveillance;
  const visibleSubTabs = [
    ORGANIGRAMMA_SUB_TAB,
    ...BASE_SUB_TABS,
    ...(showEquipmentTab ? [EQUIPMENT_SUB_TAB] : []),
    ...(showMedicalTab ? [MEDICAL_SUB_TAB] : []),
  ];

  React.useEffect(() => {
    if (subTab === "attrezzature" && !showEquipmentTab) {
      setSubTab("dvr");
    }
    if (subTab === "visitemediche" && !showMedicalTab) {
      setSubTab("dvr");
    }
  }, [showEquipmentTab, showMedicalTab, subTab]);

  const dvrItems = dvrDocs.filter((d) => d.kind === "dvr");
  const allegatiItems = dvrDocs.filter((d) => d.kind === "allegato");

  // --- Form DVR / Allegati (condiviso) ---
  const [docTitle, setDocTitle] = useState("");
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [docFile, setDocFile] = useState(null);
  const [docNote, setDocNote] = useState("");
  const [docError, setDocError] = useState("");
  const [docBusy, setDocBusy] = useState(false);

  const onDocFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setDocError("");
    if (f && f.size > MAX_FILE_BYTES) { setDocError("File troppo grande (limite 8 MB)."); setDocFile(null); e.target.value = ""; return; }
    setDocFile(f);
  };

  const submitDoc = (kind) => async (e) => {
    e.preventDefault();
    if (!docTitle.trim()) return;
    setDocBusy(true);
    setDocError("");
    try {
      let attachment_path = null;
      if (docFile) attachment_path = await uploadAttachment(company.id, docFile);
      await addDvrDoc({ kind, title: docTitle, doc_date: docDate, attachment_path, note: docNote });
      setDocTitle(""); setDocNote(""); setDocFile(null);
      setDocDate(new Date().toISOString().slice(0, 10));
      const input = document.getElementById(`${kind}-file-input`);
      if (input) input.value = "";
    } catch (err) {
      setDocError("Errore durante il caricamento: " + err.message);
    } finally {
      setDocBusy(false);
    }
  };

  // --- Form Nomine e Attestati ---
  const [role, setRole] = useState(ROLE_OPTIONS[0]);
  const [personName, setPersonName] = useState("");
  const [nominaIssueDate, setNominaIssueDate] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [validityYears, setValidityYears] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [apptNominaFile, setApptNominaFile] = useState(null);
  const [apptAttestatoFile, setApptAttestatoFile] = useState(null);
  const [apptNote, setApptNote] = useState("");
  const [apptError, setApptError] = useState("");
  const [apptBusy, setApptBusy] = useState(false);

  const handleIssueChange = (value) => {
    setIssueDate(value);
    if (validityYears) setExpiryDate(addYears(value, validityYears));
  };
  const handleYearsChange = (value) => {
    setValidityYears(value);
    if (issueDate) setExpiryDate(addYears(issueDate, value));
  };

  const onApptNominaFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setApptError("");
    if (f && f.size > MAX_FILE_BYTES) { setApptError("File troppo grande (limite 8 MB)."); setApptNominaFile(null); e.target.value = ""; return; }
    setApptNominaFile(f);
  };

  const onApptAttestatoFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setApptError("");
    if (f && f.size > MAX_FILE_BYTES) { setApptError("File troppo grande (limite 8 MB)."); setApptAttestatoFile(null); e.target.value = ""; return; }
    setApptAttestatoFile(f);
  };

  const submitAppointment = async (e) => {
    e.preventDefault();
    if (!personName.trim() || (!nominaIssueDate && !issueDate)) return;
    setApptBusy(true);
    setApptError("");
    try {
      let nomina_attachment_path = null;
      let attestato_attachment_path = null;
      if (apptNominaFile) nomina_attachment_path = await uploadAttachment(company.id, apptNominaFile);
      if (apptAttestatoFile) attestato_attachment_path = await uploadAttachment(company.id, apptAttestatoFile);
      await addAppointment({
        role,
        person_name: personName,
        nomina_issue_date: nominaIssueDate || null,
        issue_date: issueDate || null,
        validity_years: validityYears === "" ? null : Number(validityYears),
        expiry_date: expiryDate || null,
        nomina_attachment_path,
        attestato_attachment_path,
        note: apptNote,
      });
      setPersonName(""); setNominaIssueDate(""); setIssueDate(""); setValidityYears(""); setExpiryDate(""); setApptNominaFile(null); setApptAttestatoFile(null); setApptNote("");
      const nominaInput = document.getElementById("nomine-nomina-file-input");
      if (nominaInput) nominaInput.value = "";
      const attestatoInput = document.getElementById("nomine-attestato-file-input");
      if (attestatoInput) attestatoInput.value = "";
    } catch (err) {
      setApptError("Errore durante il caricamento: " + err.message);
    } finally {
      setApptBusy(false);
    }
  };

  // --- Modifica di una nomina/attestato già registrato ---
  const [editingApptId, setEditingApptId] = useState(null);
  const [editNominaIssueDate, setEditNominaIssueDate] = useState("");
  const [editIssueDate, setEditIssueDate] = useState("");
  const [editValidityYears, setEditValidityYears] = useState("");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editNominaFile, setEditNominaFile] = useState(null);
  const [editAttestatoFile, setEditAttestatoFile] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  const startEditAppointment = (item) => {
    setEditingApptId(item.id);
    setEditNominaIssueDate(item.nomina_issue_date || "");
    setEditIssueDate(item.issue_date || "");
    setEditValidityYears(item.validity_years ? String(item.validity_years) : "");
    setEditExpiryDate(item.expiry_date || "");
    setEditNote(item.note || "");
    setEditNominaFile(null);
    setEditAttestatoFile(null);
    setEditError("");
  };
  const cancelEditAppointment = () => setEditingApptId(null);

  const handleEditIssueChange = (value) => {
    setEditIssueDate(value);
    if (editValidityYears) setEditExpiryDate(addYears(value, editValidityYears));
  };
  const handleEditYearsChange = (value) => {
    setEditValidityYears(value);
    if (editIssueDate) setEditExpiryDate(addYears(editIssueDate, value));
  };

  const saveEditAppointment = async (item) => {
    setEditBusy(true);
    setEditError("");
    try {
      let nomina_attachment_path = item.nomina_attachment_path;
      let attestato_attachment_path = item.attestato_attachment_path;
      if (editNominaFile) nomina_attachment_path = await uploadAttachment(company.id, editNominaFile);
      if (editAttestatoFile) attestato_attachment_path = await uploadAttachment(company.id, editAttestatoFile);
      await updateAppointment(item.id, {
        nomina_issue_date: editNominaIssueDate || null,
        issue_date: editIssueDate || null,
        validity_years: editValidityYears === "" ? null : Number(editValidityYears),
        expiry_date: editExpiryDate || null,
        note: editNote,
        nomina_attachment_path,
        attestato_attachment_path,
      });
      setEditingApptId(null);
    } catch (err) {
      setEditError("Errore durante il salvataggio: " + err.message);
    } finally {
      setEditBusy(false);
    }
  };

  const expiringSoon = appointments.filter((a) => {
    const info = expiryInfo(a.expiry_date);
    return info && (info.cls === "pill-warn" || info.cls === "pill-alert");
  }).length;

  // --- Form Attrezzature e Verifiche ---
  const [equipType, setEquipType] = useState(EQUIPMENT_TYPE_OPTIONS[0]);
  const [equipLabel, setEquipLabel] = useState("");
  const [equipTechnician, setEquipTechnician] = useState("");
  const [equipIssueDate, setEquipIssueDate] = useState("");
  const [equipValidityYears, setEquipValidityYears] = useState("");
  const [equipExpiryDate, setEquipExpiryDate] = useState("");
  const [equipFile, setEquipFile] = useState(null);
  const [equipNote, setEquipNote] = useState("");
  const [equipError, setEquipError] = useState("");
  const [equipBusy, setEquipBusy] = useState(false);

  const handleEquipIssueChange = (value) => {
    setEquipIssueDate(value);
    if (equipValidityYears) setEquipExpiryDate(addYears(value, equipValidityYears));
  };
  const handleEquipYearsChange = (value) => {
    setEquipValidityYears(value);
    if (equipIssueDate) setEquipExpiryDate(addYears(equipIssueDate, value));
  };

  const onEquipFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setEquipError("");
    if (f && f.size > MAX_FILE_BYTES) { setEquipError("File troppo grande (limite 8 MB)."); setEquipFile(null); e.target.value = ""; return; }
    setEquipFile(f);
  };

  const submitEquipment = async (e) => {
    e.preventDefault();
    if (!equipIssueDate) return;
    setEquipBusy(true);
    setEquipError("");
    try {
      let attachment_path = null;
      if (equipFile) attachment_path = await uploadAttachment(company.id, equipFile);
      await addEquipmentCheck({
        equipment_type: equipType,
        label: equipLabel,
        technician: equipTechnician,
        issue_date: equipIssueDate,
        validity_years: equipValidityYears === "" ? null : Number(equipValidityYears),
        expiry_date: equipExpiryDate || null,
        attachment_path,
        note: equipNote,
      });
      setEquipLabel(""); setEquipTechnician(""); setEquipIssueDate(""); setEquipValidityYears(""); setEquipExpiryDate(""); setEquipFile(null); setEquipNote("");
      const input = document.getElementById("attrezzature-file-input");
      if (input) input.value = "";
    } catch (err) {
      setEquipError("Errore durante il caricamento: " + err.message);
    } finally {
      setEquipBusy(false);
    }
  };

  const equipmentExpiringSoon = equipmentChecks.filter((a) => {
    const info = expiryInfo(a.expiry_date);
    return info && (info.cls === "pill-warn" || info.cls === "pill-alert");
  }).length;

  // --- Form Visite Mediche ---
  const [medEmployeeName, setMedEmployeeName] = useState("");
  const [medJobRole, setMedJobRole] = useState("");
  const [medVisitDate, setMedVisitDate] = useState("");
  const [medValidityYears, setMedValidityYears] = useState("");
  const [medExpiryDate, setMedExpiryDate] = useState("");
  const [medFile, setMedFile] = useState(null);
  const [medNote, setMedNote] = useState("");
  const [medError, setMedError] = useState("");
  const [medBusy, setMedBusy] = useState(false);

  const handleMedVisitChange = (value) => {
    setMedVisitDate(value);
    if (medValidityYears) setMedExpiryDate(addYears(value, medValidityYears));
  };
  const handleMedYearsChange = (value) => {
    setMedValidityYears(value);
    if (medVisitDate) setMedExpiryDate(addYears(medVisitDate, value));
  };

  const onMedFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setMedError("");
    if (f && f.size > MAX_FILE_BYTES) { setMedError("File troppo grande (limite 8 MB)."); setMedFile(null); e.target.value = ""; return; }
    setMedFile(f);
  };

  const submitMedicalVisit = async (e) => {
    e.preventDefault();
    if (!medEmployeeName.trim() || !medVisitDate) return;
    setMedBusy(true);
    setMedError("");
    try {
      let attachment_path = null;
      if (medFile) attachment_path = await uploadAttachment(company.id, medFile);
      await addMedicalVisit({
        employee_name: medEmployeeName,
        job_role: medJobRole,
        visit_date: medVisitDate,
        validity_years: medValidityYears === "" ? null : Number(medValidityYears),
        expiry_date: medExpiryDate || null,
        attachment_path,
        note: medNote,
      });
      setMedEmployeeName(""); setMedJobRole(""); setMedVisitDate(""); setMedValidityYears(""); setMedExpiryDate(""); setMedFile(null); setMedNote("");
      const input = document.getElementById("visitemediche-file-input");
      if (input) input.value = "";
    } catch (err) {
      setMedError("Errore durante il caricamento: " + err.message);
    } finally {
      setMedBusy(false);
    }
  };

  const medicalExpiringSoon = medicalVisits.filter((a) => {
    const info = expiryInfo(a.expiry_date);
    return info && (info.cls === "pill-warn" || info.cls === "pill-alert");
  }).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Sicurezza sul lavoro</h2>
          <p className="sub">Documento di Valutazione dei Rischi, allegati, nomine e attestati (D.Lgs. 81/08).</p>
        </div>
        {(expiringSoon + equipmentExpiringSoon + medicalExpiringSoon) > 0 && (
          <div className="pill pill-alert"><HardHat size={14} /> {expiringSoon + equipmentExpiringSoon + medicalExpiringSoon} in scadenza o scaduti</div>
        )}
      </div>

      <div className="config-subtabs">
        {visibleSubTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={"config-subtab" + (subTab === t.id ? " active" : "")}
            onClick={() => setSubTab(t.id)}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {subTab === "organigramma" && <Organigramma />}

      {(subTab === "dvr" || subTab === "allegati") && (
        <>
          <form onSubmit={submitDoc(subTab === "dvr" ? "dvr" : "allegato")} className="traccia-form">
            {subTab === "allegati" && (
              <select
                value={ALLEGATO_TYPE_OPTIONS.includes(docTitle) ? docTitle : "Altro"}
                onChange={(e) => setDocTitle(e.target.value === "Altro" ? "" : e.target.value)}
              >
                {ALLEGATO_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            <div className="row-form">
              <input
                type="text"
                placeholder={subTab === "dvr" ? "Titolo (es. DVR 2026, Aggiornamento DVR...)" : "Titolo / dettaglio (es. aggiungi la data o il reparto)"}
                required
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="note-input"
              />
              <label className="field-label">Data
                <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
              </label>
            </div>
            <input type="text" placeholder="Nota (opzionale)" value={docNote} onChange={(e) => setDocNote(e.target.value)} className="full-input" />
            <label className="file-drop" htmlFor={`${subTab === "dvr" ? "dvr" : "allegato"}-file-input`}>
              <Paperclip size={15} /><span>{docFile ? docFile.name : "Allega documento (PDF o immagine)"}</span>
              <input id={`${subTab === "dvr" ? "dvr" : "allegato"}-file-input`} type="file" accept=".pdf,image/*" onChange={onDocFileChange} hidden />
            </label>
            {docError && <span className="file-error"><AlertTriangle size={13} /> {docError}</span>}
            <button type="submit" className="btn-primary" disabled={docBusy} style={{ alignSelf: "flex-start" }}>
              <Plus size={16} /> {docBusy ? "Salvataggio…" : "Registra"}
            </button>
          </form>

          {(subTab === "dvr" ? dvrLoading : dvrLoading) ? (
            <p className="sub">Caricamento…</p>
          ) : (subTab === "dvr" ? dvrItems : allegatiItems).length === 0 ? (
            <div className="empty"><p>{subTab === "dvr" ? "Nessuna versione del DVR registrata." : "Nessun allegato registrato."}</p></div>
          ) : (
            <ul className="dish-list">
              {(subTab === "dvr" ? dvrItems : allegatiItems).map((item) => (
                <li key={item.id} className="dish-row">
                  <div className="dish-top">
                    <strong>{item.title}</strong>
                    <button className="icon-btn" onClick={() => removeDvrDoc(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                  </div>
                  <div className="traccia-meta">
                    <span className="log-time">{fmtDate(item.doc_date)}</span>
                  </div>
                  {item.note && <p className="pest-note">{item.note}</p>}
                  <AttachmentLink path={item.attachment_path} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {subTab === "nomine" && (
        <>
          <form onSubmit={submitAppointment} className="traccia-form">
            <div className="row-form">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {employees.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const emp = employees.find((x) => x.id === e.target.value);
                    if (emp) setPersonName(`${emp.first_name} ${emp.last_name}`);
                  }}
                >
                  <option value="">Scegli dall'elenco dipendenti…</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>)}
                </select>
              )}
              <input type="text" placeholder="Nominativo" required value={personName} onChange={(e) => setPersonName(e.target.value)} className="note-input" />
            </div>

            <fieldset className="config-group">
              <legend>Nomina</legend>
              <div className="row-form" style={{ margin: "0 0 8px" }}>
                <label className="field-label">Data nomina
                  <input type="date" value={nominaIssueDate} onChange={(e) => setNominaIssueDate(e.target.value)} />
                </label>
              </div>
              <label className="file-drop" htmlFor="nomine-nomina-file-input">
                <Paperclip size={15} /><span>{apptNominaFile ? apptNominaFile.name : "Allega nomina (PDF o immagine)"}</span>
                <input id="nomine-nomina-file-input" type="file" accept=".pdf,image/*" onChange={onApptNominaFileChange} hidden />
              </label>
            </fieldset>

            <fieldset className="config-group">
              <legend>Corso di formazione</legend>
              <div className="row-form" style={{ margin: "0 0 8px" }}>
                <label className="field-label">Data corso
                  <input type="date" value={issueDate} onChange={(e) => handleIssueChange(e.target.value)} />
                </label>
                <label className="field-label">Anni di validità (opzionale)
                  <input type="number" min="0" step="1" placeholder="es. 5" value={validityYears} onChange={(e) => handleYearsChange(e.target.value)} className="num" />
                </label>
                <label className="field-label">Data scadenza corso
                  <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                </label>
              </div>
              <label className="file-drop" htmlFor="nomine-attestato-file-input">
                <Paperclip size={15} /><span>{apptAttestatoFile ? apptAttestatoFile.name : "Allega attestato/i di formazione (PDF o immagine)"}</span>
                <input id="nomine-attestato-file-input" type="file" accept=".pdf,image/*" onChange={onApptAttestatoFileChange} hidden />
              </label>
            </fieldset>

            <p className="sub" style={{ marginTop: -6 }}>Compila almeno una delle due date (nomina o corso) per registrare la scheda — l'altra puoi aggiungerla in un secondo momento con "Modifica".</p>
            <input type="text" placeholder="Nota (opzionale)" value={apptNote} onChange={(e) => setApptNote(e.target.value)} className="full-input" />
            {apptError && <span className="file-error"><AlertTriangle size={13} /> {apptError}</span>}
            <button type="submit" className="btn-primary" disabled={apptBusy} style={{ alignSelf: "flex-start" }}>
              <Plus size={16} /> {apptBusy ? "Salvataggio…" : "Registra nomina / attestato"}
            </button>
          </form>

          {appointmentsLoading ? (
            <p className="sub">Caricamento…</p>
          ) : appointments.length === 0 ? (
            <div className="empty"><p>Nessuna nomina o attestato registrato.</p></div>
          ) : (
            <ul className="dish-list">
              {appointments.map((item) => {
                const info = expiryInfo(item.expiry_date);
                const isEditing = editingApptId === item.id;

                if (isEditing) {
                  return (
                    <li key={item.id} className="dish-row">
                      <div className="dish-top">
                        <div>
                          <strong>{item.role}</strong>
                          <span className="lot-tag">{item.person_name}</span>
                        </div>
                      </div>
                      <div className="nc-edit-block">
                        <fieldset className="config-group">
                          <legend>Nomina</legend>
                          <label className="field-label">Data nomina
                            <input type="date" value={editNominaIssueDate} onChange={(e) => setEditNominaIssueDate(e.target.value)} />
                          </label>
                          <label className="file-drop" htmlFor={`edit-nomina-${item.id}`} style={{ marginTop: 8 }}>
                            <Paperclip size={15} />
                            <span>{editNominaFile ? editNominaFile.name : (item.nomina_attachment_path ? "Sostituisci nomina allegata" : "Allega nomina (PDF o immagine)")}</span>
                            <input id={`edit-nomina-${item.id}`} type="file" accept=".pdf,image/*" onChange={(e) => setEditNominaFile(e.target.files?.[0] || null)} hidden />
                          </label>
                        </fieldset>
                        <fieldset className="config-group">
                          <legend>Corso di formazione</legend>
                          <div className="row-form" style={{ margin: "0 0 8px" }}>
                            <label className="field-label">Data corso
                              <input type="date" value={editIssueDate} onChange={(e) => handleEditIssueChange(e.target.value)} />
                            </label>
                            <label className="field-label">Anni di validità (opzionale)
                              <input type="number" min="0" step="1" placeholder="es. 5" value={editValidityYears} onChange={(e) => handleEditYearsChange(e.target.value)} className="num" />
                            </label>
                            <label className="field-label">Data scadenza corso
                              <input type="date" value={editExpiryDate} onChange={(e) => setEditExpiryDate(e.target.value)} />
                            </label>
                          </div>
                          <label className="file-drop" htmlFor={`edit-attestato-${item.id}`}>
                            <Paperclip size={15} />
                            <span>{editAttestatoFile ? editAttestatoFile.name : (item.attestato_attachment_path ? "Sostituisci attestato allegato" : "Allega attestato/i di formazione")}</span>
                            <input id={`edit-attestato-${item.id}`} type="file" accept=".pdf,image/*" onChange={(e) => setEditAttestatoFile(e.target.files?.[0] || null)} hidden />
                          </label>
                        </fieldset>
                        <input type="text" placeholder="Nota (opzionale)" value={editNote} onChange={(e) => setEditNote(e.target.value)} className="full-input" />
                        {editError && <span className="file-error"><AlertTriangle size={13} /> {editError}</span>}
                        <div className="row-form" style={{ margin: "10px 0 0" }}>
                          <button type="button" className="btn-primary" onClick={() => saveEditAppointment(item)} disabled={editBusy}>
                            <Check size={14} /> Salva
                          </button>
                          <button type="button" className="icon-btn" onClick={cancelEditAppointment} aria-label="Annulla"><X size={14} /> Annulla</button>
                        </div>
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={item.id} className={"dish-row" + (info?.cls === "pill-alert" ? " row-warn" : "")}>
                    <div className="dish-top">
                      <div>
                        <strong>{item.role}</strong>
                        <span className="lot-tag">{item.person_name}</span>
                      </div>
                      <div>
                        <button className="icon-btn" onClick={() => startEditAppointment(item)} aria-label="Modifica"><Pencil size={14} /></button>
                        <button className="icon-btn" onClick={() => removeAppointment(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="traccia-meta">
                      {item.nomina_issue_date && <span className="doc-type-tag">Nomina del {fmtDate(item.nomina_issue_date)}</span>}
                      {item.issue_date && <span className="doc-type-tag">Corso del {fmtDate(item.issue_date)}</span>}
                      {info && <span className={"pill " + info.cls}>{info.label}</span>}
                    </div>
                    {item.note && <p className="pest-note">{item.note}</p>}
                    <div className="row-form" style={{ margin: "6px 0 0" }}>
                      <div>
                        <span className="none-label" style={{ display: "block", marginBottom: 4 }}>Nomina</span>
                        <AttachmentLink path={item.nomina_attachment_path} />
                      </div>
                      <div>
                        <span className="none-label" style={{ display: "block", marginBottom: 4 }}>Attestato/i formazione</span>
                        <AttachmentLink path={item.attestato_attachment_path} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {subTab === "attrezzature" && (
        <>
          <form onSubmit={submitEquipment} className="traccia-form">
            <div className="row-form">
              <select value={equipType} onChange={(e) => setEquipType(e.target.value)}>
                {EQUIPMENT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="text" placeholder="Identificativo (es. Carrello reparto magazzino)" value={equipLabel} onChange={(e) => setEquipLabel(e.target.value)} className="note-input" />
            </div>
            {employees.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const emp = employees.find((x) => x.id === e.target.value);
                  if (emp) setEquipTechnician(`${emp.first_name} ${emp.last_name}`);
                }}
              >
                <option value="">Scegli dall'elenco dipendenti…</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>)}
              </select>
            )}
            <input type="text" placeholder="Nominativo / Ditta esecutrice (opzionale)" value={equipTechnician} onChange={(e) => setEquipTechnician(e.target.value)} className="full-input" />
            <div className="row-form">
              <label className="field-label">Data verifica / rilascio
                <input type="date" required value={equipIssueDate} onChange={(e) => handleEquipIssueChange(e.target.value)} />
              </label>
              <label className="field-label">Anni di validità (opzionale)
                <input type="number" min="0" step="1" placeholder="es. 5" value={equipValidityYears} onChange={(e) => handleEquipYearsChange(e.target.value)} className="num" />
              </label>
              <label className="field-label">Data prossima scadenza
                <input type="date" value={equipExpiryDate} onChange={(e) => setEquipExpiryDate(e.target.value)} />
              </label>
            </div>
            <input type="text" placeholder="Nota (opzionale)" value={equipNote} onChange={(e) => setEquipNote(e.target.value)} className="full-input" />
            <label className="file-drop" htmlFor="attrezzature-file-input">
              <Paperclip size={15} /><span>{equipFile ? equipFile.name : "Allega verbale / patentino (PDF o immagine)"}</span>
              <input id="attrezzature-file-input" type="file" accept=".pdf,image/*" onChange={onEquipFileChange} hidden />
            </label>
            {equipError && <span className="file-error"><AlertTriangle size={13} /> {equipError}</span>}
            <button type="submit" className="btn-primary" disabled={equipBusy} style={{ alignSelf: "flex-start" }}>
              <Plus size={16} /> {equipBusy ? "Salvataggio…" : "Registra"}
            </button>
          </form>

          {equipmentLoading ? (
            <p className="sub">Caricamento…</p>
          ) : equipmentChecks.length === 0 ? (
            <div className="empty"><p>Nessuna attrezzatura o verifica registrata.</p></div>
          ) : (
            <ul className="dish-list">
              {equipmentChecks.map((item) => {
                const info = expiryInfo(item.expiry_date);
                return (
                  <li key={item.id} className={"dish-row" + (info?.cls === "pill-alert" ? " row-warn" : "")}>
                    <div className="dish-top">
                      <div>
                        <strong>{item.equipment_type}</strong>
                        {item.label && <span className="lot-tag">{item.label}</span>}
                      </div>
                      <button className="icon-btn" onClick={() => removeEquipmentCheck(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                    </div>
                    <div className="traccia-meta">
                      <span className="doc-type-tag">Verificata il {fmtDate(item.issue_date)}</span>
                      {item.technician && <span className="doc-type-tag">{item.technician}</span>}
                      {info && <span className={"pill " + info.cls}>{info.label}</span>}
                    </div>
                    {item.note && <p className="pest-note">{item.note}</p>}
                    <AttachmentLink path={item.attachment_path} />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {subTab === "visitemediche" && (
        <>
          <form onSubmit={submitMedicalVisit} className="traccia-form">
            {employees.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const emp = employees.find((x) => x.id === e.target.value);
                  if (emp) {
                    setMedEmployeeName(`${emp.first_name} ${emp.last_name}`);
                    if (emp.job_role) setMedJobRole(emp.job_role);
                  }
                }}
              >
                <option value="">Scegli dall'elenco dipendenti…</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>)}
              </select>
            )}
            <div className="row-form">
              <input type="text" placeholder="Nome e Cognome dipendente" required value={medEmployeeName} onChange={(e) => setMedEmployeeName(e.target.value)} className="note-input" />
              <input type="text" placeholder="Mansione" value={medJobRole} onChange={(e) => setMedJobRole(e.target.value)} className="note-input" />
            </div>
            <div className="row-form">
              <label className="field-label">Data della visita
                <input type="date" required value={medVisitDate} onChange={(e) => handleMedVisitChange(e.target.value)} />
              </label>
              <label className="field-label">Anni di validità (opzionale)
                <input type="number" min="0" step="1" placeholder="es. 2" value={medValidityYears} onChange={(e) => handleMedYearsChange(e.target.value)} className="num" />
              </label>
              <label className="field-label">Data scadenza (prossima visita)
                <input type="date" value={medExpiryDate} onChange={(e) => setMedExpiryDate(e.target.value)} />
              </label>
            </div>
            <input type="text" placeholder="Nota (opzionale)" value={medNote} onChange={(e) => setMedNote(e.target.value)} className="full-input" />
            <label className="file-drop" htmlFor="visitemediche-file-input">
              <Paperclip size={15} /><span>{medFile ? medFile.name : "Allega giudizio di idoneità del medico competente (PDF o immagine)"}</span>
              <input id="visitemediche-file-input" type="file" accept=".pdf,image/*" onChange={onMedFileChange} hidden />
            </label>
            {medError && <span className="file-error"><AlertTriangle size={13} /> {medError}</span>}
            <button type="submit" className="btn-primary" disabled={medBusy} style={{ alignSelf: "flex-start" }}>
              <Plus size={16} /> {medBusy ? "Salvataggio…" : "Registra visita"}
            </button>
          </form>

          {medicalLoading ? (
            <p className="sub">Caricamento…</p>
          ) : medicalVisits.length === 0 ? (
            <div className="empty"><p>Nessuna visita medica registrata.</p></div>
          ) : (
            <ul className="dish-list">
              {medicalVisits.map((item) => {
                const info = expiryInfo(item.expiry_date);
                return (
                  <li key={item.id} className={"dish-row" + (info?.cls === "pill-alert" ? " row-warn" : "")}>
                    <div className="dish-top">
                      <div>
                        <strong>{item.employee_name}</strong>
                        {item.job_role && <span className="lot-tag">{item.job_role}</span>}
                      </div>
                      <button className="icon-btn" onClick={() => removeMedicalVisit(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                    </div>
                    <div className="traccia-meta">
                      <span className="doc-type-tag">Visita del {fmtDate(item.visit_date)}</span>
                      {info && <span className={"pill " + info.cls}>{info.label}</span>}
                    </div>
                    {item.note && <p className="pest-note">{item.note}</p>}
                    <AttachmentLink path={item.attachment_path} />
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
