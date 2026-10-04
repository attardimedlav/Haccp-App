import React, { useState, useEffect } from "react";
import { CheckCircle2, CalendarClock, Download, Wrench, Droplets, SprayCan, Settings2, RefreshCw, Lock, Users, BookOpen, FileText, Paperclip, KeyRound, PenLine, Trash2, ClipboardCheck } from "lucide-react";
import { useAuth } from "../AuthContext";
import { downloadReminderICS } from "../hooks/useReminders";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";
import { fotoInFirma } from "../utils/firmaImmagine";
import { getSubscriptionStatus, pillClassFor } from "../subscriptionStatus";
import Attrezzature from "./Attrezzature";
import Sanificanti from "./Sanificanti";
import PianoPulizie from "./PianoPulizie";
import PreparazioneManuale from "./PreparazioneManuale";
import ArchivioFirme from "./ArchivioFirme";
import Dipendenti from "./Dipendenti";
import AccessoAzienda from "./AccessoAzienda";
import { scaricaProceduraRegistrazioni } from "../utils/proceduraRegistrazioniDocx";

const SUB_TABS = [
  { id: "generale", label: "Generale", icon: Settings2 },
  { id: "attrezzature", label: "Attrezzature", icon: Wrench },
  { id: "sanificanti", label: "Sanificanti", icon: Droplets },
  { id: "pulizie", label: "Piano pulizie", icon: SprayCan },
  { id: "preparazione", label: "Preparazione manuale", icon: ClipboardCheck },
  { id: "firmadatore", label: "Firma datore di lavoro", icon: PenLine },
  { id: "dipendenti", label: "Dipendenti", icon: Users },
];

// Solo il consulente crea le credenziali con cui l'azienda entra nell'app.
const TAB_ACCESSO = { id: "accesso", label: "Accesso", icon: KeyRound };

