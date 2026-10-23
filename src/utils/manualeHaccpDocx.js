// Generatore del manuale di autocontrollo.
//
// Funzione pura: prende un dossier (azienda, registrazione sanitaria, impianti,
// catalogo dei cicli e delle procedure) e restituisce il corpo
// WordprocessingML del manuale. Nessuna chiamata al database qui dentro: così
// si può provare fuori dall'app, e soprattutto si vede a colpo d'occhio che
// cosa finisce nel documento e da dove viene.
//
// La regola che governa tutto: il manuale non dichiara nulla che in azienda
// non esista. Ogni ciclo, riga di analisi e procedura porta un requires_flag,
// e se quella casella di Configurazione è spenta quel pezzo non entra.

import { par, cella, tabella, riga, parImmagine, RID_IMMAGINE } from "../modules/CorsoFormazione";
import { TITOLO_PROCEDURA, testoProceduraRegistrazioni } from "./proceduraRegistrazioni";
import { etichettaFrequenza } from "./pianoPulizie";
import { elencoGiorni } from "./chiusure";
// L'elenco dei moduli di registrazione sta in un posto solo: lo stesso che
// stampa l'allegato cartaceo. Cosi' i codici citati qui e quelli scritti sul
// foglio in mano all'operatore non possono divergere.
import { elencoModuli, codiceModulo } from "./moduliElenco";

const VERDE = "1B2A22";
const VERDE_CHIARO = "2F6F4E";
const W = 9360;

const data = (iso) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  return d ? `${d}/${m}/${y}` : String(iso);
};

// --- mattoni di comodo --------------------------------------------------

const h1 = (t) => par(t, { stile: "Heading1", bold: true, size: 28, color: VERDE, before: 340, after: 140, bordoSotto: true });
const h2 = (t) => par(t, { stile: "Heading2", bold: true, size: 26, color: VERDE_CHIARO, before: 240, after: 110 });
const h3 = (t) => par(t, { bold: true, size: 23, color: VERDE_CHIARO, before: 180, after: 90 });
const p = (t, o = {}) => par(t, { size: 22, align: "both", after: 120, interlinea: 264, ...o });
const punto = (t) => par("•  " + t, { size: 22, align: "both", after: 80, interlinea: 264 });
// La periodicità dei controlli analitici si scrive in mesi, ma in un manuale
// si legge a parole: è così che la trova scritta chi la confronta con i
// referti di laboratorio.
const periodicita = (mesi) => {
  const n = Number(mesi) || 0;
  if (n === 1) return "Mensile";
  if (n === 3) return "Trimestrale";
  if (n === 6) return "Semestrale";
  if (n === 12) return "Annuale";
  if (n === 24) return "Biennale";
  if (n === 36) return "Triennale";
  if (n <= 0) return "Secondo necessità";
  return "Ogni " + n + " mesi";
};

const saltoPagina = () => par("", { saltoPagina: true, after: 0 });

// tabella a due colonne, la prima in grassetto su fondo chiaro
function scheda(righe, larghezze = [3000, 6360]) {
  return tabella(larghezze, righe.map(([k, v]) =>
    riga(
      cella(par(String(k).replace(/\|/g, "\n"), { bold: true, size: 20, after: 40 }), larghezze[0], { sfondo: "F1F4F0" }) +
      // un valore puo' arrivare gia' scritto in XML - e' il caso della firma
      // del responsabile, che e' un'immagine e non una stringa
      cella(v && v.xml ? v.xml : par(String(v ?? "").replace(/\|/g, "\n"), { size: 20, after: 40 }), larghezze[1])
    )
  ));
}

// tabella con intestazione
function griglia(intestazione, righe, larghezze, o = {}) {
  const capo = riga(
    intestazione.map((t, i) => cella(par(t, { bold: true, size: 19, after: 30 }), larghezze[i], { sfondo: "E6EFE8" })).join(""),
    { intestazione: true }
  );
  // altezza: serve alle tabelle da firmare a penna, che altrimenti escono
  // con righe alte due millimetri e sono inutilizzabili.
  const corpo = righe.map((r) =>
    riga(r.map((t, i) => cella(par(String(t ?? "").replace(/\|/g, "\n"), { size: 19, after: 30 }), larghezze[i])).join(""),
      o.altezza ? { altezza: o.altezza } : {})
  );
  return tabella(larghezze, [capo, ...corpo]);
}

// --- diagrammi di flusso ------------------------------------------------
//
// Il diagramma non e' decorazione: e' la pagina che un ispettore guarda per
// prima e deve leggersi in un colpo d'occhio. Le fasi scendono numerate
// lungo una linea continua - la colonna dei numeri, che non e' un disegno
// ma una striscia di celle dello stesso colore - invece di essere separate
// da frecce scritte con un carattere, che a seconda del font installato in
// Word diventano un quadratino vuoto. Ogni ciclo ha la sua pagina.

// Quattro colonne: il numero, il riquadro della fase, l'etichetta CP/CCP e
// la colonna laterale, dove finisce il ramo NO di una decisione. La somma
// resta quella di prima, cosi' il diagramma occupa la stessa larghezza.
// Due misure, non una. Nei cicli senza decisioni la colonna laterale non
// ha niente da contenere, e lasciarla li' spingeva tutto il diagramma a
// sinistra con mezza pagina bianca a destra: il foglio che si stacca e si
// affigge in laboratorio sembrava un ritaglio. Quando non serve, lo spazio
// torna al riquadro della fase, che diventa largo e leggibile da lontano.
const DIA = { num: 620, box: 5240, tag: 1000, lato: 2500 };
const DIA_SEMPLICE = { num: 620, box: 7740, tag: 1000, lato: 0 };
const GIALLO = "FBF4DA";      // il rombo della decisione
const GIALLO_BORDO = "C9A227";
const GRIGIO = "F2F2F0";      // l'azione correttiva, fuori dal flusso
const GRIGIO_BORDO = "C8CCC6";

function bordiCella(colore, spessore) {
  return ["top", "left", "bottom", "right"]
    .map((lato) => colore
      ? `<w:${lato} w:val="single" w:sz="${spessore || 6}" w:space="0" w:color="${colore}"/>`
      : `<w:${lato} w:val="none" w:sz="0" w:space="0" w:color="auto"/>`)
    .join("");
}

// Una cella del diagramma. L'ordine dentro <w:tcPr> e' fissato dallo schema
// (tcW, tcBorders, shd, tcMar, vAlign): fuori posto Word lo ignora in
// silenzio, come e' gia' successo con il salto pagina.
function cellaDia(contenuto, larghezza, o = {}) {
  const pad = o.pad == null ? 100 : o.pad;
  const lat = o.padLat == null ? 150 : o.padLat;
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${larghezza}" w:type="dxa"/>` +
    (o.span ? `<w:gridSpan w:val="${o.span}"/>` : "") +
    `<w:tcBorders>${bordiCella(o.bordo, o.spessore)}</w:tcBorders>` +
    (o.sfondo ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.sfondo}"/>` : "") +
    `<w:tcMar><w:top w:w="${pad}" w:type="dxa"/><w:left w:w="${lat}" w:type="dxa"/>` +
    `<w:bottom w:w="${pad}" w:type="dxa"/><w:right w:w="${lat}" w:type="dxa"/></w:tcMar>` +
    `<w:vAlign w:val="center"/></w:tcPr>` +
    (contenuto || par("", { size: 2, after: 0 })) +
    `</w:tc>`
  );
}

// cantSplit: un riquadro non si spezza fra due pagine. Deve precedere
// trHeight, altrimenti vale solo il secondo.
function rigaDia(celle, o = {}) {
  // hRule exact taglia il contenuto che non ci sta: va bene per il tratto
  // di collegamento, che e' vuoto, non per un riquadro con dentro del testo.
  // Per quelli si usa atLeast: il riquadro non scende sotto quell'altezza ma
  // cresce se la fase ha una riga in piu'.
  const pr = `<w:trPr><w:cantSplit/>` +
    (o.altezza ? `<w:trHeight w:val="${o.altezza}" w:hRule="${o.minima ? "atLeast" : "exact"}"/>` : "") +
    `</w:trPr>`;
  return `<w:tr>${pr}${celle}</w:tr>`;
}

