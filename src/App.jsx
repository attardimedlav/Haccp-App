import React, { useState } from "react";
import { Thermometer, SprayCan, Bug, ChevronRight, LogOut, ShieldCheck, Wrench } from "lucide-react";
import { AuthProvider, useAuth } from "./AuthContext";
import Login from "./Login";
import Dashboard from "./modules/Dashboard";
import Temperature from "./modules/Temperature";
import Sanificazione from "./modules/Sanificazione";
import Infestanti from "./modules/Infestanti";
import Attrezzature from "./modules/Attrezzature";

const TABS = [
  { id: "dashboard", label: "Panoramica", icon: ChevronRight },
  { id: "temperature", label: "Temperature", icon: Thermometer },
  { id: "attrezzature", label: "Attrezzature", icon: Wrench },
  { id: "sanificazione", label: "Sanificazione", icon: SprayCan },
  { id: "infestanti", label: "Monitoraggio infestanti", icon: Bug },
];

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
        <button className="nav-item nav-item-settings" onClick={signOut}>
          <LogOut size={16} /> Esci
        </button>
      </aside>
      <main className="content">
        {tab === "dashboard" && <Dashboard goTo={setTab} />}
        {tab === "temperature" && <Temperature />}
        {tab === "attrezzature" && <Attrezzature />}
        {tab === "sanificazione" && <Sanificazione />}
        {tab === "infestanti" && <Infestanti />}
      </main>
    </div>
  );
}

function Gate() {
  const { session, company, loadingCompany, error } = useAuth();

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