function addOneYear(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default function Configurazione({ onVai }) {
  const { company, updateCompany, error, homeCompanyId, consultantCompanies } = useAuth();
  const [name, setName] = useState("");
  const [consultantName, setConsultantName] = useState("");
  const [consultantEmail, setConsultantEmail] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [sedeLegale, setSedeLegale] = useState("");
  const [sedeOperativa, setSedeOperativa] = useState("");
  const [piva, setPiva] = useState("");
  const [pec, setPec] = useState("");
  const [formaGiuridica, setFormaGiuridica] = useState("");
  const [numeroRea, setNumeroRea] = useState("");
  const [codiceAteco, setCodiceAteco] = useState("");
  const [tipologiaAttivita, setTipologiaAttivita] = useState("");
  const [hasWaterTank, setHasWaterTank] = useState(false);
  const [hasWaterFilter, setHasWaterFilter] = useState(false);
  const [servesRawFish, setServesRawFish] = useState(false);
  const [activeHaccp, setActiveHaccp] = useState(true);
  const [activeTraceability, setActiveTraceability] = useState(true);
  const [hasBlastChiller, setHasBlastChiller] = useState(false);
  const [hasIceMachine, setHasIceMachine] = useState(false);
  const [hasFryer, setHasFryer] = useState(false);
  const [hasHood, setHasHood] = useState(true);
  const [iceMachineDays, setIceMachineDays] = useState("30");
  const [manualSource, setManualSource] = useState("app");
  const [manualPath, setManualPath] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState("");
  const [recordsMode, setRecordsMode] = useState("app");
  const [activeWorkSafety, setActiveWorkSafety] = useState(false);
  const [activeEquipmentChecks, setActiveEquipmentChecks] = useState(false);
  const [activeMedicalSurveillance, setActiveMedicalSurveillance] = useState(false);
  const [haccpManager, setHaccpManager] = useState("");
  // Firma del responsabile: si allega come qualunque altro allegato, nello
  // storage dell'azienda; qui resta il percorso, e l'anteprima e' il PNG
  // appena elaborato oppure un link temporaneo al file gia' caricato.
  const [firmaPath, setFirmaPath] = useState("");
  const [firmaAnteprima, setFirmaAnteprima] = useState("");
  const [firmaBusy, setFirmaBusy] = useState(false);
  const [firmaErrore, setFirmaErrore] = useState("");
  // Autorizzazione del firmatario: senza, la firma non si carica e non si
  // appone. Apporre la firma di un'altra persona regge solo se quella
  // persona lo ha consentito, e la data serve a dire da quando.
  const [firmaConsensoAl, setFirmaConsensoAl] = useState("");
  const [firmaConsensoNota, setFirmaConsensoNota] = useState("");
  const [subscriptionStart, setSubscriptionStart] = useState("");
  const [subscriptionEnd, setSubscriptionEnd] = useState("");
  const [subscriptionAmount, setSubscriptionAmount] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState("attivo");
  const [subscriptionNote, setSubscriptionNote] = useState("");
  const [tosAcceptedAt, setTosAcceptedAt] = useState("");
  const [dpaSignedAt, setDpaSignedAt] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subTab, setSubTab] = useState("generale");

  // Solo chi entra come consulente in un'azienda cliente (non la propria) può gestire l'abbonamento.
  const canManageSubscription = !!(company && homeCompanyId && company.id !== homeCompanyId);

  // Tracciabilita', abbattitore e macchina del ghiaccio li attiva solo il
  // consulente, anche sulla propria azienda (serve per provarli): sono moduli
  // che richiedono un'impostazione fatta da chi conosce l'attivita'.
  const isConsultant = (consultantCompanies || []).length > 0;

  useEffect(() => {
    if (company) {
      setName(company.name || "");
      setConsultantName(company.consultant_name || "");
      setConsultantEmail(company.consultant_email || "");
      setOwnerEmail(company.owner_email || "");
      setSedeLegale(company.sede_legale || "");
      setSedeOperativa(company.sede_operativa || "");
      setPiva(company.piva || "");
      setPec(company.pec || "");
      setFormaGiuridica(company.forma_giuridica || "");
      setNumeroRea(company.numero_rea || "");
      setCodiceAteco(company.codice_ateco || "");
      setTipologiaAttivita(company.tipologia_attivita || "");
      setHasWaterTank(!!company.has_water_tank);
      setHasWaterFilter(!!company.has_water_filter);
      setServesRawFish(!!company.serves_raw_fish);
      setActiveTraceability(company.active_traceability !== false);
      setHasBlastChiller(!!company.has_blast_chiller);
      setHasIceMachine(!!company.has_ice_machine);
      setHasFryer(!!company.has_fryer);
      setHasHood(company.has_hood !== false);
      setIceMachineDays(String(company.ice_machine_cleaning_days || 30));
      setManualSource(company.haccp_manual_source === "esterno" ? "esterno" : "app");
      setManualPath(company.haccp_manual_path || "");
      setManualNote(company.haccp_manual_note || "");
      setRecordsMode(company.haccp_records_mode === "cartaceo" ? "cartaceo" : "app");
      // Di default il modulo HACCP è attivo: lo consideriamo spento solo se
      // qualcuno lo ha esplicitamente disattivato (valore false), non se la
      // colonna è semplicemente vuota/non ancora impostata.
      setActiveHaccp(company.active_haccp !== false);
      setActiveWorkSafety(!!company.active_work_safety);
      setActiveEquipmentChecks(!!company.active_equipment_checks);
      setActiveMedicalSurveillance(!!company.active_medical_surveillance);
      setHaccpManager(company.haccp_manager || "");
      setFirmaPath(company.haccp_signature_path || "");
      setFirmaConsensoAl(company.haccp_signature_consent_at || "");
      setFirmaConsensoNota(company.haccp_signature_consent_note || "");
      setSubscriptionStart(company.subscription_start || "");
      setSubscriptionEnd(company.subscription_end || "");
      setSubscriptionAmount(
        company.subscription_amount === null || company.subscription_amount === undefined
          ? ""
          : String(company.subscription_amount)
      );
      setSubscriptionStatus(company.subscription_status || "attivo");
      setSubscriptionNote(company.subscription_note || "");
      setTosAcceptedAt(company.tos_accepted_at || "");
      setDpaSignedAt(company.dpa_signed_at || "");
    }
  }, [company]);

  const buildPayload = (overrides = {}) => ({
    name,
    consultant_name: consultantName,
    consultant_email: consultantEmail,
    owner_email: ownerEmail,
    sede_legale: sedeLegale,
    sede_operativa: sedeOperativa,
    piva: piva,
    pec: pec,
    forma_giuridica: formaGiuridica,
    numero_rea: numeroRea,
    codice_ateco: codiceAteco,
    tipologia_attivita: tipologiaAttivita,
    has_water_tank: hasWaterTank,
    has_water_filter: hasWaterFilter,
    serves_raw_fish: servesRawFish,
    active_traceability: activeTraceability,
    has_blast_chiller: hasBlastChiller,
    has_ice_machine: hasIceMachine,
    has_fryer: hasFryer,
    has_hood: hasHood,
    ice_machine_cleaning_days: Math.max(1, parseInt(iceMachineDays, 10) || 30),
    haccp_manual_source: manualSource,
    haccp_manual_path: manualPath || null,
    haccp_manual_note: manualNote || null,
    haccp_records_mode: recordsMode,
    active_haccp: activeHaccp,
    active_work_safety: activeWorkSafety,
    active_equipment_checks: activeEquipmentChecks,
    active_medical_surveillance: activeMedicalSurveillance,
    haccp_manager: haccpManager,
    haccp_signature_path: firmaPath || null,
    haccp_signature_consent_at: firmaConsensoAl || null,
    haccp_signature_consent_note: firmaConsensoNota || null,
    subscription_start: subscriptionStart || null,
    subscription_end: subscriptionEnd || null,
    subscription_amount: subscriptionAmount === "" ? null : Number(subscriptionAmount),
    subscription_status: subscriptionStatus,
    subscription_note: subscriptionNote,
    tos_accepted_at: tosAcceptedAt || null,
    dpa_signed_at: dpaSignedAt || null,
    ...overrides,
  });

  // Manuale HACCP già esistente: il file viene caricato subito nello storage
  // dell'azienda; il percorso resta in stato e viene salvato con il resto della
  // configurazione al Salva.
  // La foto della firma non si carica com'e': la carta diventa trasparente,
  // il tratto viene isolato e ritagliato, e quello che finisce nello storage
  // e' un PNG della misura che il manuale si aspetta. Senza questo passaggio
  // nel documento comparirebbe il rettangolo grigio del foglio fotografato.
  const onFirmaFile = async (e) => {
    const f = e.target.files?.[0] || null;
    setFirmaErrore("");
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) {
      setFirmaErrore("Foto troppo grande (limite 12 MB).");
      e.target.value = "";
      return;
    }
    if (!firmaConsensoAl) {
      setFirmaErrore("Prima serve la dichiarazione di autorizzazione del responsabile, qui sotto.");
      e.target.value = "";
      return;
    }
    setFirmaBusy(true);
    try {
      const firma = await fotoInFirma(f);
      const path = await uploadAttachment(company.id, firma.file);
      setFirmaPath(path);
      setFirmaAnteprima(firma.dataUrl);
      await updateCompany(buildPayload({ haccp_signature_path: path }));
    } catch (err) {
      setFirmaErrore(err.message || "Non è stato possibile elaborare la foto.");
    } finally {
      setFirmaBusy(false);
      e.target.value = "";
    }
  };

  // Togliendo l'autorizzazione si toglie anche la firma: tenerla caricata
  // ma inutilizzabile sarebbe uno stato che nessuno capisce guardando la
  // pagina, e il primo a non capirlo sarebbe chi genera il manuale.
  const cambiaConsenso = async (dato) => {
    if (!dato && firmaPath) {
      if (!window.confirm("Togliendo l'autorizzazione si toglie anche la firma caricata. Procedere?")) return;
      setFirmaPath("");
      setFirmaAnteprima("");
      setFirmaConsensoAl("");
      await updateCompany(buildPayload({ haccp_signature_path: null, haccp_signature_consent_at: null }));
      return;
    }
    setFirmaConsensoAl(dato);
    await updateCompany(buildPayload({ haccp_signature_consent_at: dato || null }));
  };

  const togliFirma = async () => {
    if (!window.confirm("Togliere la firma del responsabile? I manuali già generati non cambiano.")) return;
    setFirmaPath("");
    setFirmaAnteprima("");
    await updateCompany(buildPayload({ haccp_signature_path: null }));
  };

  // anteprima del file già caricato in una sessione precedente
  useEffect(() => {
    let vivo = true;
    if (firmaPath && !firmaAnteprima) {
      getAttachmentUrl(firmaPath).then((url) => { if (vivo && url) setFirmaAnteprima(url); });
    }
    return () => { vivo = false; };
  }, [firmaPath]);   // eslint-disable-line react-hooks/exhaustive-deps

  const onManualFile = async (e) => {
    const f = e.target.files?.[0] || null;
    setManualError("");
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) {
      setManualError("File troppo grande (limite 12 MB).");
      e.target.value = "";
      return;
    }
    setManualBusy(true);
    try {
      const path = await uploadAttachment(company.id, f);
      setManualPath(path);
      const ok = await updateCompany(buildPayload({
        haccp_manual_source: "esterno",
        haccp_manual_path: path,
        haccp_manual_updated_at: new Date().toISOString(),
      }));
      if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    } catch (err) {
      setManualError("Errore durante il caricamento: " + err.message);
    } finally {
      setManualBusy(false);
      e.target.value = "";
    }
  };

  const apriManuale = async () => {
    if (!manualPath) return;
    const url = await getAttachmentUrl(manualPath);
    if (url) window.open(url, "_blank", "noopener");
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await updateCompany(buildPayload());
    setBusy(false);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  // Quando cambia la data di inizio, la scadenza si ricalcola sempre da sola: +1 anno.
  const handleStartChange = (value) => {
    setSubscriptionStart(value);
    setSubscriptionEnd(addOneYear(value));
  };

  const renewFromToday = async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const newEnd = addOneYear(todayStr);
    setBusy(true);
    const ok = await updateCompany(buildPayload({
      subscription_start: todayStr,
      subscription_end: newEnd,
      subscription_status: "attivo",
    }));
    setBusy(false);
    if (ok) {
      setSubscriptionStart(todayStr);
      setSubscriptionEnd(newEnd);
      setSubscriptionStatus("attivo");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  const markTosAccepted = async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setBusy(true);
    const ok = await updateCompany(buildPayload({ tos_accepted_at: todayStr }));
    setBusy(false);
    if (ok) { setTosAcceptedAt(todayStr); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  const markDpaSigned = async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setBusy(true);
    const ok = await updateCompany(buildPayload({ dpa_signed_at: todayStr }));
    setBusy(false);
    if (ok) { setDpaSignedAt(todayStr); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  const subStatus = getSubscriptionStatus(company);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Configurazione</h2>
          <p className="sub">Dati dell'attività, del consulente HACCP e impostazioni generali.</p>
        </div>
      </div>

      <div className="config-subtabs">
        {(isConsultant ? [...SUB_TABS, TAB_ACCESSO] : SUB_TABS).map((t) => (
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

      {subTab === "attrezzature" && <Attrezzature />}
      {subTab === "sanificanti" && <Sanificanti />}
      {subTab === "pulizie" && <PianoPulizie />}
      {subTab === "firmadatore" && <ArchivioFirme ambito="azienda" />}
      {subTab === "preparazione" && (
        <PreparazioneManuale
          onVai={(dove) => {
            // Le sotto-schede si cambiano qui dentro; per le schede vere
            // dell'app serve App, che possiede lo stato della navigazione.
            if (dove.tipo === "sub") { setSubTab(dove.id); window.scrollTo({ top: 0, behavior: "smooth" }); }
            else if (onVai) onVai(dove.id);
          }}
        />
      )}
      {subTab === "dipendenti" && <Dipendenti />}
      {subTab === "accesso" && isConsultant && <AccessoAzienda />}

      {subTab === "generale" && (
        <>
          <form onSubmit={submit} className="config-form">
            <fieldset className="config-group">
              <legend>Attività</legend>
              <input type="text" placeholder="Ragione sociale / nome attività" value={name} onChange={(e) => setName(e.target.value)} className="full-input" />
              <input type="email" placeholder="Email del titolare" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="full-input" style={{ marginTop: 10 }} />
              <div className="config-grid-2" style={{ marginTop: 10 }}>
                <input type="text" placeholder="Sede legale (indirizzo completo)" value={sedeLegale} onChange={(e) => setSedeLegale(e.target.value)} className="full-input" />
                <input type="text" placeholder="Sede operativa (se diversa)" value={sedeOperativa} onChange={(e) => setSedeOperativa(e.target.value)} className="full-input" />
              </div>
              <div className="config-grid-2" style={{ marginTop: 10 }}>
                <input type="text" placeholder="P.IVA" value={piva} onChange={(e) => setPiva(e.target.value)} className="full-input" />
                <input type="email" placeholder="PEC" value={pec} onChange={(e) => setPec(e.target.value)} className="full-input" />
              </div>
              <div className="config-grid-2" style={{ marginTop: 10 }}>
                <input type="text" placeholder="Forma giuridica (es. S.R.L., S.N.C., Ditta individuale...)" value={formaGiuridica} onChange={(e) => setFormaGiuridica(e.target.value)} className="full-input" />
                <input type="text" placeholder="Numero REA (es. CT - 346696)" value={numeroRea} onChange={(e) => setNumeroRea(e.target.value)} className="full-input" />
              </div>
              <p className="sub" style={{ marginTop: 6 }}>
                Questi dati, insieme a Sede legale e P.IVA, vengono usati per compilare da soli i documenti di nomina generati automaticamente in Sicurezza sul lavoro.
              </p>
              <div className="config-grid-2" style={{ marginTop: 10 }}>
                <input type="text" placeholder="Codice ATECO" value={codiceAteco} onChange={(e) => setCodiceAteco(e.target.value)} className="full-input" />
                <input type="text" placeholder="Tipologia di attività (es. Ristorazione, Bar...)" value={tipologiaAttivita} onChange={(e) => setTipologiaAttivita(e.target.value)} className="full-input" />
              </div>
              <label className="checkbox-row" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={activeHaccp} onChange={(e) => setActiveHaccp(e.target.checked)} />
                Attiva il modulo HACCP (autocontrollo alimentare)
              </label>
              <p className="sub" style={{ marginTop: 4, marginLeft: 26 }}>
                Disattivalo per i clienti che non sono attività alimentari (es. aziende seguite solo per la sicurezza sul lavoro): nel menu resteranno visibili solo Sicurezza sul lavoro e Configurazione. I dati già inseriti restano salvati.
              </p>
              {activeHaccp && (
                <>
                  <label className="checkbox-row" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={hasWaterTank} onChange={(e) => setHasWaterTank(e.target.checked)} />
                    L'attività ha una vasca di accumulo dell'acqua
                  </label>
                  <label className="checkbox-row" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={hasWaterFilter} onChange={(e) => setHasWaterFilter(e.target.checked)} />
                    L'attività ha un impianto di filtrazione o trattamento dell'acqua (addolcitore, osmosi, filtri)
                  </label>
                  <label className="checkbox-row" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={servesRawFish} onChange={(e) => setServesRawFish(e.target.checked)} />
                    L'attività somministra pesce crudo (richiede abbattimento a norma)
                  </label>

                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px dashed #D8DED6" }}>
                    {!isConsultant && (
                      <p className="sub" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <Lock size={13} /> Le voci seguenti possono essere modificate solo dal tuo consulente HACCP.
                      </p>
                    )}
                    <label className="checkbox-row">
                      <input type="checkbox" checked={activeTraceability} disabled={!isConsultant} onChange={(e) => setActiveTraceability(e.target.checked)} />
                      Attiva Arrivo merci e tracciabilità (ricevimento merci con lettura automatica di bolle e fatture)
                    </label>
                    <label className="checkbox-row" style={{ marginTop: 8 }}>
                      <input type="checkbox" checked={hasBlastChiller} disabled={!isConsultant} onChange={(e) => setHasBlastChiller(e.target.checked)} />
                      L'attività ha un abbattitore (registro abbattimento dei prodotti cotti)
                    </label>
                    <label className="checkbox-row" style={{ marginTop: 8 }}>
                      <input type="checkbox" checked={hasIceMachine} disabled={!isConsultant} onChange={(e) => setHasIceMachine(e.target.checked)} />
                      L'attività ha una macchina del ghiaccio (registro pulizia e sanificazione)
                    </label>
                    <label className="checkbox-row" style={{ marginTop: 8 }}>
                      <input type="checkbox" checked={hasFryer} disabled={!isConsultant} onChange={(e) => setHasFryer(e.target.checked)} />
                      L'attività ha una friggitrice (registro dei cambi olio)
                    </label>
                    <label className="checkbox-row" style={{ marginTop: 8 }}>
                      <input type="checkbox" checked={hasHood} disabled={!isConsultant} onChange={(e) => setHasHood(e.target.checked)} />
                      L'attività ha una cappa aspirante (pulizia delle superfici e dei filtri nel piano pulizie)
                    </label>
                    {hasIceMachine && (
                      <label className="field-label" style={{ marginTop: 8, marginLeft: 26, display: "flex", alignItems: "center", gap: 8, flexDirection: "row" }}>
                        Pulizia e sanificazione ogni
                        <input type="number" min="1" value={iceMachineDays} disabled={!isConsultant} onChange={(e) => setIceMachineDays(e.target.value)} className="full-input" style={{ width: 80 }} />
                        giorni (secondo il manuale del produttore)
                      </label>
                    )}

                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px dashed #D8DED6" }}>
                      <p className="field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <BookOpen size={14} /> Manuale di autocontrollo HACCP
                      </p>
                      <label className="checkbox-row" style={{ marginTop: 6 }}>
                        <input type="radio" name="manual-source" checked={manualSource === "app"} disabled={!isConsultant} onChange={() => setManualSource("app")} />
                        Il manuale viene redatto qui, con i dati dell'azienda presenti nell'app
                      </label>
                      <label className="checkbox-row" style={{ marginTop: 6 }}>
                        <input type="radio" name="manual-source" checked={manualSource === "esterno"} disabled={!isConsultant} onChange={() => setManualSource("esterno")} />
                        L'azienda ha già un proprio manuale: lo carico io a mano
                      </label>

                      {manualSource === "esterno" && (
                        <div style={{ marginTop: 8, marginLeft: 26 }}>
                          {manualPath ? (
                            <p className="sub" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <FileText size={14} />
                              <button type="button" className="link-btn" onClick={apriManuale}>
                                {manualPath.split("/").pop()}
                              </button>
                              <Download size={13} />
                            </p>
                          ) : (
                            <p className="sub">Nessun manuale caricato.</p>
                          )}
                          {isConsultant && (
                            <label className="field-label" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                              <Paperclip size={14} />
                              {manualBusy ? "Caricamento in corso…" : (manualPath ? "Sostituisci il file (PDF, max 12 MB)" : "Carica il manuale (PDF, max 12 MB)")}
                              <input type="file" accept="application/pdf,image/*" disabled={manualBusy} onChange={onManualFile} />
                            </label>
                          )}
                          <input
                            type="text"
                            placeholder="Riferimenti del manuale esistente (autore, revisione, data)"
                            value={manualNote}
                            disabled={!isConsultant}
                            onChange={(e) => setManualNote(e.target.value)}
                            className="full-input"
                            style={{ marginTop: 8 }}
                          />
                          {manualError && <p className="file-error" style={{ marginTop: 6 }}>{manualError}</p>}
                        </div>
                      )}

                      <p className="field-label" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
                        <FileText size={14} /> Come l'azienda tiene le schede di autocontrollo
                      </p>
                      <label className="checkbox-row" style={{ marginTop: 6 }}>
                        <input type="radio" name="records-mode" checked={recordsMode === "app"} disabled={!isConsultant} onChange={() => setRecordsMode("app")} />
                        Nell'app: temperature, sanificazione, arrivo merci e le altre schede si compilano qui
                      </label>
                      <label className="checkbox-row" style={{ marginTop: 6 }}>
                        <input type="radio" name="records-mode" checked={recordsMode === "cartaceo"} disabled={!isConsultant} onChange={() => setRecordsMode("cartaceo")} />
                        Su carta: l'azienda compila le schede stampate e le conserva in sede
                      </label>
                      {/* Il foglio separato serve solo quando il manuale non lo
                          scriviamo noi: se lo genera l'app, la procedura è già
                          dentro al capitolo 10.1 e stamparla a parte
                          significherebbe avere due copie della stessa cosa. */}
                      {recordsMode === "app" && manualSource === "app" && (
                        <p className="sub" style={{ marginTop: 8 }}>
                          La procedura sulla tenuta delle registrazioni su supporto informatico è già scritta
                          dentro il manuale generato dall'app, al capitolo 10. Non serve stamparla a parte.
                        </p>
                      )}
                      {recordsMode === "app" && manualSource === "esterno" && (
                        <div className="reminder-block" style={{ marginTop: 10 }}>
                          <div className="reminder-head">
                            <FileText size={17} color="#2F6F4E" />
                            <div>
                              <h3>Procedura da allegare al manuale dell'azienda</h3>
                              <p className="sub">
                                Il manuale di questa azienda l'ha scritto qualcun altro e non dice niente sulle
                                registrazioni informatiche. Questo foglio lo spiega — come sono tenute, conservate
                                ed esibite, con i riferimenti normativi: si stampa, si firma e si allega al manuale
                                cartaceo esistente.
                              </p>
                            </div>
                          </div>
                          <button
                            type="button" className="btn-primary"
                            onClick={() => scaricaProceduraRegistrazioni(company || {})}
                          >
                            <Download size={16} /> Scarica la procedura (.docx)
                          </button>
                        </div>
                      )}
                      <p className="sub" style={{ marginTop: 6, marginLeft: 26 }}>
                        Questa scelta viene scritta nel manuale: se le registrazioni sono nell'app il manuale lo dichiara, altrimenti rimanda alle schede cartacee allegate. In modalità cartacea le sezioni di registrazione restano comunque disponibili, ma l'azienda non è tenuta a compilarle.
                      </p>
                    </div>
                  </div>
                </>
              )}
              <label className="checkbox-row" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={activeWorkSafety} onChange={(e) => setActiveWorkSafety(e.target.checked)} />
                Attiva il modulo Sicurezza sul lavoro (DVR, nomine e attestati — D.Lgs. 81/08)
              </label>
              {activeWorkSafety && (
                <label className="checkbox-row" style={{ marginTop: 8, marginLeft: 26 }}>
                  <input type="checkbox" checked={activeEquipmentChecks} onChange={(e) => setActiveEquipmentChecks(e.target.checked)} />
                  Attiva anche il tracciamento attrezzature e verifiche (patentini, messa a terra, manutenzioni)
                </label>
              )}
              {activeWorkSafety && (
                <label className="checkbox-row" style={{ marginTop: 8, marginLeft: 26 }}>
                  <input type="checkbox" checked={activeMedicalSurveillance} onChange={(e) => setActiveMedicalSurveillance(e.target.checked)} />
                  Attiva anche la sorveglianza sanitaria (visite mediche periodiche dei dipendenti)
                </label>
              )}
            </fieldset>

            <fieldset className="config-group">
              <legend>Responsabile del sistema HACCP</legend>
              <input
                type="text"
                placeholder="Nome e cognome del responsabile HACCP"
                value={haccpManager}
                onChange={(e) => setHaccpManager(e.target.value)}
                className="full-input"
              />
              <p className="sub" style={{ marginTop: 6 }}>
                Questo nome comparirà come scelta rapida nei campi operatore/responsabile delle schede.
              </p>

              <label className="checkbox-row" style={{ marginTop: 14, alignItems: "flex-start" }}>
                <input
                  type="checkbox" checked={!!firmaConsensoAl}
                  onChange={(e) => cambiaConsenso(e.target.checked ? new Date().toISOString().slice(0, 10) : "")}
                />
                <span>
                  Il responsabile mi ha autorizzato ad apporre la sua firma sui documenti che l'app
                  genera per questa azienda.
                </span>
              </label>
              {firmaConsensoAl && (
                <div className="row-form" style={{ marginTop: 8 }}>
                  <label className="field-label">
                    Autorizzazione resa il
                    <input type="date" value={firmaConsensoAl} onChange={(e) => setFirmaConsensoAl(e.target.value)} />
                  </label>
                  <input
                    type="text" className="note-input" placeholder="Come è stata resa (a voce, per iscritto, via email…)"
                    value={firmaConsensoNota} onChange={(e) => setFirmaConsensoNota(e.target.value)}
                  />
                </div>
              )}

              <label className="file-drop" htmlFor="firma-haccp-file-input" style={{ marginTop: 12 }}>
                <PenLine size={15} />
                <span>
                  {firmaBusy
                    ? "Elaborazione della firma…"
                    : firmaPath
                      ? "Sostituisci la firma del responsabile"
                      : "Allega la firma del responsabile (foto o immagine)"}
                </span>
                <input
                  id="firma-haccp-file-input" type="file" accept="image/*" hidden
                  onChange={onFirmaFile} disabled={firmaBusy || !company?.id || !firmaConsensoAl}
                />
              </label>
              {firmaErrore && <span className="file-error"><Paperclip size={13} /> {firmaErrore}</span>}
              {firmaAnteprima && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                  <img
                    src={firmaAnteprima} alt="Firma del responsabile HACCP"
                    style={{ height: 58, background: "#FFFFFF", border: "1px solid #D8E0DA", borderRadius: 6, padding: "4px 10px" }}
                  />
                  <button type="button" className="icon-btn" onClick={togliFirma} aria-label="Togli la firma" title="Togli la firma">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
              <p className="sub" style={{ marginTop: 6 }}>
                Il responsabile firma a penna su un foglio bianco e ne scatta una foto: l'app isola il
                tratto, rende trasparente la carta e tiene solo la firma. Da quel momento il manuale
                generato esce già firmato, in calce alla dichiarazione di adozione, con l'indicazione
                della data in cui l'autorizzazione è stata resa. Senza la dichiarazione qui sopra la
                firma non si carica e non viene apposta.
              </p>
            </fieldset>

            <fieldset className="config-group">
              <legend>Fornitore del servizio (consulente HACCP)</legend>
              <input type="text" placeholder="Nome e cognome" value={consultantName} onChange={(e) => setConsultantName(e.target.value)} className="full-input" />
              <input type="email" placeholder="Email" value={consultantEmail} onChange={(e) => setConsultantEmail(e.target.value)} className="full-input" style={{ marginTop: 10 }} />
            </fieldset>

            <fieldset className="config-group">
              <legend>Abbonamento</legend>

              {subStatus && (
                <div style={{ marginBottom: 12 }}>
                  <span className={"pill " + pillClassFor(subStatus.state)}>{subStatus.label}</span>
                </div>
              )}

              {!canManageSubscription && (
                <p className="sub" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <Lock size={13} /> Questa sezione può essere modificata solo dal tuo consulente HACCP.
                </p>
              )}

              <div className="config-grid-2">
                <label className="field-label">
                  Inizio abbonamento
                  <input
                    type="date"
                    value={subscriptionStart}
                    onChange={(e) => handleStartChange(e.target.value)}
                    className="full-input"
                    disabled={!canManageSubscription}
                  />
                </label>
                <label className="field-label">
                  Scadenza abbonamento (calcolata: +1 anno)
                  <input
                    type="date"
                    value={subscriptionEnd}
                    className="full-input computed-field"
                    disabled
                    readOnly
                  />
                </label>
              </div>
              <div className="config-grid-2" style={{ marginTop: 10 }}>
                <label className="field-label">
                  Importo (€)
                  <input
                    type="number" step="0.01" min="0"
                    value={subscriptionAmount}
                    onChange={(e) => setSubscriptionAmount(e.target.value)}
                    className="full-input"
                    disabled={!canManageSubscription}
                  />
                </label>
                <label className="field-label">
                  Stato
                  <select
                    value={subscriptionStatus}
                    onChange={(e) => setSubscriptionStatus(e.target.value)}
                    className="full-input"
                    disabled={!canManageSubscription}
                  >
                    <option value="attivo">Attivo</option>
                    <option value="scaduto">Scaduto</option>
                    <option value="sospeso">Sospeso</option>
                  </select>
                </label>
              </div>
              <textarea
                placeholder="Note (es. modalità di pagamento, riferimento fattura...)"
                value={subscriptionNote}
                onChange={(e) => setSubscriptionNote(e.target.value)}
                className="full-input"
                style={{ marginTop: 10, minHeight: 70 }}
                disabled={!canManageSubscription}
              />

              {canManageSubscription && (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={renewFromToday}
                    disabled={busy}
                    style={{ marginTop: 12 }}
                  >
                    <RefreshCw size={15} /> Rinnova da oggi (+1 anno)
                  </button>
                  <p className="sub" style={{ marginTop: 6 }}>
                    Imposta l'inizio a oggi, calcola la scadenza tra 12 mesi e riporta lo stato su Attivo — salva subito.
                  </p>
                </>
              )}
            </fieldset>

            <fieldset className="config-group">
              <legend>Documenti legali</legend>

              {!canManageSubscription && (
                <p className="sub" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <Lock size={13} /> Questa sezione può essere modificata solo dal tuo consulente HACCP.
                </p>
              )}

              <div className="config-grid-2">
                <label className="field-label">
                  Termini di servizio accettati il
                  <input
                    type="date"
                    value={tosAcceptedAt}
                    onChange={(e) => setTosAcceptedAt(e.target.value)}
                    className="full-input"
                    disabled={!canManageSubscription}
                  />
                </label>
                <label className="field-label">
                  Accordo di nomina a Responsabile firmato il
                  <input
                    type="date"
                    value={dpaSignedAt}
                    onChange={(e) => setDpaSignedAt(e.target.value)}
                    className="full-input"
                    disabled={!canManageSubscription}
                  />
                </label>
              </div>

              {canManageSubscription && (
                <div className="row-form" style={{ margin: "12px 0 0" }}>
                  {!tosAcceptedAt && (
                    <button type="button" className="btn-primary" onClick={markTosAccepted} disabled={busy}>
                      <CheckCircle2 size={15} /> Segna Termini come accettati oggi
                    </button>
                  )}
                  {!dpaSignedAt && (
                    <button type="button" className="btn-primary" onClick={markDpaSigned} disabled={busy}>
                      <CheckCircle2 size={15} /> Segna Accordo come firmato oggi
                    </button>
                  )}
                </div>
              )}

              {(!tosAcceptedAt || !dpaSignedAt) && (
                <p className="sub" style={{ marginTop: 10 }}>
                  {!tosAcceptedAt && !dpaSignedAt
                    ? "Termini di servizio e Accordo di nomina non ancora registrati per questa azienda."
                    : !tosAcceptedAt
                    ? "Termini di servizio non ancora registrati per questa azienda."
                    : "Accordo di nomina non ancora registrato per questa azienda."}
                </p>
              )}
            </fieldset>

            <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
              <CheckCircle2 size={16} /> Salva configurazione
            </button>
            {saved && <span className="saved-note"><CheckCircle2 size={13} /> Salvato</span>}
            {!saved && error && <p className="login-error" style={{ marginTop: 4 }}>Errore nel salvataggio: {error}</p>}
          </form>

          <div className="reminder-block">
            <div className="reminder-head">
              <CalendarClock size={17} color="#2F6F4E" />
              <div>
                <h3>Promemoria compilazione sul telefono</h3>
                <p className="sub">Scarica il file e aprilo con l'app Calendario del telefono (Google, Apple o Outlook). Il calendario avvisa da solo, anche ad app chiusa — non serve un server.</p>
              </div>
            </div>
            <ul className="reminder-list">
              <li>Ogni giorno alle 8:00 — temperature e sanificazione</li>
              <li>Ogni lunedì alle 8:00 — monitoraggio infestanti</li>
            </ul>
            <button type="button" className="btn-primary" onClick={() => downloadReminderICS(name)}>
              <Download size={16} /> Scarica promemoria (.ics)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
