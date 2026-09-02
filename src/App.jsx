import React, { useState } from "react";
import { Thermometer, SprayCan, Bug, ChevronRight, ChevronDown, LogOut, ShieldCheck, ShieldAlert, GraduationCap, Package, Building2, Settings, Printer, ClipboardX, Droplet, Users, ArrowLeftCircle, FolderOpen, Snowflake, HardHat, FileText, Paperclip, Award, Wrench, Stethoscope, Network } from "lucide-react";
import { AuthProvider, useAuth } from "./AuthContext";
import { useTable } from "./hooks/useTable";
import Login from "./Login";
import ResetPassword from "./ResetPassword";
import Dashboard from "./modules/Dashboard";
import Temperature from "./modules/Temperature";
import AbbattimentoPesce from "./modules/AbbattimentoPesce";
import SicurezzaLavoro from "./modules/SicurezzaLavoro";
import Sanificazione from "./modules/Sanificazione";
import Infestanti from "./modules/Infestanti";
import Allergeni from "./modules/Allergeni";
import Formazione from "./modules/Formazione";
import Tracciabilita from "./modules/Tracciabilita";
import RegistrazioneSanitaria from "./modules/RegistrazioneSanitaria";
import Configurazione from "./modules/Configurazione";
import PrintHeader from "./PrintHeader";
import NonConformita from "./modules/NonConformita";
import AcquePotabili from "./modules/AcquePotabili";
import MieiClienti from "./modules/MieiClienti";
import Documenti from "./modules/Documenti";
import { getSubscriptionStatus, isSubscriptionBlocked, getBannerTier } from "./subscriptionStatus";

const MAIN_TABS = [
  { id: "temperature", label: "Temperature", icon: Thermometer },
  { id: "sanificazione", label: "Sanificazione", icon: SprayCan },
  { id: "infestanti", label: "Monitoraggio infestanti", icon: Bug },
  { id: "acquepotabili", label: "Acque potabili", icon: Droplet },
  { id: "tracciabilita", label: "Tracciabilità", icon: Package },
  { id: "nonconformita", label: "Non conformità", icon: ClipboardX },
  { id: "abbattimento", label: "Abbattimento pesce crudo", icon: Snowflake },
];

const STATIC_TABS = [
  { id: "allergeni", label: "Allergeni", icon: ShieldAlert },
  { id: "formazione", label: "Formazione", icon: GraduationCap },
  { id: "registrazione", label: "Registrazione sanitaria", icon: Building2 },
  { id: "documenti", label: "Documenti", icon: FolderOpen },
];

const WORK_SAFETY_SUB_ITEMS = [
  { id: "organigramma", label: "Organigramma", icon: Network },
  { id: "dvr", label: "DVR", icon: FileText },
  { id: "allegati", label: "Allegati al DVR", icon: Paperclip },
  { id: "nomine", label: "Nomine e Attestati", icon: Award },
  { id: "conformita", label: "Conformità", icon: ShieldAlert },
  { id: "attrezzature", label: "Attrezzature", icon: Wrench, requires: "active_equipment_checks" },
  { id: "visitemediche", label: "Visite Mediche", icon: Stethoscope, requires: "active_medical_surveillance" },
];

const TABS = [
  { id: "dashboard", label: "Panoramica", icon: ChevronRight },
  ...MAIN_TABS,
  ...STATIC_TABS,
  { id: "sicurezzalavoro", label: "Sicurezza sul lavoro", icon: HardHat },
];

// Tutte le schede che fanno parte del modulo HACCP (autocontrollo alimentare):
// quando il modulo è disattivato per un'azienda, nessuna di queste è raggiungibile.
const HACCP_TAB_IDS = new Set([...MAIN_TABS, ...STATIC_TABS].map((t) => t.id));

const SETTINGS_TAB = { id: "config", label: "Configurazione", icon: Settings };

const RSPP_ROLES = ["RSPP Datore di Lavoro", "RSPP Esterno"];

// Riga sempre presente in cima a ogni scheda: chi è il Responsabile del
// Servizio di Prevenzione e Protezione di questa azienda. È il riferimento
// che serve avere sott'occhio mentre si lavora, e comparendo anche in stampa
// finisce sui registri esportati. Il nome si prende sia dalle nomine
// registrate sia dal ruolo di sicurezza in anagrafica, così compare anche
// prima che la nomina sia protocollata.
function RsppLine() {
  const { company } = useAuth();
  const { items: employees } = useTable("employees", company?.id);
  const { items: appointments } = useTable("work_safety_appointments", company?.id);

  if (!company?.active_work_safety) return null;

  const names = [...new Set([
    ...appointments.filter((a) => RSPP_ROLES.includes(a.role)).map((a) => (a.person_name || "").trim()),
    ...employees.filter((e) => RSPP_ROLES.includes(e.security_role)).map((e) => `${e.first_name} ${e.last_name}`.trim()),
  ])].filter(Boolean);

  return (
    <div className="rspp-line">
      <ShieldCheck size={14} color="#2F6F4E" />
      <span className="rspp-label">RSPP</span>
      {names.length > 0
        ? <span className="rspp-name">{names.join(", ")}</span>
        : <span className="rspp-missing">non ancora nominato</span>}
    </div>
  );
}

