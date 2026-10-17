// Moduli di registrazione da stampare — l'allegato cartaceo del manuale.
//
// Sono gli stessi moduli disegnati per VALHALLA e BELLO, qui generati
// dall'app con i dati dell'azienda: intestazione, responsabile, e una scheda
// M01 per ciascun impianto davvero censito invece di un elenco generico.
// I moduli legati a una dotazione (olio, ghiaccio, abbattimento) compaiono
// solo se quella casella è accesa: un modulo che resterà in bianco per
// sempre documenta soltanto che il sistema non è applicato.

import { par, cella, tabella, riga, pacchettoDocx, scaricaDocx } from "../modules/CorsoFormazione";

const VERDE = "2F6F4E";
const SCURO = "1B2A22";
const GRIGIO = "3F5147";
const INTESTA = "E6EFE8";

const titolo = (t) => par(t, { bold: true, size: 28, color: SCURO, before: 0, after: 60, bordoSotto: true });
// Chi è il responsabile si legge in testa alla scheda, accanto al titolo: così
// la firma non occupa il fondo pagina e ogni modulo sta in un foglio solo.
const sottoTitolo = (azienda, responsabile) =>
  par(`${azienda.name || ""}   ·   Responsabile del Piano di Autocontrollo: ${responsabile}   ·   Firma ____________________`,
    { size: 18, color: GRIGIO, after: 100 });
const nota = (t) => par(t, { italic: true, size: 18, color: GRIGIO, before: 120, after: 60 });
const testo = (t, o = {}) => par(t, { size: 20, after: o.after == null ? 120 : o.after, bold: o.bold });
const saltoPagina = () => par("", { saltoPagina: true, after: 0 });

// Chiude la sezione corrente con un orientamento: è così che nello stesso
// documento convivono pagine verticali e orizzontali.
function fineSezione(orizzontale) {
  const w = orizzontale ? 16838 : 11906;
  const h = orizzontale ? 11906 : 16838;
  return (
    `<w:p><w:pPr><w:sectPr>` +
    `<w:pgSz w:w="${w}" w:h="${h}"${orizzontale ? ' w:orient="landscape"' : ""}/>` +
    `<w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="850" w:header="708" w:footer="708" w:gutter="0"/>` +
    `</w:sectPr></w:pPr></w:p>`
  );
}

function griglia(intestazione, righe, larghezze, o = {}) {
  const capo = riga(
    intestazione
      .map((t, i) => cella(par(String(t).replace(/\|/g, "\n"), { bold: true, size: o.sizeIntest || 17, after: 20, align: "center" }), larghezze[i], { sfondo: INTESTA }))
      .join(""),
    { intestazione: true },
  );
  const corpo = righe.map((r) =>
    riga(
      r.map((t, i) => cella(par(String(t ?? " ").replace(/\|/g, "\n"), { size: o.size || 17, after: 20 }), larghezze[i])).join(""),
      { altezza: o.altezza || 420 },
    ),
  );
  return tabella(larghezze, [capo, ...corpo]);
}

// Tabella senza intestazione, prima colonna in evidenza: le schede anagrafiche.
function scheda(voci, larghezze) {
  const righe = voci.map(([etichetta, valore]) =>
    riga(
      cella(par(etichetta, { bold: true, size: 19, after: 20 }), larghezze[0], { sfondo: "F1F4F0" }) +
      cella(par(valore || " ", { size: 19, after: 20 }), larghezze[1]),
      { altezza: 460 },
    ),
  );
  return tabella(larghezze, righe);
}

const vuote = (n, c) => Array.from({ length: n }, () => Array.from({ length: c }, () => " "));

