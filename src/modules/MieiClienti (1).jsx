import React from "react";
import { Building2, ArrowRight, User } from "lucide-react";
import { useAuth } from "../AuthContext";
import { getSubscriptionStatus } from "../subscriptionStatus";

function pillClassFor(state) {
  if (state === "scaduto" || state === "sospeso") return "pill-alert";
  if (state === "in_scadenza") return "pill-warn";
  return "pill-ok";
}

export default function MieiClienti({ goTo }) {
  const { company, homeCompanyId, homeCompanyName, consultantCompanies, switchCompany } = useAuth();
  const enter = async (id) => {
    const ok = await switchCompany(id);
    if (ok) goTo("dashboard");
  };

  const homeSub = company?.id === homeCompanyId ? getSubscriptionStatus(company) : null;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>I miei clienti</h2>
          <p className="sub">Passa da un'azienda all'altra senza rifare il login. Stai visualizzando: <strong>{company?.name}</strong>.</p>
        </div>
      </div>
      <ul className="dish-list">
        {homeCompanyId && (
          <li className={"dish-row client-row" + (company?.id === homeCompanyId ? " client-row-active" : "")}>
            <div className="client-row-info">
              <User size={16} color="#2F6F4E" />
              <div>
                <strong>La tua azienda</strong>
                <span className="log-note" style={{ display: "block" }}>{homeCompanyName}</span>
              </div>
              {homeSub && <span className={"pill " + pillClassFor(homeSub.state)}>{homeSub.label}</span>}
            </div>
            {company?.id !== homeCompanyId && (
              <button className="btn-primary" onClick={() => enter(homeCompanyId)}>
                Entra <ArrowRight size={14} />
              </button>
            )}
          </li>
        )}
        {consultantCompanies.map((c) => {
          const sub = getSubscriptionStatus(c);
          return (
            <li key={c.id} className={"dish-row client-row" + (company?.id === c.id ? " client-row-active" : "")}>
              <div className="client-row-info">
                <Building2 size={16} color="#2F6F4E" />
                <strong>{c.name}</strong>
                {sub && <span className={"pill " + pillClassFor(sub.state)}>{sub.label}</span>}
              </div>
              {company?.id !== c.id && (
                <button className="btn-primary" onClick={() => enter(c.id)}>
                  Entra <ArrowRight size={14} />
                </button>
              )}
            </li>
          );
        })}
        {consultantCompanies.length === 0 && (
          <div className="empty"><p>Non hai ancora clienti collegati al tuo account consulente.</p></div>
        )}
      </ul>
    </div>
  );
}
