// Moduli di registrazione da stampare — l'allegato cartaceo del manuale.
//
// Sono gli stessi moduli disegnati per VALHALLA e BELLO, qui generati
// dall'app con i dati dell'azienda: intestazione, responsabile, e una scheda
// M01 per ciascun impianto davvero censito invece di un elenco generico.
// I moduli legati a una dotazione (olio, ghiaccio, abbattimento) compaiono
// solo se quella casella è accesa: un modulo che resterà in bianco per
// sempre documenta soltanto che il sistema non è applicato.
//
// Tre regole di impaginazione, dal 23/10/2026:
//
//  1. I codici non sono scritti qui. Arrivano da moduliElenco.js, lo stesso
//     elenco che legge il manuale, e sono assegnati di fila dopo il filtro:
//     se l'azienda non ha l'abbattitore la numerazione non salta.
//  2. Un modulo per pagina. Il salto non è più un paragrafo vuoto in fondo
//     al modulo precedente — era quello a produrre le pagine bianche in
//     Word — ma l'attributo pageBreakBefore sul titolo del modulo che
//     comincia. Le uniche pagine senza pageBreakBefore sono i moduli che
//     seguono un cambio di orientamento, perché il cambio di sezione è già
//     un salto pagina: metterne due di fila è esattamente come si ottiene
//     un foglio bianco.
//  3. Il frontespizio sta da solo, l'elenco dei moduli sulla pagina dopo.

import { par, cella, tabella, riga, pacchettoDocx, scaricaDocx } from "../modules/CorsoFormazione";
import { elencoModuli } from "./moduliElenco";

const VERDE = "2F6F4E";
const SCURO = "1B2A22";
const GRIGIO = "3F5147";
const INTESTA = "E6EFE8";

const titolo = (t, o = {}) =>
  par(t, { bold: true, size: 28, color: SCURO, before: 0, after: 60, bordoSotto: true, pageBreakBefore: !!o.pageBreakBefore });
// Chi è il responsabile si legge in testa alla scheda, accanto al titolo: così
// la firma non occupa il fondo pagina e ogni modulo sta in un foglio solo.
const sottoTitolo = (azienda, responsabile) =>
  par(`${azienda.name || ""}   ·   Responsabile del Piano di Autocontrollo: ${responsabile}   ·   Firma ____________________`,
    { size: 18, color: GRIGIO, after: 100 });
const nota = (t) => par(t, { italic: true, size: 18, color: GRIGIO, before: 120, after: 60 });
const testo = (t, o = {}) => par(t, { size: 20, after: o.after == null ? 120 : o.after, bold: o.bold });

const dataIt = (iso) => {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [a, m, g] = s.split("-");
  return `${g}/${m}/${a}`;
};