// Il piano di pulizia e le postazioni di monitoraggio arrivano da fuori: i
// moduli di carta sono la copia su foglio di quello che l'app sorveglia, non
// un secondo elenco scritto qui dentro. Se l'azienda non li ha ancora
// compilati restano gli elenchi generali, che è meglio di un foglio vuoto.
export function corpoModuli(azienda = {}, impianti = [], piano = [], postazioni = []) {
  const responsabile = azienda.haccp_manager || "____________________";
  const capo = (t) => [titolo(t), sottoTitolo(azienda, responsabile)];
  const frigo = !!azienda.has_fryer;
  const ghiaccio = !!azienda.has_ice_machine;
  const abbattitore = !!azienda.has_blast_chiller;
  const pesceCrudo = !!azienda.serves_raw_fish;
  // La tracciabilita' e' accesa salvo che il consulente la spenga: dove c'e',
  // c'e' anche una lavorazione da registrare.
  const tracciabilita = azienda.active_traceability !== false;
  const cessioni = !!azienda.sells_to_businesses;
  const b = [];

  // ---------------- copertina ----------------
  b.push(par("", { after: 700 }));
  b.push(par("MODULI DI REGISTRAZIONE", { bold: true, size: 48, align: "center", after: 120, color: SCURO }));
  b.push(par("allegati al Manuale di Autocontrollo Alimentare", { italic: true, size: 26, align: "center", after: 500 }));
  b.push(par(azienda.name || "", { bold: true, size: 36, align: "center", after: 40 }));
  b.push(par([azienda.tipologia_attivita, azienda.sede_operativa].filter(Boolean).join(" — "), { size: 24, align: "center", after: 320 }));
  b.push(par("Responsabile del Piano di Autocontrollo: " + responsabile, { size: 22, align: "center", after: 60 }));
  b.push(par("Revisione ______ del ____ / ____ / ________", { size: 22, align: "center", after: 400 }));

  const elenco = [
    ["M01", "Registro temperature — frigoriferi, congelatori, vetrine ed espositori", "Una volta al giorno, alla stessa ora"],
    frigo ? ["M02", "Registro cambi olio di frittura", "A ogni sostituzione dell'olio"] : null,
    ["M03", "Acque potabili — filtri, sanificazione, manutenzione, analisi", "A ogni intervento"],
    ["M04", "Calendario delle pulizie e sanificazioni", "Secondo il programma di sanificazione"],
    ["M05", "Arrivo merci e tracciabilità", "A ogni consegna priva di lotto sul documento"],
    ["M06", "Schede di registrazione fornitori", "All'inserimento e all'aggiornamento"],
    ["M07", "Registrazione non conformità", "A ogni evento"],
    ["M08", "Manutenzione impianti e attrezzature", "A ogni intervento"],
    ["M09", "Monitoraggio insetti e roditori", "Settimanale, a cura del responsabile"],
    ["M10", "Comunicazione di ritiro del prodotto", "All'occorrenza"],
    ghiaccio ? ["M11", "Controllo della macchina del ghiaccio", "Ispezione settimanale, sanificazione periodica"] : null,
    // Tre registri e non uno. "Abbattimento" nel parlare comune indica tre
    // processi diversi - raffreddare in fretta un cotto, congelare per
    // conservare, bonificare il pesce crudo dall'Anisakis - e un foglio solo
    // li confonde proprio dove la confusione costa: la bonifica e' un obbligo
    // di legge con parametri fissi, gli altri due no. I codici sono gli stessi
    // del capitolo 10 del manuale: se il foglio in mano all'OSA non porta lo
    // stesso numero del modulo dichiarato, in ispezione la differenza si vede.
    abbattitore ? ["M12", "Registro del raffreddamento rapido dei prodotti cotti", "A ogni ciclo"] : null,
    abbattitore ? ["M13", "Registro di congelamento e scongelamento", "A ogni partita congelata e a ogni uscita dal congelatore"] : null,
    pesceCrudo ? ["M14", "Registro della bonifica preventiva del pesce crudo", "A ogni trattamento e a ogni scongelamento"] : null,
    tracciabilita ? ["M15", "Scheda di produzione e cartellino del preparato", "A ogni lotto prodotto in laboratorio"] : null,
    cessioni ? ["M16", "Registro delle cessioni ad altre imprese", "A ogni consegna a un'altra impresa"] : null,
  ].filter(Boolean);
  b.push(griglia(["Codice", "Modulo", "Frequenza di compilazione"], elenco, [1000, 5560, 2800], { size: 19, altezza: 460 }));
  b.push(nota("Allergeni, formazione del personale e controlli analitici non hanno una scheda da compilare: gli allergeni sono riportati nell'elenco che l'operatore tiene esposto o a disposizione del consumatore (art. 44 del Reg. UE 1169/2011), la formazione è documentata dagli attestati degli alimentaristi e i controlli analitici dai rapporti di prova del laboratorio, tutti conservati in azienda."));
  b.push(nota("Ogni modulo è un fac-simile: va riprodotto in copia secondo il numero di schede necessarie (una per impianto, una per mese, una per fornitore). I moduli compilati si conservano in sede, a disposizione dell'Autorità di controllo, per almeno un anno."));
  b.push(saltoPagina());

  // ---------------- M01: una scheda per impianto ----------------
  const MESI = ["G.", "GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
  const COLS_M01 = [620, 728, 728, 728, 728, 728, 728, 728, 728, 728, 728, 728, 728];
  const elencoImpianti = impianti.length > 0
    ? impianti.map((u) => [u.label, `da ${u.min_temp} °C a ${u.max_temp} °C`])
    : [["______________________________________", "______________________________________"]];
  // una scheda in bianco di riserva, per l'impianto aggiunto dopo la stampa
  elencoImpianti.push(["______________________________________", "______________________________________"]);

  elencoImpianti.forEach(([nome, limiti], i) => {
    b.push(...capo("M01 — REGISTRO TEMPERATURE"));
    b.push(nota("Rilevazione una volta al giorno, alla stessa ora. Una scheda per ciascun impianto, per anno solare."));
    b.push(scheda([
      ["Impianto da controllare", nome],
      ["Limiti di conformità", limiti],
      ["Ora di rilevamento", "________________"],
      ["Anno", "20______"],
    ], [3000, 6360]));
    b.push(par("", { after: 160 }));
    const righe = [];
    for (let g = 1; g <= 31; g++) righe.push([String(g), ...Array(12).fill(" ")]);
    righe.push(["FIRMA", ...Array(12).fill(" ")]);
    b.push(griglia(MESI, righe, COLS_M01, { size: 15, sizeIntest: 15, altezza: 300 }));
    b.push(nota("Valore fuori limite: annotare l'accaduto sul modulo M07 «Registrazione non conformità» e applicare l'azione correttiva prevista dal manuale."));
      if (i < elencoImpianti.length - 1) b.push(saltoPagina());
  });
  b.push(saltoPagina());

  // ---------------- M02 ----------------
  if (frigo) {
    b.push(...capo("M02 — REGISTRO CAMBI OLIO DI FRITTURA"));
    b.push(nota("Si registra ogni sostituzione dell'olio. Il controllo sensoriale quotidiano è buona prassi e non si registra."));
    b.push(griglia(["DATA", "MOTIVO DELLA SOSTITUZIONE", "LITRI", "COMPOSTI POLARI|(se misurati)", "FIRMA"], vuote(20, 5), [1100, 4060, 1200, 1800, 1200], { altezza: 420 }));
    b.push(nota("Motivo: sostituzione programmata · colore scuro · odore acre · fumo alla temperatura di esercizio · schiuma persistente · aumento della viscosità · composti polari prossimi al 25%."));
    b.push(nota("L'olio esausto è raccolto in contenitore chiuso omologato e conferito a ditta autorizzata: conservare i documenti di conferimento."));
      b.push(saltoPagina());
  }

  // ---------------- M03 ----------------
  b.push(...capo("M03 — ACQUE POTABILI E DISPOSITIVO DI TRATTAMENTO"));
  b.push(nota("Frequenze secondo il libretto d'uso e manutenzione del produttore del dispositivo."));
  b.push(griglia(["DATA", "TIPO DI INTERVENTO", "ESEGUITO DA", "ESITO / NOTE", "FIRMA"], vuote(20, 5), [1100, 3300, 1900, 1900, 1160], { altezza: 420 }));
  b.push(nota("Tipo di intervento: sostituzione del filtro · ricarica del dosatore · sanificazione dell'impianto · flussaggio dopo fermo superiore a due giorni · manutenzione del tecnico · campionamento e analisi."));
  b.push(nota("I rapporti di prova delle analisi, il libretto del dispositivo e la dichiarazione di conformità dei materiali a contatto si conservano allegati al manuale."));

  // ===== da qui pagine orizzontali: M04 e M05 =====
  b.push(fineSezione(false));

  const GIORNI = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const PULIZIE = [
    ["OGNI GIORNO — al termine dell'uso o a ogni cambio lavorazione", null],
    ["Piani di lavoro e di appoggio", 1],
    ["Utensili e attrezzature smontabili", 1],
    ["Attrezzature a contatto con gli alimenti in uso nella giornata", 1],
    ["Lavelli e lavabi (a ogni cambio d'uso)", 1],
    ["OGNI GIORNO — a fine servizio", null],
    ["Superfici e banchi di lavoro", 1],
    ["Vetrine, espositori e banco di somministrazione", 1],
    frigo ? ["Friggitrice: filtrazione dell'olio e pulizia della vasca", 1] : null,
    ["Lavastoviglie: filtri e ugelli", 1],
    ["Pavimenti dei locali di lavoro e della sala", 1],
    ["Contenitori portarifiuti", 1],
    ["Servizi igienici: vaso, lavabo, pavimento", 1],
    ["Tavoli e sedie della sala", 1],
    ["OGNI SETTIMANA", null],
    ["Frigoriferi, congelatori e vetrine: pulizia interna", 1],
    ["Cappe di aspirazione: filtri", 1],
    ["Pareti, porte e barriera antinsetti", 1],
    ["Spogliatoio e armadietti", 1],
    ["Indumenti da lavoro e copricapo", 1],
    ["Lavelli: disincrostazione e pulizia dello scarico", 1],
    ghiaccio ? ["Macchina del ghiaccio: ispezione", 1] : null,
    ["OGNI MESE", null],
    ["Dispensa: scaffalature e pedane", 1],
    ["Soffitti e corpi illuminanti", 1],
    ["Retro delle attrezzature e zone di difficile accesso", 1],
    ghiaccio ? ["Macchina del ghiaccio: sanificazione", 1] : null,
  ].filter(Boolean);

  // Le fasce sono quelle della scheda Sanificazione: a fine turno si fa il
  // giro delle quotidiane, il lunedì quello delle settimanali.
  const FASCE_M04 = [
    { titolo: "OGNI GIORNO", test: (g) => g === 1 },
    { titolo: "OGNI SETTIMANA", test: (g) => g > 1 && g <= 14 },
    { titolo: "OGNI MESE", test: (g) => g > 14 && g <= 90 },
    { titolo: "PIÙ VOLTE L'ANNO", test: (g) => g > 90 },
    { titolo: "QUANDO OCCORRE", test: (g) => !g || g <= 0 },
  ];
  const pianoAttivo = (piano || [])
    .filter((r) => r.active !== false)
    .filter((r) => !r.requires_flag || azienda[r.requires_flag])
    .sort((a, c) => (a.sort_order || 0) - (c.sort_order || 0));

  let VOCI;
  if (pianoAttivo.length) {
    VOCI = [];
    FASCE_M04.forEach((f) => {
      const righe = pianoAttivo.filter((r) => f.test(Number(r.frequency_days)));
      if (!righe.length) return;
      VOCI.push([f.titolo, null, ""]);
      righe.forEach((r) => VOCI.push([
        r.operation + (r.area ? "  (" + r.area + ")" : ""),
        1,
        r.product || "",
      ]));
    });
  } else {
    VOCI = PULIZIE.map(([voce, tipo]) => [voce, tipo, ""]);
  }

  const COLS_M04 = [4200, 1700, ...Array(31).fill(261)];
  const larghezzaTotale = COLS_M04.reduce((a, c) => a + c, 0);
  const capoM04 = riga(
    cella(par("ATTREZZATURA / AREA", { bold: true, size: 16, after: 20, align: "center" }), COLS_M04[0], { sfondo: INTESTA }) +
    cella(par("SANIFICANTE USATO", { bold: true, size: 16, after: 20, align: "center" }), COLS_M04[1], { sfondo: INTESTA }) +
    GIORNI.map((g) => cella(par(g, { bold: true, size: 13, after: 20, align: "center" }), 261, { sfondo: INTESTA })).join(""),
    { intestazione: true },
  );
  const righeM04 = VOCI.map(([voce, tipo, prodotto]) => {
    if (tipo === null) {
      // riga di sezione: una sola cella larga quanto la tabella
      return riga(
        `<w:tc><w:tcPr><w:tcW w:w="${larghezzaTotale}" w:type="dxa"/><w:gridSpan w:val="${COLS_M04.length}"/>` +
        `<w:shd w:val="clear" w:color="auto" w:fill="DCE6DD"/><w:vAlign w:val="center"/></w:tcPr>` +
        par(voce, { bold: true, size: 15, after: 10, color: SCURO }) + `</w:tc>`,
        { altezza: 240 },
      );
    }
    return riga(
      cella(par(voce, { size: 14, after: 10 }), COLS_M04[0]) +
      cella(par(prodotto || " ", { size: 13, after: 10 }), COLS_M04[1]) +
      GIORNI.map(() => cella(par(" ", { size: 14, after: 10 }), 261)).join(""),
      { altezza: 280 },
    );
  });

  b.push(...capo("M04 — CALENDARIO DELLE PULIZIE"));
  b.push(testo("Mese ____________________     Anno 20______", { bold: true, after: 90 }));
  b.push(nota(pianoAttivo.length
    ? "Una scheda per mese: barrare la casella del giorno in cui l'intervento è stato eseguito. Le voci e le frequenze sono quelle del programma di pulizia dell'azienda, le stesse che il manuale riporta nella sezione 5.5."
    : "Una scheda per mese: barrare la casella del giorno in cui l'intervento è stato eseguito."));
  b.push(tabella(COLS_M04, [capoM04, ...righeM04]));
  b.push(nota("Concentrazioni e tempi di contatto: seguire le schede tecniche dei prodotti. Gli interventi non previsti in elenco si annotano sul retro del foglio."));

  b.push(...capo("M05 — ARRIVO MERCI E TRACCIABILITÀ"));
  b.push(nota("Si compila per le consegne il cui documento non riporta lotto e scadenza. Per le altre è sufficiente conservare bolla o fattura."));
  b.push(griglia(
    ["DATA", "PRODOTTO", "FORNITORE", "LOTTO / QUANTITÀ", "N. BOLLA O FATTURA", "STATO DELLA MERCE|C / NC", "ETICHETTATURA|C / NC", "SCADENZA|C / NC", "FIRMA"],
    vuote(13, 9), [1100, 2700, 2300, 1700, 1700, 1700, 1300, 1200, 1200], { sizeIntest: 15, altezza: 500 },
  ));
  b.push(nota("C = conforme · NC = non conforme. Stato della merce: controllo sensoriale della catena del freddo — refrigerati freddi al tatto, surgelati duri, senza brina abbondante né confezioni ammorbidite."));
  b.push(nota("In caso di non conformità: contrassegnare la merce «Non toccare — da restituire al fornitore», respingerla e registrare l'evento sul modulo M07. Il fornitore entra in sorveglianza rinforzata con misura della temperatura a ogni consegna."));

  // ===== si torna in verticale =====
  b.push(fineSezione(true));

  // ---------------- M06 ----------------
  b.push(...capo("M06 — SCHEDE DI REGISTRAZIONE FORNITORI"));
  b.push(nota("Una scheda per fornitore. Si aggiorna all'inserimento di un nuovo fornitore e a ogni variazione."));
  const vociFornitore = [
    ["Denominazione del fornitore", " "],
    ["Sede e ragione sociale", " "],
    ["Prodotto o servizio fornito", " "],
    ["Dichiarazione di applicazione dell'autocontrollo (data)", " "],
    ["Dichiarazione di conformità MOCA (se pertinente)", " "],
    ["Modalità di consegna", " "],
    ["Verifiche eseguite prima dell'introduzione del prodotto", " "],
    ["Sorveglianza rinforzata sulla catena del freddo (data e motivo)", " "],
  ];
  for (let i = 0; i < 2; i++) {
    b.push(scheda(vociFornitore, [3600, 5760]));
    b.push(par("", { after: 200 }));
  }
  b.push(saltoPagina());

  // ---------------- M07 ----------------
  b.push(...capo("M07 — REGISTRAZIONE NON CONFORMITÀ"));
  b.push(nota("Si registra ogni scostamento rilevato: merce respinta, temperatura fuori limite, esito analitico non conforme, presenza di infestanti, guasto di un'attrezzatura, reclamo del cliente."));
  b.push(griglia(["DATA", "IDENTIFICAZIONE DELLA NON CONFORMITÀ", "AZIONE CORRETTIVA ADOTTATA", "ESITO", "FIRMA"], vuote(18, 5), [1100, 3260, 3000, 1000, 1000], { altezza: 480 }));
  b.push(nota("Il prodotto non conforme viene isolato e identificato con la dicitura «Non toccare — merce non conforme» fino alla decisione del responsabile."));
  b.push(saltoPagina());

  // ---------------- M08 ----------------
  b.push(...capo("M08 — MANUTENZIONE IMPIANTI E ATTREZZATURE"));
  b.push(nota("Manutenzione ordinaria a cura del personale interno, straordinaria a cura di ditte qualificate. Comprende la taratura dei termometri e la sostituzione dei filtri."));
  b.push(griglia(["DATA", "IDENTIFICAZIONE ATTREZZATURA", "ESEGUITO DA", "ESITO DELL'INTERVENTO", "FIRMA"], vuote(18, 5), [1100, 3000, 1900, 2260, 1100], { altezza: 480 }));
  b.push(nota("Dopo ogni intervento si ripristinano le condizioni igieniche secondo la procedura di pulizia e sanificazione."));
  b.push(saltoPagina());

  // ---------------- M09 ----------------
  b.push(...capo("M09 — MONITORAGGIO INSETTI E RODITORI"));
  b.push(nota("Ispezione settimanale a cura del responsabile del piano di autocontrollo. Barrare ciò che si rileva e indicare il livello di presenza."));
  const posAttive = (postazioni || []).filter((p) => p.active !== false)
    .sort((a, c) => String(a.code).localeCompare(String(c.code), "it", { numeric: true }));
  if (posAttive.length) {
    // Una riga per postazione: così il foglio dice anche quali esche NON sono
    // state controllate, che è la domanda che arriva in ispezione.
    const COLS_M09 = [900, 2860, 1120, 1120, 1120, 1120, 1120];
    b.push(griglia(
      ["N.", "TIPO E COLLOCAZIONE", "data ___/___", "data ___/___", "data ___/___", "data ___/___", "data ___/___"],
      posAttive.map((p) => [
        p.code || "",
        [p.kind, p.placement, p.indoor ? "interna" : "esterna"].filter(Boolean).join(" — "),
        " ", " ", " ", " ", " ",
      ]),
      COLS_M09, { altezza: 400 }
    ));
    b.push(nota("Per ogni postazione: A assente · T tracce · C catture · M esca mancante o danneggiata. Il giro si considera eseguito quando tutte le postazioni risultano controllate."));
  } else {
    b.push(griglia(["DATA", "ALATI", "STRISCIANTI", "RODITORI", "LIVELLO DI PRESENZA", "AMBIENTE INTERESSATO", "FIRMA"], vuote(18, 7), [1100, 900, 1200, 1000, 2000, 2160, 1000], { altezza: 460 }));
  }
  b.push(nota("Livello di presenza: assente · bassa · media · alta. Da «media» in su il responsabile ricorre a ditta specializzata per l'intervento di disinfestazione o derattizzazione, seguito dalla sanificazione dei locali; l'intervento e il suo esito si registrano su questa stessa scheda e il rapporto della ditta si conserva agli atti."));
  b.push(saltoPagina());

  // ---------------- M10 ----------------
  b.push(...capo("M10 — COMUNICAZIONE DI RITIRO DEL PRODOTTO"));
  b.push(nota("Da compilare e trasmettere all'Autorità sanitaria competente, ai sensi dell'art. 19 del Reg. (CE) n. 178/2002."));
  b.push(scheda([
    ["Data della comunicazione", " "],
    ["Autorità sanitaria destinataria", " "],
    ["Denominazione del prodotto", " "],
    ["Fornitore / produttore", " "],
    ["Lotto e termine di conservazione", " "],
    ["Quantità interessata", " "],
    ["Quantità ancora giacente in azienda", " "],
    ["Motivo del ritiro", " "],
    ["Origine della segnalazione", " "],
    ["Provvedimenti adottati", " "],
  ], [3600, 5760]));
  b.push(nota("La merce interessata viene isolata, identificata con la dicitura «Merce non conforme — non utilizzare» e tenuta a disposizione dell'Autorità di controllo, che ne stabilisce la destinazione."));
  b.push(par("Luogo e data  ______________________________________", { size: 20, before: 260, after: 80 }));

  // ---------------- M11 e M12, solo se servono ----------------
  if (ghiaccio) {
    b.push(saltoPagina());
    b.push(...capo("M11 — CONTROLLO DELLA MACCHINA DEL GHIACCIO"));
    b.push(nota("Ispezione visiva settimanale; sanificazione con la periodicità stabilita dal manuale e secondo il libretto del costruttore."));
    b.push(griglia(["DATA", "TIPO DI INTERVENTO|ispezione / sanificazione", "PRODOTTO USATO", "ESITO / NOTE", "FIRMA"], vuote(18, 5), [1100, 2600, 2200, 2360, 1100], { altezza: 460 }));
    b.push(nota("Il ghiaccio destinato al contatto con gli alimenti è ottenuto da acqua potabile (Reg. CE 852/2004, Allegato II, Capitolo VII)."));
    }
  // ---------------- M12: il raffreddamento dei cotti ----------------
  if (abbattitore) {
    b.push(saltoPagina());
    b.push(...capo("M12 — REGISTRO DEL RAFFREDDAMENTO RAPIDO DEI PRODOTTI COTTI"));
    b.push(nota("Un rigo per ciclo. Si registrano la temperatura e l'ora di inizio e di fine. Qui il tempo è un riferimento e non un limite: gli abbattitori recenti si fermano sulla sonda, e quello che conta è la temperatura raggiunta al cuore del prodotto."));
    b.push(griglia(
      ["DATA", "PRODOTTO", "QUANTITÀ", "INIZIO|ora / °C", "FINE|ora / °C", "DESTINAZIONE", "FIRMA"],
      vuote(16, 7), [1000, 2250, 1000, 1450, 1450, 1360, 850], { altezza: 460 }));
    b.push(nota("Il prodotto raffreddato si etichetta con la data di produzione e il termine di conservazione, e si conserva in frigorifero fino all'impiego. Un ciclo che non arriva alla temperatura prevista si annota su M07 con l'azione correttiva adottata."));

    // ---------------- M13: il congelamento per conservare ----------------
    b.push(saltoPagina());
    b.push(...capo("M13 — REGISTRO DI CONGELAMENTO E SCONGELAMENTO"));
    b.push(nota("Per le partite congelate allo scopo di conservarle: gelati, semifreddi, tavola calda, preparati di laboratorio. Non è la bonifica del pesce crudo, che è un trattamento sanitario e ha la scheda M14. La riga si chiude quando la partita esce dal congelatore."));
    b.push(griglia(
      // Intestazioni di parole corte: "DATA DI CONGELAMENTO" in una colonna
      // stretta Word lo spezza a meta' parola, e un'intestazione tagliata e'
      // la prima cosa che si nota su un foglio da firmare.
      ["PRODOTTO E LOTTO", "PRODOTTO IL", "CONGELATO IL", "T. AL CUORE|°C", "USCITO IL", "COME SCONGELATO", "FIRMA"],
      vuote(16, 7), [2200, 1200, 1300, 1000, 1100, 1700, 860], { altezza: 460 }));
    b.push(nota("Ogni partita porta un cartellino con denominazione, lotto e data di congelamento. Lo scongelamento si fa in frigorifero a non più di +4 °C, oppure per cottura diretta se il prodotto è già porzionato: mai a temperatura ambiente. Il prodotto scongelato non si ricongela."));
  }

  // ---------------- M14: la bonifica del pesce crudo ----------------
  if (pesceCrudo) {
    b.push(saltoPagina());
    b.push(...capo("M14 — REGISTRO DELLA BONIFICA PREVENTIVA DEL PESCE CRUDO"));
    b.push(nota("Trattamento sanitario obbligatorio per il pesce destinato a essere consumato crudo, marinato o poco cotto (Reg. CE 853/2004, allegato III, sezione VIII). I parametri non si scelgono: −20 °C per 24 ore oppure −35 °C per 15 ore, in tutte le parti del prodotto."));
    b.push(griglia(
      ["DATA", "PRODOTTO E LOTTO", "QUANTITÀ", "TRATTAMENTO|−20 °C/24 h · −35 °C/15 h", "INIZIO|ora", "FINE|ora", "FIRMA"],
      vuote(16, 7), [950, 2150, 1000, 2000, 950, 950, 1360], { altezza: 460 }));
    b.push(nota("Qui, a differenza del raffreddamento dei cotti, la durata È il limite: un trattamento più breve del dovuto non ha ucciso le larve di Anisakis, e il prodotto non può essere servito crudo. Ora di inizio e ora di fine vanno scritte entrambe."));
    b.push(nota("Il pesce bonificato si identifica con il lotto e la data del trattamento fino al momento del servizio. L'informazione al consumatore sul trattamento di bonifica resta esposta in sala secondo quanto previsto dal manuale."));
  }

  // ---------------- M15: la scheda di produzione ----------------
  //
  // E' il foglio che corrisponde alla scheda Preparazioni dell'app, ed era
  // l'ultimo pezzo che in cartaceo non esisteva: l'OSA che lavora su carta
  // registrava gli arrivi e le temperature ma non quello che produceva, cioe'
  // proprio l'anello che tiene insieme la catena — da un prodotto finito ai
  // lotti delle materie prime con cui e' stato fatto.
  //
  // Una scheda per lotto, non una riga: gli ingredienti sono piu' d'uno e la
  // riga di una tabella non li contiene. Il riquadro in fondo e' il cartellino
  // da ritagliare e attaccare al prodotto, per chi non ha la stampante di
  // etichette.
  if (tracciabilita) {
    b.push(saltoPagina());
    b.push(...capo("M15 — SCHEDA DI PRODUZIONE E CARTELLINO DEL PREPARATO"));
    b.push(nota("Una scheda per ogni lotto prodotto in laboratorio: semilavorati, creme, ripieni, impasti, prodotti finiti. Il numero di lotto si scrive una volta qui e si ripete sul cartellino del prodotto."));
    b.push(scheda([
      ["Denominazione del preparato", " "],
      ["Numero di lotto", " "],
      ["Data e ora di produzione", " "],
      ["Quantità prodotta (kg / pezzi)", " "],
      ["Operatore", " "],
    ], [3600, 5760]));
    b.push(par("", { after: 120 }));
    b.push(nota("Materie prime impiegate: per ognuna il lotto scritto sulla confezione o sul documento di consegna. È questo elenco che, partendo da un prodotto finito, permette di risalire ai fornitori."));
    b.push(griglia(["INGREDIENTE", "FORNITORE", "LOTTO", "SCADENZA"], vuote(8, 4), [3000, 2600, 2000, 1760], { altezza: 420 }));
    b.push(par("", { after: 120 }));
    b.push(nota("Semilavorati già registrati che entrano in questa preparazione: si indica il loro numero di lotto, non gli ingredienti, che sono già scritti nella loro scheda."));
    b.push(griglia(["SEMILAVORATO", "LOTTO", "DATA DI PRODUZIONE"], vuote(3, 3), [4400, 2400, 2560], { altezza: 420 }));
    b.push(par("", { after: 140 }));
    b.push(scheda([
      ["Allergeni presenti", " "],
      ["Può contenere tracce di", " "],
      ["Conservazione (frigo / freezer / ambiente)", " "],
      ["Da consumarsi entro", " "],
    ], [3600, 5760]));
    b.push(nota("Gli allergeni si leggono dalle etichette delle materie prime impiegate e si riportano qui: sono gli stessi che vanno dichiarati al consumatore (Reg. UE 1169/2011)."));

    b.push(saltoPagina());
    b.push(...capo("M15/a — CARTELLINI DA RITAGLIARE"));
    b.push(nota("Da compilare e attaccare al contenitore. Un preparato senza cartellino non si può né usare con fiducia né scartare con ragione, e la decisione finisce per dipendere dall'aspetto e dall'odore."));
    const cartellino = () => griglia(
      ["DENOMINAZIONE", "LOTTO", "PRODOTTO IL", "DA CONSUMARSI ENTRO", "ALLERGENI"],
      vuote(1, 5), [2600, 1500, 1500, 1900, 1860], { altezza: 620 });
    for (let i = 0; i < 4; i += 1) {
      b.push(cartellino());
      b.push(par("", { after: 200 }));
    }
    b.push(nota("Chi ha la stampante di etichette non usa questo foglio: l'etichetta si stampa dalla scheda Preparazioni con i dati già scritti."));
  }

  // ---------------- M16: il passo avanti ----------------
  if (cessioni) {
    b.push(saltoPagina());
    b.push(...capo("M16 — REGISTRO DELLE CESSIONI AD ALTRE IMPRESE"));
    b.push(nota("Si registra quello che viene ceduto ad altre imprese — bar, ristoranti, negozi, mense, grossisti — come previsto dall'art. 18 del Reg. (CE) n. 178/2002. Le vendite al consumatore finale non si registrano."));
    b.push(griglia(
      ["DATA", "DESTINATARIO", "PRODOTTO", "LOTTO", "QUANTITÀ", "DOCUMENTO", "FIRMA"],
      vuote(16, 7), [1000, 2200, 2000, 1200, 1000, 1200, 760], { altezza: 460 }));
    b.push(nota("Se un lotto viene richiamato, è da questo foglio che si ricava l'elenco delle imprese da avvisare. Il documento di accompagnamento (DDT, fattura) si conserva insieme al registro."));
  }

  return b;
}

export async function scaricaModuliRegistrazione(azienda = {}, impianti = [], piano = [], postazioni = []) {
  const files = pacchettoDocx(corpoModuli(azienda, impianti, piano, postazioni), { conPiePagina: false });
  const nome = `Moduli_registrazione_${(azienda.name || "azienda").replace(/[^A-Za-z0-9]+/g, "_")}.docx`;
  await scaricaDocx(files, nome);
}
