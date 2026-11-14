import React from "react";
import {
  Network, FileText, ShieldCheck, Users, HeartPulse, Flame, HardHat,
  Stethoscope, Paperclip, GraduationCap, Wrench, ShieldAlert, Check, AlertTriangle, Award,
} from "lucide-react";
import { useAuth } from "../AuthContext";
import { expiryInfo, MEDICO_ROLE, ALLEGATO_TYPE_OPTIONS, eDatoreDi } from "./SicurezzaLavoro";

// IL FASCICOLO DELLA SICUREZZA
//
// Le schede di "Sicurezza sul lavoro" sono organizzate per dove stanno i dati
// — organigramma, DVR, allegati, attestati, visite — e per chi ci lavora
// dentro va benissimo. Ma il titolare, che di queste cose spesso capisce poco,
// non cerca "gli attestati": vuole sapere se ha l'addetto antincendio e se
// quel foglio c'e'. E l'ispettore sfoglia nell'ordine in cui il fascicolo si
// compone: organigramma, DVR, le figure una per una con la loro nomina e il
// loro attestato, la sorveglianza sanitaria, i verbali.
//
// Questa e' la stessa roba, messa in quell'ordine. E' la prima scheda di
// "Sicurezza sul lavoro", quella che si apre entrando: prima si vede come sta
// il fascicolo, poi si va nella scheda che serve. Non inserisce e non modifica
// niente — da ogni riquadro il tasto porta dove si rimedia.
//
// Tutti i dati arrivano gia' caricati da SicurezzaLavoro e gia' ripuliti dei
// lavoratori non piu' in forza: qui non si interroga il database una seconda
// volta e soprattutto non si riscrive quel filtro, che sta scritto in un
// posto solo.
//
// Non c'e' niente da migrare: un ordine di presentazione e' codice, non dato.
// Il giorno in cui si pubblica, tutte le aziende — quelle gia' fatte e quelle
// che verranno — hanno il loro fascicolo. Quello che cambia e' che i buchi,
// dove ci sono, diventano visibili.

const fmt = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");

// Lo stato di una riga in tre parole, con i colori usati ovunque nell'app:
// verde a posto, giallo da completare, rosso manca.
function Stato({ cls, testo }) {
  return <span className={"lot-tag " + cls}>{testo}</span>;
}

function Blocco({ icona: Icona, titolo, sottotitolo, stato, onVai, children }) {
  return (
    <div className="dish-row fasc-blocco">
      <div className="fasc-testa">
        <Icona size={17} color="#2F6F4E" />
        <strong className="fasc-titolo">{titolo}</strong>
        {stato}
        {onVai && (
          <button type="button" className="link-btn fasc-apri" onClick={onVai}>
            Apri
          </button>
        )}
      </div>
      {sottotitolo && <p className="sub fasc-sotto">{sottotitolo}</p>}
      {children && <div className="fasc-corpo">{children}</div>}
    </div>
  );
}

