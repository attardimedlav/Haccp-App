import React from "react";
import {
  CheckCircle2, AlertTriangle, ChevronRight, Info, ClipboardCheck, Circle,
} from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

// Preparazione del manuale.
//
// Il manuale non scrive nulla che in azienda non esista: è la regola che
// tiene insieme tutto il modulo, e il suo rovescio è che quello che resta
// vuoto nel configuratore manca poi nel documento. Finché i dati stavano in
// otto schede diverse, sapere a che punto si era voleva dire aprirle tutte e
// ricordarsele.
//
// Questa pagina non è un posto nuovo dove scrivere: non duplica niente, legge
// i dati dove stanno e dice che cosa manca, nell'ordine in cui conviene
// compilarlo. Il pulsante porta alla scheda giusta.
//
// Gli stati sono tre e vogliono dire cose diverse:
//   ok        la voce c'è, il manuale la userà;
//   manca     il capitolo resterà vuoto o il manuale dichiarerà meno di quanto dovrebbe;
//   da vedere non si può sapere dall'esterno se è stato fatto — gli interruttori
//             sono accesi o spenti comunque, ma solo il sopralluogo dice se è giusto.

const PILL = {
  ok: { cls: "pill-ok", testo: "a posto", Icona: CheckCircle2 },
  manca: { cls: "pill-alert", testo: "manca", Icona: AlertTriangle },
  vedere: { cls: "pill-warn", testo: "da controllare", Icona: Circle },
};

