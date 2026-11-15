// La revisione del menu che l'azienda ha già.
//
// Quasi tutte le attività un menu ce l'hanno: stampato, plastificato, appeso
// da due anni. Chiedere di rifarlo dentro l'app per avere gli allergeni è il
// modo migliore perché non lo faccia nessuno. Qui invece l'OSA allega il suo,
// l'app lo legge e gli dice che cosa manca per essere in regola — e solo
// dopo, se vuole, se lo porta dentro.
//
// Due cose che questo file NON fa, di proposito:
//
//   1. non dichiara allergeni al posto dell'OSA. Gli allergeni proposti qui
//      escono da un dizionario di nomi di piatti: "carbonara" fa pensare a
//      uova, latte e glutine, ma la carbonara di quel bar potrebbe essere
//      senza pecorino o con la pasta di mais. La proposta serve a non far
//      partire da foglio bianco, e va confermata guardando le etichette dei
//      prodotti in uso. La responsabilità della dichiarazione resta
//      dell'operatore, e l'app non deve mai far credere il contrario.
//
//   2. non promuove e non boccia un menu. Elenca i rilievi con il loro
//      riferimento di legge; quanto pesino lo decide chi legge. Un semaforo
//      verde su un menu lo leggerebbe come un'approvazione, e questa app non
//      ha titolo per darla.

import { allergeniDaIngredienti } from "./allergeniDaIngredienti";

export const ALLERGENI = [
  "Glutine", "Latte", "Uova", "Soia", "Frutta a guscio", "Pesce", "Crostacei",
  "Sedano", "Senape", "Solfiti", "Arachidi", "Sesamo", "Lupini", "Molluschi",
];

const normalizza = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// I piatti il cui nome non contiene gli ingredienti, ma li ha lo stesso.
//
// "Spaghetti alle vongole" lo capisce già il dizionario degli ingredienti,
// perché la parola vongole c'è. "Carbonara" no: il nome non nomina niente di
// quello che c'è dentro, ed è esattamente il caso in cui un allergene sparisce
// da un menu. Qui stanno quei piatti.
//
// Vale per la ricetta comune. Nessuna riga di questo elenco e' una certezza
// sul piatto di quella cucina: per questo quello che esce di qui si chiama
// proposta e si presenta spuntabile, mai salvato da solo.
const PIATTI = [
  // Primi
  ["carbonara", ["Glutine", "Uova", "Latte"]],
  ["amatriciana", ["Glutine", "Latte"]],
  ["cacio e pepe", ["Glutine", "Latte"]],
  ["gricia", ["Glutine", "Latte"]],
  ["pesto", ["Latte", "Frutta a guscio"]],
  ["lasagn", ["Glutine", "Latte", "Uova", "Sedano"]],
  ["cannellon", ["Glutine", "Latte", "Uova"]],
  ["tortellin", ["Glutine", "Uova", "Latte"]],
  ["ravioli", ["Glutine", "Uova", "Latte"]],
  ["gnocchi", ["Glutine", "Latte"]],
  ["risotto", ["Latte"]],
  ["ragù", ["Sedano"]],
  ["ragu", ["Sedano"]],
  ["bolognese", ["Sedano", "Glutine"]],
  ["norma", ["Glutine", "Latte"]],
  ["quattro formaggi", ["Glutine", "Latte"]],
  ["carbonara di mare", ["Glutine", "Uova", "Pesce"]],
  // Secondi e contorni
  ["cotoletta", ["Glutine", "Uova", "Latte"]],
  ["milanese", ["Glutine", "Uova", "Latte"]],
  ["impanat", ["Glutine", "Uova"]],
  ["panat", ["Glutine", "Uova"]],
  ["fritto misto", ["Glutine", "Pesce", "Molluschi", "Crostacei"]],
  ["frittura di paranza", ["Glutine", "Pesce", "Molluschi"]],
  ["parmigiana", ["Latte", "Glutine", "Uova"]],
  ["polpett", ["Glutine", "Uova", "Latte"]],
  ["hamburger", ["Glutine", "Senape", "Sesamo"]],
  ["panino", ["Glutine"]],
  ["club sandwich", ["Glutine", "Uova", "Latte", "Senape"]],
  ["caesar", ["Uova", "Pesce", "Latte", "Glutine"]],
  ["insalata russa", ["Uova", "Senape"]],
  ["maionese", ["Uova", "Senape"]],
  ["salsa rosa", ["Uova", "Senape"]],
  ["tartare", ["Senape"]],
  ["frutti di mare", ["Molluschi", "Crostacei"]],
  ["insalata di mare", ["Molluschi", "Crostacei", "Pesce"]],
  ["zuppa di pesce", ["Pesce", "Molluschi", "Crostacei", "Sedano"]],
  ["grigliata mista", ["Pesce", "Molluschi", "Crostacei"]],
  ["crudo di mare", ["Pesce", "Molluschi", "Crostacei"]],
  ["cous cous", ["Glutine", "Sedano"]],
  ["couscous", ["Glutine", "Sedano"]],
  // Pizza e lievitati
  ["pizza", ["Glutine", "Latte"]],
  ["focacc", ["Glutine"]],
  ["calzone", ["Glutine", "Latte"]],
  ["piadina", ["Glutine", "Latte"]],
  ["arancin", ["Glutine", "Latte", "Uova", "Sedano"]],
  ["crocch", ["Glutine", "Latte", "Uova"]],
  ["rustico", ["Glutine", "Latte", "Uova"]],
  ["cornetto", ["Glutine", "Latte", "Uova"]],
  ["croissant", ["Glutine", "Latte", "Uova"]],
  ["brioche", ["Glutine", "Latte", "Uova"]],
  // Dolci
  ["tiramis", ["Glutine", "Latte", "Uova"]],
  ["cannol", ["Glutine", "Latte", "Uova", "Frutta a guscio"]],
  ["cassata", ["Glutine", "Latte", "Uova", "Frutta a guscio"]],
  ["crostata", ["Glutine", "Latte", "Uova"]],
  ["torta", ["Glutine", "Latte", "Uova"]],
  ["profiterol", ["Glutine", "Latte", "Uova"]],
  ["bignè", ["Glutine", "Latte", "Uova"]],
  ["panna cotta", ["Latte"]],
  ["gelato", ["Latte", "Uova"]],
  ["semifreddo", ["Latte", "Uova", "Glutine"]],
  ["granita", []],
  ["crema", ["Latte", "Uova"]],
  ["zabaion", ["Uova"]],
  ["biscott", ["Glutine", "Latte", "Uova"]],
  ["pasticcini", ["Glutine", "Latte", "Uova", "Frutta a guscio"]],
  ["pasta di mandorle", ["Frutta a guscio"]],
  ["torrone", ["Frutta a guscio", "Uova"]],
  ["pistacchio", ["Frutta a guscio"]],
  ["nutella", ["Latte", "Soia", "Frutta a guscio"]],
  // Bevande
  ["cappuccino", ["Latte"]],
  ["latte macchiato", ["Latte"]],
  ["birra", ["Glutine", "Solfiti"]],
  ["vino", ["Solfiti"]],
  ["spritz", ["Solfiti"]],
];

