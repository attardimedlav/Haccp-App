// Allergeni dedotti dal testo degli ingredienti.
//
// Serve quando un elenco ingredienti c'è ma l'elenco allergeni no: succede
// spesso con le banche dati aperte. È un dizionario locale, non costa niente
// e non chiama nessuno.
//
// Quello che esce di qui è una PROPOSTA, non una lettura: va confermata
// guardando la confezione. Un dizionario non capisce il contesto, e in
// etichetta contano le sfumature ("burro di cacao" non è latte).

const VOCI = [
  ["Glutine", ["frumento", "grano ", "grano,", "farina di grano", "semola", "orzo", "segale", "avena", "farro", "kamut", "malto", "glutine", "couscous", "bulgur", "seitan"]],
  ["Latte", ["latte", "burro", "panna", "formagg", "caseina", "caseinat", "siero di latte", "lattosio", "yogurt", "mascarpone", "ricotta", "mozzarella", "parmigiano", "grana", "pecorino", "provolone", "stracchino", "crescenza"]],
  ["Uova", ["uovo", "uova", "tuorlo", "albume", "ovoprodott", "lisozima"]],
  ["Soia", ["soia", "tofu", "edamame"]],
  ["Frutta a guscio", ["nocciol", "mandorl", "noci", "noce del brasile", "pistacch", "anacard", "macadamia", "pecan", "noci di"]],
  ["Pesce", ["pesce", "tonno", "acciug", "alici", "salmone", "merluzzo", "sgombro", "colatura di alici", "bottarga", "surimi"]],
  ["Crostacei", ["crostace", "gamber", "scampi", "astice", "aragosta", "granchio", "mazzancoll"]],
  ["Molluschi", ["mollusch", "cozze", "vongole", "calamar", "seppia", "polpo", "totano", "capesante", "lumache di mare", "ostrich"]],
  ["Sedano", ["sedano"]],
  ["Senape", ["senape", "mostarda"]],
  ["Solfiti", ["solfit", "anidride solforosa", "metabisolfito", "e220", "e221", "e222", "e223", "e224", "e226", "e227", "e228"]],
  ["Arachidi", ["arachid"]],
  ["Sesamo", ["sesamo", "tahina", "tahini"]],
  ["Lupini", ["lupin"]],
];

// Espressioni che contengono la parola ma NON l'allergene: il burro di cacao
// non è latte, il latte di cocco non è latte, il burro di arachidi è un'altra
// cosa ancora. Si tolgono dal testo prima di cercare.
const INGANNI = [
  "burro di cacao", "burro di arachidi", "burro di mandorle", "burro di nocciole",
  "latte di cocco", "latte di mandorla", "latte di mandorle", "latte di soia",
  "latte di riso", "latte di avena", "noce di cocco", "noce moscata", "olio di cocco",
  "acido lattico", "fermenti lattici", "lattitolo",
];

export function allergeniDaIngredienti(testo) {
  let t = String(testo || "").toLowerCase();
  if (!t.trim()) return [];
  INGANNI.forEach((frase) => { t = t.split(frase).join(" ");  });
  const trovati = [];
  for (const [allergene, parole] of VOCI) {
    if (parole.some((p) => t.includes(p))) trovati.push(allergene);
  }
  // "noce di cocco" e "noce moscata" sono già stati tolti: se resta "noce"
  // isolata vale come frutta a guscio, ed è la scelta prudente.
  return trovati;
}
