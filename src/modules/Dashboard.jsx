import React from "react";
import { Thermometer, SprayCan, Bug, AlertTriangle, CheckCircle2, Droplet, FolderOpen, HardHat, Award, Stethoscope, Wrench, GraduationCap, Truck, Flame, BookOpen, Package } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { WATER_TANK_CONTROL_TYPE } from "./AcquePotabili";
import { PLAN_TYPE } from "./Documenti";
import { expiryInfo, FORMAZIONE_ROLE, DATORE_ROLES } from "./SicurezzaLavoro";
import { riassuntoPerArea } from "../utils/pianoPulizie";

const CHECK_PERIODICITY = [
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
  // Il piano di pulizia e i giri sulle postazioni: le scadenze nascono da
  // qui, non piu da un controllo generico per area.
  const piano = useTable("cleaning_plan", company?.id);
  const giriInfestanti = useTable("pest_rounds", company?.id);
  const vasche = useTable("water_tanks", company?.id);
  const water = useTable("water_controls", company?.id);
  const docs = useTable("haccp_documents", company?.id);
  const workSafety = useTable("work_safety_appointments", company?.id);
  const trainings = useTable("work_safety_trainings", company?.id);
  const equipmentChecks = useTable("equipment_checks", company?.id);
  const medicalVisits = useTable("medical_visits", company?.id);
  const employees = useTable("employees", company?.id);
  const manutenzioni = useTable("maintenance_logs", company?.id);
  const fornitori = useTable("suppliers", company?.id);
  const olio = useTable("frying_oil_logs", company?.id);
  const arrivi = useTable("traceability_records", company?.id);
  const manuali = useTable("haccp_manuals", company?.id);
  const corsiHaccp = useTable("training_records", company?.id);

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

    // Le scadenze degli incarichi stanno nei corsi di formazione: si segnala
    // il corso, dicendo per quale incarico e per quale persona vale.
    //
    // Un aggiornamento NON si aggiunge al corso base: lo sostituisce. Per ogni
    // incarico vale quindi soltanto il corso che scade più tardi, che è la
    // stessa regola usata in Sicurezza sul lavoro (latestTraining). Senza
    // questo filtro la Panoramica continuava a segnalare come scaduto il corso
    // base di una persona che aveva già fatto l'aggiornamento.
    const corsiInVigore = Object.values(
      trainings.items
        .filter((t) => t.expiry_date)
        .reduce((acc, t) => {
          const chiave = t.appointment_id || t.id;
          if (!acc[chiave] || new Date(t.expiry_date) > new Date(acc[chiave].expiry_date)) acc[chiave] = t;
          return acc;
        }, {})
    );

    collect(corsiInVigore, "nomine", Award,
      (t) => {
        const appt = workSafety.items.find((a) => a.id === t.appointment_id);
        return appt?.role || "Corso di formazione";
      },
      (t) => {
        const appt = workSafety.items.find((a) => a.id === t.appointment_id);
        return [appt?.person_name, t.course_kind].filter(Boolean).join(" — ");
      });

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

  // Chi è il datore di lavoro. Non basta guardare il ruolo scritto in
  // anagrafica: spesso il titolare risulta datore soltanto dalla nomina, e
  // allora compariva fra i lavoratori senza visita medica — un obbligo che
  // non lo riguarda. Si guardano tutti e due, come fa la scheda dei documenti.
  // Il confronto ignora l'ordine del nome perché sugli attestati e sulle
  // nomine si trova sia "Bello Giuseppe" sia "Giuseppe Bello".
  const chiave = (testo) => String(testo || "").trim().toLowerCase().split(/\s+/).sort().join(" ");
  const nomiDatore = new Set(
    workSafety.items
      .filter((a) => DATORE_ROLES.includes(a.role))
      .map((a) => chiave(a.person_name))
  );
  const eDatore = (e) =>
    DATORE_ROLES.includes(e.security_role) ||
    nomiDatore.has(chiave(`${e.first_name} ${e.last_name}`));

  // Lavoratori senza alcuna visita registrata: obbligo di legge per tutti
  // tranne il datore di lavoro.
  const senzaVisita =
    company?.active_work_safety && company?.active_medical_surveillance
      ? employees.items
          .filter((e) => !eDatore(e))
          .filter((e) => !medicalVisits.items.some(
            (v) => (v.employee_name || "").trim() === `${e.first_name} ${e.last_name}`.trim()
          ))
      : [];

  // Lavoratori senza alcun attestato di formazione art. 37. E' il rovescio
  // delle altre segnalazioni: qui non c'e' una scadenza da controllare, c'e'
  // un documento che non esiste. Senza questo blocco un neoassunto senza
  // formazione non comparirebbe da nessuna parte in Panoramica — e' la non
  // conformita' piu' grave e sarebbe l'unica invisibile.
  // Il datore di lavoro e' escluso: l'art. 37 riguarda i lavoratori, e la sua
  // formazione e' un'altra.
  const senzaFormazione = company?.active_work_safety
    ? employees.items
        .filter((e) => !eDatore(e))
        .filter((e) => {
          const nome = `${e.first_name} ${e.last_name}`.trim();
          const sue = workSafety.items.filter(
            (a) => a.role === FORMAZIONE_ROLE && (a.person_name || "").trim() === nome
          );
          return !sue.some((a) => trainings.items.some((t) => t.appointment_id === a.id));
        })
    : [];

  // Incarichi che un'azienda con dipendenti deve avere comunque: il servizio
  // di prevenzione e protezione, il primo soccorso e la prevenzione incendi
  // (artt. 17, 18 e 43 del D.Lgs. 81/08). Senza questo controllo la Panoramica
  // segnalava solo le scadenze di quello che c'era, e un incarico mai
  // assegnato restava invisibile — che è la mancanza più grave delle due.
  const haIncarico = (ruoli) =>
    workSafety.items.some((a) => ruoli.includes(a.role) && (a.person_name || "").trim());

  const incarichiMancanti = company?.active_work_safety
    ? [
        { ruolo: "Servizio di prevenzione e protezione (RSPP)", ha: haIncarico(["RSPP Datore di Lavoro", "RSPP Esterno"]) },
        { ruolo: "Addetto al primo soccorso", ha: haIncarico(["Addetto al Primo Soccorso"]) },
        { ruolo: "Addetto antincendio", ha: haIncarico(["Addetto Antincendio"]) },
      ].filter((x) => !x.ha).map((x) => x.ruolo)
    : [];

  // Incarico assegnato ma corso mai svolto. L'RSPP esterno resta fuori: è un
  // professionista con requisiti propri, e l'azienda non ne conserva gli
  // attestati come fa per i suoi addetti.
  const RUOLI_CON_CORSO = ["RSPP Datore di Lavoro", "Addetto al Primo Soccorso", "Addetto Antincendio"];
  const incarichiSenzaCorso = company?.active_work_safety
    ? workSafety.items
        .filter((a) => RUOLI_CON_CORSO.includes(a.role) && (a.person_name || "").trim())
        .filter((a) => !trainings.items.some((t) => t.appointment_id === a.id))
        .map((a) => `${(a.person_name || "").trim()} (${a.role})`)
    : [];

  // Formazione degli alimentaristi. È un obbligo HACCP, distinto da quello
  // dell'art. 37 sulla sicurezza: chi manipola alimenti deve avere l'attestato
  // previsto dalla propria Regione, e il titolare che lavora in cucina non fa
  // eccezione — per questo qui non si esclude nessuno. Finché la Panoramica
  // guardava solo i corsi di sicurezza, una persona senza alimentarista non
  // compariva da nessuna parte.
  const corsoAlimentarista = (c) => /aliment/i.test(String(c?.course || ""));
  const corsiDi = (e) => {
    const k = chiave(`${e.first_name} ${e.last_name}`);
    return corsiHaccp.items.filter((c) =>
      (c.employee_id && c.employee_id === e.id) || chiave(c.employee_name) === k);
  };

  const senzaAlimentarista = showHaccp
    ? employees.items.filter((e) => !corsiDi(e).some(corsoAlimentarista))
    : [];

  // Attestato scaduto: vale quello che scade più tardi, perché il rinnovo è
  // una riga nuova accanto al primo rilascio, non una sostituzione.
  const alimentaristaScaduto = showHaccp
    ? employees.items
        .map((e) => {
          const validi = corsiDi(e).filter(corsoAlimentarista).filter((c) => c.expiry);
          if (!validi.length) return null;
          const ultimo = validi.reduce((m, c) => (!m || new Date(c.expiry) > new Date(m.expiry) ? c : m), null);
          return new Date(ultimo.expiry) < new Date() ? { e, scadenza: ultimo.expiry } : null;
        })
        .filter(Boolean)
    : [];

  // Segnalazioni che nascono dalle sezioni nuove. Non sono scadenze di legge:
  // sono promesse che il manuale fa e che qui si controlla siano mantenute.
  const oggi = new Date().toISOString().slice(0, 10);
  const haccpIssues = [];
  if (showHaccp) {
    // Temperature: il controllo è per impianto, non per tabella. Con una sola
    // lettura registrata l'intera scheda risultava aggiornata, e un frigorifero
    // saltato non compariva da nessuna parte — che è proprio il caso in cui
    // l'avviso serve.
    const senzaLettura = units.items.filter((u) =>
      !temp.items.some((t) => t.unit === u.label && String(t.created_at).slice(0, 10) === oggi));
    if (units.items.length > 0 && senzaLettura.length > 0) {
      haccpIssues.push({
        key: "temp-oggi", tab: "temperature", icon: Thermometer,
        titolo: "Temperature non registrate oggi",
        dettaglio: senzaLettura.length + " impianti su " + units.items.length + ": " +
          senzaLettura.map((u) => u.label).join(", "),
      });
    }

    // Pulizie di ogni giorno: una riga sola con il conteggio, non una per
    // voce, altrimenti cinque righe di pulizie coprono le scadenze serie.
    const quotidiane = piano.items.filter((r) =>
      r.active !== false && Number(r.frequency_days) === 1 &&
      (!r.requires_flag || company?.[r.requires_flag]));
    const quotidianeFatte = quotidiane.filter((r) => san.items.some((s) =>
      s.area === r.area && (s.operation || "") === r.operation &&
      String(s.created_at).slice(0, 10) === oggi)).length;
    if (quotidiane.length > 0 && quotidianeFatte < quotidiane.length) {
      haccpIssues.push({
        key: "pulizie-oggi", tab: "sanificazione", icon: SprayCan,
        titolo: "Pulizie di oggi da completare",
        dettaglio: quotidianeFatte + " di " + quotidiane.length + " registrate",
      });
    }

    // Pulizie fuori frequenza, raggruppate per area: una riga per area con
    // il ritardo peggiore. Elencarle una per una coprirebbe le scadenze
    // serie sotto dieci voci di pulizie.
    riassuntoPerArea(piano.items, san.items).forEach((a) => haccpIssues.push({
      key: "pulizie-" + a.area, tab: "sanificazione", icon: SprayCan,
      titolo: "Pulizie in ritardo — " + a.area,
      dettaglio: a.peggiore
        ? a.peggiore.riga.operation + ": " + a.peggiore.label.toLowerCase() +
          (a.scadute > 1 ? " (e altre " + (a.scadute - 1) + " in quest'area)" : "")
        : a.scadute + " operazioni da recuperare",
    }));

    // Monitoraggio infestanti: vale l'ultimo giro sulle postazioni della
    // planimetria, non piu il vecchio registro per area.
    const giorniGiro = Number(company?.pest_round_days) || 7;
    const ultimoGiro = giriInfestanti.items.reduce((m, g) => ((g.round_date || "") > m ? g.round_date : m), "");
    if (!ultimoGiro) {
      haccpIssues.push({
        key: "infestanti-mai", tab: "infestanti", icon: Bug,
        titolo: "Monitoraggio infestanti mai eseguito",
        dettaglio: "Nessun giro registrato sulle postazioni",
      });
    } else {
      const trascorsi = Math.floor((Date.now() - new Date(ultimoGiro).getTime()) / 86400000);
      if (trascorsi > giorniGiro) {
        haccpIssues.push({
          key: "infestanti-tardi", tab: "infestanti", icon: Bug,
          titolo: "Giro infestanti in ritardo",
          dettaglio: "Ultimo giro il " + new Date(ultimoGiro).toLocaleDateString("it-IT") +
            ", " + trascorsi + " giorni fa (previsto ogni " + giorniGiro + ")",
        });
      }
    }

    // Vasche di accumulo: una per una, con la periodicita della vasca.
    // Prima il controllo era sull'azienda e bastava pulirne una qualsiasi
    // per far sparire l'avviso di tutte.
    vasche.items.filter((vs) => vs.active !== false).forEach((vs) => {
      const mesi = Number(vs.cleaning_months) || 6;
      const sue = water.items.filter((w) => w.tank_id === vs.id);
      const ultima = sue.reduce((m, w) => ((w.created_at || "") > m ? w.created_at : m), "");
      if (!ultima) {
        haccpIssues.push({
          key: "vasca-" + vs.id, tab: "acquepotabili", icon: Droplet,
          titolo: "Vasca mai pulita", dettaglio: vs.name,
        });
        return;
      }
      const scad = new Date(ultima);
      scad.setMonth(scad.getMonth() + mesi);
      if (scad < new Date()) {
        haccpIssues.push({
          key: "vasca-" + vs.id, tab: "acquepotabili", icon: Droplet,
          titolo: "Pulizia della vasca scaduta",
          dettaglio: vs.name + " — ultima il " + new Date(ultima).toLocaleDateString("it-IT"),
        });
      }
    });

    // manutenzioni con la prossima scadenza già passata
    manutenzioni.items
      .filter((m) => m.next_due && m.next_due < oggi)
      .forEach((m) => haccpIssues.push({
        key: "manut-" + m.id, tab: "manutenzione", icon: Wrench,
        titolo: "Manutenzione scaduta",
        dettaglio: `${m.equipment} — ${m.intervention_type}, prevista entro il ${new Date(m.next_due).toLocaleDateString("it-IT")}`,
      }));

    // fornitori attivi senza dichiarazione. Dal 05/10/2026 la dichiarazione non
    // scade più (vale finché non cambia qualcosa): si segnala solo se manca.
    fornitori.items
      .filter((fo) => fo.active !== false)
      .forEach((fo) => {
        const senza = !fo.declaration_date && !fo.attachment_path;
        if (!senza) return;
        haccpIssues.push({
          key: "forn-" + fo.id, tab: "fornitori", icon: Truck,
          titolo: "Fornitore senza dichiarazione",
          dettaglio: fo.name + (fo.supplied_goods ? " — " + fo.supplied_goods : ""),
        });
      });

    // fornitori in sorveglianza rinforzata: non è un errore, è un promemoria
    fornitori.items
      .filter((fo) => fo.reinforced_watch)
      .forEach((fo) => haccpIssues.push({
        key: "sorv-" + fo.id, tab: "fornitori", icon: Truck,
        titolo: "Fornitore in sorveglianza rinforzata",
        dettaglio: `${fo.name} — misurare la temperatura a ogni consegna`,
      }));

    // arrivi merce registrati senza lotto: sono i casi in cui la
    // rintracciabilità si regge solo sul documento di consegna
    const senzaLotto = arrivi.items.filter((a) => !a.lot_number || !String(a.lot_number).trim()).length;
    if (senzaLotto > 0) {
      haccpIssues.push({
        key: "arrivi-lotto", tab: "tracciabilita", icon: Package,
        titolo: "Arrivi merce senza lotto",
        dettaglio: `${senzaLotto} ${senzaLotto === 1 ? "registrazione" : "registrazioni"} senza numero di lotto: la rintracciabilità si regge sul solo documento di consegna`,
      });
    }

    // olio di frittura: se l'azienda frigge e non risulta nessun cambio
    if (company?.has_fryer) {
      const ultimo = olio.items.reduce((max, o) => (o.change_date > max ? o.change_date : max), "");
      if (!ultimo) {
        haccpIssues.push({
          key: "olio", tab: "oliofrittura", icon: Flame,
          titolo: "Nessun cambio d'olio registrato",
          dettaglio: "È l'unica documentazione da esibire in caso di controllo strumentale sull'olio in uso",
        });
      }
    }

    // Il manuale non ha una scadenza periodica: il Reg. (CE) 852/2004, art. 5
    // c. 4 lett. b, chiede di rivederlo quando cambiano il prodotto, il
    // processo o una qualsiasi fase — non ogni anno. Qui si segnala soltanto
    // se non c'è: né come revisione depositata, né come vecchio documento
    // caricato in Documenti.
    const manualeCaricatoInDocumenti = docs.items.some((i) => i.document_type === PLAN_TYPE);
    if (manuali.items.length === 0 && !manualeCaricatoInDocumenti) {
      haccpIssues.push({
        key: "manuale", tab: "manuale", icon: BookOpen,
        titolo: "Manuale di autocontrollo mancante",
        dettaglio: "Nessuna revisione depositata",
      });
    }
  }

  const safetyAlertCount =
    safetyIssues.length + (senzaVisita.length > 0 ? 1 : 0) + (senzaFormazione.length > 0 ? 1 : 0);

  const cards = showHaccp
    ? [
        { id: "temperature", label: "Letture temperatura", value: temp.items.length, icon: Thermometer, flag: deviations > 0 ? `${deviations} da verificare` : null },
        { id: "sanificazione", label: "Interventi di sanificazione", value: san.items.length, icon: SprayCan, flag: null },
        { id: "infestanti", label: "Giri di monitoraggio", value: giriInfestanti.items.length, icon: Bug, flag: null },
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

      {(lateChecks.length > 0 || safetyAlertCount > 0 || haccpIssues.length > 0) && (
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
          {haccpIssues.map((it) => (
            <button key={it.key} className="compliance-row" onClick={() => goTo(it.tab)}>
              <AlertTriangle size={15} color="#B3432E" />
              <it.icon size={15} />
              <span className="compliance-text">
                <strong>{it.titolo}</strong>{" — "}{it.dettaglio}
              </span>
            </button>
          ))}
          {senzaAlimentarista.length > 0 && (
            <button className="compliance-row" onClick={() => goTo("formazione")}>
              <AlertTriangle size={15} color="#B3432E" />
              <GraduationCap size={15} />
              <span className="compliance-text">
                <strong>Formazione alimentaristi mancante</strong>
                {" — "}
                {senzaAlimentarista.length === 1
                  ? `${senzaAlimentarista[0].first_name} ${senzaAlimentarista[0].last_name}`
                  : `${senzaAlimentarista.length} persone: ` +
                    senzaAlimentarista.map((e) => `${e.first_name} ${e.last_name}`).join(", ")}
                {" — chi manipola alimenti deve avere l'attestato previsto dalla Regione"}
              </span>
            </button>
          )}
          {alimentaristaScaduto.length > 0 && (
            <button className="compliance-row" onClick={() => goTo("formazione")}>
              <AlertTriangle size={15} color="#B3432E" />
              <GraduationCap size={15} />
              <span className="compliance-text">
                <strong>Attestato di alimentarista scaduto</strong>
                {" — "}
                {alimentaristaScaduto
                  .map((x) => `${x.e.first_name} ${x.e.last_name} (${new Date(x.scadenza).toLocaleDateString("it-IT")})`)
                  .join(", ")}
              </span>
            </button>
          )}
          {incarichiMancanti.length > 0 && (
            <button className="compliance-row" onClick={() => goToWorkSafety("nomine")}>
              <AlertTriangle size={15} color="#B3432E" />
              <HardHat size={15} />
              <span className="compliance-text">
                <strong>Incarichi di sicurezza non assegnati</strong>
                {" — "}
                {incarichiMancanti.join(", ")}
                {" — vanno nominati e formati prima dell'inizio dell'attività"}
              </span>
            </button>
          )}
          {incarichiSenzaCorso.length > 0 && (
            <button className="compliance-row" onClick={() => goToWorkSafety("nomine")}>
              <AlertTriangle size={15} color="#B3432E" />
              <GraduationCap size={15} />
              <span className="compliance-text">
                <strong>Incarichi senza il corso previsto</strong>
                {" — "}
                {incarichiSenzaCorso.join(", ")}
              </span>
            </button>
          )}
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
          {senzaFormazione.length > 0 && (
            <button className="compliance-row" onClick={() => goToWorkSafety("corsi")}>
              <AlertTriangle size={15} color="#B3432E" />
              <GraduationCap size={15} />
              <span className="compliance-text">
                <strong>Formazione dei lavoratori mai svolta</strong>
                {" — "}
                {senzaFormazione.length === 1
                  ? `${senzaFormazione[0].first_name} ${senzaFormazione[0].last_name}`
                  : `${senzaFormazione.length} lavoratori: ` +
                    senzaFormazione.map((e) => `${e.first_name} ${e.last_name}`).join(", ")}
                {" — va erogata prima dell'inizio dell'attività (Accordo 17/04/2025)"}
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
