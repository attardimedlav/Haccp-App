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

import { par, cella, tabella, riga } from "../modules/CorsoFormazione";

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
const saltoPagina = () => par("", { saltoPagina: true, after: 0 });

// tabella a due colonne, la prima in grassetto su fondo chiaro
function scheda(righe, larghezze = [3000, 6360]) {
  return tabella(larghezze, righe.map(([k, v]) =>
    riga(
      cella(par(String(k).replace(/\|/g, "\n"), { bold: true, size: 20, after: 40 }), larghezze[0], { sfondo: "F1F4F0" }) +
      cella(par(String(v ?? "").replace(/\|/g, "\n"), { size: 20, after: 40 }), larghezze[1])
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

// Riquadro del diagramma di flusso: una tabella di una sola colonna, con il
// bordo colorato. I CCP escono in rosso, come nei manuali scritti a mano:
// è l'unica cosa che un ispettore cerca guardando il diagramma.
function riquadro(titolo, sotto, marcatore) {
  const critico = /CCP/i.test(marcatore || "");
  const colore = critico ? "A83A2C" : "8FA894";
  const spessore = critico ? 12 : 6;
  const bordi = ["top", "left", "bottom", "right"]
    .map((b) => `<w:${b} w:val="single" w:sz="${spessore}" w:space="0" w:color="${colore}"/>`).join("");
  const dentro = [
    par(titolo, { bold: true, size: 19, align: "center", after: sotto || marcatore ? 30 : 0 }),
    sotto ? par(sotto, { size: 17, align: "center", after: marcatore ? 30 : 0 }) : "",
    marcatore ? par(marcatore, { bold: true, size: 17, align: "center", after: 0, color: critico ? "A83A2C" : "3F5147" }) : "",
  ].join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="6600" w:type="dxa"/><w:jc w:val="center"/>` +
    `<w:tblBorders>${bordi}</w:tblBorders>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="${critico ? "FBEDEC" : "F1F4F0"}"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="6600"/></w:tblGrid>` +
    `<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>` +
    `<w:tc><w:tcPr><w:tcW w:w="6600" w:type="dxa"/>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="${critico ? "FBEDEC" : "F1F4F0"}"/></w:tcPr>${dentro}</w:tc></w:tr></w:tbl>`
  );
}

// Una fase del flusso si scrive "Nome della fase" oppure, per marcarla,
// "Nome della fase | CCP 1" — la stessa barra verticale usata altrove.
function leggiFase(testo, classificazione) {
  const pezzi = String(testo || "").split("|").map((x) => x.trim());
  const nome = pezzi[0];
  const dettaglio = pezzi.length > 2 ? pezzi[1] : "";
  const marcato = pezzi.length > 2 ? pezzi[2] : (pezzi.length === 2 ? pezzi[1] : "");
  // Una fase è critica solo se lo dice il catalogo. Far ereditare la
  // classificazione del ciclo era sbagliato: dentro un ciclo classificato CCP
  // la maggior parte delle fasi non lo è — il servizio al cliente e la
  // dispensa a temperatura ambiente non sono punti critici — e marcarle
  // tutte in rosso dichiara controlli che non esistono.
  const marcatore = marcato || "CP";
  return { nome, dettaglio, marcatore };
}

function diagramma(ciclo) {
  const fuori = [];
  const fasi = (ciclo.flow || []).map((x) => leggiFase(x, ciclo.classification));
  if (!fasi.length) return fuori;
  fuori.push(par(`${ciclo.code} — ${ciclo.name}`, { bold: true, size: 22, align: "center", before: 200, after: 120 }));
  fasi.forEach((f, i) => {
    fuori.push(riquadro(f.nome, f.dettaglio, f.marcatore));
    if (i < fasi.length - 1) fuori.push(par("▼", { size: 16, align: "center", after: 0, color: "6E8B78" }));
  });
  fuori.push(par("CP — punto di controllo     ·     CCP — punto critico di controllo",
    { size: 16, align: "center", before: 120, after: 200, color: "5A6B5E" }));
  return fuori;
}

// --- filtro sui flag dell'azienda ---------------------------------------

// Una voce entra nel manuale se non chiede nessuna casella, oppure se la
// casella che chiede è accesa per questa azienda.
export function vale(voce, azienda) {
  const flag = voce?.requires_flag;
  if (!flag) return true;
  return !!azienda?.[flag];
}

// --- controllo di coerenza prima di generare ----------------------------
//
// Il manuale promette dei controlli: se in azienda non esistono gli impianti,
// il responsabile o i prodotti di sanificazione, quelle promesse restano
// lettera morta. Meglio dirlo prima di generare che scoprirlo in ispezione.
export function controlli(dossier) {
  const { azienda, impianti = [], sanificanti = [], registrazione = null, cicli = [], procedure = [] } = dossier;
  const avvisi = [];
  if (!azienda?.haccp_manager) avvisi.push("Manca il responsabile del piano di autocontrollo: si indica in Configurazione.");
  if (!registrazione) avvisi.push("Manca la registrazione sanitaria: il manuale cita numero, data e autorità competente.");
  if (impianti.length === 0) avvisi.push("Nessun impianto a temperatura controllata censito: il CCP 1 dichiarerebbe un monitoraggio senza apparecchi su cui farlo.");
  if (sanificanti.length === 0) avvisi.push("Nessun prodotto di sanificazione registrato: il piano di pulizia rimanda a schede tecniche che non risultano.");
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
  } = dossier;

  const inApp = azienda.haccp_records_mode !== "cartaceo";
  const cicliAttivi = cicli.filter((c) => vale(c, azienda));
  const procedureAttive = procedure.filter((x) => vale(x, azienda));
  const ccp = cicliAttivi.filter((c) => /^CCP/.test(c.classification));
  const cp = cicliAttivi.filter((c) => !/^CCP/.test(c.classification));
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
  b.push(par("", { after: 240 }));
  b.push(h2("Matrice delle revisioni"));
  b.push(griglia(["Revisione", "Data", "Motivo della revisione", "Redatto", "Resp. HACCP"], [
    [revisione.numero || "00", data(revisione.data) || "__/__/____", revisione.motivo || "Prima emissione",
     revisione.redattoDa || azienda.consultant_name || "", azienda.haccp_manager || ""],
    [" ", " ", " ", " ", " "],
    [" ", " ", " ", " ", " "],
  ], [1200, 1500, 3660, 1500, 1500], { altezza: 420 }));
  b.push(par("", { after: 200 }));
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
  b.push(par("L'indice si aggiorna da solo all'apertura del documento; per rigenerarlo a mano: selezionarlo e premere F9.",
    { italic: true, size: 20, after: 160 }));
  b.push(
    `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>` +
    `<w:fldSimple w:instr=" TOC \\o &quot;1-2&quot; \\h \\z \\u ">` +
    `<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">Indice in aggiornamento…</w:t></w:r>` +
    `</w:fldSimple></w:p>`
  );
  b.push(saltoPagina());

  // ---------------- 1. definizioni ----------------
  b.push(h1("1. Definizioni"));
  b.push(p("Ai fini del presente manuale, e in coerenza con il Codex Alimentarius e con la Circolare del Ministero della Sanità n. 21 del 28 luglio 1995, si intende per:"));
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
  cicliAttivi.forEach((c) => b.push(punto(c.name + (c.intro ? " — " + c.intro : ""))));
  b.push(p("Il manuale è redatto al fine di soddisfare gli obblighi dei Regolamenti comunitari in materia di igiene degli alimenti, e in particolare l'obbligo di predisporre, attuare e mantenere procedure permanenti basate sui principi del sistema HACCP di cui all'art. 5 del Reg. (CE) n. 852/2004."));
  b.push(p("Il titolare si impegna ad acquistare le materie prime esclusivamente da fornitori qualificati e da canali ufficiali, quale prima garanzia di salubrità del prodotto somministrato o venduto."));
  b.push(p("Il manuale non sostituisce il documento di valutazione dei rischi previsto dal D.Lgs. 81/08, che l'impresa redige separatamente.", { italic: true, size: 20 }));

  // ---------------- 3. normative ----------------
  b.push(h1("3. Normative di riferimento"));
  [
    "Regolamento (CE) n. 178/2002 — principi e requisiti generali della legislazione alimentare, rintracciabilità (art. 18), ritiro e richiamo (art. 19).",
    "Regolamento (CE) n. 852/2004 — igiene dei prodotti alimentari, con gli Allegati I e II.",
    "Regolamento (CE) n. 2073/2005 — criteri microbiologici applicabili ai prodotti alimentari.",
    "Regolamento (CE) n. 1935/2004 e Regolamento (CE) n. 2023/2006 — materiali e oggetti a contatto con gli alimenti (MOCA).",
    "Regolamento (UE) n. 1169/2011 — informazioni sugli alimenti ai consumatori, Allegato II sugli allergeni e art. 44 per gli alimenti non preimballati.",
    "Comunicazione della Commissione 2016/C 278/01 — programmi di prerequisito e flessibilità per le piccole imprese.",
    "D.Lgs. 6 novembre 2007, n. 193 — sanzioni in materia di igiene degli alimenti.",
    "D.Lgs. 15 dicembre 2017, n. 231 — sanzioni per la violazione del Reg. (UE) 1169/2011.",
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

  b.push(h2("5.3 Materie prime e destinazione d'uso"));
  b.push(griglia(["Gruppo", "Conservazione"], [
    ["Sfarinati e prodotti secchi", "Dispensa asciutta e fresca, su scaffalature sollevate da terra e distanziate dalle pareti"],
    ["Prodotti deperibili refrigerati", "Refrigerazione a 0/+4 °C, nel rispetto dell'etichetta del produttore"],
    ["Prodotti surgelati", "Congelatore a temperatura non superiore a −18 °C"],
    ["Prodotti pronti acquistati da terzi", "Secondo le indicazioni del fornitore; i freschi sono venduti in giornata"],
    ["Conserve e prodotti in barattolo", "Ambiente; dopo l'apertura travaso in contenitore idoneo, refrigerazione ed etichettatura con la data di apertura"],
    ["Oli e grassi", "Ambiente, al riparo dalla luce e da fonti di calore"],
    ["Bevande", "Ambiente o refrigerazione secondo l'etichetta"],
  ], [3000, 6360]));
  b.push(par("", { after: 160 }));
  b.push(p("I prodotti preparati hanno una doppia destinazione d'uso: consumo immediato all'interno del locale e vendita da asporto. Per l'asporto il prodotto è confezionato in contenitori idonei al contatto con gli alimenti; il personale informa il cliente che il prodotto è destinato al consumo in tempi brevi e che, se non consumato subito, va conservato in frigorifero."));
  b.push(p("I prodotti ottenuti da impasto surgelato o parzialmente cotto sono dichiarati come tali al consumatore, come previsto dal Reg. (UE) n. 1169/2011.", { italic: true, size: 20 }));

  b.push(h2("5.4 Diagrammi di flusso"));
  b.push(p("Il diagramma di flusso rappresenta le fasi che compongono ciascun ciclo, dalla materia prima al prodotto servito, e indica per ognuna se costituisce punto di controllo (CP) o punto critico di controllo (CCP)."));
  cicliAttivi.forEach((c, i) => {
    const d = diagramma(c);
    if (!d.length) return;
    d.forEach((x) => b.push(x));
    // due diagrammi per pagina: più di così si spezzano a metà
    if (i % 2 === 1 && i < cicliAttivi.length - 1) b.push(saltoPagina());
  });
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

  cicliAttivi.forEach((c) => {
    const righe = (c.righe || []).filter((r) => vale(r, azienda));
    b.push(h2(`${c.code} — ${c.name}`));
    b.push(par("Classificazione: " + c.classification, { bold: true, size: 20, color: /^CCP/.test(c.classification) ? "A83A2C" : VERDE_CHIARO, after: 100 }));
    if (c.intro) b.push(p(c.intro));
    // nella riga di testo i marcatori non si scrivono: li porta il diagramma
    if ((c.flow || []).length) {
      const fasi = (c.flow || []).map((x) => leggiFase(x, c.classification).nome);
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
          `${c.classification} — ${c.name}`,
          r.map((x) => x.control_measure).join(" | ").slice(0, 400),
          r.map((x) => x.monitoring).join(" | ").slice(0, 300),
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
  b.push(griglia(["Oggetto del controllo", "Frequenza", "Finalità"], [
    ["Tamponi ambientali su superfici, piani di lavoro e utensili", "Biennale", "Verifica dell'efficacia del piano di pulizia e sanificazione"],
    ["Acqua destinata al consumo umano", "Un campionamento all'anno, alternando il punto di prelievo", "Verifica dei parametri del D.Lgs. 18/2023"],
  ], [3000, 2200, 4160]));
  b.push(par("", { after: 160 }));
  b.push(p("In caso di esito non conforme si applicano le azioni correttive previste dalla fase o dalla procedura interessata, si ripete il campionamento dopo l'intervento e si registra l'esito fra le non conformità."));

  // ---------------- 10. moduli ----------------
  b.push(h1("10. Allegati e moduli di registrazione"));
  b.push(p(inApp
    ? "Le registrazioni sono tenute nell'applicativo gestionale, che conserva anche i documenti di trasporto, le schede tecniche e gli attestati. I moduli cartacei corrispondenti sono allegati al manuale e si utilizzano in caso di indisponibilità del sistema."
    : "Le registrazioni sono tenute sui moduli cartacei allegati al presente manuale, conservati compilati in azienda e messi a disposizione degli organi di controllo."));
  const moduli = [
    ["M01", "Registro temperature", "Una volta al giorno, alla stessa ora", null],
    ["M02", "Registro cambi olio di frittura", "A ogni sostituzione dell'olio", "has_fryer"],
    ["M03", "Acque potabili", "A ogni intervento", null],
    ["M04", "Calendario delle pulizie e sanificazioni", "Secondo il programma di sanificazione", null],
    ["M05", "Arrivo merci e tracciabilità", "A ogni consegna priva di lotto sul documento", null],
    ["M06", "Schede di registrazione fornitori", "All'inserimento e all'aggiornamento", null],
    ["M07", "Registrazione non conformità", "A ogni evento", null],
    ["M08", "Manutenzione impianti e attrezzature", "A ogni intervento", null],
    ["M09", "Monitoraggio insetti e roditori", "Settimanale", null],
    ["M10", "Comunicazione di ritiro del prodotto", "All'occorrenza", null],
    ["M11", "Controllo della macchina del ghiaccio", "Ispezione settimanale, sanificazione mensile", "has_ice_machine"],
    ["M12", "Registro degli abbattimenti", "A ogni ciclo", "has_blast_chiller"],
  ].filter(([, , , flag]) => !flag || azienda[flag]);
  b.push(griglia(["N.", "Modulo", "Frequenza di compilazione"], moduli.map(([n, m, f]) => [n, m, f]), [900, 5000, 3460]));
  b.push(par("", { after: 180 }));
  b.push(p("Allergeni, formazione del personale e controlli analitici non hanno una scheda da compilare: gli allergeni sono riportati nell'elenco che l'operatore tiene esposto o a disposizione del consumatore ai sensi dell'art. 44 del Reg. (UE) n. 1169/2011, la formazione è documentata dagli attestati degli alimentaristi e i controlli analitici dai rapporti di prova del laboratorio, tutti conservati in azienda."));
  b.push(par("", { after: 140 }));
  b.push(p("Si allegano inoltre: planimetria dei locali; documento di registrazione sanitaria; schede tecniche e di sicurezza dei prodotti di detergenza; schede tecniche o etichette dei prodotti alimentari acquistati con l'indicazione degli allergeni; dichiarazioni di conformità dei MOCA; attestati di formazione; rapporti di prova delle analisi; documentazione degli interventi di disinfestazione e di manutenzione."));

  // ---------------- 11. dati da completare ----------------
  b.push(h1("11. Dati da completare a cura dell'azienda"));
  b.push(p("I dati che seguono sono quelli che il manuale non può fissare in astratto e che il titolare completa alla prima emissione, aggiornandoli a ogni variazione."));
  b.push(scheda([
    ["Nominativi degli addetti", "________________________________________"],
    ["Ditta autorizzata al ritiro degli oli esausti", "________________________________________"],
    ["Ditta di disinfestazione, se incaricata", "________________________________________"],
    ["Laboratorio di analisi incaricato", "________________________________________"],
    ["Elenco dei fornitori di prodotti pronti", "________________________________________"],
  ]));

  // ---------------- 12. verifica e firme ----------------
  b.push(h1("12. Verifica, riesame e approvazione"));
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
    ["L'Operatore del Settore Alimentare|(firma leggibile)", (azienda.haccp_manager || "") + "\n\n\n____________________________________________"],
    ["Redazione tecnica", revisione.redattoDa || azienda.consultant_name || ""],
  ]));
  b.push(par("", { after: 200 }));
  b.push(p("La firma può essere apposta a mano sulla copia stampata, poi scansionata e caricata nel sistema, oppure in forma digitale sul file PDF.", { italic: true, size: 20 }));
  b.push(p("La redazione tecnica è indicata a fini di tracciabilità del documento: la responsabilità dell'adozione e dell'applicazione del piano di autocontrollo resta in capo all'Operatore del Settore Alimentare.", { italic: true, size: 20 }));

  return b.join("");
}