// Le diciture che in ispezione non bastano.
//
// Non sono opinioni: un menu che rimanda a voce al personale, o che dice
// genericamente di contenere allergeni, non assolve l'obbligo dell'art. 44 —
// l'informazione dev'essere scritta e riferita al singolo alimento.
const DICITURE = [
  {
    cerca: /chieder\w*\s+(al|allo|informazioni\s+al)\s+personale|rivolgersi\s+al\s+personale|chiedere\s+in\s+cassa/i,
    titolo: "Rimando al personale",
    dettaglio:
      "«Chiedere al personale» non sostituisce l'informazione scritta: l'art. 44 del Reg. UE 1169/2011 " +
      "la vuole per iscritto e riferita a ciascun alimento. Può restare come aggiunta, non da sola.",
  },
  {
    cerca: /può\s+contenere\s+allergeni|puo'\s+contenere\s+allergeni|contiene\s+allergeni\b(?!\s*:)/i,
    titolo: "Dicitura generica",
    dettaglio:
      "«Può contenere allergeni» non dice quale: va indicato l'allergene per nome, piatto per piatto.",
  },
  {
    cerca: /\bqr\b|inquadra\s+il\s+codice/i,
    titolo: "Rimando a un QR code",
    dettaglio:
      "Il QR code da solo non basta: serve comunque il supporto scritto consultabile sul posto. " +
      "Come aggiunta va benissimo.",
  },
];

// Gli allergeni che il nome di un piatto lascia pensare.
//
// Prima il dizionario degli ingredienti, che riconosce le parole esplicite
// ("vongole", "gamberi", "pistacchio"), poi quello dei piatti per i nomi che
// non dicono che cosa c'è dentro. L'ordine non cambia il risultato: si
// sommano.
export function allergeniProbabili(nomePiatto, ingredienti = "") {
  const n = normalizza(nomePiatto);
  if (!n) return [];
  const trovati = new Set(allergeniDaIngredienti(`${nomePiatto} ${ingredienti}`));
  for (const [chiave, allergeni] of PIATTI) {
    if (n.includes(chiave)) allergeni.forEach((a) => trovati.add(a));
  }
  return ALLERGENI.filter((a) => trovati.has(a));
}