function Voce({ n, titolo, stato, dettaglio, azione, onVai }) {
  const p = PILL[stato] || PILL.vedere;
  return (
    <li className={"dish-row" + (stato === "manca" ? " row-warn" : "")}>
      <div className="dish-top" style={{ marginBottom: 6 }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span
            className="doc-type-tag"
            style={{ minWidth: 26, textAlign: "center", fontWeight: 700 }}
          >
            {n}
          </span>
          <strong>{titolo}</strong>
        </div>
        <span className={"pill " + p.cls}>
          <p.Icona size={12} /> {p.testo}
        </span>
      </div>
      <p className="pest-note" style={{ margin: "0 0 6px 36px" }}>{dettaglio}</p>
      {azione && (
        <button
          type="button" className="link-btn" style={{ marginLeft: 36 }}
          onClick={() => onVai(azione)}
        >
          {azione.label} <ChevronRight size={14} />
        </button>
      )}
    </li>
  );
}

export default function PreparazioneManuale({ onVai }) {
  const { company } = useAuth();
  const id = company?.id;

  const { items: impianti } = useTable("temperature_units", id);
  const { items: sanificanti } = useTable("sanitizers", id);
  const { items: piano } = useTable("cleaning_plan", id);
  const { items: analisi } = useTable("analysis_plan", id);
  const { items: registrazioni } = useTable("health_registrations", id);

  const c = company || {};
  const pianoAttivo = piano.filter((r) => r.active !== false);
  const analisiAttive = analisi.filter((r) => r.active !== false);

  // Anagrafica: il frontespizio e l'anagrafica del manuale nascono da qui.
  const mancanti = [
    !c.name && "ragione sociale",
    !c.sede_operativa && "sede operativa",
    !c.piva && "partita IVA",
    !c.tipologia_attivita && "tipologia di attività",
  ].filter(Boolean);

  const accesi = [
    c.active_traceability && "tracciabilità",
    c.has_blast_chiller && "abbattitore",
    c.has_ice_machine && "macchina del ghiaccio",
    c.has_fryer && "friggitrice",
    c.has_hood !== false && "cappa aspirante",
    c.has_water_tank && "vasca di accumulo",
    c.has_water_filter && "acqua filtrata",
    c.serves_raw_fish && "pesce crudo",
  ].filter(Boolean);

  const voci = [
    {
      n: 1,
      titolo: "Anagrafica dell'attività",
      stato: mancanti.length === 0 ? "ok" : "manca",
      dettaglio: mancanti.length === 0
        ? "Ragione sociale, sede operativa, partita IVA e tipologia di attività: finiscono nel frontespizio."
        : "Da completare: " + mancanti.join(", ") + ". Sono i dati della prima pagina del manuale.",
      azione: { tipo: "sub", id: "generale", label: "Vai ai dati dell'attività" },
    },
    {
      n: 2,
      titolo: "Interruttori delle lavorazioni",
      stato: "vedere",
      dettaglio: accesi.length
        ? "Accesi: " + accesi.join(", ") + ". Ogni casella accende cicli, procedure, righe di pulizia e moduli: va confrontata con il sopralluogo, perché nessun controllo automatico può dire se è giusta."
        : "Nessuna lavorazione particolare accesa. Se l'azienda ha abbattitore, friggitrice, macchina del ghiaccio o altro, il manuale non ne parlerà.",
      azione: { tipo: "sub", id: "generale", label: "Vai agli interruttori" },
    },
    {
      n: 3,
      titolo: "Responsabile del piano e firma",
      stato: !c.haccp_manager ? "manca" : "ok",
      dettaglio: !c.haccp_manager
        ? "Senza il responsabile la dichiarazione di adozione resta con la riga vuota."
        : c.haccp_signature_path && c.haccp_signature_consent_at
          ? `${c.haccp_manager} — firma depositata, il manuale esce già firmato.`
          : `${c.haccp_manager} — nessuna firma depositata: il manuale andrà stampato e firmato a mano.`,
      azione: { tipo: "sub", id: "generale", label: "Vai al responsabile" },
    },
    {
      n: 4,
      titolo: "Impianti a temperatura controllata",
      stato: impianti.length ? "ok" : "manca",
      dettaglio: impianti.length
        ? `${impianti.length} impianti censiti: sono le righe della scheda Temperature e sostengono il CCP 1.`
        : "Nessun impianto: il manuale dichiarerebbe un monitoraggio senza apparecchi su cui farlo.",
      azione: { tipo: "sub", id: "attrezzature", label: "Vai alle attrezzature" },
    },
    {
      n: 5,
      titolo: "Prodotti di sanificazione",
      stato: sanificanti.length ? "ok" : "manca",
      dettaglio: sanificanti.length
        ? `${sanificanti.length} prodotti registrati: il manuale rimanda alle loro schede tecniche.`
        : "Nessun prodotto: il manuale rimanderebbe a schede tecniche che non risultano.",
      azione: { tipo: "sub", id: "sanificanti", label: "Vai ai sanificanti" },
    },
    {
      n: 6,
      titolo: "Piano di pulizia",
      stato: pianoAttivo.length ? "ok" : "manca",
      dettaglio: pianoAttivo.length
        ? `${pianoAttivo.length} operazioni programmate: è la sezione 5.5 del manuale ed è la scheda che l'operatore spunta.`
        : "Programma vuoto: il manuale non potrà stampare frequenze e la scheda Sanificazione resterà senza righe.",
      azione: { tipo: "sub", id: "pulizie", label: "Vai al piano pulizie" },
    },
    {
      n: 7,
      titolo: "Registrazione sanitaria",
      stato: registrazioni.length ? "ok" : "manca",
      dettaglio: registrazioni.length
        ? "Registrata: il manuale cita numero, data e autorità competente."
        : "Mancante: il manuale cita numero, data e autorità competente della SCIA o della notifica.",
      azione: { tipo: "tab", id: "registrazione", label: "Vai alla registrazione sanitaria" },
    },
    {
      n: 8,
      titolo: "Programma dei controlli analitici",
      stato: analisiAttive.length ? "ok" : "manca",
      dettaglio: analisiAttive.length
        ? `${analisiAttive.length} controlli programmati: è il capitolo 9.`
        : "Nessun controllo programmato: il capitolo 9 resterebbe senza il programma dell'azienda.",
      azione: { tipo: "tab", id: "controllianalitici", label: "Vai ai controlli analitici" },
    },
  ];

  const mancano = voci.filter((v) => v.stato === "manca").length;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h3 style={{ margin: "0 0 6px" }}>Preparazione del manuale</h3>
          <p className="sub" style={{ margin: 0 }}>
            Che cosa serve prima di generarlo, nell'ordine in cui conviene compilarlo.
          </p>
        </div>
        <div className={"pill " + (mancano === 0 ? "pill-ok" : "pill-alert")}>
          {mancano === 0
            ? <><CheckCircle2 size={14} /> pronto</>
            : <><AlertTriangle size={14} /> {mancano} da completare</>}
        </div>
      </div>

      <p className="login-info" style={{ margin: "12px 0" }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Qui non si scrive nulla: è un riepilogo di dati che stanno altrove. Il manuale non dichiara
        mai cose che in azienda non esistono, e il rovescio della regola è che quello che resta vuoto
        qui manca poi nel documento.
      </p>

      <ul className="dish-list">
        {voci.map((v) => (
          <Voce key={v.n} {...v} onVai={onVai} />
        ))}
      </ul>

      <div className="nc-edit-block" style={{ marginTop: 14 }}>
        <p className="field-label" style={{ margin: "0 0 6px" }}>
          <ClipboardCheck size={13} /> Ultimo passo
        </p>
        <p className="pest-note" style={{ margin: 0 }}>
          Nella scheda Manuale di autocontrollo, prima «Genera solo una copia di prova»: scarica il
          documento senza registrare la revisione e mostra gli avvisi di coerenza. Si sistema quello
          che manca e solo allora si deposita la revisione vera.
        </p>
        <button
          type="button" className="btn-primary" style={{ marginTop: 10 }}
          onClick={() => onVai({ tipo: "tab", id: "manuale" })}
        >
          Vai al manuale di autocontrollo <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
