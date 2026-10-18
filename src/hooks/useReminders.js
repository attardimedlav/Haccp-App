// I promemoria da mettere nel calendario.
//
// Prima questo file conteneva due eventi scritti a mano: temperature e
// sanificazione ogni mattina, infestanti ogni lunedì. Erano uguali per
// tutti i clienti, e quindi per quasi tutti sbagliati: il giro degli
// infestanti ha la periodicità che il consulente ha scritto in
// configurazione — quindici giorni, dieci, sette — e il calendario
// continuava a suonare ogni lunedì. Due documenti della stessa azienda
// che dicono cose diverse sono il difetto peggiore che questo sistema
// possa avere, perché in ispezione vale quello che dichiara di più.
//
// Da qui gli eventi nascono dai dati dell'azienda: le fasce del piano di
// pulizia che esistono davvero, la periodicità vera degli infestanti, le
// vasche con la loro cadenza, il piano analitico con le sue scadenze, le
// manutenzioni già programmate. E nessun promemoria cade in un giorno di
// chiusura: chiedere una registrazione a serranda abbassata è il modo
// più rapido per insegnare a ignorare le notifiche.

const pad2 = (n) => String(n).padStart(2, "0");

const formatICSDate = (d) =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;

// Il testo di un evento non può contenere virgole o punti e virgola nudi:
// nel formato iCalendar separano i campi, e un titolo con una virgola
// spezza l'evento in due — il calendario lo scarta senza dire niente.
const esc = (t) =>
  String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const GIORNI_ICS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const aperti = (azienda) => {
  const chiusi = (azienda?.closing_weekdays || []).map(Number);
  return [0, 1, 2, 3, 4, 5, 6].filter((n) => !chiusi.includes(n));
};

// Il primo giorno utile a partire da una data: salta i giorni di
// chiusura e, se l'ora di oggi è già passata, parte da domani.
function primoGiornoUtile(azienda, ora, da) {
  const apertiOggi = aperti(azienda);
  const adesso = new Date();
  const base = da ? new Date(da) : adesso;
  let d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), ora, 0, 0);
  if (d <= adesso) d.setDate(d.getDate() + 1);
  let giri = 0;
  while (!apertiOggi.includes(d.getDay()) && giri < 14) {
    d.setDate(d.getDate() + 1);
    giri += 1;
  }
  return d;
}

const dataDa = (iso) => {
  if (!iso) return null;
  const p = String(iso).slice(0, 10).split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
};

const piuMesi = (d, mesi) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + Number(mesi || 0));
  return x;
};

// Una frequenza in giorni diventa una regola di ricorrenza: i multipli di
// sette si scrivono in settimane, così il promemoria cade sempre nello
// stesso giorno invece di scivolare.
function regolaDaGiorni(giorni) {
  const n = Number(giorni) || 0;
  if (n <= 0) return null;
  if (n === 1) return "FREQ=DAILY";
  if (n % 7 === 0) return `FREQ=WEEKLY${n > 7 ? ";INTERVAL=" + n / 7 : ""}`;
  if (n >= 28 && n % 30 === 0) return `FREQ=MONTHLY${n > 30 ? ";INTERVAL=" + n / 30 : ""}`;
  return `FREQ=DAILY;INTERVAL=${n}`;
}

// Le fasce del piano di pulizia, le stesse che l'operatore vede nella
// scheda Sanificazione: si promemorizza la fascia, non la singola voce,
// perché dodici notifiche di pulizie coprirebbero le scadenze serie.
const FASCE = [
  { id: "settimana", titolo: "Pulizie settimanali del piano", test: (g) => g > 1 && g <= 14, giorni: 7 },
  { id: "mese", titolo: "Pulizie mensili del piano", test: (g) => g > 14 && g <= 90, giorni: 30 },
  { id: "raro", titolo: "Pulizie periodiche del piano", test: (g) => g > 90, giorni: 180 },
];