function Shell() {
  const { company, signOut, homeCompanyId, consultantCompanies, switchCompany } = useAuth();
  const isViewingClient = homeCompanyId && company && company.id !== homeCompanyId;
  const hasMultipleClients = consultantCompanies.length > 0;
  const [tab, setTab] = useState("dashboard");
  const [workSafetySubTab, setWorkSafetySubTab] = useState("organigramma");
  const [workSafetyExpanded, setWorkSafetyExpanded] = useState(false);

  // Di default il modulo HACCP è attivo: lo consideriamo spento solo se è stato
  // esplicitamente disattivato in Configurazione (valore false), non se la
  // colonna è semplicemente vuota/non ancora impostata.
  const showHaccp = company?.active_haccp !== false;
  const visibleMainTabs = MAIN_TABS.filter((t) => t.id !== "abbattimento" || company?.serves_raw_fish);
  const visibleWorkSafetyItems = WORK_SAFETY_SUB_ITEMS.filter((t) => !t.requires || company?.[t.requires]);

  React.useEffect(() => {
    if (tab === "abbattimento" && !company?.serves_raw_fish) {
      setTab("dashboard");
    }
    if (tab === "sicurezzalavoro" && !company?.active_work_safety) {
      setTab("dashboard");
    }
    if (HACCP_TAB_IDS.has(tab) && !showHaccp) {
      setTab("dashboard");
    }
    if (workSafetySubTab === "attrezzature" && !company?.active_equipment_checks) {
      setWorkSafetySubTab("dvr");
    }
    if (workSafetySubTab === "visitemediche" && !company?.active_medical_surveillance) {
      setWorkSafetySubTab("dvr");
    }
  }, [company?.serves_raw_fish, company?.active_work_safety, company?.active_equipment_checks, company?.active_medical_surveillance, showHaccp, tab, workSafetySubTab]);

  const openWorkSafety = (subTabId) => {
    setTab("sicurezzalavoro");
    setWorkSafetySubTab(subTabId);
    setWorkSafetyExpanded(true);
  };

  const subStatus = getSubscriptionStatus(company);
  const showSubBanner = subStatus?.state === "in_scadenza" && company.id === homeCompanyId;
  const bannerTier = showSubBanner ? getBannerTier(subStatus.diffDays) : null;
  const bannerClass = {
    notice: "subscription-banner",
    warning: "subscription-banner-warning",
    urgent: "subscription-banner-urgent",
    critical: "subscription-banner-critical",
  }[bannerTier] || "subscription-banner";
  const bannerWhen = showSubBanner
    ? (subStatus.diffDays === 0 ? "scade OGGI" : subStatus.diffDays === 1 ? "scade DOMANI" : `scade tra ${subStatus.diffDays} giorni`)
    : "";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><ShieldCheck size={16} /></span>
          <span className="brand-name">{company?.name || "Cardine"}</span>
        </div>
        <button className={"nav-item nav-item-settings-top" + (tab === SETTINGS_TAB.id ? " active" : "")} onClick={() => setTab(SETTINGS_TAB.id)}>
          <SETTINGS_TAB.icon size={16} /> {SETTINGS_TAB.label}
        </button>
        {hasMultipleClients && (
          <button className={"nav-item nav-item-clients" + (tab === "clienti" ? " active" : "")} onClick={() => setTab("clienti")}>
            <Users size={16} /> I miei clienti
          </button>
        )}
        {showHaccp && (
          <nav>
            <button className={"nav-item" + (tab === "dashboard" ? " active" : "")} onClick={() => setTab("dashboard")}>
              <ChevronRight size={16} /> Panoramica
            </button>
            {visibleMainTabs.map((t) => (
              <button key={t.id} className={"nav-item" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
                <t.icon size={16} />
                {t.label}
              </button>
            ))}
          </nav>
        )}
        {!showHaccp && (
          <nav>
            <button className={"nav-item" + (tab === "dashboard" ? " active" : "")} onClick={() => setTab("dashboard")}>
              <ChevronRight size={16} /> Panoramica
            </button>
          </nav>
        )}
        {showHaccp && (
          <nav className="nav-static-group">
            {STATIC_TABS.map((t) => (
              <button key={t.id} className={"nav-item" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
                <t.icon size={16} />
                {t.label}
              </button>
            ))}
          </nav>
        )}
        {company?.active_work_safety && (
          <nav className="nav-worksafety-group">
            <button
              className={"nav-item nav-item-accordion" + (tab === "sicurezzalavoro" ? " active" : "")}
              onClick={() => {
                setTab("sicurezzalavoro");
                setWorkSafetyExpanded((v) => !v);
              }}
            >
              <HardHat size={16} />
              <span style={{ flex: 1 }}>Sicurezza sul lavoro</span>
              {workSafetyExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {workSafetyExpanded && (
              <div className="nav-subitems">
                {visibleWorkSafetyItems.map((t) => (
                  <button
                    key={t.id}
                    className={"nav-subitem" + (tab === "sicurezzalavoro" && workSafetySubTab === t.id ? " active" : "")}
                    onClick={() => openWorkSafety(t.id)}
                  >
                    <t.icon size={14} />
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </nav>
        )}
        <div className="sidebar-spacer" />
        <button className="nav-item" onClick={signOut}>
          <LogOut size={16} /> Esci
        </button>
      </aside>
      <main className="content">
        {isViewingClient && (
          <div className="viewing-client-banner">
            <span>Stai visualizzando i dati di <strong>{company.name}</strong> come consulente.</span>
            <button className="link-btn" onClick={() => switchCompany(homeCompanyId)}>
              <ArrowLeftCircle size={13} /> Torna alla tua vista
            </button>
          </div>
        )}
        {showSubBanner && (
          <div className={bannerClass}>
            <ShieldAlert size={14} />
            <span>
              Attenzione: l'abbonamento {bannerWhen} ({subStatus.dateLabel}).
              Se non viene rinnovato, l'accesso verrà bloccato automaticamente.
              {(company.consultant_name || company.consultant_email) && (
                <>
                  {" "}Contatta {company.consultant_name || "il tuo consulente"}
                  {company.consultant_email ? ` (${company.consultant_email})` : ""} per il rinnovo.
                </>
              )}
            </span>
          </div>
        )}
        <RsppLine />
        <div className="content-toolbar">
          <button type="button" className="print-btn" onClick={() => window.print()}>
            <Printer size={14} /> Esporta PDF
          </button>
        </div>
        {tab !== "allergeni" && (
          <PrintHeader sectionLabel={(TABS.find((t) => t.id === tab) || SETTINGS_TAB).label} />
        )}
        {tab === "dashboard" && <Dashboard goTo={setTab} openWorkSafety={openWorkSafety} />}
        {tab === "temperature" && <Temperature />}
        {tab === "abbattimento" && <AbbattimentoPesce />}
        {tab === "sicurezzalavoro" && <SicurezzaLavoro subTab={workSafetySubTab} setSubTab={setWorkSafetySubTab} />}
        {tab === "sanificazione" && <Sanificazione />}
        {tab === "infestanti" && <Infestanti />}
        {tab === "allergeni" && <Allergeni />}
        {tab === "formazione" && <Formazione />}
        {tab === "tracciabilita" && <Tracciabilita />}
        {tab === "registrazione" && <RegistrazioneSanitaria />}
        {tab === "nonconformita" && <NonConformita />}
        {tab === "acquepotabili" && <AcquePotabili />}
        {tab === "documenti" && <Documenti />}
        {tab === "config" && <Configurazione />}
        {tab === "clienti" && <MieiClienti goTo={setTab} />}
      </main>
    </div>
  );
}

function SubscriptionBlockScreen({ company, signOut }) {
  const sub = getSubscriptionStatus(company);
  const suspended = sub?.state === "sospeso";
  return (
    <div className="loading-screen">
      <div className="subscription-block-card">
        <ShieldAlert size={28} color="#B3432E" />
        <h2>Accesso non disponibile</h2>
        <p>
          {suspended
            ? "Il tuo account è stato sospeso."
            : `Il tuo abbonamento è scaduto${sub?.dateLabel ? " il " + sub.dateLabel : ""}.`}
        </p>
        <p className="sub">
          Per riattivare l'accesso contatta il tuo consulente HACCP
          {company.consultant_name ? `, ${company.consultant_name}` : ""}
          {company.consultant_email ? ` (${company.consultant_email})` : ""}.
        </p>
        <button className="btn-primary" onClick={signOut} style={{ marginTop: 8 }}>
          <LogOut size={16} /> Esci
        </button>
      </div>
    </div>
  );
}

function Gate() {
  const { session, company, homeCompanyId, consultantCompanies, loadingCompany, error, recoveryMode, signOut } = useAuth();

  if (recoveryMode) return <ResetPassword />;
  if (session === undefined) return <div className="loading-screen">Caricamento…</div>;
  if (!session) return <Login />;
  if (loadingCompany) return <div className="loading-screen">Caricamento azienda…</div>;
  if (!company) {
    return (
      <div className="loading-screen">
        <p>{error || "Nessuna azienda collegata a questo utente."}</p>
      </div>
    );
  }

  // Il blocco riguarda solo l'azienda "propria" dell'utente (il cliente stesso),
  // mai un'azienda che il consulente sta visitando tramite "I miei clienti".
  //
  // Un consulente non viene mai bloccato: la sua azienda è quella da cui eroga
  // il servizio, non una di quelle che lo acquistano. Senza questa esclusione
  // basterebbe una data di scadenza lasciata per sbaglio nella propria
  // Configurazione per chiudersi fuori dal programma da soli.
  const isConsultant = consultantCompanies.length > 0;

  if (!isConsultant && company.id === homeCompanyId && isSubscriptionBlocked(company)) {
    return <SubscriptionBlockScreen company={company} signOut={signOut} />;
  }

  return <Shell />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
