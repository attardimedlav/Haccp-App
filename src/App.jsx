import React, { useState } from "react";
import { Thermometer, SprayCan, Bug, ChevronRight, LogOut, ShieldCheck, ShieldAlert, GraduationCap, Package, Building2, Settings, Printer, ClipboardX, Droplet, Users, ArrowLeftCircle, FolderOpen, Snowflake, HardHat } from "lucide-react";
import { AuthProvider, useAuth } from "./AuthContext";
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
  { id: "sicurezzalavoro", label: "Sicurezza sul lavoro", icon: HardHat },
];

const STATIC_TABS = [
  { id: "allergeni", label: "Allergeni", icon: ShieldAlert },
  { id: "formazione", label: "Formazione", icon: GraduationCap },
  { id: "registrazione", label: "Registrazione sanitaria", icon: Building2 },
  { id: "documenti", label: "Documenti", icon: FolderOpen },
];

const TABS = [
  { id: "dashboard", label: "Panoramica", icon: ChevronRight },
  ...MAIN_TABS,
  ...STATIC_TABS,
];

const SETTINGS_TAB = { id: "config", label: "Configurazione", icon: Settings };

function Shell() {
  const { company, signOut, homeCompanyId, consultantCompanies, switchCompany } = useAuth();
  const isViewingClient = homeCompanyId && company && company.id !== homeCompanyId;
  const hasMultipleClients = consultantCompanies.length > 0;
  const [tab, setTab] = useState("dashboard");

  const visibleMainTabs = MAIN_TABS.filter((t) => {
    if (t.id === "abbattimento") return !!company?.serves_raw_fish;
    if (t.id === "sicurezzalavoro") return !!company?.active_work_safety;
    return true;
  });

  React.useEffect(() => {
    if (tab === "abbattimento" && !company?.serves_raw_fish) {
      setTab("dashboard");
    }
    if (tab === "sicurezzalavoro" && !company?.active_work_safety) {
      setTab("dashboard");
    }
  }, [company?.serves_raw_fish, company?.active_work_safety, tab]);

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
          <span className="brand-name">{company?.name || "Autocontrollo"}</span>
        </div>
        {hasMultipleClients && (
          <button className={"nav-item nav-item-clients" + (tab === "clienti" ? " active" : "")} onClick={() => setTab("clienti")}>
            <Users size={16} /> I miei clienti
          </button>
        )}
        <nav>
          {visibleMainTabs.map((t) => (
            <button key={t.id} className={"nav-item" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </nav>
        <nav className="nav-static-group">
          {STATIC_TABS.map((t) => (
            <button key={t.id} className={"nav-item" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <button className={"nav-item nav-item-settings" + (tab === SETTINGS_TAB.id ? " active" : "")} onClick={() => setTab(SETTINGS_TAB.id)}>
          <SETTINGS_TAB.icon size={16} /> {SETTINGS_TAB.label}
        </button>
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
        <div className="content-toolbar">
          <button type="button" className="print-btn" onClick={() => window.print()}>
            <Printer size={14} /> Esporta PDF
          </button>
        </div>
        {tab !== "allergeni" && (
          <PrintHeader sectionLabel={(TABS.find((t) => t.id === tab) || SETTINGS_TAB).label} />
        )}
        {tab === "dashboard" && <Dashboard goTo={setTab} />}
        {tab === "temperature" && <Temperature />}
        {tab === "abbattimento" && <AbbattimentoPesce />}
        {tab === "sicurezzalavoro" && <SicurezzaLavoro />}
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
  const { session, company, homeCompanyId, loadingCompany, error, recoveryMode, signOut } = useAuth();

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
  if (company.id === homeCompanyId && isSubscriptionBlocked(company)) {
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
