// Attività chiusa e attrezzature spente.
//
// Un registro di autocontrollo deve spiegare anche i giorni vuoti. La
// vetrina dei gelati spenta d'inverno e il locale chiuso per ferie
// producono lo stesso buco nelle registrazioni, e un buco senza
// spiegazione, in ispezione, è un controllo che non è stato fatto.
//
// Qui dentro non c'è nessuna "casella spenta": ci sono periodi, con un
// inizio, un motivo e — quando si riprende — una fine. Lo stato di oggi
// si deduce dai periodi, non si scrive da nessuna parte, così non può
// esistere una vetrina segnata accesa che ha ancora un periodo aperto.

export const MOTIVI_CHIUSURA = [
  "Chiusura per ferie",
  "Chiusura stagionale",
  "Chiusura per lavori",
  "Chiusura straordinaria",
  "Altro",
];

export const MOTIVI_SPEGNIMENTO = [
  "Spenta per fine stagione",
  "Spenta perché guasta",
  "Spenta in attesa dell'intervento del tecnico",
  "Non utilizzata in questo periodo",
  "Altro",
];

export const oggiISO = () => new Date().toISOString().slice(0, 10);

export function fmtGiorno(iso) {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}

// Un periodo copre un giorno se è iniziato entro quel giorno e non è
// ancora finito, oppure finisce in quel giorno o dopo. La fine è
// inclusiva: «chiuso dal 10 al 20» comprende il 20.
export function copreIlGiorno(periodo, giorno) {
  if (!periodo || !periodo.start_date) return false;
  const g = String(giorno).slice(0, 10);
  if (String(periodo.start_date).slice(0, 10) > g) return false;
  if (!periodo.end_date) return true;
  return String(periodo.end_date).slice(0, 10) >= g;
}

// La chiusura che vale oggi, se c'è. La query ne garantisce una sola
// aperta per volta, ma qui si sceglie comunque la più recente: se un
// giorno il vincolo cambiasse, la scheda non mostrerebbe due verità.
export function chiusuraDelGiorno(chiusure, giorno = oggiISO()) {
  return (chiusure || [])
    .filter((c) => copreIlGiorno(c, giorno))
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0] || null;
}

export function fuoriServizioDelGiorno(periodi, etichetta, giorno = oggiISO()) {
  return (periodi || [])
    .filter((p) => p.unit_label === etichetta && copreIlGiorno(p, giorno))
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0] || null;
}

// Come si legge un periodo, aperto o chiuso. Il motivo viene prima della
// data perché è la domanda che fa l'ispettore.
export function descrizionePeriodo(periodo) {
  if (!periodo) return "";
  const motivo = periodo.reason || "Fuori servizio";
  if (!periodo.end_date) return `${motivo}, dal ${fmtGiorno(periodo.start_date)}`;
  return `${motivo}, dal ${fmtGiorno(periodo.start_date)} al ${fmtGiorno(periodo.end_date)}`;
}


// ----------------------------------------------------------------------
// La chiusura settimanale.
//
// Il giorno di riposo è una proprietà dell'azienda, non un evento: un bar
// chiuso il lunedì lo è tutti i lunedì, e chiedere al titolare di premere
// «attività chiusa» ogni settimana è chiedergli di ricordarsi una cosa
// che il sistema sa già — e che, dimenticata, lascia ogni lunedì un buco
// nel registro e una fila di avvisi rossi il martedì.
//
// Si configura una volta in Configurazione → Azienda e vale per sempre.
// Non è un periodo e non si "riapre": per questo qui si costruisce un
// oggetto che ha la stessa forma di un periodo — così le schede lo
// trattano come gli altri — ma marcato `settimanale`, che toglie il
// pulsante di riapertura dove non ha senso.

export const GIORNI = [
  { n: 1, nome: "lunedì" },
  { n: 2, nome: "martedì" },
  { n: 3, nome: "mercoledì" },
  { n: 4, nome: "giovedì" },
  { n: 5, nome: "venerdì" },
  { n: 6, nome: "sabato" },
  { n: 0, nome: "domenica" },
];

const nomeGiorno = (n) => (GIORNI.find((g) => g.n === Number(n)) || {}).nome || "";

// «lunedì», «lunedì e martedì», «lunedì, martedì e mercoledì».
export function elencoGiorni(giorni) {
  const nomi = GIORNI.filter((g) => (giorni || []).map(Number).includes(g.n)).map((g) => g.nome);
  if (nomi.length === 0) return "";
  if (nomi.length === 1) return nomi[0];
  return nomi.slice(0, -1).join(", ") + " e " + nomi[nomi.length - 1];
}

// Il giorno della settimana si legge in ora locale: la data ISO di
// mezzanotte interpretata come UTC sposterebbe indietro di un giorno chi
// sta a est di Greenwich, e il lunedì diventerebbe domenica.
function giornoDellaSettimana(iso) {
  const p = String(iso).slice(0, 10).split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay();
}

export function chiusuraSettimanale(azienda, giorno = oggiISO()) {
  const giorni = (azienda && azienda.closing_weekdays) || [];
  if (!giorni.length) return null;
  const n = giornoDellaSettimana(giorno);
  if (!giorni.map(Number).includes(n)) return null;
  return {
    id: "settimanale-" + n,
    settimanale: true,
    start_date: String(giorno).slice(0, 10),
    end_date: String(giorno).slice(0, 10),
    reason: "Giorno di chiusura settimanale (" + nomeGiorno(n) + ")",
  };
}

// Quella che vale oggi: una chiusura registrata batte il giorno di
// riposo, perché dice di più (ferie, lavori) e ha una data di rientro.
export function chiusuraOggi(chiusure, azienda, giorno = oggiISO()) {
  return chiusuraDelGiorno(chiusure, giorno) || chiusuraSettimanale(azienda, giorno);
}