function tabellaDia(righe, L) {
  const senza = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((b) => `<w:${b} w:val="none" w:sz="0" w:space="0" w:color="auto"/>`).join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${L.reduce((a, b) => a + b, 0)}" w:type="dxa"/>` +
    `<w:jc w:val="center"/><w:tblBorders>${senza}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid>${L.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    righe.join("") + `</w:tbl>`
  );
}

// La legenda si stampa una volta sola all'inizio della sezione: ripeterla
// sotto ogni diagramma era rumore su ogni pagina.
export function legendaFlusso() {
  return par("CP  punto di controllo        CCP  punto critico di controllo        \u25C7  decisione, con a destra che cosa fare quando la risposta è no",
    { size: 16, align: "center", color: "5A6B5E", maiuscoletto: true, before: 40, after: 200 });
}

// Una fase del flusso si scrive "Nome della fase" oppure, per marcarla,
// "Nome della fase | CCP 1" - la stessa barra verticale usata altrove.
function leggiFase(testo, classificazione) {
  const grezzo = String(testo || "").trim();
  // Una decisione si scrive con il punto interrogativo davanti:
  //   ? Tempo e bollore rispettati? | NO: ripetere il trattamento
  // Non e' una fase del processo ma un bivio, e il ramo NO non prosegue: va
  // di lato, nella casella grigia dell'azione correttiva, perche' e' quello
  // che fa l'operatore quando il controllo non torna. Finche' il diagramma
  // sapeva disegnare solo una catena di scatole, il manuale diceva che cosa
  // si controlla e taceva che cosa succede se il controllo va male.
  if (grezzo.startsWith("?")) {
    const pz = grezzo.slice(1).split("|").map((x) => x.trim());
    return {
      tipo: "decisione",
      nome: pz[0],
      ramo: (pz[1] || "").replace(/^NO\s*[:\-]\s*/i, ""),
      dettaglio: "",
      marcatore: "",
    };
  }
  const pezzi = grezzo.split("|").map((x) => x.trim());
  const nome = pezzi[0];
  const dettaglio = pezzi.length > 2 ? pezzi[1] : "";
  const marcato = pezzi.length > 2 ? pezzi[2] : (pezzi.length === 2 ? pezzi[1] : "");
  // Una fase e' critica solo se lo dice il catalogo. Far ereditare la
  // classificazione del ciclo era sbagliato: dentro un ciclo classificato CCP
  // la maggior parte delle fasi non lo e' - il servizio al cliente e la
  // dispensa a temperatura ambiente non sono punti critici - e marcarle
  // tutte in rosso dichiara controlli che non esistono.
  const marcatore = marcato || "CP";
  return { tipo: "fase", nome, dettaglio, marcatore };
}

function diagramma(ciclo, numeroCcp) {
  const fasi = (ciclo.flow || []).map((x) => leggiFase(x, ciclo.classification));
  if (!fasi.length) return [];
  const cicloCritico = /CCP/i.test(ciclo.classification || "");
  // La colonna laterale esiste solo se c'e' almeno una decisione da cui far
  // uscire il ramo NO. Altrimenti sparisce e il riquadro si allarga.
  const conDecisioni = fasi.some((f) => f.tipo === "decisione");
  const D = conDecisioni ? DIA : DIA_SEMPLICE;
  const colonne = conDecisioni ? [D.num, D.box, D.tag, D.lato] : [D.num, D.box, D.tag];
  const righe = [];
  // I riquadri si distribuiscono sull'altezza del foglio invece di
  // accatastarsi in cima lasciando mezza pagina bianca: e' la pagina che si
  // stacca e si affigge in laboratorio, e da due metri si deve leggere.
  // Un ciclo di quattro fasi avra' riquadri alti, uno di dodici riquadri
  // stretti; i limiti tengono il risultato dentro il ragionevole.
  const conteggioFasi = fasi.filter((f) => f.tipo === "fase").length || 1;
  const altezzaFase = Math.max(640, Math.min(1500,
    Math.round((12400 - fasi.length * 120) / Math.max(fasi.length, 1))));
  const vuota = (l, o) => cellaDia(par("", { size: 2, after: 0 }), l, o || {});
  // La cella di coda: una cella vera dove la colonna c'e', niente dove non c'e'.
  const coda = (contenuto) => (conDecisioni ? (contenuto || vuota(D.lato)) : "");

  // intestazione piena: numero, nome e classificazione del ciclo
  righe.push(rigaDia(
    cellaDia(par(`${ciclo.numero ? "Ciclo " + ciclo.numero : ciclo.code}    ${ciclo.name}`, { bold: true, size: 21, color: "FFFFFF", after: 0 }),
      D.num + D.box, { sfondo: VERDE, span: 2 }) +
    cellaDia(par(cicloCritico ? "CCP" : "CP", { bold: true, size: 16, color: "FFFFFF", align: "center", after: 0 }),
      D.tag, { sfondo: VERDE }) +
    coda()
  ));

  // il tratto di collegamento: la colonna dei numeri resta colorata e tiene
  // la linea, le altre restano vuote
  const tratto = () => righe.push(rigaDia(
    vuota(D.num, { sfondo: VERDE_CHIARO, pad: 0 }) +
    vuota(D.box, { pad: 0 }) + vuota(D.tag, { pad: 0 }) + coda(vuota(D.lato, { pad: 0 })),
    { altezza: 120 }
  ));

  let n = 0;
  fasi.forEach((f) => {
    tratto();

    if (f.tipo === "decisione") {
      // Il bivio. La colonna dei numeri resta verde perche' il flusso
      // prosegue comunque: il ramo SI' e' la riga sotto, il ramo NO esce di
      // lato e non torna nella catena.
      righe.push(rigaDia(
        vuota(D.num, { sfondo: VERDE_CHIARO, pad: 0 }) +
        cellaDia(
          par("◇  " + f.nome, { bold: true, size: 20, align: "center", after: 40 }) +
          par("SÌ  ↓", { size: 15, align: "center", color: "6E8B78", after: 0 }),
          D.box, { sfondo: GIALLO, bordo: GIALLO_BORDO, spessore: 8 }) +
        cellaDia(par(f.ramo ? "NO  →" : "", { size: 15, align: "center", after: 0, color: "8A7320" }), D.tag) +
        coda(f.ramo
          ? cellaDia(par(f.ramo, { size: 16, after: 0, color: "4A4A46", interlinea: 220 }),
              D.lato, { sfondo: GRIGIO, bordo: GRIGIO_BORDO, spessore: 6, padLat: 110 })
          : vuota(D.lato)),
        { altezza: altezzaFase, minima: true }
      ));
      return;
    }

    // Le decisioni non consumano un numero: numerate sono le fasi del
    // processo, non le domande che ci si fa dentro.
    n += 1;
    const ccp = /CCP/i.test(f.marcatore || "");
    const dentro =
      par(f.nome, { bold: true, size: 20, after: f.dettaglio ? 50 : 0 }) +
      (f.dettaglio ? par(f.dettaglio, { size: 17, color: "4A5A50", after: 0, interlinea: 240 }) : "");
    righe.push(rigaDia(
      cellaDia(par(String(n), { bold: true, size: 21, color: "FFFFFF", align: "center", after: 0 }),
        D.num, { sfondo: ccp ? "A83A2C" : VERDE_CHIARO }) +
      cellaDia(dentro, D.box,
        { sfondo: ccp ? "FBEDEC" : "F4F7F2", bordo: ccp ? "A83A2C" : "CBD9CE", spessore: ccp ? 12 : 6 }) +
      // L'etichetta del punto critico e' una pastiglia piena, non una
      // scritta: su una pagina di riquadri verdi e' l'unica cosa che deve
      // saltare all'occhio da lontano.
      cellaDia(par(ccp ? (numeroCcp ? `CCP ${numeroCcp}` : "CCP") : "CP",
        { bold: ccp, size: 16, align: "center", after: 0, color: ccp ? "FFFFFF" : "6E8B78" }),
        D.tag, ccp ? { sfondo: "A83A2C", pad: 60, padLat: 40 } : {}) +
      coda(),
      { altezza: altezzaFase, minima: true }
    ));
  });

  return [tabellaDia(righe, colonne)];
}

// La firma del responsabile, quando e' stata depositata in Configurazione.
// L'immagine la porta il pacchetto (word/media/firma.png, relazione rId30):
// qui si scrive soltanto il riferimento, e se la firma non c'e' resta la
// riga vuota da firmare a penna, che e' il comportamento di sempre.
function firmaOSA(azienda) {
  const nome = azienda.haccp_manager || "";
  if (!azienda.haccp_signature_path || !azienda.haccp_signature_consent_at) {
    return nome + "\n\n\n____________________________________________";
  }
  return {
    xml:
      par(nome, { size: 20, after: 20 }) +
      parImmagine(RID_IMMAGINE(0), 4.5, 1.5, { after: 20, nome: "Firma del responsabile" }) +
      par("____________________________________________", { size: 20, after: 40 }),
  };
}

// --- filtro sui flag dell'azienda ---------------------------------------

// Una voce entra nel manuale se non chiede nessuna casella, oppure se la
// casella che chiede è accesa per questa azienda.
export function vale(voce, azienda) {
  const flag = voce?.requires_flag;
  if (!flag) return true;
  return !!azienda?.[flag];
}

// Quali cicli entrano in questo manuale, con il loro numero progressivo e,
// per quelli critici, il numero del CCP.
//
// Sta qui e si esporta perche' la deve usare anche chi disegna i diagrammi
// fuori dal generatore: se il disegno numerasse i cicli per conto suo, il
// foglio appeso in laboratorio direbbe "Ciclo 4 — CCP 2" e il testo del
// manuale "Ciclo 3 — CCP 1". Una regola sola, in un posto solo.
export function cicliDelManuale(cicli, azienda) {
  let n = 0;
  return (cicli || [])
    .filter((c) => vale(c, azienda))
    .map((c, i) => {
      const critico = /^CCP/i.test(c.classification || "");
      if (critico) n += 1;
      return { ...c, numero: i + 1, ccpNumero: critico ? n : null };
    });
}

// --- controllo di coerenza prima di generare ----------------------------
//
// Il manuale promette dei controlli: se in azienda non esistono gli impianti
// o il responsabile, quelle promesse restano lettera morta. Meglio dirlo
// prima di generare che scoprirlo in ispezione.
export function controlli(dossier) {
  const { azienda, impianti = [], registrazione = null, cicli = [], procedure = [] } = dossier;
  const avvisi = [];
  if (!azienda?.haccp_manager) avvisi.push("Manca il responsabile del piano di autocontrollo: si indica in Configurazione.");
  if (!registrazione) avvisi.push("Manca la registrazione sanitaria: il manuale cita numero, data e autorità competente.");
  if (impianti.length === 0) avvisi.push("Nessun impianto a temperatura controllata censito: il CCP 1 dichiarerebbe un monitoraggio senza apparecchi su cui farlo.");
  // Il manuale non elenca piu' i prodotti per nome, quindi la sezione
  // Sanificanti vuota non lo blocca: resta un controllo utile, ma e' un
  // promemoria, non un impedimento.
  if ((dossier.piano || []).filter((r) => r.active !== false).length === 0) {
    avvisi.push("Il programma di pulizia è vuoto: il manuale non potrà stampare frequenze, e la scheda Sanificazione resterà senza righe da spuntare. Si compila in Configurazione → Piano pulizie.");
  }
  if ((dossier.analisi || []).filter((r) => r.active !== false).length === 0) {
    avvisi.push("Nessun controllo analitico programmato: il capitolo 9 resterebbe senza il programma dell'azienda. Si compila nella scheda Controlli analitici.");
  }
  if (cicli.length === 0) avvisi.push("Il catalogo dei cicli è vuoto per questo settore.");
  if (procedure.length === 0) avvisi.push("Il catalogo delle procedure è vuoto per questo settore.");
  return avvisi;
}

// --- il documento -------------------------------------------------------

export function corpoManuale(dossier) {
  const {
    azienda = {},
    registrazione = null,
    impianti = [],
    revisione = {},
    cicli = [],
    procedure = [],
    piano = [],
    analisi = [],
    diagrammi = {},
  } = dossier;

  const inApp = azienda.haccp_records_mode !== "cartaceo";
  // I cicli del manuale sono quelli scelti per questa azienda, nell'ordine
  // deciso in Configurazione, meno quelli il cui interruttore e' spento.
  // Il numero nasce da qui: il primo ciclo dell'elenco e' il numero 1. I
  // codici del catalogo (C01, C07...) restano un'etichetta interna della
  // biblioteca e nel manuale non compaiono piu': lo stesso ciclo in una
  // pasticceria e' il terzo e in un bar il primo, e stampare un codice fisso
  // obbligava a spiegare al cliente perche' il suo manuale salta dei numeri.
  const cicliAttivi = cicliDelManuale(cicli, azienda);
  const procedureAttive = procedure.filter((x) => vale(x, azienda));
  // Il numero del CCP vale PER QUESTO MANUALE, non per il catalogo.
  //
  // In catalogo ogni ciclo porta la sua classificazione scritta a mano — "CCP
  // 1", "CCP 2" — e finche' i cicli critici erano due funzionava. Con i cicli
  // nuovi il risultato era che "CCP 1" indicava lo stoccaggio in un ciclo, la
  // pastorizzazione del gelato in un altro e la vetrina della pasticceria in
  // un terzo: tre cose diverse con lo stesso nome, dentro lo stesso documento,
  // e un quadro riassuntivo che elencava quattro "CCP 1".
  //
  // Qui i punti critici si contano nell'ordine in cui compaiono e si numerano
  // 1..n: il numero e' unico nel manuale, il quadro riassuntivo corrisponde ai
  // diagrammi, e in ispezione "CCP 3" indica una cosa sola.
  const ccp = cicliAttivi.filter((c) => c.ccpNumero);
  const numeroCcp = new Map(ccp.map((c) => [c.id, c.ccpNumero]));
  const etichettaCcp = (c) => `CCP ${numeroCcp.get(c.id) || ""}`.trim();
  const cp = cicliAttivi.filter((c) => !/^CCP/i.test(c.classification || ""));
  const b = [];

  // ---------------- frontespizio ----------------
  b.push(par("", { after: 900 }));
  b.push(par("MANUALE DI", { bold: true, size: 44, align: "center", after: 0, color: VERDE }));
  b.push(par("AUTOCONTROLLO ALIMENTARE", { bold: true, size: 56, align: "center", after: 160, color: VERDE }));
  b.push(par("Sistema HACCP — Reg. (CE) n. 852/2004", { size: 26, align: "center", after: 700, color: VERDE_CHIARO }));
  b.push(par(azienda.name || "", { bold: true, size: 44, align: "center", after: 40 }));
  if (azienda.tipologia_attivita) b.push(par(azienda.tipologia_attivita, { size: 26, align: "center", after: 240 }));
  if (azienda.sede_operativa) b.push(par("Sede operativa: " + azienda.sede_operativa, { size: 24, align: "center", after: 30 }));
  b.push(par([azienda.vat ? "C.F. " + azienda.vat : "", azienda.piva ? "P.IVA " + azienda.piva : ""].filter(Boolean).join("   ·   "),
    { size: 24, align: "center", after: 30 }));
  if (registrazione?.notification_number) {
    b.push(par("Identificativo OSA / registrazione sanitaria: " + registrazione.notification_number, { size: 24, align: "center", after: 600 }));
  } else {
    b.push(par("", { after: 600 }));
  }
  b.push(par("Il Titolare e Responsabile del Piano di Autocontrollo", { size: 24, align: "center", after: 40 }));
  b.push(par(azienda.haccp_manager || "____________________________", { bold: true, size: 30, align: "center", after: 500 }));
  b.push(par(`Revisione ${revisione.numero || "00"}  —  emessa il ${data(revisione.data) || "____ / ____ / ________"}`,
    { size: 24, align: "center", after: 60 }));
  b.push(par("Redatto ai sensi del Regolamento (CE) n. 852 del 29 aprile 2004 sull'igiene dei prodotti alimentari",
    { italic: true, size: 21, align: "center", after: 0 }));
  b.push(saltoPagina());

  // ---------------- riquadro sul sistema di registrazione ----------------
  if (inApp) {
    b.push(tabella([W], [riga(cella(
      [
        par("Sistema di registrazione dell'autocontrollo", { bold: true, size: 26, after: 120, color: VERDE }),
        p("L'impresa tiene le registrazioni previste dal presente manuale con un sistema informatico online, accessibile agli addetti autorizzati da computer e da telefono. Il sistema conserva, insieme alle registrazioni, i documenti di trasporto e le fatture, le schede tecniche dei prodotti, gli attestati di formazione e gli allegati fotografici, con la data e l'ora di ogni inserimento."),
        p("Le registrazioni sono messe a disposizione dell'Autorità di controllo in ogni momento: possono essere consultate a video oppure stampate su richiesta, con lo stesso valore delle schede cartacee."),
        p("In caso di indisponibilità del sistema, di guasto del dispositivo o di mancanza di collegamento a internet, le registrazioni vengono eseguite sui moduli cartacei allegati al manuale, che l'impresa tiene stampati e disponibili in sede. Le annotazioni fatte su carta sono conservate insieme al manuale e riportate nel sistema informatico appena torna disponibile, indicando la data effettiva della rilevazione."),
        p("La mancanza del collegamento a internet non sospende l'obbligo di registrare: il controllo si esegue e si annota comunque.", { after: 0 }),
      ].join(""), W, { sfondo: "F1F4F0" }
    ))]));
    b.push(par("", { after: 240 }));
  }

  // ---------------- anagrafica e revisioni ----------------
  b.push(h1("Anagrafica dell'azienda e matrice delle revisioni"));
  b.push(scheda([
    ["Ragione sociale", [azienda.name, azienda.forma_giuridica].filter(Boolean).join(" — ")],
    ["Attività svolta", azienda.tipologia_attivita || ""],
    ["Codice ATECO", azienda.codice_ateco || ""],
    ["Sede legale", azienda.sede_legale || ""],
    ["Sede operativa", azienda.sede_operativa || ""],
    ["C.F. / Partita IVA", [azienda.vat, azienda.piva].filter(Boolean).join("  /  ")],
    ["PEC / e-mail", [azienda.pec, azienda.owner_email].filter(Boolean).join("  —  ")],
    ["Registrazione sanitaria", registrazione
      ? `N. ${registrazione.notification_number || "—"} del ${data(registrazione.notification_date)} — ${registrazione.asl || ""}`
      : "da completare"],
    ["Titolare / Legale rappresentante", azienda.haccp_manager || ""],
    ["Responsabile del Piano di Autocontrollo", azienda.haccp_manager || ""],
  ]));
  b.push(par("", { after: 160 }));
  b.push(h2("Matrice delle revisioni"));
  b.push(griglia(["Revisione", "Data", "Motivo della revisione", "Redatto", "Resp. HACCP"], [
    [revisione.numero || "00", data(revisione.data) || "__/__/____", revisione.motivo || "Prima emissione",
     revisione.redattoDa || azienda.consultant_name || "", azienda.haccp_manager || ""],
    [" ", " ", " ", " ", " "],
    [" ", " ", " ", " ", " "],
  ], [1200, 1500, 3660, 1500, 1500], { altezza: 340 }));
  b.push(par("", { after: 140 }));
  b.push(p("Il piano di autocontrollo viene aggiornato, sostituendo parzialmente o totalmente la presente edizione, al verificarsi di una o più delle seguenti condizioni:"));
  [
    "sostituzione della figura del responsabile delle procedure di autocontrollo;",
    "variazione delle fasi del ciclo produttivo o introduzione di nuove preparazioni;",
    "sostituzione o introduzione di attrezzature;",
    "modifica della destinazione d'uso dei locali;",
    "modifica delle normative di riferimento.",
  ].forEach((t) => b.push(punto(t)));
  b.push(saltoPagina());

  // ---------------- sommario ----------------
  // Indice automatico: Word lo costruisce dai titoli e ci mette i numeri di
  // pagina, che l'app non può conoscere perché non impagina il documento.
  b.push(h1("Sommario"));
  b.push(
    `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>` +
    `<w:fldSimple w:instr=" TOC \\o &quot;1-2&quot; \\h \\z \\u ">` +
    // Il testo di ripiego e' quello che resta stampato se il campo non viene
    // aggiornato: deve essere una frase presentabile, non un messaggio di
    // servizio. "Indice in aggiornamento..." su un manuale consegnato faceva
    // sembrare il documento incompiuto.
    `<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">Il sommario si compone all'apertura del documento.</w:t></w:r>` +
    `</w:fldSimple></w:p>`
  );
  b.push(saltoPagina());

  // ---------------- 1. definizioni ----------------
  b.push(h1("1. Definizioni"));
  b.push(p("Ai fini del presente manuale, e in coerenza con le definizioni del Codex Alimentarius e dei regolamenti comunitari vigenti, si intende per:"));
  b.push(scheda([
    ["HACCP", "Metodo che permette di individuare pericoli specifici, di valutarli e di stabilire le misure preventive per controllarli."],
    ["Pericolo", "Agente biologico, chimico o fisico, o condizione di un alimento, in grado di provocare un effetto nocivo per la salute."],
    ["Rischio", "Funzione della probabilità che il pericolo si manifesti e della gravità delle sue conseguenze."],
    ["CP — punto di controllo", "Fase o procedura che, tenuta sotto controllo, contribuisce a garantire la sicurezza igienica dell'alimento, ma in cui il rischio residuo è basso."],
    ["CCP — punto critico di controllo", "Fase in corrispondenza della quale è possibile esercitare un'azione di controllo che previene, elimina o riduce a livelli accettabili un pericolo per la sicurezza degli alimenti."],
    ["Limite critico", "Valore che separa l'accettabilità dall'inaccettabilità."],
    ["Monitoraggio", "Sequenza programmata di osservazioni o misure di un parametro di controllo, per accertare che un CCP sia tenuto sotto controllo."],
    ["Azione correttiva", "Azione da intraprendere quando il monitoraggio indica che un CCP è fuori controllo."],
    ["Contaminazione crociata", "Trasferimento di microrganismi da un alimento contaminato, dalle mani, dalle superfici o dagli utensili a un altro alimento."],
    ["Sanificazione", "Insieme delle operazioni di pulizia e disinfezione che riducono la carica microbica a livelli di sicurezza."],
    ["OSA", "Operatore del settore alimentare: la persona fisica o giuridica responsabile del rispetto della legislazione alimentare nell'impresa."],
    ["MOCA", "Materiali e oggetti destinati a venire a contatto con gli alimenti."],
    ["TMC", "Termine minimo di conservazione: “da consumarsi preferibilmente entro”."],
    ["Data di scadenza", "Termine perentorio dei prodotti molto deperibili: “da consumarsi entro”."],
    ["Alimento deperibile", "Alimento che per la sua breve conservabilità richiede condizioni controllate di temperatura."],
    ["Prerequisito (PRP)", "Condizione di base necessaria a mantenere un ambiente igienico: struttura, pulizia, acqua, infestanti, formazione, rifiuti."],
  ]));
  b.push(saltoPagina());

  // ---------------- 2. premessa ----------------
  b.push(h1("2. Premessa e campo di applicazione"));
  b.push(p(`Il presente Manuale di Autocontrollo appartiene a ${azienda.name || "—"} e si applica a tutte le attività di deposito, preparazione, cottura, somministrazione e vendita di alimenti e bevande che si svolgono presso la sede di ${azienda.sede_operativa || "—"}.`));
  b.push(p("Nell'esercizio si svolgono i seguenti cicli di lavorazione:"));
  cicliAttivi.forEach((c) => b.push(punto(`${c.numero}. ${c.name}` + (c.intro ? " — " + c.intro : ""))));
  b.push(p("Il manuale è redatto al fine di soddisfare gli obblighi dei Regolamenti comunitari in materia di igiene degli alimenti, e in particolare l'obbligo di predisporre, attuare e mantenere procedure permanenti basate sui principi del sistema HACCP di cui all'art. 5 del Reg. (CE) n. 852/2004."));
  b.push(p("Il titolare si impegna ad acquistare le materie prime esclusivamente da fornitori qualificati e da canali ufficiali, quale prima garanzia di salubrità del prodotto somministrato o venduto."));
  b.push(p("Il manuale non sostituisce il documento di valutazione dei rischi previsto dal D.Lgs. 81/08, che l'impresa redige separatamente.", { italic: true, size: 20 }));

  // ---------------- 3. normative ----------------
  b.push(h1("3. Normative di riferimento"));
  [
    "Regolamento (CE) n. 178/2002 — principi e requisiti generali della legislazione alimentare, rintracciabilità (art. 18), ritiro e richiamo (art. 19).",
    "Regolamento (CE) n. 852/2004 — igiene dei prodotti alimentari, con gli Allegati I e II.",
    "Regolamento (CE) n. 2073/2005 — criteri microbiologici applicabili ai prodotti alimentari.",
    "Regolamento (UE) n. 931/2011 — requisiti di rintracciabilità per gli alimenti di origine animale.",
    "Regolamento (UE) n. 2017/625 — controlli ufficiali sugli alimenti.",
    "Regolamento (CE) n. 1935/2004 e Regolamento (CE) n. 2023/2006 — materiali e oggetti a contatto con gli alimenti (MOCA).",
    "Regolamento (UE) n. 1169/2011 — informazioni sugli alimenti ai consumatori, Allegato II sugli allergeni e art. 44 per gli alimenti non preimballati.",
    "Comunicazione della Commissione 2016/C 278/01 — programmi di prerequisito e flessibilità per le piccole imprese.",
    "D.Lgs. 6 novembre 2007, n. 193 — sanzioni in materia di igiene degli alimenti.",
    "Direttiva 2011/91/UE — indicazioni che consentono di identificare la partita (lotto) alla quale appartiene una derrata alimentare.",
    "D.Lgs. 15 dicembre 2017, n. 231 — sanzioni per la violazione del Reg. (UE) 1169/2011 e disciplina del lotto e degli alimenti non preimballati.",
    "D.Lgs. 23 febbraio 2023, n. 18 — qualità delle acque destinate al consumo umano.",
    "Circolare del Ministero della Sanità 11 gennaio 1991, n. 1 — oli e grassi impiegati per la frittura.",
    "Normativa regionale in materia di formazione degli addetti alla manipolazione degli alimenti.",
  ].forEach((t) => b.push(punto(t)));

  // ---------------- 4. metodo ----------------
  b.push(h1("4. Il metodo HACCP e i sette principi"));
  b.push(p("Le malattie provocate dall'ingestione di alimenti contaminati durante la produzione, il trattamento, il confezionamento, il trasporto, la vendita o la somministrazione costituiscono un problema epidemiologico rilevante. Un alimento può essere contaminato già all'origine, oppure la contaminazione può avvenire nelle successive fasi di lavorazione."));
  b.push(p("Il metodo HACCP è lo strumento operativo con cui l'operatore previene il danno lungo il processo, invece di accorgersene alla fine. Si applica a ciascuna fase della filiera e si articola in sette principi."));
  [
    "1. Identificare i pericoli e analizzare i rischi lungo tutte le fasi del processo.",
    "2. Identificare i punti critici di controllo (CCP).",
    "3. Stabilire, per ciascun CCP, i limiti critici da rispettare.",
    "4. Stabilire le modalità di monitoraggio di ciascun CCP.",
    "5. Stabilire le azioni correttive da adottare quando un CCP è fuori controllo.",
    "6. Definire le procedure di verifica e di riesame periodico del sistema.",
    "7. Predisporre un sistema di registrazione e documentazione.",
  ].forEach((t) => b.push(punto(t)));

  // ---------------- 5. sviluppo ----------------
  b.push(h1("5. Sviluppo del piano di autocontrollo"));
  b.push(h2("5.1 Gruppo di lavoro HACCP"));
  b.push(p("Il gruppo di lavoro è costituito dal titolare, che assume la funzione di responsabile delle procedure di autocontrollo, dagli addetti alla manipolazione degli alimenti e dal consulente tecnico incaricato. Tutti gli operatori che manipolano alimenti sono formati alla manipolazione dei prodotti alimentari e ai rischi della fase di cui sono responsabili."));
  b.push(griglia(["Ruolo", "Nominativo", "Compiti"], [
    ["Titolare e Operatore del Settore Alimentare", azienda.haccp_manager || "____________________",
     "Responsabile ultimo della sicurezza degli alimenti: garantisce risorse, attrezzature e formazione, approva il manuale, decide sul destino dei prodotti non conformi"],
    ["Responsabile del piano di autocontrollo", azienda.haccp_manager || "____________________",
     "Applica e fa applicare il manuale, verifica le registrazioni, gestisce le non conformità e i rapporti con l'Autorità competente"],
    ["Addetti alla manipolazione", "____________________",
     "Applicano le procedure di igiene, eseguono le registrazioni di competenza, segnalano ogni anomalia al responsabile"],
    ["Consulenza tecnica", azienda.consultant_name || "____________________",
     "Redige e aggiorna il manuale, eroga la formazione, effettua le verifiche periodiche del sistema"],
  ], [2400, 2400, 4560]));

  b.push(h2("5.2 Requisiti dei locali e delle attrezzature"));
  b.push(p("I locali e le attrezzature rispondono ai requisiti generali e specifici stabiliti dall'Allegato II del Reg. (CE) n. 852/2004. La planimetria dei locali è allegata al manuale e ne costituisce parte integrante: su di essa sono riportate la destinazione degli ambienti, l'ubicazione delle attrezzature e la collocazione dei dispositivi di monitoraggio degli infestanti."));
  b.push(h3("Requisiti generali (Allegato II, Capitolo I)"));
  [
    "locali mantenuti puliti, in buono stato e in condizioni tali da consentire una corretta prassi igienica, compresa la protezione contro la contaminazione;",
    "spazi di lavoro sufficienti a consentire lo svolgimento delle operazioni in condizioni igieniche;",
    "lavabi per il lavaggio delle mani in numero adeguato, con acqua corrente calda e fredda, materiale per lavarsi e asciugarsi le mani in modo igienico;",
    "numero adeguato di gabinetti, con scarico idraulico e collegati a un sistema fognario efficace, non direttamente comunicanti con i locali di manipolazione;",
    "aerazione naturale o meccanica sufficiente, con accesso ai filtri per la pulizia e la sostituzione;",
    "illuminazione naturale o artificiale adeguata, con corpi illuminanti protetti nelle aree di lavorazione;",
    "impianti di scarico adeguati allo scopo e costruiti in modo da evitare il rischio di contaminazione;",
    "spogliatoi adeguati per il personale, con gli effetti personali tenuti separati dalle aree di lavorazione.",
  ].forEach((t) => b.push(punto(t)));
  b.push(h3("Requisiti dei locali di preparazione (Allegato II, Capitolo II)"));
  [
    "pavimenti in materiale impermeabile, non assorbente, lavabile e non tossico, mantenuti in buone condizioni e di facile pulizia e disinfezione;",
    "pareti in materiale impermeabile, non assorbente, lavabile e non tossico, con superficie liscia fino a un'altezza adeguata alle operazioni;",
    "soffitti e attrezzature sospese costruiti e rifiniti in modo da evitare l'accumulo di sporcizia, la formazione di muffe e la caduta di particelle;",
    "finestre e altre aperture verso l'esterno munite, ove necessario, di dispositivi di protezione contro gli insetti, facilmente smontabili per la pulizia;",
    "porte di superficie liscia e non assorbente, di facile pulizia e disinfezione;",
    "superfici a contatto con gli alimenti in materiale liscio, lavabile, resistente alla corrosione e non tossico;",
    "attrezzature adeguate per la pulizia, la disinfezione e il deposito degli utensili di lavoro.",
  ].forEach((t) => b.push(punto(t)));
  b.push(h3("Attrezzature, acqua, rifiuti e personale"));
  [
    "attrezzature a contatto con gli alimenti costruite con materiali idonei, mantenute in buono stato, pulite e disinfettate con frequenza sufficiente (Cap. V);",
    "rifiuti alimentari e di altro genere depositati in contenitori chiudibili, rimossi dai locali con la frequenza necessaria ed eliminati in modo igienico (Cap. VI);",
    "approvvigionamento idrico con acqua potabile, impiegata ogni volta che è necessario per non contaminare gli alimenti; il ghiaccio destinato al contatto con gli alimenti è ottenuto da acqua potabile (Cap. VII);",
    "igiene personale curata, indumenti adeguati e puliti, allontanamento dalla manipolazione di chi è affetto da malattia trasmissibile con gli alimenti (Cap. VIII);",
    "materie prime non accettate quando risultano contaminate o alterate, e conservate in condizioni tali da impedirne il deterioramento (Cap. IX);",
    "formazione degli addetti in materia di igiene alimentare in relazione alla mansione svolta (Cap. XII).",
  ].forEach((t) => b.push(punto(t)));
  b.push(p("Il rispetto di questi requisiti è verificato dal responsabile del piano di autocontrollo nel corso dei controlli ordinari; le difformità rilevate sono gestite come non conformità, con l'azione correttiva e i tempi di ripristino annotati nel registro dedicato.", { italic: true, size: 20 }));
  b.push(h3("Impianti a temperatura controllata"));
  if (impianti.length > 0) {
    b.push(griglia(["Impianto", "Intervallo di conformità", "Monitoraggio"],
      impianti.map((u) => [u.label, `da ${u.min_temp} a ${u.max_temp} °C`, "Lettura e registrazione giornaliera"]),
      [3600, 3000, 2760]));
  } else {
    b.push(p("Da completare: gli impianti a temperatura controllata non risultano ancora censiti.", { italic: true }));
  }
  // La clausola che tiene l'azienda al riparo quando compra un frigorifero.
  //
  // L'elenco qui sopra fotografa la dotazione al momento della revisione. Un
  // manuale che la dichiarasse come immutabile metterebbe l'OSA in difetto il
  // giorno in cui sostituisce una vetrina rotta: la registrazione sanitaria
  // riguarda lo stabilimento e le attività che vi si svolgono, non il numero
  // dei frigoriferi, e aggiungere o sostituire un'apparecchiatura dello stesso
  // tipo non cambia né i locali, né le lavorazioni, né le categorie di
  // prodotto. Quello che deve cambiare è il piano di autocontrollo, ed è
  // quello che la frase impegna a fare.
  b.push(p("L'elenco degli impianti riporta la dotazione presente alla data della presente revisione. L'installazione, la sostituzione o la dismissione di un'apparecchiatura a temperatura controllata dello stesso tipo e con la stessa destinazione d'uso non modifica i locali, il ciclo produttivo né le categorie di prodotto trattate, e rientra pertanto nella ordinaria gestione dell'attività già registrata ai sensi dell'art. 6 del Reg. (CE) n. 852/2004: non comporta una nuova segnalazione di inizio attività."));
  b.push(p("Ogni variazione è però recepita immediatamente nel piano di autocontrollo: la nuova apparecchiatura viene censita con la propria destinazione d'uso e i propri limiti di conformità, entra nel programma di monitoraggio delle temperature e nel programma di pulizia e sanificazione dal giorno della messa in esercizio, e l'elenco aggiornato è riportato nella revisione successiva del manuale. Restano fermi gli obblighi di comunicazione all'Autorità competente previsti dalla normativa regionale per le modifiche strutturali e impiantistiche, per il cambio di sede e per la variazione delle attività o delle categorie di prodotto."));

  b.push(h2("5.3 Materie prime e destinazione d'uso"));
  b.push(griglia(["Gruppo", "Conservazione"], [
    ["Sfarinati e prodotti secchi", "Dispensa asciutta e fresca, su scaffalature sollevate da terra e distanziate dalle pareti"],
    // Le temperature non si scrivono qui. Questa tabella dice che cosa va
    // tenuto al freddo; A QUALE freddo lo dicono gli impianti dell'azienda, nel
    // prospetto qui sotto, che l'app sorveglia davvero. Scrivere "0/+4 °C" in
    // un manuale di un'azienda che ha la cella impostata a +2/+6 significa
    // dichiarare un limite che nessuno controlla.
    ["Prodotti deperibili refrigerati", "Refrigerazione negli impianti dell'azienda, entro i limiti indicati nel prospetto delle temperature e nel rispetto dell'etichetta del produttore"],
    ["Prodotti surgelati", "Congelatore ai limiti indicati nel prospetto delle temperature, comunque non superiori a −18 °C"],
    ["Prodotti pronti acquistati da terzi", "Secondo le indicazioni del fornitore; i freschi sono venduti in giornata"],
    // La riga dei semilavorati mancava, ed e' quella che in un laboratorio
    // riempie davvero il frigorifero: creme, ripieni, basi, impasti pronti.
    // Il loro tempo di vita non sta sull'etichetta di nessuno, lo decide
    // l'azienda - e se non e' scritto da qualche parte non lo decide nessuno.
    ["Semilavorati e preparati del laboratorio", "Refrigerazione in contenitore chiuso o coperto, con cartellino di identificazione e data di produzione; impiego entro 48 ore dalla preparazione"],
    ["Conserve e prodotti in barattolo", "Ambiente; dopo l'apertura travaso in contenitore idoneo, refrigerazione ed etichettatura con la data di apertura"],
    ["Oli e grassi", "Ambiente, al riparo dalla luce e da fonti di calore"],
    ["Bevande", "Ambiente o refrigerazione secondo l'etichetta"],
  ], [3000, 6360]));
  b.push(par("", { after: 160 }));
  b.push(p("I prodotti preparati hanno una doppia destinazione d'uso: consumo immediato all'interno del locale e vendita da asporto. Per l'asporto il prodotto è confezionato in contenitori idonei al contatto con gli alimenti; il personale informa il cliente che il prodotto è destinato al consumo in tempi brevi e che, se non consumato subito, va conservato in frigorifero."));
  b.push(p("Ogni preparato che non viene impiegato subito è coperto o riposto in contenitore chiuso e porta un cartellino con la denominazione e la data di produzione. È la regola che tiene in piedi tutto il resto: senza data, un contenitore in frigorifero non si può né usare con fiducia né scartare con ragione, e la decisione finisce per dipendere dall'aspetto e dall'odore. Salvo diversa indicazione scritta nella scheda di lavorazione, i semilavorati si impiegano entro 48 ore dalla preparazione; oltre quel termine si eliminano."));
  b.push(p(inApp
    ? "Le preparazioni e le etichette si registrano nell'app, che conserva per ogni lotto la data di produzione, gli ingredienti impiegati e i lotti delle materie prime da cui proviene."
    : "Le preparazioni e le etichette si annotano sul modulo cartaceo di produzione, conservato insieme agli altri registri."));
  b.push(p("I prodotti ottenuti da impasto surgelato o parzialmente cotto sono dichiarati come tali al consumatore, come previsto dal Reg. (UE) n. 1169/2011.", { italic: true, size: 20 }));

  b.push(h2("5.4 Diagrammi di flusso"));
  b.push(p("Il diagramma di flusso rappresenta le fasi che compongono ciascun ciclo, dalla materia prima al prodotto servito, e indica per ognuna se costituisce punto di controllo (CP) o punto critico di controllo (CCP). Ogni ciclo occupa una pagina: il diagramma si legge per intero e si può staccare per essere affisso nel locale di lavorazione."));
  b.push(legendaFlusso());
  // un diagramma per pagina. Due per pagina stavano larghi solo quando i
  // cicli avevano poche fasi, e per tutti gli altri si spezzavano a metà.
  //
  // Dal 23/10/2026 il diagramma, quando si può, è un disegno: lo prepara
  // diagrammaCiclo.js su un canvas e arriva qui già pronto dentro
  // dossier.diagrammi, indicizzato per id del ciclo. Con le celle di una
  // tabella le frecce, il rombo e il ramo che si stacca non si disegnano, e
  // il diagramma restava una lista messa in cornice. Se il disegno non c'è
  // — nessun canvas, prova fuori dal browser — resta la tabella di prima:
  // il manuale esce comunque, che è la cosa che conta.
  cicliAttivi.forEach((c) => {
    const dis = diagrammi[c.id];
    if (dis) {
      b.push(saltoPagina());
      b.push(parImmagine(RID_IMMAGINE(dis.indice), dis.larghezzaCm, dis.altezzaCm,
        { nome: "Diagramma di flusso — " + (c.name || ""), align: "center", after: 0 }));
      return;
    }
    const d = diagramma(c, numeroCcp.get(c.id));
    if (!d.length) return;
    b.push(saltoPagina());
    d.forEach((x) => b.push(x));
  });
  b.push(saltoPagina());

  // 5.5 - Il programma di pulizia.
  //
  // Queste righe sono le stesse che l'azienda spunta nella scheda
  // Sanificazione e sulle quali nascono gli avvisi: il manuale le stampa, non
  // le riscrive. Finche' la frequenza stava soltanto nel testo del manuale,
  // nessun avviso poteva nascere da li' - una frase non si confronta con una
  // data - e documento e app raccontavano due storie diverse.
  const pianoAttivo = piano
    .filter((r) => r.active !== false)
    .filter((r) => vale(r, azienda))
    .sort((a, b2) => (a.sort_order || 0) - (b2.sort_order || 0));

  b.push(h2("5.5 Programma di pulizia e sanificazione"));
  if (pianoAttivo.length === 0) {
    b.push(p("Il programma di pulizia non risulta ancora definito nel sistema di gestione dell'azienda. Fino alla sua compilazione valgono le modalità descritte nella procedura di pulizia e sanificazione del capitolo 8."));
  } else {
    b.push(p(`Il programma che segue elenca, per ciascun punto di intervento, l'operazione prevista e la frequenza con cui va eseguita. ${inApp
      ? "È lo stesso programma che l'applicativo gestionale presenta all'operatore nella scheda di sanificazione: ogni intervento eseguito vi è spuntato con la data, il nome di chi lo ha svolto e il prodotto impiegato, e il sistema segnala le operazioni non eseguite entro la frequenza stabilita."
      : "Le esecuzioni si registrano sul modulo di pulizia e sanificazione allegato al presente manuale."} Una modifica del programma comporta la revisione di questa sezione.`));
    b.push(griglia(
      ["Area", "Operazione", "Frequenza", "Prodotto impiegato", "A cura di"],
      pianoAttivo.map((r) => [
        r.area || "",
        r.operation || "",
        etichettaFrequenza(r.frequency_days),
        r.product || "secondo la procedura",
        r.responsible || "Personale addetto",
      ]),
      [1500, 2900, 1500, 1900, 1560]
    ));
    const conMetodo = pianoAttivo.filter((r) => r.method);
    if (conMetodo.length) {
      b.push(par("", { after: 140 }));
      b.push(p("Modalità di esecuzione specifiche:"));
      conMetodo.forEach((r) => b.push(punto(`${r.operation} — ${r.method}`)));
    }
    b.push(par("", { after: 140 }));
    // Categorie, non marche.
    //
    // Prima qui usciva l'elenco dei prodotti registrati in azienda, con i
    // nomi commerciali. Era un impegno che l'azienda non puo' mantenere: il
    // giorno in cui il fornitore cambia fornitura, o il banconista compra
    // un'altra marca di sgrassatore, il manuale dichiara un prodotto che in
    // magazzino non c'e' piu' - e in ispezione quella e' una difformita' fra
    // il dichiarato e il reale. La categoria invece resta vera, e la marca
    // effettivamente in uso si legge dove serve davvero: sulla scheda
    // tecnica conservata in sede e sul calendario delle pulizie, dove si
    // scrive il prodotto usato.
    b.push(p("I prodotti impiegati appartengono alle categorie indicate di seguito, scelti fra quelli idonei all'impiego nell'industria alimentare e utilizzati alle diluizioni e con i tempi di contatto indicati nelle rispettive schede tecniche, conservate in sede e a disposizione dell'Autorità competente. Le superfici a contatto con gli alimenti sono risciacquate con acqua potabile dopo l'impiego del disinfettante.", { size: 20 }));
    b.push(par("", { after: 120 }));
    b.push(griglia(["Categoria di prodotto", "Impiego"], [
      ["Detergente per superfici e utensili", "Rimozione dello sporco e dei residui organici da piani di lavoro, banchi, lavelli, utensili e attrezzature smontabili."],
      ["Detergente sgrassante", "Attrezzature, cappe, filtri, friggitrici e superfici con residui grassi."],
      ["Disinfettante idoneo al contatto con gli alimenti", "Sanificazione delle superfici e delle attrezzature a contatto con gli alimenti, dopo la detersione, seguita da risciacquo con acqua potabile."],
      ["Detergente disinfettante", "Dove la scheda tecnica del prodotto ne consente l'impiego combinato in un'unica operazione."],
      ["Detergente per pavimenti", "Pavimenti dei locali di lavorazione, della sala e dei servizi igienici, con attrezzature distinte per i servizi."],
      ["Disincrostante o anticalcare", "Lavelli, lavastoviglie e attrezzature a contatto con acqua, secondo le indicazioni del costruttore."],
      ["Prodotto per i servizi igienici", "Vaso, lavabo e pavimento dei servizi igienici."],
      ["Sapone e prodotto per l'igiene delle mani", "Lavaggio e igiene delle mani degli operatori ai lavabi dedicati."],
    ], [3400, 5960]));
    b.push(p("Il manuale indica la categoria e non la marca: la sostituzione di un prodotto con un altro della stessa categoria, parimenti idoneo all'impiego nell'industria alimentare, non comporta la revisione del manuale, purché la scheda tecnica del prodotto in uso sia conservata insieme alle altre. Il prodotto effettivamente impiegato per ciascuna operazione è riportato sul calendario delle pulizie.", { italic: true, size: 20 }));
  }
  b.push(saltoPagina());

  // ---------------- 6. pericoli ----------------
  b.push(h1("6. Identificazione dei pericoli e analisi dei rischi"));
  b.push(p("I pericoli che possono danneggiare un alimento si distinguono in biologici, chimici e fisici; a questi si aggiunge la presenza involontaria di allergeni, che produce un danno diretto al consumatore sensibile."));
  b.push(scheda([
    ["Biologico", "Batteri e loro tossine, virus, muffe e lieviti. Fonti: materie prime contaminate all'origine, interruzione della catena del freddo, contaminazione crociata fra crudi e pronti al consumo, mani e stato di salute degli operatori, superfici e utensili non sanificati."],
    ["Chimico", "Residui di detergenti e disinfettanti per risciacquo insufficiente, migrazione da materiali non idonei al contatto, sostanze di degradazione dell'olio di frittura, prodotti per la disinfestazione."],
    ["Fisico", "Frammenti di vetro, metallo, plastica o legno, schegge di utensili, monili e oggetti personali degli operatori, corpi estranei introdotti con le materie prime."],
    ["Allergeni", "Presenza involontaria di allergeni per contaminazione crociata fra preparazioni, attrezzature condivise e prodotti acquistati già pronti."],
  ]));
  b.push(p("La probabilità che il pericolo si manifesti dipende dalla deperibilità del prodotto, dalle condizioni igieniche dei locali e delle attrezzature e dal grado di formazione del personale. La gravità dipende dalle caratteristiche dell'agente e non è influenzata dall'organizzazione aziendale."));
  b.push(saltoPagina());

  // ---------------- 7. cicli ----------------
  b.push(h1("7. I cicli di lavorazione: punti di controllo e punti critici"));
  b.push(h2("Criterio adottato nella scelta dei punti critici"));
  b.push(p(`L'azienda ha individuato ${ccp.length === 0 ? "nessun punto critico" : ccp.length === 1 ? "un solo punto critico di controllo" : ccp.length + " punti critici di controllo"}. La scelta si fonda sulla flessibilità prevista dall'art. 5 del Reg. (CE) n. 852/2004 e richiamata dalla Comunicazione della Commissione 2016/C 278/01: nelle imprese di ridotte dimensioni la maggior parte dei pericoli è tenuta sotto controllo dai programmi di prerequisiti e dalle buone prassi di lavorazione, e le procedure basate sui principi HACCP vanno semplificate di conseguenza.`));
  b.push(p("Sono classificati come CCP soltanto i passaggi in cui la perdita di controllo non è percepibile dall'operatore e non viene corretta dalla pratica di lavoro. Le altre fasi sono punti di controllo governati da procedure e buone prassi: la deviazione è immediatamente visibile e correggibile sul momento."));
  b.push(p("Un sistema che dichiara più punti critici di quanti l'azienda sia in grado di monitorare con continuità produce schede incomplete, e una scheda in bianco documenta che il sistema non è applicato.", { italic: true }));

  cicliAttivi.forEach((c, i) => {
    const righe = (c.righe || []).filter((r) => vale(r, azienda));
    // ogni ciclo da pagina nuova: la tabella dei pericoli e' larga e
    // spezzata fra due pagine non si legge
    if (i > 0) b.push(saltoPagina());
    b.push(h2(`${c.numero ? "Ciclo " + c.numero : c.code} — ${c.name}`));
    const critico = /^CCP/i.test(c.classification || "");
    b.push(par("Classificazione: " + (critico ? etichettaCcp(c) : c.classification),
      { bold: true, size: 20, color: critico ? "A83A2C" : VERDE_CHIARO, after: 100 }));
    if (c.intro) b.push(p(c.intro));
    // nella riga di testo i marcatori non si scrivono: li porta il diagramma
    if ((c.flow || []).length) {
      const fasi = (c.flow || [])
        .map((x) => leggiFase(x, c.classification))
        .filter((f) => f.tipo !== "decisione")
        .map((f) => f.nome);
      b.push(par("Flusso:  " + fasi.join("  →  "), { size: 19, after: 140 }));
    }
    if (righe.length) {
      b.push(griglia(["Fase", "Pericolo", "Misura preventiva / limite", "Monitoraggio", "Azione correttiva"],
        righe.map((r) => [r.phase, r.hazard, r.control_measure, r.monitoring, r.corrective_action]),
        [1500, 2000, 2400, 1800, 1660]));
    }
    b.push(par("", { after: 120 }));
  });

  b.push(h2("Quadro riassuntivo dei controlli"));
  if (ccp.length) {
    b.push(p("Punti critici di controllo, con limite critico, monitoraggio e registrazione:"));
    b.push(griglia(["CCP", "Limite critico", "Monitoraggio", "Registrazione"],
      ccp.map((c) => {
        const r = (c.righe || []).filter((x) => vale(x, azienda));
        return [
          `${etichettaCcp(c)} — ${c.name}`,
          r.map((x) => x.control_measure).filter(Boolean).join(" | "),
          r.map((x) => x.monitoring).filter(Boolean).join(" | "),
          inApp ? "Registro nell'applicativo gestionale" : "Scheda cartacea allegata",
        ];
      }), [2400, 2600, 2400, 1960]));
  }
  if (cp.length) {
    b.push(par("", { after: 160 }));
    b.push(p("Punti di controllo governati da buone prassi e procedure:"));
    b.push(griglia(["Fase", "Controllo"], cp.map((c) => [c.name, (c.righe || []).map((x) => x.phase).join(" · ")]), [3000, 6360]));
  }
  b.push(saltoPagina());

  // ---------------- 8. procedure ----------------
  b.push(h1("8. Procedure aziendali"));
  b.push(p("Per procedura aziendale si intende la descrizione di come gli operatori devono agire all'interno delle diverse fasi del processo, al fine di garantire la salubrità del prodotto e la sicurezza del consumatore."));
  b.push(p(`Responsabile di tutte le procedure che seguono, salvo diversa indicazione, è ${azienda.haccp_manager || "il titolare"}.`, { italic: true, size: 20 }));

  procedureAttive.forEach((pr) => {
    b.push(h2(`${pr.code} — ${pr.title}`));
    if (pr.purpose) b.push(p("Scopo: " + pr.purpose));
    (pr.body || []).forEach((bl) => {
      if (bl.t === "h") b.push(h3(bl.x));
      else if (bl.t === "b") b.push(punto(bl.x));
      else if (bl.t === "tab") {
        const cols = (bl.i || []).length;
        if (cols > 0) {
          const larghezze = Array.from({ length: cols }, () => Math.floor(W / cols));
          b.push(griglia(bl.i, bl.r || [], larghezze));
          b.push(par("", { after: 140 }));
        }
      } else b.push(p(bl.x));
    });
    if (pr.corrective_action) b.push(p("Azioni correttive: " + pr.corrective_action));
    if (pr.verification_docs) b.push(par("Documenti di verifica: " + pr.verification_docs, { italic: true, size: 20, after: 160 }));
  });
  b.push(saltoPagina());

  // ---------------- 9. controlli analitici ----------------
  b.push(h1("9. Programmazione dei controlli analitici"));
  b.push(p("Le verifiche analitiche integrano il monitoraggio quotidiano e servono a dimostrare l'efficacia del sistema. Le analisi sono eseguite presso laboratori accreditati e i referti sono conservati agli atti."));

  // Il criterio con cui si sceglie la frequenza, scritto.
  //
  // Il Reg. 2073/2005 fissa i limiti e non le frequenze: l'art. 4 lascia la
  // scelta all'operatore e l'art. 5 permette di ridurre il numero dei campioni
  // quando l'HACCP e' documentato ed efficace. Un piano leggero in una
  // microimpresa e' quindi previsto dalla norma - ma solo se motivato.
  //
  // E' la stessa regola della sezione sugli allergeni: una semplificazione si
  // difende solo se e' scritta. Senza questo capoverso, un piano con un
  // tampone all'anno sembra una dimenticanza; con questo capoverso e' una
  // scelta che l'impresa ha preso e che sa spiegare.
  b.push(h2("9.1 Criterio adottato nella scelta delle frequenze"));
  b.push(p("Il Reg. (CE) n. 2073/2005 stabilisce i criteri microbiologici — cioè i limiti — e non la cadenza dei campionamenti: l'art. 4 affida all'operatore la scelta della frequenza di campionamento, e l'art. 5 consente di ridurre il numero delle unità campionarie quando l'applicazione delle procedure basate sui principi HACCP è documentata ed efficace. La frequenza va quindi adattata alla natura e alle dimensioni dell'impresa."));
  b.push(p("Il programma riportato di seguito tiene conto delle dimensioni ridotte dell'impresa, del numero contenuto di addetti, della semplicità e ripetitività delle lavorazioni, dell'assenza di produzione destinata ad altre imprese e del fatto che i criteri di igiene di processo sono tenuti sotto controllo dalle registrazioni quotidiane previste dal presente manuale. Un programma più oneroso di quanto l'impresa possa sostenere non verrebbe applicato, e un controllo programmato e non eseguito documenta che il sistema non è attuato."));
  b.push(p("La riduzione è accompagnata da due impegni precisi, che l'impresa assume:"));
  b.push(punto("dove si producono alimenti pronti che possono favorire la crescita di Listeria monocytogenes — creme, prodotti farciti, gelati — il campionamento delle aree di lavorazione e delle attrezzature è eseguito in ogni caso, come previsto dall'art. 5, comma 2 del Reg. (CE) n. 2073/2005;"));
  b.push(punto("si esegue un campionamento straordinario quando cambia il processo, quando si avvia una produzione nuova, dopo una non conformità rilevata o una segnalazione, e in caso di esito non conforme la frequenza viene raddoppiata per l'anno successivo."));
  b.push(p("La verifica dell'efficacia della pulizia è organizzata su due livelli. Due volte l'anno il consulente esegue un controllo rapido sui residui proteici delle superfici, con lettura immediata e redazione di verbale: si effettua dopo detersione e risciacquo e prima della disinfezione, perché è la pulizia che si sta verificando, e un esito non conforme comporta la ripetizione della pulizia sul punto interessato e il riesame della procedura. Periodicamente, un tampone di laboratorio con esame microbiologico conferma che quella verifica stia misurando la cosa giusta."));
  b.push(p(`Il tampone di laboratorio è eseguito ${azienda.rte_production ? "ogni anno, perché l'impresa produce alimenti pronti al consumo che possono favorire la crescita di Listeria monocytogenes e per essi il campionamento delle aree di lavorazione è previsto dall'art. 5, comma 2 del Reg. (CE) n. 2073/2005" : "ogni due anni: l'impresa non produce alimenti pronti al consumo che favoriscano la crescita di Listeria monocytogenes, e per le lavorazioni svolte la verifica rapida semestrale sui residui proteici è lo strumento con cui l'efficacia della sanificazione viene tenuta sotto controllo durante l'anno"}.`));
  b.push(p("Le superfici campionate sono le stesse a ogni tornata: l'andamento nel tempo dice più del singolo risultato. Per le superfici la normativa non fissa limiti numerici; i valori di riferimento sono quelli adottati nel presente piano d'intesa con il laboratorio incaricato, e la presenza di patogeni su una superficie a contatto con gli alimenti comporta comunque un'azione correttiva immediata.", { size: 20 }));
  b.push(par("", { after: 140 }));
  b.push(h2("9.2 Programma dei controlli"));

  // Il programma è quello che l'azienda ha davvero deciso e che l'app
  // sorveglia, non un elenco scritto una volta nel codice: un manuale che
  // promette tamponi biennali a chi non li ha mai programmati dichiara un
  // controllo che nessuno farà, ed è la promessa a vuoto che in ispezione
  // pesa più della sua assenza.
  const analisiAttive = analisi
    .filter((r) => r.active !== false)
    .filter((r) => vale(r, azienda));

  if (analisiAttive.length === 0) {
    b.push(p("Il programma dei controlli analitici è definito dal responsabile del piano di autocontrollo con il laboratorio incaricato, in funzione delle lavorazioni svolte e degli esiti del monitoraggio, e viene riportato in questa sezione alla prima revisione utile.", { italic: true }));
  } else {
    b.push(griglia(["Oggetto del controllo", "Matrice", "Parametri ricercati", "Punto di prelievo", "Frequenza"],
      analisiAttive.map((r) => [
        r.label || "",
        r.matrix || "",
        r.parameters || "secondo il piano concordato con il laboratorio",
        r.sampling_point || "—",
        periodicita(r.frequency_months),
      ]),
      [2100, 1500, 2600, 1700, 1460]));
    const conNota = analisiAttive.filter((r) => r.note);
    if (conNota.length) {
      b.push(par("", { after: 140 }));
      conNota.forEach((r) => b.push(punto(`${r.label} — ${r.note}`)));
    }
    b.push(par("", { after: 140 }));
    b.push(p(inApp
      ? "Scadenze e referti sono gestiti nell'applicativo gestionale, che segnala il controllo in avvicinamento e conserva il referto di laboratorio insieme alla data di prelievo."
      : "Le date di prelievo e i referti sono conservati in sede, allegati al presente manuale."));
  }
  b.push(par("", { after: 160 }));
  b.push(p("In caso di esito non conforme si applicano le azioni correttive previste dalla fase o dalla procedura interessata, si ripete il campionamento dopo l'intervento e si registra l'esito fra le non conformità."));

  // ---------------- 10. moduli ----------------
  // ---------------- 10. rintracciabilita' ----------------
  //
  // Il capitolo mancava del tutto: il Reg. 178/2002 compariva solo
  // nell'elenco delle norme. E' il capitolo dove si gioca la distinzione che
  // in ispezione conta davvero, e che quasi tutti i manuali sbagliano:
  //
  //   - la rintracciabilita' ESTERNA (un passo indietro, un passo avanti) e'
  //     un obbligo di legge, art. 18 del Reg. 178/2002;
  //   - la rintracciabilita' INTERNA - collegare i lotti in entrata ai
  //     prodotti preparati - NON e' imposta: lo dicono gli Orientamenti della
  //     Commissione del 2010 e l'Intesa Stato-Regioni del 28/07/2005, che
  //     all'art. 5.2 scrive che il regolamento "non obbliga gli operatori ad
  //     istituire un collegamento" fra entrata e uscita.
  //
  // Dichiararla obbligatoria sarebbe un errore e si ritorcerebbe contro
  // l'azienda: quello che il manuale dichiara diventa vincolante per chi lo
  // adotta, e promettere piu' di quanto si fa e' il modo piu' veloce di
  // prendere una prescrizione. Il manuale dice quindi la verita': l'azienda
  // la tiene per scelta, perche' e' quello che le permette di ritirare un
  // lotto invece di buttare tutto, e perche' senza conoscere la composizione
  // di quello che prepara non potrebbe ne' fare l'analisi dei pericoli ne'
  // dire al cliente che allergeni contiene.
  b.push(h1("10. Rintracciabilità, ritiro e richiamo"));

  b.push(h2("10.1 Che cosa impone la legge"));
  b.push(p("L'art. 18 del Reg. (CE) n. 178/2002 impone a ogni impresa alimentare di sapere, e di poter dimostrare all'Autorità di controllo, da chi ha ricevuto ogni alimento e a chi lo ha ceduto: è la regola detta «un passo indietro, un passo avanti». L'obbligo riguarda le imprese, non il consumatore finale: la vendita al banco non va tracciata nominativamente."));
  b.push(p("Il regolamento fissa l'obiettivo e non i mezzi: non prescrive un modulo, un programma o una forma particolare. Devono però esistere documenti che permettano di risalire al fornitore e di identificare la merce — documenti di trasporto, fatture, etichette, registrazioni interne — conservati e disponibili in tempi brevi."));
  b.push(p("Per gli alimenti di origine animale il Reg. (UE) n. 931/2011 aggiunge le informazioni minime che devono accompagnare la fornitura fra imprese: descrizione, volume o quantità, nome e indirizzo di chi spedisce e di chi riceve, data di spedizione e, quando previsto, il riferimento al lotto."));
  b.push(p("Il lotto identifica la partita alla quale appartiene un alimento. L'obbligo di indicarlo è disciplinato dal Titolo III del D.Lgs. 231/2017, che recepisce la direttiva 2011/91/UE, e riguarda i prodotti preimballati; non si applica agli alimenti non preimballati, cioè a quelli venduti sfusi, su richiesta del consumatore o preimballati ai fini della vendita diretta. L'indicazione del lotto non è richiesta quando l'etichetta riporta già il termine minimo di conservazione o la data di scadenza con l'indicazione almeno del giorno e del mese."));

  b.push(h2("10.2 Che cosa la legge non impone, e perché l'azienda lo fa lo stesso"));
  b.push(p("Collegare i lotti delle materie prime in entrata ai prodotti preparati in laboratorio — quella che si chiama rintracciabilità interna — non è imposto dall'art. 18. Lo confermano gli Orientamenti della Commissione europea del 2010 sull'attuazione degli articoli 11, 12, 14, 17, 18, 19 e 20 del Reg. 178/2002, e l'Intesa Stato-Regioni del 28 luglio 2005, che all'art. 5.2 afferma espressamente che il regolamento non obbliga gli operatori a istituire un collegamento fra i prodotti in entrata e quelli in uscita.", { italic: false }));
  b.push(p("L'azienda la tiene ugualmente, e il motivo è pratico prima che formale."));
  b.push(punto("Se un fornitore richiama un lotto, chi ha il collegamento ritira i prodotti che contengono quel lotto; chi non ce l'ha deve eliminare tutto quello che ha preparato in quei giorni, senza poter dimostrare il contrario."));
  b.push(punto("L'analisi dei pericoli prevista dall'art. 5 del Reg. (CE) n. 852/2004 si fa sui prodotti e sui processi dell'azienda: per farla occorre descrivere che cosa contiene ciò che si prepara. La composizione delle preparazioni, quindi, serve comunque — ed è da lì che nasce la scheda di produzione."));
  b.push(punto("Gli allergeni dei prodotti venduti sfusi vanno dichiarati al consumatore ai sensi dell'art. 44 del Reg. (UE) n. 1169/2011: si possono dichiarare solo se si sa, per ogni preparazione, da quali ingredienti è composta."));
  b.push(p("Resta il principio di proporzione: si registra quello che serve a ritrovare il prodotto, non tutto quello che si potrebbe registrare. Una scheda compilata a metà documenta che il sistema non è applicato, ed è peggio di una scheda che non esiste.", { italic: true, size: 20 }));

  b.push(h2("10.3 Come è organizzata in questa azienda"));
  b.push(p(inApp
    ? "Le merci in arrivo si registrano nella scheda Arrivo merci e tracciabilità, con fornitore, prodotto, lotto, data di consegna e documento di riferimento. Ogni lavorazione fatta in laboratorio si registra nella scheda Preparazioni, che genera un numero di lotto interno e tiene il collegamento con i lotti delle materie prime impiegate e con gli eventuali semilavorati già registrati. Dalla preparazione si stampa il cartellino da applicare al prodotto."
    : `Le merci in arrivo si registrano sul modulo ${codiceModulo(azienda, "arrivomerci")} «Arrivo merci e tracciabilità» quando il documento di consegna non riporta il lotto; negli altri casi è sufficiente conservare la bolla o la fattura, che il lotto lo riportano già. Ogni preparato messo in conservazione porta un cartellino con la denominazione del prodotto, la data di produzione e il termine entro cui va impiegato: i lotti delle materie prime impiegate restano sui documenti di acquisto conservati in azienda, e non si riscrivono a mano a ogni lavorazione.`));
  // Il passo avanti si scrive solo dove esiste davvero: dichiarare un
  // registro delle cessioni in un bar che vende al banco significa prometterlo
  // vuoto per sempre.
  if (azienda.sells_to_businesses) {
    b.push(p(inApp
      ? "I prodotti ceduti ad altre imprese — bar, ristoranti, negozi, mense, grossisti — si registrano nella scheda Cessioni ad altre imprese, con data, destinatario, prodotto, lotto, quantità e documento di accompagnamento. È il passo avanti richiesto dall'art. 18: da un lotto si risale a chi lo ha ricevuto."
      : `I prodotti ceduti ad altre imprese — bar, ristoranti, negozi, mense, grossisti — si registrano sul modulo ${codiceModulo(azienda, "cessioni")} «Registro delle cessioni ad altre imprese», con data, destinatario, prodotto, lotto, quantità e documento di accompagnamento. È il passo avanti richiesto dall'art. 18: da un lotto si risale a chi lo ha ricevuto.`));
    b.push(p("Le vendite al consumatore finale non si registrano: l'obbligo riguarda le cessioni fra imprese."));
  } else {
    b.push(p("L'azienda cede i propri prodotti esclusivamente al consumatore finale: il passo avanti previsto dall'art. 18 non richiede registrazioni nominative, perché l'obbligo riguarda le cessioni ad altre imprese. Se l'attività iniziasse a fornire altri operatori, la registrazione delle cessioni va attivata."));
  }
  b.push(p("Il numero di lotto interno è costruito dalla data di produzione e da un progressivo della giornata: non contiene informazioni da interpretare, serve solo a ritrovare la scheda."));
  b.push(p(inApp
    ? "I preparati conservati portano un cartellino con denominazione, lotto interno, data di produzione e termine entro cui vanno impiegati, stampato dalla scheda Preparazioni. Un contenitore senza cartellino non si usa e non si conserva: si elimina."
    : "I preparati conservati portano un cartellino con la denominazione del prodotto, la data di produzione e il termine entro cui vanno impiegati. Un contenitore senza cartellino non si usa e non si conserva: si elimina."));

  b.push(h2("10.4 Un esempio: dalla materia prima al prodotto servito"));
  b.push(p("Arriva una partita di ricotta con il suo lotto, che viene registrato all'ingresso. Con quella ricotta si prepara una farcitura, che riceve un lotto interno e nella cui scheda compare il lotto della ricotta. Con la farcitura si producono i dolci della giornata, che nella loro scheda richiamano il lotto della farcitura. Se il caseificio richiama il lotto di ricotta, dalla sua scheda si arriva alla farcitura e da questa ai dolci: si ritirano quelli, e solo quelli."));

  b.push(h2("10.5 Conservazione dei documenti"));
  b.push(p("I documenti di acquisto e le registrazioni di rintracciabilità si conservano per un periodo non inferiore a dodici mesi e comunque adeguato alla vita commerciale del prodotto: per i prodotti confezionati, per tutta la durata di conservazione dichiarata e per i sei mesi successivi. È lo stesso criterio adottato per le altre registrazioni dell'autocontrollo."));

  b.push(h2("10.6 Ritiro e richiamo"));
  b.push(p("Quando l'azienda ha motivo di ritenere che un alimento non sia conforme ai requisiti di sicurezza, avvia immediatamente le procedure dell'art. 19 del Reg. (CE) n. 178/2002: ritira il prodotto dal mercato, ne informa l'Autorità competente e, se il prodotto può essere già arrivato al consumatore, lo richiama informando i consumatori in modo efficace e accurato."));
  b.push(p("Il prodotto interessato viene isolato e identificato con la dicitura «Merce non conforme — non utilizzare», tenuto a disposizione dell'Autorità di controllo, che ne stabilisce la destinazione."));
  b.push(p(inApp
    ? "La non conformità e l'eventuale ritiro si registrano nella scheda Non conformità, che tiene anche i dati della comunicazione all'Autorità sanitaria."
    : `La non conformità si registra sul modulo ${codiceModulo(azienda, "nonconformita")} e la comunicazione all'Autorità sanitaria sul modulo ${codiceModulo(azienda, "ritiro")} «Comunicazione di ritiro del prodotto».`));

  // ---------------- 11. allergeni ----------------
  //
  // Mancava un capitolo suo, e gli allergeni comparivano solo di sfuggita
  // nell'analisi dei pericoli e fra gli allegati. E' la contestazione piu'
  // frequente e l'unica con una sanzione amministrativa diretta (D.Lgs.
  // 231/2017), e soprattutto e' l'unico pericolo che colpisce una persona
  // sola e in modo immediato: la contaminazione microbiologica fa ammalare
  // chi e' sfortunato, un allergene nascosto fa male a chi lo e' davvero.
  //
  // Il punto che quasi tutti i manuali sbagliano e' il "come": per gelateria,
  // pasticceria, panetteria, pasta fresca e gastronomia la legge permette il
  // cartello unico o il registro, ma pretende che l'informazione sia
  // RICONDUCIBILE AL SINGOLO ALIMENTO. Un cartellone con l'elenco dei
  // quattordici allergeni appeso al muro non soddisfa niente.
  b.push(h1("11. Allergeni e informazione al consumatore"));

  b.push(h2("11.1 Le sostanze da dichiarare"));
  b.push(p("Sono le quattordici sostanze o prodotti elencati nell'Allegato II del Reg. (UE) n. 1169/2011: cereali contenenti glutine; crostacei; uova; pesce; arachidi; soia; latte; frutta a guscio; sedano; senape; semi di sesamo; anidride solforosa e solfiti oltre 10 mg/kg o 10 mg/l; lupini; molluschi. L'obbligo riguarda la sostanza e i prodotti che ne derivano, anche quando è presente in quantità minime come ingrediente di un ingrediente."));

  b.push(h2("11.2 Come l'informazione viene data"));
  b.push(p("Per gli alimenti non preimballati — quelli venduti sfusi, serviti al banco o somministrati — l'informazione sugli allergeni è obbligatoria ai sensi dell'art. 44 del Reg. (UE) n. 1169/2011 e del D.Lgs. 231/2017, e deve essere disponibile prima che il consumatore scelga."));
  b.push(p("Per gelateria, pasticceria, panetteria, pasta fresca e gastronomia gli ingredienti possono essere riportati su un cartello unico o su un registro tenuto a disposizione del consumatore, ma le indicazioni sugli allergeni devono essere riconducibili al singolo alimento. Un cartello che elenchi genericamente i quattordici allergeni presenti nel laboratorio non assolve l'obbligo: dal cartello o dal registro deve risultare quali allergeni contiene ciascun prodotto.", { bold: false }));
  b.push(p("Nelle collettività — ristorazione, mense, scuole, ospedali — l'informazione deve essere riconducibile a ciascun alimento prima del servizio, su menù, registro o cartello. Se si utilizzano strumenti digitali, devono comunque esistere documenti scritti facilmente reperibili dal personale e dall'Autorità di controllo."));
  b.push(p(inApp
    ? "L'azienda tiene l'elenco nella scheda Menu e allergeni, che per ogni preparazione riporta gli ingredienti e gli allergeni, e che si stampa per essere esposta o messa a disposizione del consumatore."
    : "L'azienda tiene l'elenco su registro cartaceo, aggiornato a ogni variazione di ricetta e messo a disposizione del consumatore."));

  b.push(h2("11.3 Da dove viene l'informazione"));
  b.push(p("Gli allergeni di ogni preparazione si ricavano dalle etichette e dalle schede tecniche delle materie prime impiegate, che l'azienda conserva. È il motivo per cui la composizione delle preparazioni va scritta: senza sapere che cosa contiene un prodotto non è possibile dichiararne gli allergeni, e una dichiarazione data a memoria non è una dichiarazione."));
  b.push(p("Quando un fornitore cambia la formulazione di un prodotto, l'elenco va aggiornato: è un controllo che si fa alla consegna, leggendo l'etichetta, e non una volta all'anno."));

  b.push(h2("11.4 La contaminazione crociata da allergeni"));
  b.push(p("In un laboratorio piccolo la separazione degli allergeni si ottiene nel tempo più che nello spazio: si lavorano per primi i prodotti che non li contengono e per ultimi quelli che li contengono, sanificando fra una lavorazione e l'altra. Utensili, taglieri, sac à poche e contenitori destinati ai prodotti senza glutine o senza frutta a guscio sono identificati e non si scambiano."));
  b.push(p("La dicitura «può contenere tracce di» descrive un rischio reale e residuo, accertato dopo aver fatto quanto possibile per evitarlo. Usarla su tutto per prudenza la rende inutile e priva di valore informativo per chi è allergico, e non mette al riparo da una contestazione.", { italic: true, size: 20 }));
  b.push(p("Le richieste del cliente allergico vengono gestite dal responsabile: se la lavorazione separata non è possibile in sicurezza, il personale lo dice chiaramente invece di rassicurare."));

  // Perche' gli allergeni non sono un CCP: scritto, e non lasciato
  // sottinteso.
  //
  // Per definizione sarebbero il candidato piu' forte — pericolo grave,
  // invisibile al consumatore, che nessuna fase successiva elimina. La ragione
  // per cui in una piccola impresa restano un punto di controllo e' che il
  // controllo e' organizzativo e non ha un limite numerico da misurare, ed e'
  // esattamente il caso in cui l'art. 5 del Reg. 852/2004 e la Comunicazione
  // 2016/C 278/01 ammettono la semplificazione.
  //
  // Lasciarlo sottinteso e' il rischio vero: in un contenzioso la differenza
  // fra una scelta motivata e una dimenticanza sta in questo capoverso.
  b.push(h2("11.5 Perché il controllo degli allergeni non è classificato come punto critico"));
  b.push(p("La presenza involontaria di un allergene ha tutte le caratteristiche di un pericolo da tenere sotto controllo critico: è grave per il consumatore sensibile, non è percepibile da chi acquista e nessuna fase successiva la elimina. L'azienda ha scelto di governarlo come punto di controllo, e la scelta è motivata."));
  b.push(p("Il controllo degli allergeni non si esercita su un parametro misurabile con un limite critico — come una temperatura o un tempo — ma su un insieme di comportamenti: la separazione delle lavorazioni nel tempo, l'uso di utensili dedicati, la lettura delle etichette delle materie prime e la correttezza dell'informazione data al consumatore. È il caso tipico in cui l'art. 5 del Reg. (CE) n. 852/2004 e la Comunicazione della Commissione 2016/C 278/01 riconoscono che il pericolo è tenuto sotto controllo dai programmi di prerequisito e dalle buone prassi, e che le procedure basate sui principi HACCP vanno semplificate di conseguenza."));
  b.push(p("La scelta comporta un impegno preciso, che l'azienda assume: la verifica dell'elenco degli allergeni a ogni variazione di ricetta e a ogni cambio di fornitore, la formazione del personale sul significato della richiesta di un cliente allergico, e il riesame di questo capitolo a ogni revisione del manuale. Se l'attività iniziasse a produrre alimenti destinati espressamente a persone allergiche o intolleranti — per esempio una linea senza glutine su richiesta — il controllo andrebbe riclassificato come punto critico, con limiti e verifiche propri."));

  b.push(h1("12. Allegati e moduli di registrazione"));
  b.push(p(inApp
    ? "Le registrazioni sono tenute nell'applicativo gestionale, che conserva anche i documenti di trasporto, le schede tecniche e gli attestati. I moduli cartacei corrispondenti sono allegati al manuale e si utilizzano in caso di indisponibilità del sistema."
    : "Le registrazioni sono tenute sui moduli cartacei allegati al presente manuale, conservati compilati in azienda e messi a disposizione degli organi di controllo."));

  // Quando le schede si compilano nell'app, il manuale deve dire come: è la
  // prima cosa che un ispettore chiede quando non trova i fogli firmati.
  if (inApp) {
    b.push(h2("12.1 " + TITOLO_PROCEDURA));
    testoProceduraRegistrazioni(azienda).forEach((bl) => {
      if (bl.t === "h") b.push(h3(bl.x));
      else if (bl.t === "b") b.push(punto(bl.x));
      else b.push(p(bl.x));
    });
    b.push(par("", { after: 160 }));
  }

  // I giorni vuoti, spiegati nel manuale.
  //
  // Un registro senza righe per due settimane, in ispezione, e' un controllo
  // non eseguito: la differenza fra "non l'ho fatto" e "non c'era da farlo" la
  // fa soltanto un documento che dice perche'. Il manuale deve quindi
  // dichiarare che i periodi di chiusura e di fermo delle attrezzature sono
  // registrati, e dove: altrimenti la spiegazione esiste ma nessuno sa di
  // doverla cercare.
  b.push(h2(`12.${inApp ? 2 : 1} Periodi di chiusura e attrezzature fuori servizio`));
  if ((azienda.closing_weekdays || []).length) {
    b.push(p(`L'attività osserva la chiusura settimanale di ${elencoGiorni(azienda.closing_weekdays)}: in quei giorni non si effettuano lavorazioni e non sono previste registrazioni.`));
  }
  b.push(p("Nei giorni in cui l'attività è chiusa — ferie, chiusura stagionale, lavori — e per le attrezzature dichiarate fuori servizio non si effettuano le registrazioni previste dal presente manuale, perché non vi è alcuna lavorazione né alcuna temperatura da rilevare. L'assenza di registrazioni in quei giorni non costituisce un controllo omesso."));
  b.push(p(inApp
    ? "Ciascun periodo è registrato con la data di inizio, il motivo e la data di ripresa dell'attività, ed è riportato in coda alle schede di sanificazione e delle temperature, dove viene stampato insieme al registro. Un'attrezzatura dichiarata ferma resta visibile nell'elenco degli impianti, con indicazione del motivo e della data dal quale è spenta, e non viene conteggiata fra i controlli del giorno; alla ripresa del funzionamento il periodo viene chiuso e la rilevazione delle temperature riprende regolarmente."
    : "Ciascun periodo è annotato sul registro interessato, con la data di inizio, il motivo e la data di ripresa dell'attività, a cura del responsabile dell'autocontrollo."));
  b.push(p("Alla ripresa dell'attività, prima dell'utilizzo, le attrezzature rimaste ferme sono pulite e sanificate e si verifica che raggiungano la temperatura di esercizio prevista; l'esito è registrato come primo controllo del periodo.", { size: 20 }));
  b.push(par("", { after: 140 }));

  const moduli = elencoModuli(azienda);
  b.push(griglia(["N.", "Modulo", "Frequenza di compilazione"], moduli.map((m) => [m.codice, m.titolo, m.frequenza]), [900, 5000, 3460]));
  b.push(par("", { after: 180 }));
  b.push(p("Allergeni, formazione del personale e controlli analitici non hanno una scheda da compilare: gli allergeni sono riportati nell'elenco descritto al capitolo 11, che l'operatore tiene esposto o a disposizione del consumatore, la formazione è documentata dagli attestati degli alimentaristi e i controlli analitici dai rapporti di prova del laboratorio, tutti conservati in azienda."));
  b.push(par("", { after: 140 }));
  b.push(p("Si allegano inoltre: planimetria dei locali; documento di registrazione sanitaria; schede tecniche e di sicurezza dei prodotti di detergenza; schede tecniche o etichette dei prodotti alimentari acquistati con l'indicazione degli allergeni; dichiarazioni di conformità dei MOCA; attestati di formazione; rapporti di prova delle analisi; documentazione degli interventi di disinfestazione e di manutenzione."));

  // ---------------- 11. dati da completare ----------------
  b.push(h1("13. Dati da completare a cura dell'azienda"));
  b.push(p("I dati che seguono sono quelli che il manuale non può fissare in astratto e che il titolare completa alla prima emissione, aggiornandoli a ogni variazione."));
  b.push(scheda([
    ["Nominativi degli addetti", "________________________________________"],
    ["Ditta autorizzata al ritiro degli oli esausti", "________________________________________"],
    ["Ditta di disinfestazione, se incaricata", "________________________________________"],
    ["Laboratorio di analisi incaricato", "________________________________________"],
    ["Elenco dei fornitori di prodotti pronti", "________________________________________"],
  ]));

  // ---------------- 12. verifica e firme ----------------
  b.push(h1("14. Verifica, riesame e approvazione"));
  [
    "Riesame mensile delle registrazioni da parte del responsabile dell'autocontrollo.",
    "Riesame completo del sistema almeno annuale, anticipato a ogni modifica di locali, attrezzature, lavorazioni o fornitori.",
    "Controllo della taratura dei termometri con strumento di riferimento, almeno annuale.",
    "Verifica periodica del sistema da parte del consulente, con relazione scritta.",
  ].forEach((t) => b.push(punto(t)));

  // La pagina della firma sta da sola: il manuale va firmato dall'OSA, e la
  // firma deve stare su un foglio che si può stampare, firmare e scansionare
  // senza portarsi dietro mezza procedura.
  b.push(saltoPagina());
  b.push(h1("Adozione del manuale"));
  b.push(p(`Il sottoscritto ${azienda.haccp_manager || "____________________________________"}, in qualità di Operatore del Settore Alimentare dell'impresa ${azienda.name || "____________________"}, con sede operativa in ${azienda.sede_operativa || "____________________"},`));
  b.push(h3("dichiara"));
  [
    "di adottare il presente Manuale di Autocontrollo quale piano di autocontrollo dell'impresa, ai sensi dell'art. 5 del Reg. (CE) n. 852/2004;",
    "di averne ricevuto copia e di conoscerne il contenuto;",
    "di applicare le procedure e i monitoraggi in esso descritti, e di farli applicare al personale;",
    "di conservarlo presso la sede operativa, a disposizione dell'Autorità competente;",
    "di aggiornarlo al verificarsi delle condizioni indicate nella matrice delle revisioni.",
  ].forEach((t) => b.push(punto(t)));
  b.push(par("", { after: 300 }));
  b.push(scheda([
    ["Revisione", `${revisione.numero || "00"} — ${data(revisione.data) || "____ / ____ / ________"}`],
    ["Luogo e data", "____________________________________________"],
    ["L'Operatore del Settore Alimentare|(firma leggibile)", firmaOSA(azienda)],
    ["Redazione tecnica", revisione.redattoDa || azienda.consultant_name || ""],
  ]));
  b.push(par("", { after: 200 }));
  b.push(p(azienda.haccp_signature_path && azienda.haccp_signature_consent_at
    ? `La firma riprodotta in calce è quella depositata dall'Operatore del Settore Alimentare nel sistema, apposta a questo documento al momento della generazione su sua autorizzazione resa in data ${data(azienda.haccp_signature_consent_at)}. Non equivale alla firma autografa né dà data certa (art. 20 D.Lgs. 82/2005): per l'una o per l'altra si stampa il documento e lo si firma a mano, oppure lo si firma digitalmente.`
    : "La firma può essere apposta a mano sulla copia stampata, poi scansionata e caricata nel sistema, oppure in forma digitale sul file PDF.",
    { italic: true, size: 20 }));
  b.push(p("La redazione tecnica è indicata a fini di tracciabilità del documento: la responsabilità dell'adozione e dell'applicazione del piano di autocontrollo resta in capo all'Operatore del Settore Alimentare.", { italic: true, size: 20 }));

  return b.join("");
}