// Che cosa finirà nel calendario. La stessa funzione serve a costruire il
// file e a mostrarne l'elenco in configurazione: se fossero due elenchi
// diversi, uno dei due col tempo direbbe il falso.
export function elencoPromemoria(dati = {}) {
  const { azienda, piano = [], vasche = [], controlliVasche = [], manutenzioni = [] } = dati;
  const ora = Number(azienda?.reminder_hour) || 8;
  const oraTesto = `${pad2(ora)}:00`;
  const eventi = [];

  const righePiano = piano
    .filter((r) => r.active !== false)
    .filter((r) => !r.requires_flag || azienda?.[r.requires_flag]);

  // 1. Il giro di ogni giorno.
  {
    eventi.push({
      key: "giornaliero",
      titolo: "Temperature e pulizie di fine turno",
      quando: aperti(azienda).length === 7
        ? `Ogni giorno alle ${oraTesto}`
        : `Alle ${oraTesto} nei giorni di apertura`,
      rrule: aperti(azienda).length === 7
        ? "FREQ=DAILY"
        : `FREQ=WEEKLY;BYDAY=${aperti(azienda).map((n) => GIORNI_ICS[n]).join(",")}`,
      inizio: primoGiornoUtile(azienda, ora),
      descrizione: "Lettura delle temperature di tutti gli impianti e pulizie quotidiane previste dal piano.",
    });
  }

  // 2. Il giro degli infestanti, con la periodicità dell'azienda e non
  //    con quella che faceva comodo a chi ha scritto il codice.
  const giorniGiro = Number(azienda?.pest_round_days) || 7;
  eventi.push({
    key: "infestanti",
    titolo: "Giro di monitoraggio infestanti",
    quando: giorniGiro === 7
      ? `Ogni settimana alle ${oraTesto}`
      : `Ogni ${giorniGiro} giorni alle ${oraTesto}`,
    rrule: regolaDaGiorni(giorniGiro),
    inizio: primoGiornoUtile(azienda, ora),
    descrizione: "Controllo delle postazioni della planimetria e registrazione del giro.",
  });

  // 3. Le fasce del piano di pulizia che esistono in questa azienda.
  FASCE.forEach((f) => {
    const sue = righePiano.filter((r) => f.test(Number(r.frequency_days)));
    if (sue.length === 0) return;
    const giorni = Math.min(...sue.map((r) => Number(r.frequency_days) || f.giorni));
    eventi.push({
      key: "pulizie-" + f.id,
      titolo: f.titolo,
      quando: `Ogni ${giorni} giorni alle ${oraTesto}`,
      rrule: regolaDaGiorni(giorni),
      inizio: primoGiornoUtile(azienda, ora),
      descrizione: sue.slice(0, 8).map((r) => r.operation).join("; ") +
        (sue.length > 8 ? ` e altre ${sue.length - 8}` : ""),
    });
  });

  // 4. Le vasche di accumulo, ciascuna con la sua cadenza e a partire
  //    dalla sua prossima scadenza vera.
  vasche.filter((v) => v.active !== false).forEach((v) => {
    const mesi = Number(v.cleaning_months) || 6;
    const sue = controlliVasche.filter((w) => w.tank_id === v.id);
    const ultima = sue.reduce((m, w) => ((w.created_at || "") > m ? w.created_at : m), "");
    const prossima = ultima ? piuMesi(new Date(ultima), mesi) : new Date();
    eventi.push({
      key: "vasca-" + v.id,
      titolo: `Pulizia della vasca: ${v.name}`,
      quando: `Ogni ${mesi} mesi, dal ${prossima.toLocaleDateString("it-IT")}`,
      rrule: `FREQ=MONTHLY;INTERVAL=${mesi}`,
      inizio: primoGiornoUtile(azienda, ora, prossima),
      descrizione: "Svuotamento, pulizia e sanificazione della vasca, con registrazione.",
    });
  });

  // 5. I controlli analitici NON entrano nel calendario.
  //
  // Prenotare il laboratorio non è un gesto che si fa alle otto del
  // mattino perché suona il telefono: la campagna la organizza il
  // consulente, e l'OSA deve solo sapere a che punto è. Una sveglia per
  // una cosa che non si può fare al momento è la sveglia che insegna a
  // spegnere anche le altre. Le scadenze del piano analitico restano
  // dove servono, cioè fra gli avvisi della Panoramica, che si guardano
  // quando si apre l'app e non pretendono niente subito.

  // 6. Le manutenzioni già programmate: una data sola, non una
  //    ricorrenza, perché la prossima la fissa il tecnico.
  manutenzioni.filter((m) => m.next_due).forEach((m) => {
    const d = dataDa(m.next_due);
    if (!d || d < new Date(new Date().toDateString())) return;
    eventi.push({
      key: "manut-" + m.id,
      titolo: `Manutenzione: ${m.equipment}`,
      quando: `Il ${d.toLocaleDateString("it-IT")}`,
      rrule: null,
      inizio: primoGiornoUtile(azienda, ora, d),
      descrizione: m.intervention_type || "",
    });
  });

  return eventi;
}

export function buildReminderICS(dati = {}) {
  const nome = dati?.azienda?.name || "";
  const eventi = elencoPromemoria(dati);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Autocontrollo HACCP//IT", "CALSCALE:GREGORIAN"];
  eventi.forEach((ev, i) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:haccp-${esc(ev.key)}-${i}-${Date.now()}@autocontrollo`,
      `DTSTAMP:${formatICSDate(new Date())}Z`,
      `DTSTART;TZID=Europe/Rome:${formatICSDate(ev.inizio)}`,
      "DURATION:PT15M",
    );
    if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
    lines.push(
      `SUMMARY:${esc(ev.titolo + (nome ? " — " + nome : ""))}`,
      `DESCRIPTION:${esc(ev.descrizione)}`,
      "BEGIN:VALARM", "TRIGGER:-PT0M", "ACTION:DISPLAY", `DESCRIPTION:${esc(ev.titolo)}`, "END:VALARM",
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadReminderICS(dati) {
  // Compatibilità con la vecchia chiamata, che passava il solo nome:
  // meglio due promemoria generici che un errore in faccia all'utente.
  const payload = typeof dati === "string" ? { azienda: { name: dati } } : (dati || {});
  const ics = buildReminderICS(payload);
  const dataUri = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  const link = document.createElement("a");
  link.href = dataUri;
  link.download = "promemoria-haccp.ics";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