// Chiude la sezione corrente con un orientamento: è così che nello stesso
// documento convivono pagine verticali e orizzontali. Attenzione: il
// paragrafo che porta il sectPr fa già cominciare una pagina nuova.
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
//
// revisione: { numero, data } del manuale in vigore. I moduli sono un suo
// allegato, e un allegato senza il numero di revisione del documento che
// accompagna non si sa a quale manuale appartenga.
export function corpoModuli(azienda = {}, impianti = [], piano = [], postazioni = [], revisione = null) {
  const responsabile = azienda.haccp_manager || "____________________";
  const frigo = !!azienda.has_fryer;
  const ghiaccio = !!azienda.has_ice_machine;

  // L'elenco dei moduli previsti, con i codici di fila: è la stessa funzione
  // che usa il manuale, quindi i due documenti non possono divergere.
  const moduli = elencoModuli(azienda);
  const ha = (chiave) => moduli.some((m) => m.chiave === chiave);
  const voce = (chiave) => moduli.find((m) => m.chiave === chiave) || null;
  const cod = (chiave) => (voce(chiave) || {}).codice || "";
  // capo(chiave): titolo del modulo con il suo codice, su pagina nuova.
  // dopoSezione: il modulo segue un cambio di orientamento, che è già un
  // salto pagina — un secondo salto qui darebbe un foglio bianco.
  const capo = (chiave, o = {}) => {
    const m = voce(chiave);
    const t = m ? `${m.codice} — ${m.intestazione}` : "";
    return [titolo(t, { pageBreakBefore: !o.dopoSezione }), sottoTitolo(azienda, responsabile)];
  };

  const b = [];

  // ---------------- frontespizio, da solo sulla sua pagina ----------------
  b.push(par("", { after: 700 }));
  b.push(par("MODULI DI REGISTRAZIONE", { bold: true, size: 48, align: "center", after: 120, color: SCURO }));
  b.push(par("allegati al Manuale di Autocontrollo Alimentare", { italic: true, size: 26, align: "center", after: 500 }));
  b.push(par(azienda.name || "", { bold: true, size: 36, align: "center", after: 40 }));
  b.push(par([azienda.tipologia_attivita, azienda.sede_operativa].filter(Boolean).join(" — "), { size: 24, align: "center", after: 320 }));
  b.push(par("Responsabile del Piano di Autocontrollo: " + responsabile, { size: 22, align: "center", after: 60 }));
  // La revisione è quella del manuale depositato, non un campo da riempire a
  // penna: l'allegato e il documento che accompagna devono portare lo stesso
  // numero, altrimenti non si sa quale dei due è aggiornato.
  if (revisione && revisione.numero) {
    b.push(par(`Allegato al Manuale di Autocontrollo in revisione ${revisione.numero}`
      + (dataIt(revisione.data) ? ` del ${dataIt(revisione.data)}` : ""),
      { size: 22, align: "center", after: 400 }));
  } else {
    b.push(par("Revisione ______ del ____ / ____ / ________", { size: 22, align: "center", after: 400 }));
  }

  // ---------------- elenco dei moduli, pagina seconda ----------------
  b.push(par("ELENCO DEI MODULI DI REGISTRAZIONE", {
    bold: true, size: 28, color: SCURO, after: 60, bordoSotto: true, pageBreakBefore: true,
  }));
  b.push(sottoTitolo(azienda, responsabile));
  b.push(griglia(
    ["Codice", "Modulo", "Frequenza di compilazione"],
    moduli.map((m) => [m.codice, m.titolo, m.frequenza]),
    [1000, 5560, 2800], { size: 19, altezza: 460 },
  ));
  b.push(nota("Allergeni, formazione del personale e controlli analitici non hanno una scheda da compilare: gli allergeni sono riportati nell'elenco che l'operatore tiene esposto o a disposizione del consumatore (art. 44 del Reg. UE 1169/2011), la formazione è documentata dagli attestati degli alimentaristi e i controlli analitici dai rapporti di prova del laboratorio, tutti conservati in azienda."));
  b.push(nota("Ogni modulo è un fac-simile: va riprodotto in copia secondo il numero di schede necessarie (una per impianto, una per mese, una per fornitore). I moduli compilati si conservano in sede, a disposizione dell'Autorità di controllo, per almeno un anno."));

  // ---------------- temperature: una scheda per impianto ----------------
  const MESI = ["G.", "GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
  const COLS_TEMP = [620, 728, 728, 728, 728, 728, 728, 728, 728, 728, 728, 728, 728];
  const elencoImpianti = impianti.length > 0
    ? impianti.map((u) => [u.label, `da ${u.min_temp} °C a ${u.max_temp} °C`])
    : [["______________________________________", "______________________________________"]];
  // una scheda in bianco di riserva, per l'impianto aggiunto dopo la stampa
  elencoImpianti.push(["______________________________________", "______________________________________"]);

  elencoImpianti.forEach(([nome, limiti]) => {
    b.push(...capo("temperature"));
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
    b.push(griglia(MESI, righe, COLS_TEMP, { size: 15, sizeIntest: 15, altezza: 300 }));
    b.push(nota(`Valore fuori limite: annotare l'accaduto sul modulo ${cod("nonconformita")} «Registrazione non conformità» e applicare l'azione correttiva prevista dal manuale.`));
  });

  // ---------------- olio di frittura ----------------
  if (frigo) {
    b.push(...capo("olio"));
    b.push(nota("Si registra ogni sostituzione dell'olio. Il controllo sensoriale quotidiano è buona prassi e non si registra."));
    b.push(griglia(["DATA", "MOTIVO DELLA SOSTITUZIONE", "LITRI", "COMPOSTI POLARI|(se misurati)", "FIRMA"], vuote(20, 5), [1100, 4060, 1200, 1800, 1200], { altezza: 420 }));
    b.push(nota("Motivo: sostituzione programmata · colore scuro · odore acre · fumo alla temperatura di esercizio · schiuma persistente · aumento della viscosità · composti polari prossimi al 25%."));
    b.push(nota("L'olio esausto è raccolto in contenitore chiuso omologato e conferito a ditta autorizzata: conservare i documenti di conferimento."));
  }

  // ---------------- acque potabili ----------------
  b.push(...capo("acque"));
  b.push(nota("Frequenze secondo il libretto d'uso e manutenzione del produttore del dispositivo."));
  b.push(griglia(["DATA", "TIPO DI INTERVENTO", "ESEGUITO DA", "ESITO / NOTE", "FIRMA"], vuote(20, 5), [1100, 3300, 1900, 1900, 1160], { altezza: 420 }));
  b.push(nota("Tipo di intervento: sostituzione del filtro · ricarica del dosatore · sanificazione dell'impianto · flussaggio dopo fermo superiore a due giorni · manutenzione del tecnico · campionamento e analisi."));
  b.push(nota("I rapporti di prova delle analisi, il libretto del dispositivo e la dichiarazione di conformità dei materiali a contatto si conservano allegati al manuale."));

  // ===== da qui pagine orizzontali: pulizie e arrivo merci =====
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
  const FASCE = [
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
    FASCE.forEach((f) => {
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
    VOCI = PULIZIE.map(([v, tipo]) => [v, tipo, ""]);
  }

  const COLS_PUL = [4200, 1700, ...Array(31).fill(261)];
  const larghezzaTotale = COLS_PUL.reduce((a, c) => a + c, 0);
  const capoPulizie = riga(
    cella(par("ATTREZZATURA / AREA", { bold: true, size: 16, after: 20, align: "center" }), COLS_PUL[0], { sfondo: INTESTA }) +
    cella(par("SANIFICANTE USATO", { bold: true, size: 16, after: 20, align: "center" }), COLS_PUL[1], { sfondo: INTESTA }) +
    GIORNI.map((g) => cella(par(g, { bold: true, size: 13, after: 20, align: "center" }), 261, { sfondo: INTESTA })).join(""),
    { intestazione: true },
  );
  const righePulizie = VOCI.map(([v, tipo, prodotto]) => {
    if (tipo === null) {
      // riga di sezione: una sola cella larga quanto la tabella
      return riga(
        `<w:tc><w:tcPr><w:tcW w:w="${larghezzaTotale}" w:type="dxa"/><w:gridSpan w:val="${COLS_PUL.length}"/>` +
        `<w:shd w:val="clear" w:color="auto" w:fill="DCE6DD"/><w:vAlign w:val="center"/></w:tcPr>` +
        par(v, { bold: true, size: 15, after: 10, color: SCURO }) + `</w:tc>`,
        { altezza: 240 },
      );
    }
    return riga(
      cella(par(v, { size: 14, after: 10 }), COLS_PUL[0]) +
      cella(par(prodotto || " ", { size: 13, after: 10 }), COLS_PUL[1]) +
      GIORNI.map(() => cella(par(" ", { size: 14, after: 10 }), 261)).join(""),
      { altezza: 280 },
    );
  });

  b.push(...capo("pulizie", { dopoSezione: true }));
  b.push(testo("Mese ____________________     Anno 20______", { bold: true, after: 90 }));
  b.push(nota(pianoAttivo.length
    ? "Una scheda per mese: barrare la casella del giorno in cui l'intervento è stato eseguito. Le voci e le frequenze sono quelle del programma di pulizia dell'azienda, le stesse che il manuale riporta nella sezione 5.5."
    : "Una scheda per mese: barrare la casella del giorno in cui l'intervento è stato eseguito."));
  b.push(tabella(COLS_PUL, [capoPulizie, ...righePulizie]));
  b.push(nota("Concentrazioni e tempi di contatto: seguire le schede tecniche dei prodotti. Gli interventi non previsti in elenco si annotano sul retro del foglio."));

  b.push(...capo("arrivomerci"));
  b.push(nota("Si compila per le consegne il cui documento non riporta lotto e scadenza. Per le altre è sufficiente conservare bolla o fattura."));
  b.push(griglia(
    ["DATA", "PRODOTTO", "FORNITORE", "LOTTO / QUANTITÀ", "N. BOLLA O FATTURA", "STATO DELLA MERCE|C / NC", "ETICHETTATURA|C / NC", "SCADENZA|C / NC", "FIRMA"],
    vuote(13, 9), [1100, 2700, 2300, 1700, 1700, 1700, 1300, 1200, 1200], { sizeIntest: 15, altezza: 500 },
  ));
  b.push(nota("C = conforme · NC = non conforme. Stato della merce: controllo sensoriale della catena del freddo — refrigerati freddi al tatto, surgelati duri, senza brina abbondante né confezioni ammorbidite."));
  b.push(nota(`In caso di non conformità: contrassegnare la merce «Non toccare — da restituire al fornitore», respingerla e registrare l'evento sul modulo ${cod("nonconformita")}. Il fornitore entra in sorveglianza rinforzata con misura della temperatura a ogni consegna.`));

  // ===== si torna in verticale =====
  b.push(fineSezione(true));

  // ---------------- fornitori ----------------
  b.push(...capo("fornitori", { dopoSezione: true }));
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

  // ---------------- non conformità ----------------
  b.push(...capo("nonconformita"));
  b.push(nota("Si registra ogni scostamento rilevato: merce respinta, temperatura fuori limite, esito analitico non conforme, presenza di infestanti, guasto di un'attrezzatura, reclamo del cliente."));
  b.push(griglia(["DATA", "IDENTIFICAZIONE DELLA NON CONFORMITÀ", "AZIONE CORRETTIVA ADOTTATA", "ESITO", "FIRMA"], vuote(18, 5), [1100, 3260, 3000, 1000, 1000], { altezza: 480 }));
  b.push(nota("Il prodotto non conforme viene isolato e identificato con la dicitura «Non toccare — merce non conforme» fino alla decisione del responsabile."));

  // ---------------- manutenzione ----------------
  b.push(...capo("manutenzione"));
  b.push(nota("Manutenzione ordinaria a cura del personale interno, straordinaria a cura di ditte qualificate. Comprende la taratura dei termometri e la sostituzione dei filtri."));
  b.push(griglia(["DATA", "IDENTIFICAZIONE ATTREZZATURA", "ESEGUITO DA", "ESITO DELL'INTERVENTO", "FIRMA"], vuote(18, 5), [1100, 3000, 1900, 2260, 1100], { altezza: 480 }));
  b.push(nota("Dopo ogni intervento si ripristinano le condizioni igieniche secondo la procedura di pulizia e sanificazione."));

  // ---------------- infestanti: foglio orizzontale, un trimestre ----------
  //
  // Il giro è settimanale e prima il foglio aveva cinque colonne di data:
  // poco più di un mese, e si ristampava di continuo. In orizzontale ci
  // stanno tredici colonne, cioè un trimestre di giri, con le postazioni
  // sulle righe. Il foglio dura e il quadro di tre mesi si legge in una
  // volta, che è anche il modo in cui si vede se una postazione viene
  // saltata sempre.
  b.push(fineSezione(false));
  b.push(...capo("infestanti", { dopoSezione: true }));
  b.push(testo("Trimestre  da ____________________  a ____________________     Anno 20______", { bold: true, after: 90 }));
  b.push(nota("Ispezione settimanale a cura del responsabile del piano di autocontrollo. Una colonna per giro: si scrive la data in testa e l'esito rilevato su ciascuna postazione."));
  const posAttive = (postazioni || []).filter((p) => p.active !== false)
    .sort((a, c) => String(a.code).localeCompare(String(c.code), "it", { numeric: true }));
  const DATE_GIRI = Array.from({ length: 13 }, () => "data|___/___");
  if (posAttive.length) {
    // Una riga per postazione: così il foglio dice anche quali esche NON sono
    // state controllate, che è la domanda che arriva in ispezione.
    const COLS_INF = [760, 3300, ...Array(13).fill(850)];
    b.push(griglia(
      ["N.", "TIPO E COLLOCAZIONE", ...DATE_GIRI],
      posAttive.map((p) => [
        p.code || "",
        [p.kind, p.placement, p.indoor ? "interna" : "esterna"].filter(Boolean).join(" — "),
        ...Array(13).fill(" "),
      ]),
      COLS_INF, { size: 15, sizeIntest: 14, altezza: 380 },
    ));
    b.push(nota("Per ogni postazione: A assente · T tracce · C catture · M esca mancante o danneggiata. Il giro si considera eseguito quando tutte le postazioni risultano controllate."));
  } else {
    // Senza postazioni censite restano le righe libere, una per giro, con le
    // stesse colonne del modulo cartaceo storico.
    b.push(griglia(
      ["DATA", "ALATI", "STRISCIANTI", "RODITORI", "LIVELLO DI PRESENZA", "AMBIENTE INTERESSATO", "FIRMA"],
      vuote(18, 7), [1300, 1300, 1600, 1400, 3000, 4400, 2100], { altezza: 400 },
    ));
  }
  b.push(nota("Livello di presenza: assente · bassa · media · alta. Da «media» in su il responsabile ricorre a ditta specializzata per l'intervento di disinfestazione o derattizzazione, seguito dalla sanificazione dei locali; l'intervento e il suo esito si registrano su questa stessa scheda e il rapporto della ditta si conserva agli atti."));
  b.push(fineSezione(true));

  // ---------------- ritiro del prodotto ----------------
  b.push(...capo("ritiro", { dopoSezione: true }));
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

  // ---------------- macchina del ghiaccio ----------------
  if (ha("ghiaccio")) {
    b.push(...capo("ghiaccio"));
    b.push(nota(`Qui si annotano gli interventi che non hanno una cadenza: pulizia straordinaria, intervento della ditta esterna, sostituzione del filtro dell'acqua, decalcificazione. L'ispezione del contenitore e la pulizia ordinaria, che hanno una frequenza stabilita, si registrano sul programma di sanificazione (${cod("pulizie")}).`));
    b.push(griglia(["DATA", "TIPO DI INTERVENTO", "ESEGUITO DA", "PRODOTTO USATO", "ESITO / NOTE", "FIRMA"], vuote(16, 6), [1000, 2200, 1700, 1700, 1760, 1000], { altezza: 460 }));
    b.push(nota("Il ghiaccio destinato al contatto con gli alimenti è ottenuto da acqua potabile (Reg. CE 852/2004, Allegato II, Capitolo VII)."));
  }

  // ---------------- raffreddamento dei cotti ----------------
  if (ha("raffreddamento")) {
    b.push(...capo("raffreddamento"));
    b.push(nota("Un rigo per ciclo. Si registrano la temperatura e l'ora di inizio e di fine. Qui il tempo è un riferimento e non un limite: gli abbattitori recenti si fermano sulla sonda, e quello che conta è la temperatura raggiunta al cuore del prodotto."));
    b.push(griglia(
      ["DATA", "PRODOTTO", "QUANTITÀ", "INIZIO|ora / °C", "FINE|ora / °C", "DESTINAZIONE", "FIRMA"],
      vuote(16, 7), [1000, 2250, 1000, 1450, 1450, 1360, 850], { altezza: 460 }));
    b.push(nota(`Il prodotto raffreddato si etichetta con la data di produzione e il termine di conservazione, e si conserva in frigorifero fino all'impiego. Un ciclo che non arriva alla temperatura prevista si annota su ${cod("nonconformita")} con l'azione correttiva adottata.`));
  }

  // ---------------- congelamento e scongelamento ----------------
  if (ha("congelamento")) {
    b.push(...capo("congelamento"));
    b.push(nota(`Per le partite congelate allo scopo di conservarle: gelati, semifreddi, tavola calda, preparati di laboratorio. Non è la bonifica del pesce crudo, che è un trattamento sanitario e ha una scheda propria. La riga si chiude quando la partita esce dal congelatore.`));
    b.push(griglia(
      // Intestazioni di parole corte: "DATA DI CONGELAMENTO" in una colonna
      // stretta Word lo spezza a meta' parola, e un'intestazione tagliata e'
      // la prima cosa che si nota su un foglio da firmare.
      ["PRODOTTO E LOTTO", "PRODOTTO IL", "CONGELATO IL", "T. AL CUORE|°C", "USCITO IL", "COME SCONGELATO", "FIRMA"],
      vuote(16, 7), [2200, 1200, 1300, 1000, 1100, 1700, 860], { altezza: 460 }));
    b.push(nota("Ogni partita porta un cartellino con denominazione, lotto e data di congelamento. Lo scongelamento si fa in frigorifero a non più di +4 °C, oppure per cottura diretta se il prodotto è già porzionato: mai a temperatura ambiente. Il prodotto scongelato non si ricongela."));
  }

  // ---------------- bonifica del pesce crudo ----------------
  if (ha("bonifica")) {
    b.push(...capo("bonifica"));
    b.push(nota("Trattamento sanitario obbligatorio per il pesce destinato a essere consumato crudo, marinato o poco cotto (Reg. CE 853/2004, allegato III, sezione VIII). I parametri non si scelgono: −20 °C per 24 ore oppure −35 °C per 15 ore, in tutte le parti del prodotto."));
    b.push(griglia(
      ["DATA", "PRODOTTO E LOTTO", "QUANTITÀ", "TRATTAMENTO|−20 °C/24 h · −35 °C/15 h", "INIZIO|ora", "FINE|ora", "FIRMA"],
      vuote(16, 7), [950, 2150, 1000, 2000, 950, 950, 1360], { altezza: 460 }));
    b.push(nota("Qui, a differenza del raffreddamento dei cotti, la durata È il limite: un trattamento più breve del dovuto non ha ucciso le larve di Anisakis, e il prodotto non può essere servito crudo. Ora di inizio e ora di fine vanno scritte entrambe."));
    b.push(nota("Il pesce bonificato si identifica con il lotto e la data del trattamento fino al momento del servizio. L'informazione al consumatore sul trattamento di bonifica resta esposta in sala secondo quanto previsto dal manuale."));
  }

  // ---------------- cartellini dei preparati ----------------
  //
  // Al posto della vecchia scheda di produzione, che chiedeva di riscrivere
  // a mano il lotto di ogni materia prima a ogni lavorazione. Quella
  // registrazione la tiene l'app nella scheda Preparazioni, e su carta era
  // un carico che il manuale non deve imporre: i lotti delle materie prime
  // restano sulle bolle e sulle fatture, che si conservano. Quello che serve
  // davvero sul contenitore è il nome del prodotto e le date — senza, un
  // preparato anonimo non si può né usare con fiducia né scartare con
  // ragione, e la decisione finisce per dipendere dall'aspetto e dall'odore.
  if (ha("cartellini")) {
    b.push(...capo("cartellini"));
    b.push(nota("Da compilare, ritagliare e attaccare al contenitore di ogni preparato messo in conservazione: semilavorati, creme, ripieni, impasti, prodotti finiti."));
    const cartellino = () => griglia(
      ["DENOMINAZIONE DEL PRODOTTO", "PRODOTTO IL", "DA CONSUMARSI ENTRO"],
      vuote(1, 3), [4360, 2500, 2500], { altezza: 700 });
    for (let i = 0; i < 5; i += 1) {
      b.push(cartellino());
      b.push(par("", { after: 200 }));
    }
    b.push(nota("Chi ha la stampante di etichette non usa questo foglio: l'etichetta si stampa dalla scheda Preparazioni con i dati già scritti, e riporta anche il lotto interno e gli allergeni."));
  }

  // ---------------- cessioni ad altre imprese ----------------
  if (ha("cessioni")) {
    b.push(...capo("cessioni"));
    b.push(nota("Si registra quello che viene ceduto ad altre imprese — bar, ristoranti, negozi, mense, grossisti — come previsto dall'art. 18 del Reg. (CE) n. 178/2002. Le vendite al consumatore finale non si registrano."));
    b.push(griglia(
      ["DATA", "DESTINATARIO", "PRODOTTO", "LOTTO", "QUANTITÀ", "DOCUMENTO", "FIRMA"],
      vuote(16, 7), [1000, 2200, 2000, 1200, 1000, 1200, 760], { altezza: 460 }));
    b.push(nota("Se un lotto viene richiamato, è da questo foglio che si ricava l'elenco delle imprese da avvisare. Il documento di accompagnamento (DDT, fattura) si conserva insieme al registro."));
  }

  return b;
}

export async function scaricaModuliRegistrazione(azienda = {}, impianti = [], piano = [], postazioni = [], revisione = null) {
  const files = pacchettoDocx(corpoModuli(azienda, impianti, piano, postazioni, revisione), { conPiePagina: false });
  const nome = `Moduli_registrazione_${(azienda.name || "azienda").replace(/[^A-Za-z0-9]+/g, "_")}.docx`;
  await scaricaDocx(files, nome);
}