export default function FascicoloSicurezza({
  employees = [],
  appointments = [],
  trainings = [],
  medicalVisits = [],
  equipmentChecks = [],
  dvrDocs = [],
  quadro = null,
  vaiA,
}) {
  const { company } = useAuth();

  const vai = (id) => (vaiA ? () => vaiA(id) : undefined);

  const dvrItems = dvrDocs.filter((d) => d.kind === "dvr");
  const allegati = dvrDocs.filter((d) => d.kind === "allegato");

  // Per ogni incarico vale il corso che scade piu' tardi: un aggiornamento
  // non si somma al corso base, lo sostituisce. E' la stessa regola che usano
  // la Panoramica e la scheda degli attestati.
  const ultimoCorso = (appointmentId) => {
    const sue = trainings.filter((t) => t.appointment_id === appointmentId && t.expiry_date);
    if (!sue.length) return null;
    return sue.reduce((m, t) => (!m || new Date(t.expiry_date) > new Date(m.expiry_date) ? t : m), null);
  };

  // Un riquadro per figura: chi la ricopre, se la nomina e' firmata e
  // allegata, come sta messa la formazione. Sono le tre domande che vengono
  // fatte in ispezione, in quest'ordine.
  const Figura = ({ icona, titolo, ruoli, obbligatoria = true, nota }) => {
    const persone = appointments.filter((a) => ruoli.includes(a.role) && String(a.person_name || "").trim());

    let stato;
    if (persone.length === 0) {
      stato = (
        <Stato
          cls={obbligatoria ? "pill-alert" : "pill-warn"}
          testo={obbligatoria ? "non designato" : "non presente"}
        />
      );
    } else {
      const completo = persone.every((a) => {
        const t = ultimoCorso(a.id);
        return a.nomina_attachment_path && t && expiryInfo(t.expiry_date)?.cls === "pill-ok";
      });
      stato = <Stato cls={completo ? "pill-ok" : "pill-warn"} testo={completo ? "completo" : "da completare"} />;
    }

    return (
      <Blocco
        icona={icona}
        titolo={titolo}
        stato={stato}
        onVai={vai("nomine")}
        sottotitolo={persone.length === 0 ? nota : null}
      >
        {persone.length > 0 && (
          <ul className="log-list">
            {persone.map((a) => {
              const t = ultimoCorso(a.id);
              const info = t ? expiryInfo(t.expiry_date) : null;
              return (
                <li key={a.id} className="log-row">
                  <span className="log-main"><strong>{a.person_name}</strong></span>
                  {a.nomina_attachment_path
                    ? <span className="doc-type-tag">Nomina del {fmt(a.nomina_issue_date)}</span>
                    : <Stato cls="pill-warn" testo="nomina da allegare" />}
                  {!t
                    ? <Stato cls="pill-alert" testo="attestato mancante" />
                    : <Stato cls={info?.cls || "pill-ok"} testo={info ? info.label : "formazione registrata"} />}
                </li>
              );
            })}
          </ul>
        )}
      </Blocco>
    );
  };

  // --- Sorveglianza sanitaria -------------------------------------------
  // Il datore di lavoro non e' un lavoratore: non ha l'obbligo di visita, e
  // contarlo tra chi ne e' sprovvisto produce un allarme che non si potrebbe
  // mai spegnere.
  const medico = appointments.find((a) => a.role === MEDICO_ROLE && String(a.person_name || "").trim()) || null;
  const eDatore = eDatoreDi(employees, appointments);
  const soggetti = employees.filter((e) => !eDatore(e));
  const conVisita = new Set(
    medicalVisits.map((v) => String(v.employee_name || "").trim().toLowerCase()).filter(Boolean)
  );
  const senzaVisita = soggetti.filter(
    (e) => !conVisita.has(`${e.first_name || ""} ${e.last_name || ""}`.replace(/\s+/g, " ").trim().toLowerCase())
  );
  const sopralluogo = allegati
    .filter((d) => /sopralluogo/i.test(d.title || ""))
    .sort((a, b) => String(b.doc_date || "").localeCompare(String(a.doc_date || "")))[0] || null;

  // --- Verbali allegati --------------------------------------------------
  // Si guardano i tipi previsti, non i titoli liberi: un verbale c'e' o non
  // c'e', e se non c'e' va detto. "Altro" non si controlla, perche' per
  // definizione non si sa cosa dovrebbe esserci; il sopralluogo del medico
  // sta gia' sopra, nella sorveglianza sanitaria, dove lo si cerca.
  const tipiDaAvere = ALLEGATO_TYPE_OPTIONS.filter((t) => t !== "Altro" && !/sopralluogo/i.test(t));
  const haAllegato = (tipo) => {
    const chiave = tipo.slice(0, 18).toLowerCase();
    return allegati.some((d) => String(d.title || "").toLowerCase().startsWith(chiave));
  };
  const mancanti = tipiDaAvere.filter((t) => !haAllegato(t));

  const ultimoDvr = dvrItems.map((d) => d.doc_date).filter(Boolean).sort().reverse()[0];

  return (
    <div className="fascicolo" style={{ marginTop: 18 }}>
      <h3 style={{ marginBottom: 2 }}>Fascicolo della sicurezza</h3>
      <p className="sub fasc-sotto" style={{ marginTop: 0 }}>
        Gli adempimenti del D.Lgs. 81/08 nell'ordine in cui compongono il fascicolo e in cui vengono
        chiesti in un controllo. Da ogni riquadro si va alla scheda dove si registra o si allega.
      </p>

      <Blocco
        icona={Network}
        titolo="Organigramma della sicurezza"
        onVai={vai("organigramma")}
        stato={employees.length === 0
          ? <Stato cls="pill-alert" testo="nessun lavoratore" />
          : <Stato cls="pill-ok" testo={employees.length === 1 ? "1 lavoratore in forza" : `${employees.length} lavoratori in forza`} />}
        sottotitolo="Chi lavora in azienda e con quale ruolo. È la base di tutto il resto: le nomine si assegnano da qui."
      />

      <Blocco
        icona={FileText}
        titolo="Documento di valutazione dei rischi"
        onVai={vai("dvr")}
        stato={dvrItems.length === 0
          ? <Stato cls="pill-alert" testo="mancante" />
          : <Stato cls="pill-ok" testo={ultimoDvr ? `ultima revisione del ${fmt(ultimoDvr)}` : "presente"} />}
        sottotitolo={dvrItems.length === 0
          ? "Obbligo non delegabile del datore di lavoro (art. 17, comma 1, lett. a)."
          : null}
      />

      <Figura
        icona={ShieldCheck}
        titolo="RSPP — Servizio di prevenzione e protezione"
        ruoli={["RSPP Datore di Lavoro", "RSPP Esterno"]}
        nota="Obbligo non delegabile del datore di lavoro (art. 17, comma 1, lett. b)."
      />

      <Figura
        icona={Users}
        titolo="RLS — Rappresentante dei lavoratori per la sicurezza"
        ruoli={["RLS"]}
        nota="Se i lavoratori non lo hanno eletto serve il verbale di mancata elezione, e ci si rivolge all'RLS territoriale (artt. 47 e 48)."
      />

      <Figura
        icona={HeartPulse}
        titolo="Addetti al primo soccorso"
        ruoli={["Addetto al Primo Soccorso"]}
        nota="Almeno un lavoratore designato e formato (artt. 18 e 45, D.M. 388/2003)."
      />

      <Figura
        icona={Flame}
        titolo="Addetti antincendio"
        ruoli={["Addetto Antincendio"]}
        nota="Almeno un lavoratore designato e formato (artt. 18 e 46, D.M. 2 settembre 2021)."
      />

      <Figura
        icona={HardHat}
        titolo="Preposti"
        ruoli={["Preposto"]}
        obbligatoria={false}
        nota="Da individuare dove c'è chi sovrintende al lavoro altrui (art. 2, lett. e; formazione art. 37, comma 7)."
      />

      {company?.active_medical_surveillance && (
        <Blocco
          icona={Stethoscope}
          titolo="Sorveglianza sanitaria"
          onVai={vai("visitemediche")}
          stato={!medico
            ? <Stato cls="pill-alert" testo="medico non nominato" />
            : senzaVisita.length > 0
              ? <Stato cls="pill-warn" testo={senzaVisita.length === 1 ? "1 lavoratore senza visita" : `${senzaVisita.length} lavoratori senza visita`} />
              : <Stato cls="pill-ok" testo="completa" />}
        >
          <ul className="log-list">
            <li className="log-row">
              <span className="log-main">Nomina del medico competente</span>
              {medico
                ? <span className="doc-type-tag">
                    {medico.person_name}{medico.nomina_issue_date ? ` — nomina del ${fmt(medico.nomina_issue_date)}` : ""}
                  </span>
                : <Stato cls="pill-alert" testo="mancante (art. 18, lett. a)" />}
            </li>
            <li className="log-row">
              <span className="log-main">Visite mediche dei lavoratori</span>
              <span className="doc-type-tag">
                {soggetti.length - senzaVisita.length} di {soggetti.length} con visita registrata
              </span>
              {senzaVisita.length > 0 && (
                <span className="log-note">
                  manca: {senzaVisita.map((e) => `${e.first_name} ${e.last_name}`).join(", ")}
                </span>
              )}
            </li>
            <li className="log-row">
              <span className="log-main">Verbale di sopralluogo annuale negli ambienti di lavoro</span>
              {sopralluogo
                ? <span className="doc-type-tag">del {fmt(sopralluogo.doc_date)}</span>
                : <Stato cls="pill-warn" testo="mancante (art. 25, lett. l)" />}
            </li>
          </ul>
        </Blocco>
      )}

      <Blocco
        icona={Paperclip}
        titolo="Verbali e allegati al DVR"
        onVai={vai("allegati")}
        stato={mancanti.length === 0
          ? <Stato cls="pill-ok" testo="completi" />
          : <Stato cls="pill-warn" testo={mancanti.length === 1 ? "1 da caricare" : `${mancanti.length} da caricare`} />}
      >
        <ul className="log-list">
          {tipiDaAvere.map((t) => (
            <li key={t} className="log-row">
              {haAllegato(t)
                ? <Check size={14} color="#2F6F4E" />
                : <AlertTriangle size={14} color="#B3432E" />}
              <span className="log-main">{t}</span>
              {!haAllegato(t) && <Stato cls="pill-warn" testo="da caricare" />}
            </li>
          ))}
        </ul>
      </Blocco>

      {/* Il quadro della formazione, lo stesso che sta negli Attestati: qui
          serve per leggere in un colpo d'occhio quando scadono i corsi di
          ciascuno, senza cambiare scheda. */}
      {quadro && (
        <div className="dish-row fasc-blocco">
          <div className="fasc-testa">
            <Award size={17} color="#2F6F4E" />
            <strong className="fasc-titolo">Quadro della formazione</strong>
            {vaiA && (
              <button type="button" className="link-btn fasc-apri" onClick={() => vaiA("nomine")}>
                Apri
              </button>
            )}
          </div>
          <p className="sub fasc-sotto">
            Le scadenze degli attestati, incarico per incarico. In rosso chi va formato.
          </p>
          <div className="fasc-corpo">{quadro}</div>
        </div>
      )}

      <Blocco
        icona={GraduationCap}
        titolo="Corsi organizzati dall'azienda"
        onVai={vai("corsi")}
        sottotitolo="La formazione erogata direttamente in azienda, con registro delle presenze, verbale di verifica e attestati."
      />

      {company?.active_equipment_checks && (
        <Blocco
          icona={Wrench}
          titolo="Attrezzature, patentini e verifiche periodiche"
          onVai={vai("attrezzature")}
          stato={<Stato
            cls={equipmentChecks.length ? "pill-ok" : "pill-warn"}
            testo={equipmentChecks.length === 1 ? "1 registrazione" : `${equipmentChecks.length} registrazioni`} />}
        />
      )}

      <Blocco
        icona={ShieldAlert}
        titolo="Quadro di conformità"
        onVai={vai("conformita")}
        sottotitolo="Il riepilogo degli obblighi con il riferimento di legge di ciascuno, da esibire o da usare come promemoria."
      />
    </div>
  );
}
