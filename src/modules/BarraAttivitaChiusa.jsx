import React, { useState } from "react";
import { CalendarOff, Check, Info } from "lucide-react";
import { MOTIVI_CHIUSURA, descrizionePeriodo, elencoGiorni, oggiISO } from "../utils/chiusure";

// La fascia dell'attività chiusa, uguale nelle schede che la mostrano.
//
// Sta in un componente solo perché la chiusura è un dato dell'azienda, non
// della scheda: si apre dalle pulizie e si vede nelle temperature, o
// viceversa, e due copie dello stesso comando finirebbero per comportarsi
// in due modi diversi.
//
// Chi apre la chiusura non deve sapere quando riaprirà: la data di fine
// resta vuota e si scrive il giorno del rientro. Obbligare a indicarla
// subito significherebbe avere nel registro una data inventata.

export default function BarraAttivitaChiusa({ chiusa, add, update, remove, nomeControlli, giorniChiusura }) {
  const [aperto, setAperto] = useState(false);
  const [inizio, setInizio] = useState(oggiISO());
  const [motivo, setMotivo] = useState(MOTIVI_CHIUSURA[0]);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);

  const apriChiusura = async () => {
    setBusy(true);
    try {
      await add({ start_date: inizio, end_date: null, reason: motivo, note: nota.trim() || null });
      setAperto(false);
      setNota("");
    } finally {
      setBusy(false);
    }
  };

  // Si riapre oggi, quindi l'ultimo giorno di chiusura e' ieri.
  //
  // Se la chiusura era cominciata proprio oggi — segnata per sbaglio, o
  // ci si e' ripensati — di giorni chiusi non ce n'e' stato nessuno: il
  // periodo si toglie invece di chiuderlo a oggi, perche' un periodo che
  // finisce oggi copre ancora oggi e l'attivita' resterebbe chiusa dopo
  // aver premuto «riaperta».
  const riapri = async () => {
    setBusy(true);
    try {
      const ieri = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const inizioChiusura = String(chiusa.start_date).slice(0, 10);
      if (inizioChiusura > ieri && remove) await remove(chiusa.id);
      else await update(chiusa.id, { end_date: ieri });
    } finally {
      setBusy(false);
    }
  };

  // Il giorno di riposo settimanale non si "riapre": torna da solo la
  // settimana dopo. Niente pulsante, quindi, ma resta la possibilita' di
  // dichiarare una chiusura vera — le ferie cominciate di lunedi' sono
  // un'altra cosa e hanno una data di rientro.
  if (chiusa && chiusa.settimanale) {
    return (
      <div className="nc-edit-block" style={{ marginBottom: 12, background: "#FBF4E6", borderColor: "#C79A3A" }}>
        <div className="dish-top" style={{ marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <CalendarOff size={14} style={{ marginRight: 6, verticalAlign: -2 }} color="#8A6514" />
            <strong>Oggi l'attività è chiusa</strong>
            <span className="lot-tag">{chiusa.reason}</span>
          </div>
          {!aperto && (
            <button type="button" className="link-btn" onClick={() => setAperto(true)}>
              <CalendarOff size={14} /> Chiusura più lunga (ferie, lavori)
            </button>
          )}
        </div>
        <p className="pest-note" style={{ margin: 0 }}>
          <span>
            {nomeControlli.charAt(0).toUpperCase() + nomeControlli.slice(1)} di oggi non si
            registrano e non vengono sollecitate. Il giorno di chiusura si cambia in
            Configurazione → Azienda.
          </span>
        </p>
        {aperto && moduloChiusura()}
      </div>
    );
  }

  if (chiusa) {
    return (
      <div className="nc-edit-block" style={{ marginBottom: 12, background: "#FBF4E6", borderColor: "#C79A3A" }}>
        <div className="dish-top" style={{ marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <CalendarOff size={14} style={{ marginRight: 6, verticalAlign: -2 }} color="#8A6514" />
            <strong>Attività chiusa</strong>
            <span className="lot-tag">{descrizionePeriodo(chiusa)}</span>
            {chiusa.note && <span className="doc-type-tag">{chiusa.note}</span>}
          </div>
          <button type="button" className="btn-primary" disabled={busy} onClick={riapri}>
            <Check size={15} /> {busy ? "…" : "Attività riaperta oggi"}
          </button>
        </div>
        <p className="pest-note" style={{ margin: 0 }}>
          <span>
            Nei giorni di chiusura {nomeControlli} non si registrano, e il registro lo dice: il
            periodo resta scritto qui e spiega perché in quei giorni non c'è nessuna riga.
            Premi «Attività riaperta» il giorno del rientro: l'app chiuderà il periodo al giorno
            prima, che è l'ultimo giorno in cui il locale era chiuso.
          </span>
        </p>
      </div>
    );
  }

  if (!aperto) {
    return (
      <div style={{ marginBottom: 10 }}>
        <button type="button" className="link-btn" onClick={() => setAperto(true)}>
          <CalendarOff size={14} /> Segna l'attività come chiusa
        </button>
        {giorniChiusura && giorniChiusura.length > 0 && (
          <span className="sub" style={{ marginLeft: 10 }}>
            chiusura settimanale: {elencoGiorni(giorniChiusura)}
          </span>
        )}
      </div>
    );
  }

  return moduloChiusura();

  function moduloChiusura() {
  return (
    <div className="nc-edit-block" style={{ marginBottom: 12 }}>
      <p className="field-label" style={{ margin: "0 0 8px" }}>
        Da quando l'attività è chiusa, e perché
      </p>
      <div className="row-form" style={{ margin: "0 0 8px" }}>
        <input type="date" value={inizio} onChange={(e) => setInizio(e.target.value)} />
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          {MOTIVI_CHIUSURA.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          type="text" className="note-input" placeholder="Nota (facoltativa)"
          value={nota} onChange={(e) => setNota(e.target.value)}
        />
      </div>
      <div className="row-form" style={{ margin: 0 }}>
        <button type="button" className="btn-primary" disabled={busy} onClick={apriChiusura}>
          <Check size={15} /> {busy ? "…" : "Registra la chiusura"}
        </button>
        <button type="button" className="link-btn" onClick={() => setAperto(false)}>Annulla</button>
      </div>
      <p className="login-info" style={{ marginTop: 10 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          La data di fine non si indica adesso: la scrive l'app il giorno in cui premi
          «Attività riaperta». Il periodo resta nello storico anche dopo la riapertura, perché è
          quello che spiega i giorni senza registrazioni. La chiusura vale per tutte le schede
          dell'autocontrollo, non solo per questa: si registra una volta e basta.
        </span>
      </p>
    </div>
  );
  }
}

// Lo storico dei periodi senza registrazioni.
//
// La fascia qui sopra dice che l'attività è chiusa OGGI, e la riga grigia
// in Temperature dice che la vetrina è spenta OGGI. Ma il controllo
// arriva a marzo e chiede perché in gennaio quella vetrina non ha
// letture: a quel punto la vetrina è accesa e a schermo non c'è più
// niente da mostrare.
//
// Questo elenco resta sempre in fondo alla scheda, chiusure e
// spegnimenti già finiti compresi. Non è un abbellimento: l'esportazione
// in PDF stampa la scheda così come si vede, quindi è il pezzo che fa
// uscire la spiegazione insieme al registro invece di lasciarla
// nell'app.
export function StoricoPeriodi({ chiusure, spegnimenti, giorniChiusura }) {
  const perData = (a, b) => (String(a.start_date) < String(b.start_date) ? 1 : -1);
  const righeChiusure = [...(chiusure || [])].sort(perData);
  const righeSpegnimenti = [...(spegnimenti || [])].sort(perData);

  const settimanale = (giorniChiusura || []).length > 0 ? elencoGiorni(giorniChiusura) : "";

  if (righeChiusure.length === 0 && righeSpegnimenti.length === 0 && !settimanale) return null;

  return (
    <div style={{ marginTop: 18 }}>
      <h3 className="section-title" style={{ marginBottom: 6 }}>
        Periodi senza registrazioni, e perché
      </h3>
      <ul className="log-list">
        {settimanale && (
          <li className="log-row">
            <CalendarOff size={15} color="#8A6514" />
            <span className="log-main"><strong>Chiusura settimanale</strong></span>
            <span className="log-note">ogni {settimanale}</span>
          </li>
        )}
        {righeChiusure.map((c) => (
          <li key={c.id} className="log-row">
            <CalendarOff size={15} color="#8A6514" />
            <span className="log-main"><strong>Attività chiusa</strong></span>
            <span className="log-note">{descrizionePeriodo(c)}</span>
            {c.note && <span className="log-unit">{c.note}</span>}
          </li>
        ))}
        {righeSpegnimenti.map((p) => (
          <li key={p.id} className="log-row">
            <CalendarOff size={15} color="#8A6514" />
            <span className="log-main"><strong>{p.unit_label}</strong></span>
            <span className="log-note">{descrizionePeriodo(p)}</span>
            {p.note && <span className="log-unit">{p.note}</span>}
          </li>
        ))}
      </ul>
      <p className="range-hint">
        Nei periodi e nei giorni elencati non c'era nulla da registrare: l'attività era chiusa o
        l'attrezzatura era ferma. L'elenco si stampa insieme al registro ed è quello che
        spiega le righe mancanti.
      </p>
    </div>
  );
}
