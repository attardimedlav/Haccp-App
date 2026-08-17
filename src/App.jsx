import React, { useState } from "react";
import { Thermometer, SprayCan, Bug, ChevronRight, LogOut, ShieldCheck, Wrench, Droplets, ShieldAlert, GraduationCap, Package, Building2, Settings, Printer, ClipboardX, Droplet } from "lucide-react";
import { AuthProvider, useAuth } from "./AuthContext";
import Login from "./Login";
import ResetPassword from "./ResetPassword";
import Dashboard from "./modules/Dashboard";
import Temperature from "./modules/Temperature";
import Sanificazione from "./modules/Sanificazione";
import Infestanti from "./modules/Infestanti";
import Attrezzature from "./modules/Attrezzature";
import Sanificanti from "./modules/Sanificanti";
import Allergeni from "./modules/Allergeni";
import Formazione from "./modules/Formazione";
import Tracciabilita from "./modules/Tracciabilita";
import RegistrazioneSanitaria from "./modules/RegistrazioneSanitaria";
import Configurazione from "./modules/Configurazione";
import PrintHeader from "./PrintHeader";
import NonConformita from "./modules/NonConformita";
import AcquePotabili from "./modules/AcquePotabili";

const TABS = [
  { id: "dashboard", label: "Panoramica", icon: ChevronRight },
  { id: "temperature", label: "Temperature", icon: Thermometer },
  { id: "attrezzature", label: "Attrezzature", icon: Wrench },
  { id: "sanificanti", label: "Sanificanti", icon: Droplets },
  { id: "sanificazione", label: "Sanificazione", icon: SprayCan },
  { id: "infestanti", label: "Monitoraggio infestanti", icon: Bug },
  { id: "allergeni", label: "Allergeni", icon: ShieldAlert },
  { id: "formazione", label: "Formazione", icon: GraduationCap },
  { id: "tracciabilita", label: "Tracciabilità", icon: Package },
  { id: "registrazione", label: "Registrazione sanitaria", icon: Building2 },
  { id: "nonconformita", label: "Non conformità", icon: ClipboardX },
  { id: "acquepotabili", label: "Acque potabili", icon: Droplet },
];

const SETTINGS_TAB = { id: "config", label: "Configurazione", icon: Settings };

function Shell() {
  const { company, signOut } = useAuth();
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><ShieldCheck size={16} /></span>
          <span className="brand-name">{company?.name || "Autocontrollo"}</span>
        </div>
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
        <div className="content-toolbar">
          <button type="button" className="print-btn" onClick={() => window.print()}>
            <Printer size={14} /> Esporta PDF
          </button>
        </div>
        <PrintHeader sectionLabel={(TABS.find((t) => t.id === tab) || SETTINGS_TAB).label} />
        {tab === "dashboard" && <Dashboard goTo={setTab} />}
        {tab === "temperature" && <Temperature />}
        {tab === "attrezzature" && <Attrezzature />}
        {tab === "sanificanti" && <Sanificanti />}
        {tab === "sanificazione" && <Sanificazione />}
        {tab === "infestanti" && <Infestanti />}
        {tab === "allergeni" && <Allergeni />}
        {tab === "formazione" && <Formazione />}
        {tab === "tracciabilita" && <Tracciabilita />}
        {tab === "registrazione" && <RegistrazioneSanitaria />}
        {tab === "nonconformita" && <NonConformita />}
        {tab === "acquepotabili" && <AcquePotabili />}
        {tab === "config" && <Configurazione />}
      </main>
    </div>
  );
}

function Gate() {
  const { session, company, loadingCompany, error, recoveryMode } = useAuth();

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
  return <Shell />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
