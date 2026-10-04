// Dati di nascita ricavati dal codice fiscale.
//
// Il codice fiscale contiene già la data di nascita: chiederla di nuovo è far
// riscrivere a mano un dato che l'app ha davanti, con il rischio che le due
// versioni non coincidano. Il comune invece resta da scrivere, perché nel
// codice è una sigla catastale (il "codice Belfiore") e tradurla richiederebbe
// la tabella di tutti i comuni italiani e di tutti gli Stati esteri, con i
// comuni soppressi e accorpati negli anni: una tabella che andrebbe mantenuta.
//
// Struttura: 6 lettere di cognome e nome, 2 cifre dell'anno, 1 lettera del
// mese, 2 cifre del giorno (alle donne si somma 40), 4 caratteri del comune,
// 1 carattere di controllo.

const MESI = { A: 1, B: 2, C: 3, D: 4, E: 5, H: 6, L: 7, M: 8, P: 9, R: 10, S: 11, T: 12 };

// Il secolo non è scritto da nessuna parte: con due cifre, "82" può essere il
// 1982 o il 2082. Si assume che la persona sia già nata: un anno superiore a
// quello corrente appartiene al secolo scorso. Per un elenco di lavoratori è
// sempre vero, e sbagliare di cent'anni si vede a occhio.
function anniInteri(due) {
  const correnti = new Date().getFullYear() % 100;
  return due > correnti ? 1900 + due : 2000 + due;
}

export function datiDaCodiceFiscale(cf) {
  const v = String(cf || "").toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(v)) return null;

  const anno = anniInteri(Number(v.slice(6, 8)));
  const mese = MESI[v[8]];
  let giorno = Number(v.slice(9, 11));
  const femmina = giorno > 40;
  if (femmina) giorno -= 40;
  if (!mese || giorno < 1 || giorno > 31) return null;

  // Controllo che la data esista davvero: il 31 febbraio supera i limiti qui
  // sopra ma non è una data, e un codice fiscale sbagliato non deve diventare
  // una data di nascita plausibile.
  const d = new Date(Date.UTC(anno, mese - 1, giorno));
  if (d.getUTCFullYear() !== anno || d.getUTCMonth() !== mese - 1 || d.getUTCDate() !== giorno) return null;

  return {
    dataNascita: `${anno}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`,
    sesso: femmina ? "F" : "M",
    codiceComune: v.slice(11, 15),
  };
}

// Comodo per i moduli: la sola data, o stringa vuota.
export function dataNascitaDaCf(cf) {
  const d = datiDaCodiceFiscale(cf);
  return d ? d.dataNascita : "";
}
