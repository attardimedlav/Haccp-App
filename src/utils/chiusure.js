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
