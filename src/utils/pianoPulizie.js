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


// Le righe del piano che valgono per QUESTA azienda.
//
// Ogni riga puo' portare un `requires_flag`: la pulizia della macchina del
// ghiaccio esiste solo se l'azienda ha la macchina del ghiaccio, quella
// della cappa solo se c'e' la cappa. Il filtro era scritto a mano in ogni
// scheda che legge il piano, e dove qualcuno se l'e' dimenticato — gli
// avvisi delle pulizie periodiche in Panoramica, la scheda del piano —
// sono comparsi controlli su attrezzature che l'azienda non ha.
//
// Un filtro scritto in un posto solo non si dimentica in cinque.
export function righeValide(piano, azienda) {
  return (piano || [])
    .filter(function (r) { return r.active !== false; })
    .filter(function (r) {
      if (!r.requires_flag) return true;
      return !!(azienda && azienda[r.requires_flag]);
    })
    .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
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

// Piano standard di partenza.
//
// Un cliente nuovo arrivava con il piano vuoto e le righe si scrivevano a
// mano una per una, sempre le stesse. Queste sono le voci tipiche di
// un'attività alimentare, già con la frequenza di monitoraggio: il
// consulente le trova pronte e cambia solo le cadenze che non tornano.
//
// Le voci legate a un'attrezzatura (cappa, friggitrice, abbattitore)
// portano il `requires_flag` della casella in Configurazione: valgono solo
// se l'azienda ha quell'attrezzatura, come già succede per la macchina del
// ghiaccio.
const DET = "Detergente sgrassante";
const SAN = "Sanificante per superfici a contatto con alimenti";
const CLORO = "Disinfettante a base di cloro";
const DIS = "Detergente disincrostante";
const ADD = "Addetto di turno";

export const PIANO_STANDARD = [
  // Cucina
  { area: "Cucina", operation: "Piani di lavoro e taglieri", frequency_days: 1, product: SAN, method: "Rimozione dei residui, lavaggio con detergente, sanificazione e risciacquo; a fine lavorazione e a ogni cambio di prodotto." },
  { area: "Cucina", operation: "Utensili, stoviglie e contenitori", frequency_days: 1, product: SAN, method: "Lavaggio in lavastoviglie ad alta temperatura o a mano con detergente e sanificazione." },
  { area: "Cucina", operation: "Lavelli e rubinetteria", frequency_days: 1, product: DIS },
  { area: "Cucina", operation: "Pavimenti della cucina", frequency_days: 1, product: CLORO, method: "Spazzatura, lavaggio con detergente e disinfezione a fine turno." },
  { area: "Cucina", operation: "Pattumiere e area rifiuti", frequency_days: 1, product: CLORO, method: "Svuotamento a fine turno, lavaggio e disinfezione dei contenitori." },
  { area: "Cucina", operation: "Piano cottura, forni e piastre", frequency_days: 1, product: DET },
  { area: "Cucina", operation: "Pareti piastrellate, porte e maniglie", frequency_days: 7, product: SAN },
  { area: "Cucina", operation: "Cappa aspirante: superfici esterne", frequency_days: 7, product: DET, requires_flag: "has_hood" },
  { area: "Cucina", operation: "Cappa aspirante: lavaggio dei filtri", frequency_days: 30, product: DET, method: "Smontaggio dei filtri, sgrassatura per immersione, risciacquo e asciugatura prima del rimontaggio.", requires_flag: "has_hood" },
  { area: "Cucina", operation: "Friggitrice: cambio olio e pulizia della vasca", frequency_days: 7, product: DET, method: "Sostituzione dell'olio quando alterato e comunque alla frequenza indicata; svuotamento, sgrassatura e asciugatura della vasca.", requires_flag: "has_fryer" },
  { area: "Cucina", operation: "Soffitti, lampade e zone alte", frequency_days: 90, product: DET },
  // Sala
  { area: "Sala", operation: "Tavoli, sedie e banco", frequency_days: 1, product: SAN },
  { area: "Sala", operation: "Pavimenti della sala", frequency_days: 1, product: CLORO },
  { area: "Sala", operation: "Vetrine espositive e banchi frigo", frequency_days: 7, product: SAN },
  { area: "Sala", operation: "Vetri, infissi e arredi", frequency_days: 30, product: DET },
  // Bagni
  { area: "Bagni", operation: "Sanitari, lavabi e pavimenti dei servizi", frequency_days: 1, product: CLORO, method: "Pulizia e disinfezione; controllo e reintegro di sapone liquido, carta e salviette monouso." },
  { area: "Bagni", operation: "Spogliatoi e armadietti", frequency_days: 7, product: SAN },
  { area: "Bagni", operation: "Pareti, porte e piastrelle dei servizi", frequency_days: 7, product: CLORO },
  // Magazzino
  { area: "Magazzino", operation: "Pavimenti del magazzino", frequency_days: 7, product: CLORO },
  { area: "Magazzino", operation: "Scaffalature e ripiani", frequency_days: 30, product: SAN, method: "Svuotamento a rotazione dei ripiani, pulizia e controllo delle scadenze e dell'integrità delle confezioni." },
  // Attrezzature
  { area: "Attrezzature", operation: "Affettatrice, tritacarne e piccole attrezzature", frequency_days: 1, product: SAN, method: "Smontaggio delle parti a contatto con l'alimento dopo l'uso, lavaggio, sanificazione e risciacquo." },
  { area: "Attrezzature", operation: "Lavastoviglie: pulizia filtri e vasca", frequency_days: 7, product: DIS },
  { area: "Attrezzature", operation: "Abbattitore: pulizia e sanificazione della cella", frequency_days: 7, product: SAN, requires_flag: "has_blast_chiller" },
  // Frigoriferi
  { area: "Frigoriferi", operation: "Frigoriferi: superfici interne e guarnizioni", frequency_days: 7, product: SAN, method: "Spostamento degli alimenti, rimozione dei residui, sanificazione di ripiani e guarnizioni, controllo delle temperature al riavvio." },
  { area: "Frigoriferi", operation: "Congelatori: sbrinamento e pulizia completa", frequency_days: 90, product: SAN },
  { area: "Frigoriferi", operation: "Celle frigorifere: pulizia completa", frequency_days: 30, product: SAN },
];

function chiave(r) {
  return (r.area || "") + "|" + (r.operation || "").trim().toLowerCase();
}

// Le voci del piano standard che il piano di questa azienda non ha ancora,
// pronte da inserire, con l'ordine che continua dopo le righe esistenti.
export function vociStandardMancanti(piano) {
  const presenti = new Set((piano || []).map(chiave));
  let ordine = (piano || []).reduce(function (m, r) { return Math.max(m, r.sort_order || 0); }, 0);
  return PIANO_STANDARD
    .filter(function (v) { return !presenti.has(chiave(v)); })
    .map(function (v) {
      ordine += 10;
      return {
        area: v.area,
        operation: v.operation,
        frequency_days: v.frequency_days,
        product: v.product || null,
        responsible: ADD,
        method: v.method || null,
        requires_flag: v.requires_flag || null,
        sort_order: ordine,
      };
    });
}
