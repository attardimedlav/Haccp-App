// L'elenco dei moduli di registrazione, in un posto solo.
//
// Lo leggono sia il manuale — il capitolo con la tabella dei moduli e i
// rimandi dentro il testo — sia l'allegato cartaceo che li stampa. Prima
// erano due elenchi paralleli con i codici scritti a mano, e bastava che un
// modulo opzionale fosse spento perche' la numerazione saltasse: nel manuale
// di un bar senza macchina del ghiaccio e senza abbattitore, dopo M10 veniva
// M15. Un numero che salta non e' un dettaglio tipografico: il foglio in mano
// all'operatore deve portare lo stesso codice che il manuale dichiara,
// altrimenti in ispezione la differenza si vede e sembra un modulo mancante.
//
// Qui i codici si assegnano di fila DOPO il filtro, cosi' sono sempre
// consecutivi e sempre gli stessi nei due documenti. Nessun codice e' fisso:
// per citare un modulo nel testo si usa codiceModulo(azienda, chiave), mai
// "M07" scritto a mano.
//
// La scheda di produzione non e' in elenco: la registrazione di tutte le
// materie prime a ogni lavorazione e' un carico che il manuale non deve
// imporre. Resta il cartellino del preparato, con denominazione e date, che
// e' quello che serve davvero per non usare un contenitore anonimo.

const MODULI = [
  {
    chiave: "temperature",
    titolo: "Registro temperature — frigoriferi, congelatori, vetrine ed espositori",
    intestazione: "REGISTRO TEMPERATURE",
    frequenza: "Una volta al giorno, alla stessa ora",
    flag: null,
  },
  {
    chiave: "olio",
    titolo: "Registro cambi olio di frittura",
    intestazione: "REGISTRO CAMBI OLIO DI FRITTURA",
    frequenza: "A ogni sostituzione dell'olio",
    flag: "has_fryer",
  },
  {
    chiave: "acque",
    titolo: "Acque potabili — filtri, sanificazione, manutenzione, analisi",
    intestazione: "ACQUE POTABILI E DISPOSITIVO DI TRATTAMENTO",
    frequenza: "A ogni intervento",
    flag: null,
  },
  {
    chiave: "pulizie",
    titolo: "Calendario delle pulizie e sanificazioni",
    intestazione: "CALENDARIO DELLE PULIZIE",
    frequenza: "Secondo il programma di sanificazione",
    flag: null,
  },
  {
    chiave: "arrivomerci",
    titolo: "Arrivo merci e tracciabilità",
    intestazione: "ARRIVO MERCI E TRACCIABILITÀ",
    frequenza: "A ogni consegna priva di lotto sul documento",
    flag: null,
  },
  {
    chiave: "fornitori",
    titolo: "Schede di registrazione fornitori",
    intestazione: "SCHEDE DI REGISTRAZIONE FORNITORI",
    frequenza: "All'inserimento e all'aggiornamento",
    flag: null,
  },
  {
    chiave: "nonconformita",
    titolo: "Registrazione non conformità",
    intestazione: "REGISTRAZIONE NON CONFORMITÀ",
    frequenza: "A ogni evento",
    flag: null,
  },
  {
    chiave: "manutenzione",
    titolo: "Manutenzione impianti e attrezzature",
    intestazione: "MANUTENZIONE IMPIANTI E ATTREZZATURE",
    frequenza: "A ogni intervento",
    flag: null,
  },
  {
    chiave: "infestanti",
    titolo: "Monitoraggio insetti e roditori",
    intestazione: "MONITORAGGIO INSETTI E RODITORI",
    frequenza: "Settimanale, a cura del responsabile",
    flag: null,
  },
  {
    chiave: "ritiro",
    titolo: "Comunicazione di ritiro del prodotto",
    intestazione: "COMUNICAZIONE DI RITIRO DEL PRODOTTO",
    frequenza: "All'occorrenza",
    flag: null,
  },
  {
    chiave: "ghiaccio",
    titolo: "Macchina del ghiaccio — interventi straordinari e della ditta esterna",
    intestazione: "MACCHINA DEL GHIACCIO: INTERVENTI STRAORDINARI E DITTA ESTERNA",
    frequenza: "All'occorrenza",
    flag: "has_ice_machine",
  },
  // Tre registri e non uno. "Abbattimento" nel parlare comune indica tre
  // processi diversi — raffreddare in fretta un cotto, congelare per
  // conservare, bonificare il pesce crudo dall'Anisakis — e un foglio solo li
  // confonde proprio dove la confusione costa: la bonifica e' un obbligo di
  // legge con parametri fissi, gli altri due no.
  {
    chiave: "raffreddamento",
    titolo: "Registro del raffreddamento rapido dei prodotti cotti",
    intestazione: "REGISTRO DEL RAFFREDDAMENTO RAPIDO DEI PRODOTTI COTTI",
    frequenza: "A ogni ciclo",
    flag: "has_blast_chiller",
  },
  {
    chiave: "congelamento",
    titolo: "Registro di congelamento e scongelamento",
    intestazione: "REGISTRO DI CONGELAMENTO E SCONGELAMENTO",
    frequenza: "A ogni partita congelata e a ogni uscita dal congelatore",
    flag: "has_blast_chiller",
  },
  {
    chiave: "bonifica",
    titolo: "Registro della bonifica preventiva del pesce crudo",
    intestazione: "REGISTRO DELLA BONIFICA PREVENTIVA DEL PESCE CRUDO",
    frequenza: "A ogni trattamento e a ogni scongelamento",
    flag: "serves_raw_fish",
  },
  {
    chiave: "cartellini",
    titolo: "Cartellini dei preparati da ritagliare",
    intestazione: "CARTELLINI DEI PREPARATI DA RITAGLIARE",
    frequenza: "A ogni preparato messo in conservazione",
    flag: "__tracciabilita",
  },
  {
    chiave: "cessioni",
    titolo: "Registro delle cessioni ad altre imprese",
    intestazione: "REGISTRO DELLE CESSIONI AD ALTRE IMPRESE",
    frequenza: "A ogni consegna a un'altra impresa",
    flag: "sells_to_businesses",
  },
];

// I moduli previsti per questa azienda, con il codice assegnato di fila.
export function elencoModuli(azienda = {}) {
  return MODULI
    .filter(function (m) {
      // La tracciabilita' e' accesa salvo che il consulente la spenga.
      if (m.flag === "__tracciabilita") return azienda.active_traceability !== false;
      return !m.flag || !!azienda[m.flag];
    })
    .map(function (m, i) {
      return Object.assign({}, m, { codice: "M" + String(i + 1).padStart(2, "0") });
    });
}

// Il codice di un modulo, per citarlo nel testo. Se quel modulo non e'
// previsto per l'azienda torna stringa vuota: chi lo cita deve prima
// controllare con haModulo, perche' un rimando a un modulo che non esiste e'
// peggio di un rimando assente.
export function codiceModulo(azienda, chiave) {
  const m = elencoModuli(azienda).find(function (x) { return x.chiave === chiave; });
  return m ? m.codice : "";
}

export function haModulo(azienda, chiave) {
  return elencoModuli(azienda).some(function (x) { return x.chiave === chiave; });
}