// Il referto.
//
// `piatti` sono quelli letti dal menu allegato: { nome, allergeni, ingredienti }.
// `vociApp` sono le voci già presenti nella sezione, per non proporre due
// volte lo stesso piatto. `vetrina` dice se l'attività vende anche sfuso o
// preincartato, perché in quel caso serve pure l'elenco degli ingredienti
// (art. 19 del D.Lgs. 231/2017), che per la sola somministrazione non è
// obbligatorio.
// Gli allergeni di un piatto possono arrivare come elenco o come una riga
// sola separata da virgole: si accettano tutti e due e si tiene solo quello
// che sta nei quattordici dell'Allegato II. Una lettura automatica scrive
// quello che le riesce, e la forma esatta della risposta non e' un motivo per
// perdere il lavoro dell'OSA.
function allergeniPuliti(valore) {
  const pezzi = Array.isArray(valore)
    ? valore
    : String(valore || "").split(/[,;·|]+/);
  const trovati = pezzi.map((x) => normalizza(x));
  return ALLERGENI.filter((a) => trovati.includes(normalizza(a)));
}

export function revisioneMenu({ piatti = [], testo = "", vociApp = [], vetrina = false } = {}) {
  const rilievi = [];
  const nomiInApp = new Set(vociApp.map((v) => normalizza(v.dish || v.nome)));

  const esaminati = piatti
    .filter((p) => normalizza(p?.nome))
    .map((p) => {
      const dichiarati = allergeniPuliti(p.allergeni);
      const probabili = allergeniProbabili(p.nome, p.ingredienti);
      return {
        nome: String(p.nome).trim(),
        ingredienti: p.ingredienti || "",
        dichiarati,
        // Si propone solo quello che manca: ripetere all'OSA un allergene che
        // ha già scritto lo fa smettere di leggere.
        proposti: probabili.filter((a) => !dichiarati.includes(a)),
        giaInApp: nomiInApp.has(normalizza(p.nome)),
      };
    });

  if (esaminati.length === 0) {
    rilievi.push({
      gravita: "grave",
      titolo: "Nessun piatto riconosciuto",
      dettaglio:
        "Dal file allegato non è stato letto nessun piatto. Se è una foto, rifalla " +
        "con il foglio ben illuminato e dritto; se è un PDF di più pagine, allega la pagina del menu.",
    });
    return { piatti: esaminati, rilievi };
  }

  const senzaNiente = esaminati.filter((p) => p.dichiarati.length === 0);
  if (senzaNiente.length) {
    rilievi.push({
      gravita: "grave",
      titolo: senzaNiente.length === 1
        ? "Un piatto senza allergeni indicati"
        : `${senzaNiente.length} piatti senza allergeni indicati`,
      dettaglio:
        "L'art. 44 del Reg. UE 1169/2011 chiede l'informazione sugli allergeni riferita a ciascun " +
        "alimento. Qui accanto trovi una proposta per ciascuno, da confermare sulle etichette dei " +
        "prodotti che usi davvero: " + senzaNiente.map((p) => p.nome).join(", ") + ".",
    });
  }

  // Chi ha dichiarato qualcosa ma non tutto: è il caso più insidioso, perché
  // il menu sembra a posto.
  const incompleti = esaminati.filter((p) => p.dichiarati.length > 0 && p.proposti.length > 0);
  if (incompleti.length) {
    rilievi.push({
      gravita: "medio",
      titolo: incompleti.length === 1
        ? "Un piatto con allergeni forse incompleti"
        : `${incompleti.length} piatti con allergeni forse incompleti`,
      dettaglio:
        "Gli allergeni ci sono, ma il nome del piatto ne fa pensare altri: " +
        incompleti.map((p) => `${p.nome} (manca ${p.proposti.join(", ")}?)`).join("; ") +
        ". Sono ipotesi sulla ricetta comune: se la tua è diversa, va bene così com'è.",
    });
  }

  for (const d of DICITURE) {
    if (d.cerca.test(testo)) {
      rilievi.push({ gravita: "medio", titolo: d.titolo, dettaglio: d.dettaglio });
    }
  }

  if (vetrina) {
    const senzaIngredienti = esaminati.filter((p) => !String(p.ingredienti || "").trim());
    if (senzaIngredienti.length) {
      rilievi.push({
        gravita: "medio",
        titolo: "Manca l'elenco degli ingredienti",
        dettaglio:
          "L'attività vende anche sfuso o preincartato: per quei prodotti l'art. 19 del D.Lgs. 231/2017 " +
          "chiede denominazione ed elenco completo degli ingredienti, con gli allergeni evidenziati, " +
          "non i soli allergeni. Per i piatti serviti al tavolo bastano gli allergeni.",
      });
    }
  }

  // Il riferimento di legge in calce non è obbligatorio, ma è quello che in
  // ispezione fa capire al primo sguardo che il foglio è l'informazione
  // dovuta e non una pubblicità.
  if (!/1169\/2011|231\/2017/.test(testo)) {
    rilievi.push({
      gravita: "lieve",
      titolo: "Nessun riferimento di legge in calce",
      dettaglio:
        "Aggiungere in fondo una riga con l'art. 44 del Reg. UE 1169/2011 (e l'art. 19 del " +
        "D.Lgs. 231/2017 se c'è vendita di sfusi) rende il foglio riconoscibile come informazione " +
        "dovuta. Il menu che stampa l'app ce l'ha già.",
    });
  }

  return { piatti: esaminati, rilievi };
}
