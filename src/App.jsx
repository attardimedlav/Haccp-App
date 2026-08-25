import React, { useState } from "react";
import { Thermometer, SprayCan, Bug, ChevronRight, LogOut, ShieldCheck, ShieldAlert, GraduationCap, Package, Building2, Settings, Printer, ClipboardX, Droplet, Users, ArrowLeftCircle, FolderOpen } from "lucide-react";
import { AuthProvider, useAuth } from "./AuthContext";
import Login from "./Login";
import ResetPassword from "./ResetPassword";
import Dashboard from "./modules/Dashboard";
import Temperature from "./modules/Temperature";
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
import { getSubscriptionStatus, isSubscriptionBlocked } from "./subscriptionStatus";

const TABS = [
  { id: "dashboard", label: "Panoramica", icon: ChevronRight },
  { id: "temperature", label: "Temperature", icon: Thermometer },
  { id: "sanificazione", label: "Sanificazione", icon: SprayCan },
  { id: "infestanti", label: "Monitoraggio infestanti", icon: Bug },
  { id: "allergeni", label: "Allergeni", icon: ShieldAlert },
  { id: "formazione", label: "Formazione", icon: GraduationCap },
  { id: "tracciabilita", label: "Tracciabilità", icon: Package },
  { id: "registrazione", label: "Registrazione sanitaria", icon: Building2 },
  { id: "nonconformita", label: "Non conformità", icon: ClipboardX },
  { id: "acquepotabili", label: "Acque potabili", icon: Droplet },
  { id: "documenti", label: "Documenti", icon: FolderOpen },
];

const SETTINGS_TAB = { id: "config", label: "Configurazione", icon: Settings };

function Shell() {
  const { company, signOut, homeCompanyId, consultantCompanies, switchCompany } = useAuth();
  const isViewingClient = homeCompanyId && company && company.id !== homeCompanyId;
  const hasMultipleClients = consultantCompanies.length > 0;
  const [tab, setTab] = useState("dashboard");

  const subStatus = getSubscriptionStatus(company);

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
          {TABS.map((t) => (
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
        {subStatus?.state === "in_scadenza" && company.id === homeCompanyId && (
          <div className={"subscription-banner" + (subStatus.diffDays <= 7 ? " subscription-banner-urgent" : "")}>
            <ShieldAlert size={14} />
            <span>
              {subStatus.diffDays <= 7 ? (
                <>
                  Attenzione: il tuo abbonamento scade tra <strong>{subStatus.diffDays}</strong>{" "}
                  {subStatus.diffDays === 1 ? "giorno" : "giorni"} ({subStatus.dateLabel}).
                  Se non rinnovi, l'accesso verrà bloccato automaticamente.
                </>
              ) : (
                <>
                  Il tuo abbonamento scade il <strong>{subStatus.dateLabel}</strong> (tra {subStatus.diffDays} giorni).
                  Ricordati di rinnovare.
                </>
              )}
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
        <PrintHeader sectionLabel={(TABS.find((t) => t.id === tab) || SETTINGS_TAB).label} />
        {tab === "dashboard" && <Dashboard goTo={setTab} />}
        {tab === "temperature" && <Temperature />}
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
