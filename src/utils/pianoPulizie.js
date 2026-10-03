// Piano di pulizia e sanificazione.
//
// Un posto solo per il piano: lo stampa il manuale, lo controlla la
// Panoramica, lo compila la scheda Sanificazione. Finché la frequenza era
// scritta soltanto nel testo del manuale, nessun avviso poteva nascere da
// lì: una frase non si può confrontare con una data.
//
// Il collegamento fra il piano e le registrazioni passa da due campi:
// l'area (le stesse sei della scheda) e l'operazione. L'operazione serve
// perché nella stessa area convivono frequenze diverse — i piani di lavoro
// si puliscono ogni giorno, la cappa una volta al mese — e senza di essa
// una passata ai piani farebbe risultare in regola anche la cappa.

export const FREQUENZE = [
  { giorni: 1, label: "Ogni giorno" },
  { giorni: 2, label: "Ogni due giorni" },
  { giorni: 7, label: "Settimanale" },
  { giorni: 14, label: "Ogni due settimane" },
  { giorni: 30, label: "Mensile" },
  { giorni: 90, label: "Trimestrale" },
  { giorni: 180, label: "Semestrale" },
  { giorni: 365, label: "Annuale" },
];

export function etichettaFrequenza(giorni) {
  const trovata = FREQUENZE.find(function (f) { return f.giorni === Number(giorni); });
  if (trovata) return trovata.label;
  const n = Number(giorni) || 0;
  if (n <= 0) return "Non programmata";
  return "Ogni " + n + " giorni";
}

const GIORNO = 86400000;

function soloData(valore) {
  if (!valore) return null;
  const d = new Date(valore);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtData(valore) {
  const d = soloData(valore);
  if (!d) return "";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// L'ultima registrazione che copre una riga del piano.
//
// Si cerca prima la registrazione fatta esattamente su quell'operazione;
// se non ce n'è, vale una registrazione dell'area senza operazione
// indicata. Le righe vecchie, salvate prima che l'operazione esistesse,
// restano quindi valide per l'area intera: è l'unica lettura onesta di un
// dato che allora non distingueva.
export function ultimaPulizia(riga, registrazioni) {
  const dellArea = registrazioni.filter(function (r) { return r.area === riga.area; });
  const precise = dellArea.filter(function (r) { return (r.operation || "") === riga.operation; });
  const generiche = dellArea.filter(function (r) { return !r.operation; });
  const candidate = precise.length ? precise : generiche;
  return candidate.reduce(function (migliore, r) {
    const d = soloData(r.created_at);
    if (!d) return migliore;
    return !migliore || d > soloData(migliore.created_at) ? r : migliore;
  }, null);
}

// Stato di una riga del piano: mai eseguita, in ritardo di N giorni,
// da fare oggi, oppure in regola fino a una certa data.
export function statoRiga(riga, registrazioni) {
  const ultima = ultimaPulizia(riga, registrazioni);
  const giorni = Math.max(1, Number(riga.frequency_days) || 1);
  if (!ultima) {
    return {
      riga: riga,
      ultima: null,
      scadenza: null,
      ritardo: null,
      cls: "pill-alert",
      label: "Mai registrata",
    };
  }
  const fatta = soloData(ultima.created_at);
  const scadenza = new Date(fatta.getTime() + giorni * GIORNO);
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const mancano = Math.ceil((scadenza - oggi) / GIORNO);
  if (mancano < 0) {
    return {
      riga: riga,
      ultima: ultima,
      scadenza: scadenza,
      ritardo: -mancano,
      cls: "pill-alert",
      label: "In ritardo di " + (-mancano) + (-mancano === 1 ? " giorno" : " giorni"),
    };
  }
  if (mancano === 0) {
    return { riga: riga, ultima: ultima, scadenza: scadenza, ritardo: 0, cls: "pill-warn", label: "Da fare oggi" };
  }
  return {
    riga: riga,
    ultima: ultima,
    scadenza: scadenza,
    ritardo: 0,
    cls: "pill-ok",
    label: "In regola fino al " + fmtData(scadenza),
  };
}

// Tutte le righe attive con il loro stato, le scoperte per prime: in
// Panoramica e nel pannello si guarda quello che manca, non quello che è
// a posto.
export function statoPiano(piano, registrazioni) {
  return (piano || [])
    .filter(function (r) { return r.active !== false; })
    .map(function (r) { return statoRiga(r, registrazioni || []); })
    .sort(function (a, b) {
      const pa = a.cls === "pill-alert" ? 0 : a.cls === "pill-warn" ? 1 : 2;
      const pb = b.cls === "pill-alert" ? 0 : b.cls === "pill-warn" ? 1 : 2;
      if (pa !== pb) return pa - pb;
      if (pa === 0 && a.ritardo !== b.ritardo) return (b.ritardo || 0) - (a.ritardo || 0);
      return (a.riga.sort_order || 0) - (b.riga.sort_order || 0);
    });
}

// Soglia degli avvisi.
//
// Le pulizie di ogni giorno non generano avvisi: nessuno registra voce per
// voce il passaggio sui piani di lavoro, e segnalarle riempirebbe la
// Panoramica di righe rosse che si imparano a ignorare — che è peggio che
// non averle. Gli avvisi restano sulle pulizie periodiche, quelle che si
// dimenticano davvero: la cappa, i frigoriferi a fondo, il magazzino.
// Nel manuale il piano resta stampato per intero, quotidiane comprese.
export const SOGLIA_AVVISO_GIORNI = 7;

// Le sole voci su cui ha senso avvisare, già in ritardo.
export function daAvvisare(piano, registrazioni) {
  return statoPiano(piano, registrazioni).filter(function (s) {
    return Number(s.riga.frequency_days) >= SOGLIA_AVVISO_GIORNI && s.cls === "pill-alert";
  });
}

// Riassunto per area, che è il modo in cui serve alla Panoramica: una riga
// per area invece di dieci, con il ritardo peggiore e quante operazioni
// sono scoperte.
export function riassuntoPerArea(piano, registrazioni) {
  const stati = daAvvisare(piano, registrazioni);
  const mappa = new Map();
  stati.forEach(function (s) {
    const area = s.riga.area;
    if (!mappa.has(area)) mappa.set(area, { area: area, totale: 0, scadute: 0, peggiore: null });
    const voce = mappa.get(area);
    voce.totale += 1;
    voce.scadute += 1;
    if (!voce.peggiore || (s.ritardo || 0) > (voce.peggiore.ritardo || 0)) voce.peggiore = s;
  });
  return [...mappa.values()]
    .filter(function (v) { return v.scadute > 0; })
    .sort(function (a, b) { return (b.peggiore?.ritardo || 0) - (a.peggiore?.ritardo || 0); });
}

// Le operazioni previste per un'area, come le propone la scheda
// Sanificazione all'operatore che registra.
export function operazioniDiArea(piano, area) {
  return (piano || [])
    .filter(function (r) { return r.active !== false && r.area === area; })
    .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
}
