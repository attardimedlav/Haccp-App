import React from "react";
import { Thermometer, SprayCan, Bug, AlertTriangle, CheckCircle2, Droplet, FolderOpen, HardHat, Award, Stethoscope, Wrench } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { WATER_TANK_CONTROL_TYPE } from "./AcquePotabili";
import { PLAN_TYPE } from "./Documenti";
import { expiryInfo } from "./SicurezzaLavoro";

const CHECK_PERIODICITY = [
  { id: "temperature_logs", tab: "temperature", label: "Temperature", days: 1, icon: Thermometer },
  { id: "sanitization_logs", tab: "sanificazione", label: "Sanificazione", days: 1, icon: SprayCan },
  { id: "pest_logs", tab: "infestanti", label: "Monitoraggio infestanti", days: 7, icon: Bug },
];

function daysSince(ts) {
  return (Date.now() - new Date(ts).getTime()) / 86400000;
}

function checkCompliance(days, items) {
  if (items.length === 0) return { status: "missing" };
  const lastTs = items.reduce((max, i) => Math.max(max, new Date(i.created_at).getTime()), 0);
  const elapsed = daysSince(lastTs);
  if (elapsed > days) return { status: "late", lastTs, daysLate: Math.floor(elapsed - days) };
  return { status: "ok", lastTs };
}

// Stessa logica usata in Temperature.jsx: usa il flag nel/fuori range quando presente,
// altrimenti (letture storiche precedenti all'introduzione del flag) confronta col range reale dell'unità.
function isTempInRange(item, units) {
  if (item.in_range !== null && item.in_range !== undefined) return item.in_range;
  const u = units.find((x) => x.label === item.unit);
  if (!u || item.value === null || item.value === undefined) return true;
  return !(item.value < u.min_temp || item.value > u.max_temp);
}

