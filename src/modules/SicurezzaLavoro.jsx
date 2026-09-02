import React, { useState } from "react";
import { Plus, Trash2, Paperclip, FileText, Download, AlertTriangle, Award, HardHat, Wrench, Stethoscope, Network, Pencil, X, Check } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";
import { supabase } from "../supabaseClient";
import Organigramma from "./Organigramma";
import { generateNominaAttachment, findRlsName, findDatoreName } from "../utils/nominaTemplates";

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

export const COURSE_KIND_OPTIONS = ["Corso base", "Aggiornamento", "Altro"];

// Il medico competente è l'unico incarico che non appartiene a un lavoratore:
// non riceve formazione da aggiornare, ed è lui a svolgere le visite. Per
// questo si inserisce e si consulta dalla scheda "Visite Mediche" invece che
// da "Nomine e Attestati". Nel database resta una nomina come le altre, così
// l'organigramma continua a ritrovarlo senza modifiche.
export const MEDICO_ROLE = "Nomina Medico Competente";

// La formazione generale e specifica dei lavoratori sta tra gli "incarichi"
// solo per comodità: è l'unica voce che non è una nomina, ma un obbligo che
// riguarda ogni lavoratore. Per questo nella sua scheda non si mostrano né la
// data di nomina né il riquadro del verbale: non esistono, e mostrarli vuoti
// faceva sembrare che mancasse un documento.
export const FORMAZIONE_ROLE = "Formazione Generale e Specifica Lavoratori";

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
  const { items: employees, add: addEmployee } = useTable("employees", company?.id);
  const { items: trainings, add: addTraining, remove: removeTraining } = useTable("work_safety_trainings", company?.id);

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

  // I corsi di un incarico, dal più recente. La validità dell'incarico è
  // quella dell'ultimo corso fatto: è l'aggiornamento più recente a dire se
  // la persona è ancora in regola, non la nomina, che di suo non scade.
  const trainingsFor = (appointmentId) =>
    trainings
      .filter((t) => t.appointment_id === appointmentId)
      .sort((a, b) => new Date(b.issue_date || 0) - new Date(a.issue_date || 0));

  const latestTraining = (appointmentId) => {
    const list = trainingsFor(appointmentId).filter((t) => t.expiry_date);
    if (list.length === 0) return null;
    // fra i corsi con scadenza vale quello che scade più tardi
    return list.reduce((best, t) =>
      !best || new Date(t.expiry_date) > new Date(best.expiry_date) ? t : best, null);
  };

  const appointmentStatus = (appointmentId) => {
    const t = latestTraining(appointmentId);
    return t ? expiryInfo(t.expiry_date) : null;
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
  // Il modulo di inserimento si apre nel punto in cui serve:
  // null = chiuso, "" = nuovo nominativo libero, altrimenti il nome della
  // persona a cui si sta aggiungendo un incarico.
  const [addingFor, setAddingFor] = useState(null);
  // "elenco" = le schede per persona; "quadro" = la matrice riassuntiva.
  const [nomineView, setNomineView] = useState("elenco");

  const openAddFor = (name) => {
    setAddingFor(name);
    setPersonName(name || "");
    setRole(ROLE_OPTIONS[0]);
    setNominaIssueDate(""); setIssueDate(""); setValidityYears(""); setExpiryDate("");
    setApptNominaFile(null); setApptAttestatoFile(null); setApptNote(""); setApptError("");
  };

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
      if (apptNominaFile) {
        nomina_attachment_path = await uploadAttachment(company.id, apptNominaFile);
      } else {
        // Nessun file allegato a mano: se esiste un modello per questo ruolo
        // (es. "RSPP Datore di Lavoro"), la nomina viene generata da sola in
        // Word con i dati dell'azienda. Non blocca il salvataggio se fallisce.
        nomina_attachment_path = await generateNominaAttachment({
          role,
          company,
          personName,
          nominaDate: nominaIssueDate || issueDate,
          rlsName: findRlsName(appointments),
          datoreName: findDatoreName(appointments, employees),
        });
      }
      if (apptAttestatoFile) attestato_attachment_path = await uploadAttachment(company.id, apptAttestatoFile);
      // La nomina custodisce solo se stessa. Il corso, se è stato compilato,
      // diventa subito il primo della lista degli attestati di questo incarico.
      const created = await addAppointment({
        role,
        person_name: personName,
        nomina_issue_date: nominaIssueDate || null,
        issue_date: null,
        validity_years: null,
        expiry_date: null,
        nomina_attachment_path,
        attestato_attachment_path: null,
        note: apptNote,
      });

      if (created?.id && (issueDate || expiryDate || attestato_attachment_path)) {
        await addTraining({
          appointment_id: created.id,
          course_kind: "Corso base",
          issue_date: issueDate || null,
          validity_years: validityYears === "" ? null : Number(validityYears),
          expiry_date: expiryDate || null,
          attachment_path: attestato_attachment_path,
          note: null,
        });
      }
      setPersonName(""); setNominaIssueDate(""); setIssueDate(""); setValidityYears(""); setExpiryDate(""); setApptNominaFile(null); setApptAttestatoFile(null); setApptNote("");
      const nominaInput = document.getElementById("nomine-nomina-file-input");
      if (nominaInput) nominaInput.value = "";
      const attestatoInput = document.getElementById("nomine-attestato-file-input");
      if (attestatoInput) attestatoInput.value = "";
      setAddingFor(null);
    } catch (err) {
      setApptError("Errore durante il caricamento: " + err.message);
    } finally {
      setApptBusy(false);
    }
  };

  // --- Corsi di formazione di un incarico ---
  const [trainingFor, setTrainingFor] = useState(null); // id dell'incarico aperto
  const [trKind, setTrKind] = useState(COURSE_KIND_OPTIONS[0]);
  const [trIssueDate, setTrIssueDate] = useState("");
  const [trValidityYears, setTrValidityYears] = useState("");
  const [trExpiryDate, setTrExpiryDate] = useState("");
  const [trFile, setTrFile] = useState(null);
  const [trNote, setTrNote] = useState("");
  const [trError, setTrError] = useState("");
  const [trBusy, setTrBusy] = useState(false);

  const openTrainingFor = (appointmentId) => {
    setTrainingFor(appointmentId);
    setTrKind(COURSE_KIND_OPTIONS[0]);
    setTrIssueDate(""); setTrValidityYears(""); setTrExpiryDate("");
    setTrFile(null); setTrNote(""); setTrError("");
  };

  const handleTrIssueChange = (value) => {
    setTrIssueDate(value);
    if (trValidityYears) setTrExpiryDate(addYears(value, trValidityYears));
  };
  const handleTrYearsChange = (value) => {
    setTrValidityYears(value);
    if (trIssueDate) setTrExpiryDate(addYears(trIssueDate, value));
  };

  const onTrFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setTrError("");
    if (f && f.size > MAX_FILE_BYTES) { setTrError("File troppo grande (limite 8 MB)."); setTrFile(null); e.target.value = ""; return; }
    setTrFile(f);
  };

  const submitTraining = async (appointmentId) => {
    if (!trIssueDate && !trExpiryDate && !trFile) {
      setTrError("Inserisci almeno la data del corso o la scadenza.");
      return;
    }
    setTrBusy(true);
    setTrError("");
    try {
      let attachment_path = null;
      if (trFile) attachment_path = await uploadAttachment(company.id, trFile);
      await addTraining({
        appointment_id: appointmentId,
        course_kind: trKind,
        issue_date: trIssueDate || null,
        validity_years: trValidityYears === "" ? null : Number(trValidityYears),
        expiry_date: trExpiryDate || null,
        attachment_path,
        note: trNote || null,
      });
      setTrainingFor(null);
    } catch (err) {
      setTrError("Errore durante il caricamento: " + err.message);
    } finally {
      setTrBusy(false);
    }
  };

  // --- Modifica di una nomina/attestato già registrato ---
  const [editingApptId, setEditingApptId] = useState(null);
  const [editNominaIssueDate, setEditNominaIssueDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editNominaFile, setEditNominaFile] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  const startEditAppointment = (item) => {
    setEditingApptId(item.id);
    setEditNominaIssueDate(item.nomina_issue_date || "");
    setEditNote(item.note || "");
    setEditNominaFile(null);
    setEditError("");
  };
  const cancelEditAppointment = () => setEditingApptId(null);

  const saveEditAppointment = async (item) => {
    setEditBusy(true);
    setEditError("");
    try {
      let nomina_attachment_path = item.nomina_attachment_path;
      if (editNominaFile) nomina_attachment_path = await uploadAttachment(company.id, editNominaFile);
      await updateAppointment(item.id, {
        nomina_issue_date: editNominaIssueDate || null,
        note: editNote,
        nomina_attachment_path,
      });
      setEditingApptId(null);
    } catch (err) {
      setEditError("Errore durante il salvataggio: " + err.message);
    } finally {
      setEditBusy(false);
    }
  };

  const expiringSoon = appointments.filter((a) => {
    const info = appointmentStatus(a.id);
    return info && (info.cls === "pill-warn" || info.cls === "pill-alert");
  }).length;

  // Le nomine si leggono per persona, non in ordine cronologico: chi ricopre
  // più ruoli deve comparire una volta sola, con sotto tutti i suoi documenti.
  //
  // L'ordine non è alfabetico ma per peso dell'incarico: prima chi ha una
  // responsabilità di sistema (RSPP), poi chi ricopre un incarico operativo,
  // e in fondo chi ha soltanto la formazione da lavoratore. In un'azienda da
  // venti dipendenti l'elenco alfabetico costringe a cercare le figure
  // chiave in mezzo a tutti gli altri. Dentro ciascuna fascia resta
  // l'ordine alfabetico.
  const ROLE_RANK = {
    "RSPP Datore di Lavoro": 0,
    "RSPP Esterno": 0,
    "RLS": 1,
    "Preposto": 2,
    "Addetto al Primo Soccorso": 3,
    "Addetto Antincendio": 4,
    "Consegna DPI": 5,
    "Formazione Generale e Specifica Lavoratori": 9,
  };

  const appointmentGroups = (() => {
    const map = new Map();
    appointments.filter((a) => a.role !== MEDICO_ROLE).forEach((a) => {
      const name = (a.person_name || "").trim() || "Senza nominativo";
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(a);
    });
    return [...map.entries()]
      .map(([name, items]) => ({
        name,
        items,
        // La persona vale per il suo incarico più importante: chi è preposto
        // e ha anche la formazione lavoratori sta tra i preposti, non in fondo.
        rank: Math.min(...items.map((a) => (a.role in ROLE_RANK ? ROLE_RANK[a.role] : 6))),
      }))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "it"));
  })();

  // Quadro riassuntivo della formazione: una riga per persona, una colonna per
  // incarico, e in ogni casella la scadenza dell'attestato più recente. Serve
  // a vedere in una sola immagine chi è coperto, chi sta per scadere e chi non
  // ha mai fatto il corso — cosa che nell'elenco per persona si capisce solo
  // scorrendo tutte le schede una a una.
  const ROLE_SHORT = {
    "RSPP Datore di Lavoro": "RSPP datore di lavoro",
    "RSPP Esterno": "RSPP esterno",
    "RLS": "RLS",
    "Preposto": "Preposto",
    "Addetto al Primo Soccorso": "Primo soccorso",
    "Addetto Antincendio": "Antincendio",
    "Consegna DPI": "Consegna DPI",
    "Formazione Generale e Specifica Lavoratori": "Formazione lavoratori",
  };

  // In colonna solo gli incarichi che qualcuno ricopre davvero: una tabella con
  // colonne sempre vuote si legge peggio e non aggiunge niente.
  const matriceRoles = [...new Set(
    appointments.filter((a) => a.role !== MEDICO_ROLE).map((a) => a.role)
  )].sort((a, b) => ((a in ROLE_RANK ? ROLE_RANK[a] : 6) - (b in ROLE_RANK ? ROLE_RANK[b] : 6))
                    || a.localeCompare(b, "it"));

  const matriceCell = (personName, role) => {
    const appt = appointments.find(
      (a) => a.role === role && (a.person_name || "").trim() === personName
    );
    if (!appt) return null;
    const t = latestTraining(appt.id);
    if (!t) return { cls: "pill-alert", label: "mai svolto" };
    const info = expiryInfo(t.expiry_date);
    if (!info) return { cls: "pill-warn", label: "senza scadenza" };
    return { cls: info.cls, label: fmtDate(t.expiry_date) };
  };

  // Un solo modulo di inserimento, riusato in due punti: in cima quando si
  // registra un incarico per un nominativo nuovo, e dentro la scheda della
  // persona quando se ne aggiunge uno a chi è già in elenco. In quel secondo
  // caso il nominativo è già deciso e non va più scelto.
  const appointmentForm = (lockedName) => (
    <form onSubmit={submitAppointment} className="traccia-form">
      {lockedName ? (
        <p className="sub" style={{ margin: 0 }}>
          Nuovo incarico per <strong>{lockedName}</strong>
        </p>
      ) : (
        <div className="row-form" style={{ marginTop: 0 }}>
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
      )}

      <label className="field-label">Incarico
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLE_OPTIONS.filter((r) => r !== MEDICO_ROLE).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>

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
      <div className="row-form" style={{ margin: "4px 0 0" }}>
        <button type="submit" className="btn-primary" disabled={apptBusy}>
          <Plus size={16} /> {apptBusy ? "Salvataggio…" : "Registra incarico"}
        </button>
        <button type="button" className="link-btn" onClick={() => setAddingFor(null)}>Annulla</button>
      </div>
    </form>
  );

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
  const [mcOpen, setMcOpen] = useState(false);
  const [mcName, setMcName] = useState("");
  const [mcDate, setMcDate] = useState("");
  const [mcFile, setMcFile] = useState(null);
  const [mcError, setMcError] = useState("");
  const [mcBusy, setMcBusy] = useState(false);
  const [medBusy, setMedBusy] = useState(false);

  const handleMedVisitChange = (value) => {
    setMedVisitDate(value);
    if (medValidityYears) setMedExpiryDate(addYears(value, medValidityYears));
  };
  const handleMedYearsChange = (value) => {
    setMedValidityYears(value);
    if (medVisitDate) setMedExpiryDate(addYears(medVisitDate, value));
  };

  const medicoCompetente = appointments.find((a) => a.role === MEDICO_ROLE) || null;

  const onMcFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setMcError("");
    if (f && f.size > MAX_FILE_BYTES) { setMcError("File troppo grande (limite 8 MB)."); setMcFile(null); e.target.value = ""; return; }
    setMcFile(f);
  };

  const submitMedicoCompetente = async () => {
    if (!mcName.trim()) { setMcError("Indica il nome del medico competente."); return; }
    setMcBusy(true);
    setMcError("");
    try {
      let nomina_attachment_path = null;
      if (mcFile) nomina_attachment_path = await uploadAttachment(company.id, mcFile);
      // Nessuna data corso e nessuna scadenza: per il medico competente non
      // esiste un attestato che scade, e inventarne una farebbe comparire
      // avvisi inesistenti in Panoramica e nell'email delle scadenze.
      await addAppointment({
        role: MEDICO_ROLE,
        person_name: mcName,
        nomina_issue_date: mcDate || null,
        nomina_attachment_path,
      });
      setMcName(""); setMcDate(""); setMcFile(null); setMcOpen(false);
    } catch (err) {
      setMcError(err.message || "Errore nel salvataggio.");
    } finally {
      setMcBusy(false);
    }
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
      const typedName = medEmployeeName.trim();
      const alreadyInOrganigramma = employees.some(
        (emp) => `${emp.first_name} ${emp.last_name}`.trim() === typedName
      );
      if (!alreadyInOrganigramma) {
        const [firstName, ...rest] = typedName.split(" ");
        const lastName = rest.join(" ") || "";
        await addEmployee({
          first_name: firstName,
          last_name: lastName,
          job_role: medJobRole || null,
          department: null,
          security_role: "Dipendente",
        });

        // Avviso email al consulente: non blocca il salvataggio se fallisce, è solo un promemoria.
        try {
          const { data, error: fnError } = await supabase.functions.invoke("rapid-endpoint", {
            body: { company_id: company.id, first_name: firstName, last_name: lastName, job_role: medJobRole || null },
          });
          if (fnError) console.error("Notifica nuovo dipendente - errore dalla function:", fnError);
          else console.log("Notifica nuovo dipendente - risposta:", data);
        } catch (err) {
          console.error("Notifica nuovo dipendente non inviata:", err);
        }
      }

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

  // Tutti i lavoratori sono soggetti a sorveglianza sanitaria tranne il datore
  // di lavoro (identificato dal ruolo di sicurezza "RSPP Datore di Lavoro").
  const medicalComplianceList = employees
    .filter((emp) => emp.security_role !== "RSPP Datore di Lavoro")
    .map((emp) => {
      const fullName = `${emp.first_name} ${emp.last_name}`;
      const visits = medicalVisits.filter((v) => v.employee_name === fullName);
      const latest = visits.reduce((best, v) => {
        if (!v.visit_date) return best;
        if (!best || new Date(v.visit_date) > new Date(best.visit_date)) return v;
        return best;
      }, null);
      const info = latest ? expiryInfo(latest.expiry_date) : null;
      let status;
      if (!latest) {
        status = { label: "Nessuna visita registrata", cls: "pill-alert" };
      } else if (info) {
        status = { label: info.label, cls: info.cls };
      } else {
        status = { label: "Registrata (senza scadenza)", cls: "pill-ok" };
      }
      return { emp, fullName, status };
    });

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
          <div className="config-subtabs">
            <button
              type="button"
              className={"config-subtab" + (nomineView === "elenco" ? " active" : "")}
              onClick={() => setNomineView("elenco")}
            >
              <Award size={15} /> Elenco per persona
            </button>
            <button
              type="button"
              className={"config-subtab" + (nomineView === "quadro" ? " active" : "")}
              onClick={() => setNomineView("quadro")}
            >
              <Network size={15} /> Quadro della formazione
            </button>
          </div>

          {nomineView === "quadro" && (
            <div className="matrice">
              <p className="matrice-intro">
                Scadenza dell'attestato più recente per ogni persona e ogni incarico.
                Le caselle vuote sono incarichi che la persona non ricopre.
              </p>
              {matriceRoles.length === 0 ? (
                <div className="empty"><p>Nessuna nomina registrata.</p></div>
              ) : (
                <div className="matrice-scroll">
                  <table className="matrice-table">
                    <thead>
                      <tr>
                        <th className="mx-name">Persona</th>
                        {matriceRoles.map((r) => (
                          <th key={r}>{ROLE_SHORT[r] || r}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {appointmentGroups.map((g) => (
                        <tr key={g.name}>
                          <td className="mx-name">{g.name}</td>
                          {matriceRoles.map((r) => {
                            const c = matriceCell(g.name, r);
                            return (
                              <td key={r}>
                                {c
                                  ? <span className={"pill " + c.cls}>{c.label}</span>
                                  : <span className="mx-empty">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="matrice-legenda">
                <span className="pill pill-ok">valido</span>
                <span className="pill pill-warn">in scadenza entro 60 giorni</span>
                <span className="pill pill-alert">scaduto o mai svolto</span>
                <span className="mx-empty">—&nbsp;incarico non ricoperto</span>
              </div>
            </div>
          )}

          {nomineView === "elenco" && (
          <>
          <button
            type="button"
            className="btn-primary"
            onClick={() => (addingFor === "" ? setAddingFor(null) : openAddFor(""))}
            style={{ marginBottom: 16 }}
          >
            <Plus size={16} /> Nuova nomina o attestato
          </button>

          {addingFor === "" && appointmentForm(null)}

          {appointmentsLoading ? (
            <p className="sub">Caricamento…</p>
          ) : appointmentGroups.length === 0 ? (
            <div className="empty"><p>Nessuna nomina o attestato registrato.</p></div>
          ) : (
            <ul className="dish-list">
              {appointmentGroups.map((group) => (
                <li key={group.name} className="dish-row">
                  <div className="dish-top">
                    <div>
                      <strong>{group.name}</strong>
                      <span className="lot-tag">
                        {group.items.length} {group.items.length === 1 ? "incarico" : "incarichi"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => (addingFor === group.name ? setAddingFor(null) : openAddFor(group.name))}
                    >
                      {addingFor === group.name ? "Annulla" : "+ Aggiungi incarico"}
                    </button>
                  </div>

                  {addingFor === group.name && appointmentForm(group.name)}

                  <ul className="appt-list">
                    {group.items.map((item) => {
                      const info = appointmentStatus(item.id);
                      const corsi = trainingsFor(item.id);
                      const isEditing = editingApptId === item.id;
                      const isFormazione = item.role === FORMAZIONE_ROLE;

                      return (
                        <li key={item.id} className={"appt-item" + (!isEditing && info?.cls === "pill-alert" ? " row-warn" : "")}>
                          <div className="appt-top">
                            <p className="appt-role">{item.role}</p>
                            {!isEditing && (
                              <div>
                                <button className="icon-btn" onClick={() => startEditAppointment(item)} aria-label="Modifica"><Pencil size={14} /></button>
                                <button className="icon-btn" onClick={() => removeAppointment(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                              </div>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="nc-edit-block">
                              {/* Per la formazione lavoratori non c'è nessuna nomina da
                                  datare o allegare: si modifica solo la nota. */}
                              {!isFormazione && (
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
                              )}
                              <input type="text" placeholder="Nota (opzionale)" value={editNote} onChange={(e) => setEditNote(e.target.value)} className="full-input" />
                              {editError && <span className="file-error"><AlertTriangle size={13} /> {editError}</span>}
                              <div className="row-form" style={{ margin: "10px 0 0" }}>
                                <button type="button" className="btn-primary" onClick={() => saveEditAppointment(item)} disabled={editBusy}>
                                  <Check size={14} /> Salva
                                </button>
                                <button type="button" className="icon-btn" onClick={cancelEditAppointment} aria-label="Annulla"><X size={14} /> Annulla</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="traccia-meta">
                                {!isFormazione && item.nomina_issue_date && <span className="doc-type-tag">Nomina del {fmtDate(item.nomina_issue_date)}</span>}
                                {/* La nomina non scade: resta valida finché non viene
                                    revocata. Quello che scade è la formazione, e questa
                                    pill riassume la scadenza dell'attestato più recente.
                                    Il testo lo dice esplicitamente, altrimenti si legge
                                    come se a scadere fosse l'incarico. */}
                                {(() => {
                                  const ultimo = latestTraining(item.id);
                                  if (!info || !ultimo) return <span className="pill pill-alert">Nessun corso registrato</span>;
                                  const testo =
                                    info.cls === "pill-alert" ? "Formazione scaduta il " :
                                    info.cls === "pill-warn"  ? "Formazione in scadenza il " :
                                                                "Formazione valida fino al ";
                                  return <span className={"pill " + info.cls}>{testo}{fmtDate(ultimo.expiry_date)}</span>;
                                })()}
                              </div>
                              {item.note && <p className="pest-note">{item.note}</p>}
                              {!isFormazione && (
                                <div style={{ margin: "6px 0 10px" }}>
                                  <span className="appt-section-label">Nomina</span>
                                  <AttachmentLink path={item.nomina_attachment_path} />
                                </div>
                              )}
                            </>
                          )}

                          {/* Gli attestati restano visibili e modificabili anche mentre
                              si sta correggendo la nomina: sono due cose indipendenti. */}
                          <div className="tr-head">
                            <span className="appt-section-label">
                              Attestati di formazione{corsi.length > 0 ? ` (${corsi.length})` : ""}
                            </span>
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => (trainingFor === item.id ? setTrainingFor(null) : openTrainingFor(item.id))}
                            >
                              {trainingFor === item.id ? "Annulla" : "+ Aggiungi attestato"}
                            </button>
                          </div>

                          {trainingFor === item.id && (
                            <div className="nc-edit-block">
                              <div className="row-form" style={{ margin: "0 0 8px" }}>
                                <label className="field-label">Tipo
                                  <select value={trKind} onChange={(e) => setTrKind(e.target.value)}>
                                    {COURSE_KIND_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
                                  </select>
                                </label>
                                <label className="field-label">Data corso
                                  <input type="date" value={trIssueDate} onChange={(e) => handleTrIssueChange(e.target.value)} />
                                </label>
                                <label className="field-label">Anni di validità
                                  <input type="number" min="0" step="1" placeholder="es. 5" value={trValidityYears} onChange={(e) => handleTrYearsChange(e.target.value)} className="num" />
                                </label>
                                <label className="field-label">Scadenza
                                  <input type="date" value={trExpiryDate} onChange={(e) => setTrExpiryDate(e.target.value)} />
                                </label>
                              </div>
                              <label className="file-drop" htmlFor={`tr-file-${item.id}`}>
                                <Paperclip size={15} /><span>{trFile ? trFile.name : "Allega attestato (PDF o immagine)"}</span>
                                <input id={`tr-file-${item.id}`} type="file" accept=".pdf,image/*" onChange={onTrFileChange} hidden />
                              </label>
                              <input type="text" placeholder="Nota (opzionale)" value={trNote} onChange={(e) => setTrNote(e.target.value)} className="full-input" style={{ marginTop: 8 }} />
                              {trError && <span className="file-error"><AlertTriangle size={13} /> {trError}</span>}
                              <div className="row-form" style={{ margin: "10px 0 0" }}>
                                <button type="button" className="btn-primary" onClick={() => submitTraining(item.id)} disabled={trBusy}>
                                  <Plus size={14} /> {trBusy ? "Salvataggio…" : "Salva attestato"}
                                </button>
                                <button type="button" className="link-btn" onClick={() => setTrainingFor(null)}>Annulla</button>
                              </div>
                            </div>
                          )}

                          {corsi.length === 0 ? (
                            <p className="none-label" style={{ margin: "4px 0 0" }}>Nessun attestato registrato</p>
                          ) : (
                            <ul className="tr-list">
                              {corsi.map((t) => {
                                const tInfo = expiryInfo(t.expiry_date);
                                return (
                                  <li key={t.id} className="tr-item">
                                    <div className="tr-item-top">
                                      <span className="tr-kind">{t.course_kind}</span>
                                      {t.issue_date && <span className="doc-type-tag">del {fmtDate(t.issue_date)}</span>}
                                      {tInfo && <span className={"pill " + tInfo.cls}>{tInfo.label}</span>}
                                      <button className="icon-btn" onClick={() => removeTraining(t.id)} aria-label="Elimina attestato"><Trash2 size={13} /></button>
                                    </div>
                                    {t.note && <p className="pest-note" style={{ margin: "4px 0 0" }}>{t.note}</p>}
                                    <AttachmentLink path={t.attachment_path} />
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          </>
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
          <div className="tr-head">
            <span className="appt-section-label">Medico competente</span>
            {!medicoCompetente && !mcOpen && (
              <button type="button" className="link-btn" onClick={() => setMcOpen(true)}>+ Nomina medico competente</button>
            )}
          </div>

          {medicoCompetente ? (
            <ul className="appt-list" style={{ marginBottom: 20 }}>
              <li className="appt-item">
                <div className="appt-top">
                  <p className="appt-role">{medicoCompetente.person_name}</p>
                  <button className="icon-btn" onClick={() => removeAppointment(medicoCompetente.id)} aria-label="Elimina nomina"><Trash2 size={14} /></button>
                </div>
                <div className="traccia-meta">
                  {medicoCompetente.nomina_issue_date
                    ? <span className="doc-type-tag">Nomina del {fmtDate(medicoCompetente.nomina_issue_date)}</span>
                    : <span className="none-label">Data nomina non indicata</span>}
                </div>
                <AttachmentLink path={medicoCompetente.nomina_attachment_path} />
              </li>
            </ul>
          ) : !mcOpen ? (
            <p className="none-label" style={{ margin: "4px 0 20px" }}>Nessun medico competente nominato</p>
          ) : null}

          {mcOpen && !medicoCompetente && (
            <div className="nc-edit-block" style={{ marginBottom: 20 }}>
              <div className="row-form">
                <input type="text" placeholder="Nome e cognome del medico competente" value={mcName} onChange={(e) => setMcName(e.target.value)} className="note-input" />
                <label className="field-label">Data nomina
                  <input type="date" value={mcDate} onChange={(e) => setMcDate(e.target.value)} />
                </label>
              </div>
              <label className="file-drop" htmlFor="mc-file-input">
                <Paperclip size={15} /><span>{mcFile ? mcFile.name : "Allega lettera di incarico (PDF o immagine)"}</span>
                <input id="mc-file-input" type="file" accept=".pdf,image/*" onChange={onMcFileChange} hidden />
              </label>
              {mcError && <span className="file-error"><AlertTriangle size={13} /> {mcError}</span>}
              <div className="row-form" style={{ margin: "10px 0 0" }}>
                <button type="button" className="btn-primary" onClick={submitMedicoCompetente} disabled={mcBusy}>
                  <Plus size={14} /> {mcBusy ? "Salvataggio…" : "Salva nomina"}
                </button>
                <button type="button" className="link-btn" onClick={() => { setMcOpen(false); setMcError(""); }}>Annulla</button>
              </div>
            </div>
          )}

          {medicalComplianceList.length > 0 && (
            <div className="panel-head" style={{ marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: "0 0 6px" }}>Situazione visite mediche per dipendente</h3>
                <p className="sub" style={{ margin: 0 }}>
                  Tutti i lavoratori, tranne il datore di lavoro, sono soggetti per legge a sorveglianza sanitaria.
                </p>
              </div>
            </div>
          )}
          {medicalComplianceList.length > 0 && (
            <ul className="dish-list" style={{ marginBottom: 20 }}>
              {medicalComplianceList.map(({ emp, fullName, status }) => (
                <li key={emp.id} className="dish-row">
                  <div className="dish-top">
                    <div>
                      <strong>{fullName}</strong>
                      {emp.job_role && <span className="lot-tag">{emp.job_role}</span>}
                    </div>
                    <span className={"pill " + status.cls}>{status.label}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

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