export default function Dashboard({ goTo, openWorkSafety }) {
  const { company } = useAuth();
  // Di default il modulo HACCP è attivo: lo consideriamo spento solo se è
  // stato esplicitamente disattivato in Configurazione (valore false).
  const showHaccp = company?.active_haccp !== false;
  const temp = useTable("temperature_logs", company?.id);
  const units = useTable("temperature_units", company?.id);
  const san = useTable("sanitization_logs", company?.id);
  const pest = useTable("pest_logs", company?.id);
  const water = useTable("water_controls", company?.id);
  const docs = useTable("haccp_documents", company?.id);
  const workSafety = useTable("work_safety_appointments", company?.id);
  const equipmentChecks = useTable("equipment_checks", company?.id);
  const medicalVisits = useTable("medical_visits", company?.id);
  const employees = useTable("employees", company?.id);

  // Tutti gli indicatori di questo blocco riguardano solo il modulo HACCP: se
  // è disattivato (azienda seguita solo per la sicurezza sul lavoro) restano
  // vuoti, così la Panoramica non segnala mai scadenze che non si applicano.
  const compliance = showHaccp
    ? CHECK_PERIODICITY.map((c) => {
        const items = c.id === "temperature_logs" ? temp.items : c.id === "sanitization_logs" ? san.items : pest.items;
        return { ...c, ...checkCompliance(c.days, items) };
      })
    : [];

  let tankCompliance = null;
  if (showHaccp && company?.has_water_tank) {
    const tankItems = water.items.filter((i) => i.control_type === WATER_TANK_CONTROL_TYPE);
    tankCompliance = {
      id: "water_tank", tab: "acquepotabili", label: "Ispezione vasca di accumulo", days: 180, icon: Droplet,
      ...checkCompliance(180, tankItems),
    };
    compliance.push(tankCompliance);
  }

  if (showHaccp) {
    // Revisione del piano di autocontrollo: usa review_date (non created_at) come riferimento
    const planItems = docs.items.filter((i) => i.document_type === PLAN_TYPE);
    let planCompliance = { id: "haccp_plan", tab: "documenti", label: "Revisione piano di autocontrollo", days: 365, icon: FolderOpen, status: "missing" };
    if (planItems.length > 0) {
      const lastReview = planItems.reduce((max, i) => Math.max(max, new Date(i.review_date).getTime()), 0);
      const elapsed = daysSince(lastReview);
      planCompliance = elapsed > 365
        ? { ...planCompliance, status: "late", lastTs: lastReview, daysLate: Math.floor(elapsed - 365) }
        : { ...planCompliance, status: "ok", lastTs: lastReview };
    }
    compliance.push(planCompliance);
  }

  const lateChecks = compliance.filter((c) => c.status !== "ok");
  const deviations = showHaccp ? temp.items.filter((i) => !isTempInRange(i, units.items)).length : 0;
  const pestAlerts = showHaccp ? pest.items.filter((i) => i.outcome === "tracce").length : 0;

  const countExpiring = (items) => items.filter((a) => {
    const info = expiryInfo(a.expiry_date);
    return info && (info.cls === "pill-warn" || info.cls === "pill-alert");
  }).length;

  // Ogni scadenza viene elencata per esteso — cosa, di chi, entro quando — e
  // porta con un clic esattamente alla scheda che la contiene, invece di
  // limitarsi a un conteggio che poi va cercato a mano.
  const goToWorkSafety = (subTab) => {
    if (openWorkSafety) openWorkSafety(subTab);
    else goTo("sicurezzalavoro");
  };

  const safetyIssues = [];
  if (company?.active_work_safety) {
    const collect = (items, subTab, icon, titleOf, detailOf) => {
      items.forEach((it) => {
        const info = expiryInfo(it.expiry_date);
        if (!info || (info.cls !== "pill-warn" && info.cls !== "pill-alert")) return;
        safetyIssues.push({
          key: subTab + "-" + it.id,
          icon,
          subTab,
          title: titleOf(it),
          detail: detailOf(it),
          info,
          expiry: it.expiry_date,
        });
      });
    };

    collect(workSafety.items, "nomine", Award,
      (a) => a.role || "Nomina",
      (a) => a.person_name);

    if (company?.active_medical_surveillance) {
      collect(medicalVisits.items, "visitemediche", Stethoscope,
        () => "Visita medica",
        (v) => [v.employee_name, v.job_role].filter(Boolean).join(", "));
    }

    if (company?.active_equipment_checks) {
      collect(equipmentChecks.items, "attrezzature", Wrench,
        (e) => e.equipment_type || "Attrezzatura",
        (e) => e.label);
    }

    // Ordine per data di scadenza: le più vecchie (già scadute) in cima,
    // poi le prossime in ordine di urgenza.
    safetyIssues.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  }

  // Lavoratori senza alcuna visita registrata: obbligo di legge per tutti
  // tranne il datore di lavoro.
  const senzaVisita =
    company?.active_work_safety && company?.active_medical_surveillance
      ? employees.items
          .filter((e) => e.security_role !== "RSPP Datore di Lavoro" && e.security_role !== "Datore di Lavoro")
          .filter((e) => !medicalVisits.items.some(
            (v) => (v.employee_name || "").trim() === `${e.first_name} ${e.last_name}`.trim()
          ))
      : [];

  const safetyAlertCount = safetyIssues.length + (senzaVisita.length > 0 ? 1 : 0);

  const cards = showHaccp
    ? [
        { id: "temperature", label: "Letture temperatura", value: temp.items.length, icon: Thermometer, flag: deviations > 0 ? `${deviations} da verificare` : null },
        { id: "sanificazione", label: "Interventi di sanificazione", value: san.items.length, icon: SprayCan, flag: null },
        { id: "infestanti", label: "Controlli infestanti", value: pest.items.length, icon: Bug, flag: pestAlerts > 0 ? `${pestAlerts} con tracce` : null },
      ]
    : [];

  const tankOverdue = tankCompliance && tankCompliance.status !== "ok";
  const tankLastDate = tankCompliance?.lastTs ? new Date(tankCompliance.lastTs).toLocaleDateString("it-IT") : null;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Panoramica</h2>
          <p className="sub">{company?.name || "Azienda"}</p>
        </div>
      </div>

      {(lateChecks.length > 0 || safetyAlertCount > 0) && (
        <div className="compliance-banner">
          {lateChecks.map((c) => (
            <button key={c.id} className="compliance-row" onClick={() => goTo(c.tab)}>
              <AlertTriangle size={15} color="#B3432E" />
              <c.icon size={15} />
              <span className="compliance-text">
                <strong>{c.label}</strong>
                {c.status === "missing"
                  ? ` — nessuna registrazione ancora effettuata`
                  : ` — in ritardo di ${c.daysLate} ${c.daysLate === 1 ? "giorno" : "giorni"}`}
              </span>
            </button>
          ))}
          {senzaVisita.length > 0 && (
            <button className="compliance-row" onClick={() => goToWorkSafety("visitemediche")}>
              <AlertTriangle size={15} color="#B3432E" />
              <Stethoscope size={15} />
              <span className="compliance-text">
                <strong>Visite mediche mai registrate</strong>
                {" — "}
                {senzaVisita.length === 1
                  ? `${senzaVisita[0].first_name} ${senzaVisita[0].last_name}`
                  : `${senzaVisita.length} lavoratori: ` +
                    senzaVisita.map((e) => `${e.first_name} ${e.last_name}`).join(", ")}
              </span>
            </button>
          )}
          {safetyIssues.map((it) => {
            const scaduto = it.info.cls === "pill-alert";
            return (
              <button
                key={it.key}
                className={"compliance-row" + (scaduto ? "" : " compliance-row-warn")}
                onClick={() => goToWorkSafety(it.subTab)}
              >
                <AlertTriangle size={15} color={scaduto ? "#B3432E" : "#9A6B12"} />
                <it.icon size={15} />
                <span className="compliance-text">
                  <strong>{it.title}</strong>
                  {it.detail ? ` — ${it.detail}` : ""}
                  {" · "}{it.info.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="compliance-ok-row">
        {compliance.filter((c) => c.status === "ok").map((c) => (
          <span key={c.id} className="ok-pill"><CheckCircle2 size={12} /> {c.label} aggiornato</span>
        ))}
      </div>

      <div className="card-grid">
        {cards.map((c) => (
          <button key={c.id} className="stat-card" onClick={() => goTo(c.id)}>
            <c.icon size={18} color="#2F6F4E" />
            <span className="stat-value">{c.value}</span>
            <span className="stat-label">{c.label}</span>
            {c.flag && <span className="stat-flag"><AlertTriangle size={12} /> {c.flag}</span>}
          </button>
        ))}
        {tankCompliance && (
          <button
            className={"stat-card" + (tankOverdue ? " stat-card-alert" : "")}
            onClick={() => goTo("acquepotabili")}
          >
            <Droplet size={18} color={tankOverdue ? "#B3432E" : "#2F6F4E"} />
            <span className="stat-value stat-value-date" style={tankOverdue ? { color: "#B3432E" } : undefined}>
              {tankLastDate || "Mai"}
            </span>
            <span className="stat-label">Ultimo controllo vasca di accumulo</span>
            {tankOverdue && (
              <span className="stat-flag">
                <AlertTriangle size={12} />
                {tankCompliance.status === "missing" ? " Nessun controllo registrato" : ` Scaduto da ${tankCompliance.daysLate} giorni`}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
