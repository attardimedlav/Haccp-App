import React, { useEffect, useRef, useState } from "react";
import { FileDown, AlertTriangle } from "lucide-react";
import { useAuth } from "../AuthContext";
import { par, tabella, riga, cella, pacchettoDocx } from "./CorsoFormazione";
import { uploadAttachment } from "../hooks/useAttachment";

// Documenti accessori al DVR.
//
// Perche' generati e non riempiti da modello: questi documenti cambiano forma
// a seconda del caso concreto. La lettera di designazione degli incaricati
// all'emergenza ha un numero di nomi variabile e a ciascuno va scritto
// l'incarico che ha davvero; il verbale dell'art. 36 ha una riga per ogni
// presente; il verbale di elezione del RLS cambia comma a seconda di quanti
// lavoratori ha l'azienda. La sostituzione dei segnaposto riempie caselle,
// non moltiplica righe e non sceglie il testo.
//
// E soprattutto: un documento costruito dai dati dell'azienda aperta non puo'
// portarsi dietro il nome di un altro cliente, ne' il genere sbagliato, ne'
// due date diverse nello stesso foglio. Sono i tre difetti trovati nei
// documenti reali da cui nasce questa scheda.

const DATORE_ROLES = ["Datore di Lavoro", "RSPP Datore di Lavoro"];
const ANTINCENDIO_ROLE = "Addetto Antincendio";
const PRIMO_ROLE = "Addetto al Primo Soccorso";
const RLS_ROLE = "RLS";
const RSPP_DL_ROLE = "RSPP Datore di Lavoro";
const RSPP_EXT_ROLE = "RSPP Esterno";
const MEDICO_ROLE = "Nomina Medico Competente";
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Firma e timbro del medico competente. Il file sta fra le risorse statiche
// (cartella "public" del repo), come i modelli delle nomine: si sostituisce
// caricandone uno nuovo, senza toccare il codice. Se non c'e' o non si carica,
// i documenti escono con la sola riga da firmare a penna: mai un errore.
const FIRMA_MEDICO = "/firma-attardi.png";
const LARGHEZZA_FIRMA_EMU = 1800000; // 5 cm — 1 cm = 360000 EMU

// Legge larghezza e altezza dal blocco IHDR del PNG (byte 16-23) invece di
// decodificare l'immagine: serve solo il rapporto per non deformarla.
async function caricaFirma(url) {
  try {
    const risposta = await fetch(url);
    if (!risposta.ok) return null;
    const bytes = new Uint8Array(await risposta.arrayBuffer());
    if (bytes.length < 24) return null;
    const px = (i) => (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
    const larghezza = px(16);
    const altezza = px(20);
    if (!larghezza || !altezza) return null;
    let binario = "";
    for (let i = 0; i < bytes.length; i += 1) binario += String.fromCharCode(bytes[i]);
    return {
      base64: btoa(binario),
      cx: LARGHEZZA_FIRMA_EMU,
      cy: Math.round((LARGHEZZA_FIRMA_EMU * altezza) / larghezza),
    };
  } catch (e) {
    return null;
  }
}

function runImmagine(firma) {
  if (!firma) return "";
  return (
    `<w:p><w:pPr><w:spacing w:before="120" w:after="0"/><w:jc w:val="center"/></w:pPr>` +
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${firma.cx}" cy="${firma.cy}"/><wp:docPr id="7" name="Firma"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="7" name="firma.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId20"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${firma.cx}" cy="${firma.cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
}

// Aggiunge l'immagine al pacchetto .docx prodotto da pacchettoDocx: la parte
// binaria, la relazione rId20 e il tipo di contenuto per le PNG, piu' il
// namespace del disegno sull'elemento radice, che pacchettoDocx non dichiara.
function impacchetta(corpo, firma) {
  const files = pacchettoDocx(corpo);
  if (!firma) return files;
  files["word/document.xml"] = files["word/document.xml"].replace(
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
    ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
  );
  files["[Content_Types].xml"] = files["[Content_Types].xml"].replace(
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>\n<Default Extension="png" ContentType="image/png"/>'
  );
  files["word/_rels/document.xml.rels"] = files["word/_rels/document.xml.rels"].replace(
    "</Relationships>",
    '<Relationship Id="rId20" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/firma.png"/></Relationships>'
  );
  files["word/media/firma.png"] = { base64: firma.base64 };
  return files;
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

// Allegato 2 del D.Lgs. 81/08: e' l'allegato che stabilisce fino a quanti
// lavoratori il datore di lavoro puo' svolgere direttamente i compiti del
// servizio di prevenzione e protezione, del primo soccorso e della
// prevenzione incendi (art. 34, comma 1).
const ALLEGATO2 = [
  { id: "artigiane", label: "azienda artigiana o industriale", limite: 30 },
  { id: "agricole", label: "azienda agricola o zootecnica", limite: 10 },
  { id: "pesca", label: "azienda della pesca", limite: 20 },
  { id: "altre", label: "azienda diversa dalle precedenti", limite: 200 },
];

// Contenuti dell'informazione, art. 36 commi 1 e 2 del D.Lgs. 81/08.
const ARGOMENTI_36 = [
  "i rischi per la salute e la sicurezza connessi all'attività dell'impresa in generale",
  "le procedure che riguardano il primo soccorso, la lotta antincendio e l'evacuazione dei luoghi di lavoro",
  "i nominativi dei lavoratori incaricati di applicare le misure di primo soccorso, di prevenzione incendi e di evacuazione",
  "il nominativo del Responsabile del Servizio di Prevenzione e Protezione e del Medico Competente",
  "i rischi specifici cui è esposto ciascun lavoratore in relazione alla mansione svolta",
  "le normative di sicurezza e le disposizioni aziendali in materia di prevenzione e protezione",
  "i pericoli connessi all'uso delle sostanze e delle miscele pericolose impiegate",
  "le misure e le attività di protezione e prevenzione adottate dall'azienda",
  "l'uso corretto delle attrezzature di lavoro e dei dispositivi di protezione individuale (DPI)",
];

function nomeCompleto(e) {
  return `${e?.first_name || ""} ${e?.last_name || ""}`.trim();
}

function oggi() {
  return new Date().toISOString().slice(0, 10);
}

// Ricava il comune dalla sede ("... 95037 San Giovanni La Punta (CT)" ->
// "San Giovanni La Punta"): serve al luogo di sottoscrizione. Se l'indirizzo
// non ha questa forma torna vuoto e il campo resta da compilare a mano.
function comuneDa(indirizzo) {
  const m = String(indirizzo || "").match(/\b\d{5}\s+([^,(\n]+)/);
  return m ? m[1].trim() : "";
}

function dataItaliana(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  return d ? `${d}/${m}/${y}` : String(iso);
}

function dataDistesa(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!d) return String(iso);
  return `l'anno ${y}, il giorno ${d} del mese di ${MESI[Number(m) - 1]}`;
}

function pulisciNomeFile(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

// --- mattoni comuni ai documenti --------------------------------------------

function intestazione(d) {
  return (
    par(d.azienda, { bold: true, size: 24, align: "center", after: 20 }) +
    par(d.sede, { size: 18, align: "center", after: 20 }) +
    (d.piva ? par(`C.F. / P.IVA: ${d.piva}`, { size: 18, align: "center", after: 40 }) : "") +
    par("", { bordoSotto: true, after: 240 })
  );
}

function titolo(testo, riferimento) {
  return (
    par(testo, { bold: true, size: 23, align: "center", after: 60 }) +
    (riferimento ? par(riferimento, { italic: true, size: 18, align: "center", after: 240 }) : "")
  );
}

function testo(t, o = {}) {
  return par(t, { size: 20, interlinea: 280, after: 120, align: o.align || "both", ...o });
}

function punti(voci) {
  return voci.map((v) => par(`•  ${v}`, { size: 20, interlinea: 280, after: 60 })).join("");
}

function sezione(t) {
  return par(t, { bold: true, size: 20, before: 200, after: 100 });
}

function firmeAffiancate(sinistra, destra, o = {}) {
  const L = [4800, 4800];
  // Etichetta e spazio della firma stanno nella stessa cella di una riga sola,
  // marcata "non spezzare": altrimenti Word manda la firma alla pagina dopo e
  // il documento esce con i nomi su un foglio e le firme su quello successivo.
  const colonna = (etichetta, immagine) => {
    if (!etichetta) return par("", {});
    return (
      par(etichetta, { align: "center", bold: true, size: 18, before: 300 }) +
      (immagine
        ? runImmagine(immagine)
        : par("_______________________________", { align: "center", size: 18, before: 260 }))
    );
  };
  const rigaUnica =
    `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
    cella(colonna(sinistra, o.firmaSinistra), L[0]) +
    cella(colonna(destra, o.firmaDestra), L[1]) +
    `</w:tr>`;
  return tabella(L, [rigaUnica], { senzaBordi: true });
}

// Elenco dei lavoratori con lo spazio per la firma. La colonna delle note
// serve ai casi reali (maternita', assenza, part-time): stanno scritti dove
// si vedono, invece che aggiunti a penna dopo.
function tabellaPresenti(persone) {
  const L = [520, 3300, 2500, 3280];
  const testa = riga(
    cella(par("N.", { bold: true, size: 17, align: "center" }), L[0], { sfondo: "EDEFEA" }) +
    cella(par("COGNOME E NOME", { bold: true, size: 17 }), L[1], { sfondo: "EDEFEA" }) +
    cella(par("MANSIONE", { bold: true, size: 17 }), L[2], { sfondo: "EDEFEA" }) +
    cella(par("FIRMA", { bold: true, size: 17, align: "center" }), L[3], { sfondo: "EDEFEA" }),
    { intestazione: true }
  );
  const corpo = persone.map((p, i) => riga(
    cella(par(String(i + 1), { align: "center", size: 18 }), L[0]) +
    cella(par(p.nome, { size: 18 }), L[1]) +
    cella(par(p.mansione || "", { size: 17 }), L[2]) +
    cella(par(p.nota || "", { size: 17, italic: true, align: "center" }), L[3]),
    { altezza: 420 }
  ));
  return tabella(L, [testa, ...corpo]);
}

// --- 0. servizio di prevenzione e protezione --------------------------------

// Compiti del RSPP, art. 33 comma 1. Sono gli stessi nei due documenti: li
// assume il datore di lavoro quando svolge direttamente l'incarico, li riceve
// il professionista esterno quando viene designato.
const COMPITI_RSPP = [
  "individuare i fattori di rischio, valutare i rischi e individuare le misure per la sicurezza e la salubrità degli ambienti di lavoro (art. 33, comma 1, lett. a);",
  "elaborare le misure preventive e protettive e i sistemi di controllo di tali misure (lett. b);",
  "elaborare le procedure di sicurezza per le varie attività aziendali (lett. c);",
  "proporre i programmi di informazione e formazione dei lavoratori (lett. d);",
  "partecipare alle consultazioni in materia di tutela della salute e sicurezza sul lavoro e alla riunione periodica di cui all'art. 35 (lett. e);",
  "fornire ai lavoratori le informazioni di cui all'art. 36 (lett. f).",
];

export function corpoRsppDatore(d) {
  const classe = ALLEGATO2.find((c) => c.id === d.tipologia) || ALLEGATO2[3];
  return (
    intestazione(d) +
    titolo(
      "DICHIARAZIONE DI SVOLGIMENTO DIRETTO DA PARTE DEL DATORE DI LAVORO DEI COMPITI DEL SERVIZIO DI PREVENZIONE E PROTEZIONE",
      "(ai sensi degli artt. 17, comma 1, lett. b), 31, 34 e dell'ALLEGATO 2 del D.Lgs. 9 aprile 2008, n. 81 e s.m.i.)"
    ) +
    testo(`Il sottoscritto ${d.datore}, legale rappresentante e datore di lavoro di ${d.azienda}, con sede in ${d.sede},`) +
    par("PREMESSO", { bold: true, align: "center", size: 20, before: 200, after: 100 }) +
    punti([
      "che la designazione del responsabile del servizio di prevenzione e protezione è attribuzione non delegabile del datore di lavoro, ai sensi dell'art. 17, comma 1, lett. b), del D.Lgs. 81/08;",
      "che l'azienda non rientra fra quelle di cui all'art. 31, comma 6, del medesimo decreto, per le quali il servizio di prevenzione e protezione deve essere interno;",
      `che l'azienda, quale ${classe.label}, occupa n. ${d.numeroLavoratori} lavoratori e rientra pertanto entro il limite di ${classe.limite} addetti fissato dall'ALLEGATO 2 del D.Lgs. 81/08, che consente al datore di lavoro lo svolgimento diretto dei compiti del servizio di prevenzione e protezione;`,
    ]) +
    par("DICHIARA DI ASSUMERE", { bold: true, align: "center", size: 20, before: 220, after: 100 }) +
    testo("i compiti del servizio di prevenzione e protezione dai rischi della propria azienda, obbligandosi a:", { after: 60 }) +
    punti(COMPITI_RSPP) +
    testo("Il sottoscritto dichiara di aver frequentato il corso di formazione previsto dall'art. 34, comma 2, del D.Lgs. 81/08, come da attestato allegato, e si impegna all'aggiornamento periodico previsto dal comma 3 del medesimo articolo e dall'Accordo Stato-Regioni del 17 aprile 2025.", { before: 140 }) +
    testo("L'incarico è assunto a tempo indeterminato e viene meno al venir meno dei presupposti sopra richiamati, in particolare al superamento dei limiti dell'ALLEGATO 2, nel qual caso il datore di lavoro provvederà a designare un responsabile del servizio di prevenzione e protezione in possesso dei requisiti dell'art. 32.") +
    testo(`${d.luogo ? d.luogo + ", " : ""}${dataItaliana(d.data)}`, { align: "left", before: 220, bold: true }) +
    firmeAffiancate(
      "Il Datore di Lavoro\n" + d.datore,
      d.rlsNome
        ? "Per presa visione\nil Rappresentante dei Lavoratori\n" + d.rlsNome
        : "Per presa visione\nil Rappresentante dei Lavoratori per la Sicurezza"
    ) +
    testo("Si allega: attestato di frequenza al corso per datore di lavoro che svolge direttamente i compiti di RSPP (art. 34, comma 2).", { before: 400, size: 18, italic: true })
  );
}

export function corpoRsppEsterno(d) {
  return (
    intestazione(d) +
    testo("Spett.le", { after: 20, align: "left" }) +
    testo(d.rsppNome, { bold: true, after: 20, align: "left" }) +
    (d.rsppQualifica ? testo(d.rsppQualifica, { after: 20, align: "left" }) : "") +
    (d.rsppIndirizzo ? testo(d.rsppIndirizzo, { after: 200, align: "left" }) : par("", { after: 200 })) +
    titolo(
      "DESIGNAZIONE DEL RESPONSABILE DEL SERVIZIO DI PREVENZIONE E PROTEZIONE",
      "(ai sensi degli artt. 17, comma 1, lett. b), 31, 32 e 33 del D.Lgs. 9 aprile 2008, n. 81 e s.m.i.)"
    ) +
    testo(`Il sottoscritto ${d.datore}, in qualità di datore di lavoro e legale rappresentante di ${d.azienda}, con sede in ${d.sede}, con la presente La designa Responsabile del Servizio di Prevenzione e Protezione dell'azienda.`) +
    testo("La designazione avviene avendo verificato il possesso delle capacità e dei requisiti professionali richiesti dall'art. 32 del D.Lgs. 81/08: titolo di studio non inferiore al diploma di istruzione secondaria superiore e attestati di frequenza, con verifica dell'apprendimento, ai corsi di formazione dei moduli A, B e C, con i relativi aggiornamenti periodici.") +
    testo("In qualità di Responsabile del Servizio di Prevenzione e Protezione Le competono i compiti previsti dall'art. 33 del D.Lgs. 81/08, e in particolare:", { after: 60 }) +
    punti(COMPITI_RSPP) +
    testo("Il datore di lavoro si impegna a fornirLe le informazioni di cui all'art. 18, comma 1, lett. o) e p), nonché i mezzi e il tempo adeguati allo svolgimento dei compiti affidati, ai sensi dell'art. 31, comma 2. Ella è tenuto al segreto in ordine ai processi lavorativi di cui viene a conoscenza nell'esercizio delle funzioni, ai sensi dell'art. 33, comma 2.", { before: 120 }) +
    testo("Si ricorda infine che il Responsabile del Servizio di Prevenzione e Protezione partecipa alla riunione periodica di cui all'art. 35 del D.Lgs. 81/08, nei casi in cui essa è prevista.") +
    testo(`${d.luogo ? d.luogo + ", " : ""}${dataItaliana(d.data)}`, { align: "left", before: 200, bold: true }) +
    firmeAffiancate("Il Datore di Lavoro\n" + d.datore, "Per accettazione\nIl Responsabile del S.P.P.\n" + d.rsppNome)
  );
}

// --- 1. designazione degli incaricati all'emergenza --------------------------

export function corpoDesignazione(d) {
  const conAnt = d.designati.some((p) => p.antincendio);
  const conPs = d.designati.some((p) => p.primo);
  const funzione = (p) =>
    p.antincendio && p.primo ? "Incaricato antincendio, evacuazione e primo soccorso"
      : p.antincendio ? "Incaricato antincendio ed evacuazione"
        : "Incaricato primo soccorso";

  const compiti = [];
  if (conAnt) {
    compiti.push("Prevenzione incendi e lotta antincendio: sovrintendere al rispetto delle norme di prevenzione incendi nei locali aziendali e intervenire tempestivamente, in caso di principio di incendio, con i mezzi di estinzione disponibili (estintori, idranti) secondo le procedure apprese nella formazione specifica.");
    compiti.push("Evacuazione e gestione delle emergenze: attuare e coordinare le procedure di evacuazione dei lavoratori, del personale presente e dei visitatori verso i punti di raccolta stabiliti, in caso di pericolo grave e immediato; collaborare al mantenimento dell'efficienza e della fruibilità delle vie e delle uscite di emergenza.");
  }
  if (conPs) {
    compiti.push("Primo soccorso: prestare la prima assistenza ai lavoratori in caso di infortunio o malore nei luoghi di lavoro; attivare senza indugio il servizio pubblico di emergenza (NUE 112) e agevolare l'arrivo dei mezzi di soccorso fornendo le indicazioni necessarie.");
  }
  compiti.push("Rapporti con i servizi esterni: interfacciarsi con i Vigili del Fuoco, con il personale sanitario e con i soccorritori esterni fornendo ogni informazione utile sullo stato dell'emergenza e sui luoghi.");

  const formazione = [];
  if (conAnt) formazione.push("la formazione in materia di prevenzione incendi, lotta antincendio ed evacuazione prevista dall'art. 46 del D.Lgs. 81/08 e dal D.M. 2 settembre 2021, con il relativo aggiornamento periodico");
  if (conPs) formazione.push("la formazione in materia di primo soccorso prevista dall'art. 45 del D.Lgs. 81/08 e dal D.M. 388/2003, con l'aggiornamento almeno triennale della capacità di intervento pratico");

  const L = [3600, 3400, 2600];
  const tabIncaricati = tabella(L, [
    riga(
      cella(par("NOMINATIVO", { bold: true, size: 17 }), L[0], { sfondo: "EDEFEA" }) +
      cella(par("INCARICO ASSEGNATO", { bold: true, size: 17 }), L[1], { sfondo: "EDEFEA" }) +
      cella(par("UNITÀ PRODUTTIVA", { bold: true, size: 17 }), L[2], { sfondo: "EDEFEA" }),
      { intestazione: true }
    ),
    ...d.designati.map((p) => riga(
      cella(par(p.nome, { size: 18 }), L[0]) +
      cella(par(funzione(p), { size: 17 }), L[1]) +
      cella(par(d.sede, { size: 16 }), L[2]),
      { altezza: 340 }
    )),
  ]);

  return (
    intestazione(d) +
    titolo(
      "LETTERA DI DESIGNAZIONE DEGLI INCARICATI ALL'ATTUAZIONE DELLE MISURE DI PREVENZIONE INCENDI, LOTTA ANTINCENDIO, EVACUAZIONE E PRIMO SOCCORSO",
      "(ai sensi degli artt. 18, comma 1, lett. b), 43, 45 e 46 del D.Lgs. 9 aprile 2008, n. 81 e s.m.i.)"
    ) +
    testo("Egr./Gent.mi Lavoratori incaricati:", { after: 60 }) +
    punti(d.designati.map((p) => `${p.nome} — ${funzione(p)}`)) +
    testo(`Il sottoscritto ${d.datore}, in qualità di legale rappresentante e datore di lavoro di ${d.azienda}, Vi comunica formalmente la Vostra designazione quali lavoratori incaricati dell'attuazione delle misure di prevenzione incendi, lotta antincendio, evacuazione dei luoghi di lavoro, gestione delle emergenze e primo soccorso aziendale, per l'unità produttiva di ${d.sede}.`, { before: 160 }) +
    sezione("1. OGGETTO DELL'INCARICO") +
    testo("Vi sono affidati i seguenti compiti operativi e organizzativi:", { after: 60 }) +
    punti(compiti) +
    sezione("2. FORMAZIONE E AGGIORNAMENTO") +
    testo("Ai sensi dell'art. 43, comma 3, del D.Lgs. 81/08, l'azienda provvede ad assicurarVi, a proprie spese e durante l'orario di lavoro:", { after: 60 }) +
    punti(formazione) +
    sezione("3. OBBLIGATORIETÀ DELL'INCARICO E MEZZI A DISPOSIZIONE") +
    testo("Ai sensi dell'art. 43, comma 3, del D.Lgs. 81/08 i lavoratori designati non possono, se non per giustificato motivo, rifiutare la designazione. Essi devono disporre di attrezzature adeguate, tenuto conto delle dimensioni dell'azienda e dei rischi specifici presenti.") +
    sezione("4. ELENCO DEGLI INCARICATI DESIGNATI") +
    tabIncaricati +
    testo("La presente designazione ha efficacia immediata ed è conservata nella documentazione aziendale in materia di salute e sicurezza sul lavoro.", { before: 200 }) +
    testo(`${d.luogo ? d.luogo + ", " : ""}${dataItaliana(d.data)}`, { align: "left", before: 200, bold: true }) +
    tabella([4800, 4800], [
      riga(
        cella(
          par("Il Datore di Lavoro", { align: "center", bold: true, size: 18, before: 300 }) +
          par(d.datore, { align: "center", size: 18, after: 40 }) +
          par("_______________________________", { align: "center", size: 18, before: 300 }),
          4800
        ) +
        cella(
          par("Per presa visione e accettazione", { align: "center", bold: true, size: 18, before: 300 }) +
          par("i Lavoratori designati", { align: "center", bold: true, size: 18, after: 40 }) +
          d.designati.map((p) =>
            par(`____________________  (${p.nome})`, { align: "center", size: 17, before: 300 })).join(""),
          4800
        )
      ),
    ], { senzaBordi: true })
  );
}

// --- 2. svolgimento diretto da parte del datore di lavoro --------------------

export function corpoSvolgimento(d, tipo) {
  const antincendio = tipo === "antincendio";
  const compito = antincendio
    ? "addetto all'attuazione delle misure di prevenzione incendi, lotta antincendio ed evacuazione"
    : "addetto al primo soccorso";
  const classe = ALLEGATO2.find((c) => c.id === d.tipologia) || ALLEGATO2[3];

  return (
    intestazione(d) +
    titolo(
      `SVOLGIMENTO DIRETTO DA PARTE DEL DATORE DI LAVORO DEI COMPITI DI ${compito.toUpperCase()}`,
      "(ai sensi degli artt. 18, 34, comma 1, e 43, comma 1, lett. b) del D.Lgs. 9 aprile 2008, n. 81 e s.m.i.)"
    ) +
    testo(`Il sottoscritto ${d.datore}, legale rappresentante e datore di lavoro di ${d.azienda}, con sede legale e operativa in ${d.sede},`) +
    par("PREMESSO", { bold: true, align: "center", size: 20, before: 200, after: 100 }) +
    punti([
      "che l'azienda non rientra fra quelle di cui all'art. 31, comma 6, del D.Lgs. 81/08, per le quali lo svolgimento diretto è precluso;",
      `che l'azienda, quale ${classe.label}, occupa n. ${d.numeroLavoratori} lavoratori e rientra pertanto entro il limite di ${classe.limite} addetti fissato dall'ALLEGATO 2 del D.Lgs. 81/08, che consente al datore di lavoro lo svolgimento diretto dei compiti di ${compito};`,
      antincendio
        ? "di aver frequentato il corso di formazione previsto dall'art. 46 del D.Lgs. 81/08 e dal D.M. 2 settembre 2021, come da attestato allegato;"
        : "di aver frequentato il corso di formazione previsto dall'art. 45 del D.Lgs. 81/08 e dal D.M. 388/2003, come da attestato allegato;",
    ]) +
    par("DICHIARA DI ASSUMERE", { bold: true, align: "center", size: 20, before: 220, after: 100 }) +
    testo(`l'incarico di ${compito} per la propria azienda.`) +
    testo("La scelta discende dalla comprovata capacità e attitudine personale del sottoscritto, che si impegna a organizzare il servizio nel rispetto di tutti i compiti previsti, espressamente e implicitamente, dal D.Lgs. 81/08 e s.m.i. L'attribuzione dell'incarico è a tempo indeterminato e viene meno con la comunicazione scritta della sua revoca.") +
    testo(`${d.luogo ? d.luogo + ", " : ""}${dataItaliana(d.data)}`, { align: "left", before: 220, bold: true }) +
    firmeAffiancate(
      "Il Datore di Lavoro\n" + d.datore,
      d.rlsNome
        ? "Per presa visione\nil Rappresentante dei Lavoratori\n" + d.rlsNome
        : "Per presa visione\nil Rappresentante dei Lavoratori per la Sicurezza"
    ) +
    testo("Si allega: attestato di frequenza al corso di formazione richiamato in premessa.", { before: 400, size: 18, italic: true })
  );
}

// --- 3. verbale di elezione / designazione del RLS ---------------------------

export function corpoRls(d) {
  const oltre15 = d.numeroLavoratori > 15;
  // Il comma applicabile cambia con la dimensione dell'azienda: sotto i 15
  // lavoratori il RLS e' eletto direttamente dai lavoratori al loro interno
  // (art. 47 c. 3); sopra i 15 e' eletto o designato nell'ambito delle
  // rappresentanze sindacali aziendali e, in loro assenza, dai lavoratori al
  // loro interno (art. 47 c. 4). Scriverlo giusto e' il punto del verbale.
  const comma = oltre15
    ? "l'art. 47, comma 4, del D.Lgs. 81/08 prevede che nelle aziende con più di 15 lavoratori il Rappresentante dei Lavoratori per la Sicurezza sia eletto o designato dai lavoratori nell'ambito delle rappresentanze sindacali aziendali e, in loro assenza, sia eletto dai lavoratori al loro interno"
    : "l'art. 47, comma 3, del D.Lgs. 81/08 prevede che nelle aziende che occupano fino a 15 lavoratori il Rappresentante dei Lavoratori per la Sicurezza sia eletto direttamente dai lavoratori al loro interno";

  if (d.modo === "rlst") {
    return (
      intestazione(d) +
      titolo(
        "VERBALE DI MANCATA ELEZIONE DEL RAPPRESENTANTE DEI LAVORATORI PER LA SICUREZZA",
        "(ai sensi degli artt. 47 e 48 del D.Lgs. 9 aprile 2008, n. 81 e s.m.i.)"
      ) +
      testo(`${dataDistesa(d.data)}, presso la sede di ${d.azienda} in ${d.sede}, si sono riuniti i lavoratori dell'azienda, convocati per procedere all'elezione del Rappresentante dei Lavoratori per la Sicurezza.`) +
      sezione("RISULTANO PRESENTI I SEGUENTI LAVORATORI") +
      tabellaPresenti(d.presenti) +
      par("PREMESSO CHE", { bold: true, align: "center", size: 20, before: 240, after: 100 }) +
      punti([
        comma + ";",
        "i lavoratori sono stati preventivamente informati sui compiti, sulle attribuzioni e sulle prerogative del Rappresentante dei Lavoratori per la Sicurezza;",
      ]) +
      par("SI DÀ ATTO CHE", { bold: true, align: "center", size: 20, before: 220, after: 100 }) +
      testo("i lavoratori presenti, pur regolarmente informati e convocati, hanno dichiarato di non procedere all'elezione del Rappresentante dei Lavoratori per la Sicurezza al proprio interno.") +
      testo("Le attribuzioni del Rappresentante dei Lavoratori per la Sicurezza sono pertanto esercitate dal Rappresentante dei Lavoratori per la Sicurezza Territoriale (RLST), ai sensi dell'art. 48 del D.Lgs. 81/08. Il Datore di Lavoro provvede agli adempimenti conseguenti, ivi compreso il versamento del contributo al fondo di cui all'art. 52 del medesimo decreto ove dovuto.") +
      testo(`${d.luogo ? d.luogo + ", " : ""}${dataItaliana(d.data)}`, { align: "left", before: 240, bold: true }) +
      firmeAffiancate("Il Datore di Lavoro\n" + d.datore, "")
    );
  }

  const designato = d.modo === "rsa";
  return (
    intestazione(d) +
    titolo(
      designato
        ? "VERBALE DI DESIGNAZIONE DEL RAPPRESENTANTE DEI LAVORATORI PER LA SICUREZZA"
        : "VERBALE DI ELEZIONE DEL RAPPRESENTANTE DEI LAVORATORI PER LA SICUREZZA",
      "(ai sensi degli artt. 47 e 50 del D.Lgs. 9 aprile 2008, n. 81 e s.m.i.)"
    ) +
    testo(`${dataDistesa(d.data)}, presso la sede di ${d.azienda} in ${d.sede}, si sono riuniti i lavoratori dell'azienda per procedere ${designato ? "alla designazione" : "all'elezione"} del Rappresentante dei Lavoratori per la Sicurezza.`) +
    sezione("RISULTANO PRESENTI I SEGUENTI LAVORATORI") +
    tabellaPresenti(d.presenti) +
    par("PREMESSO CHE", { bold: true, align: "center", size: 20, before: 240, after: 100 }) +
    punti([
      comma + ";",
      "i lavoratori sono stati preventivamente informati sui compiti, sulle attribuzioni e sulle prerogative del Rappresentante dei Lavoratori per la Sicurezza;",
      designato
        ? "si è proceduto alla designazione nell'ambito delle rappresentanze sindacali aziendali;"
        : "i lavoratori presenti hanno proceduto all'elezione del proprio rappresentante;",
    ]) +
    par("SI DÀ ATTO CHE", { bold: true, align: "center", size: 20, before: 220, after: 100 }) +
    testo(`all'unanimità dei presenti viene ${designato ? "designato" : "eletto"} Rappresentante dei Lavoratori per la Sicurezza il/la Sig./Sig.ra ${d.rlsNome}, che dichiara di accettare l'incarico e di impegnarsi a svolgere le funzioni previste dagli artt. 47 e 50 del D.Lgs. 81/08 e s.m.i.`) +
    testo("Il Datore di Lavoro si impegna a garantire al Rappresentante dei Lavoratori per la Sicurezza:", { after: 60 }) +
    punti([
      "la formazione iniziale obbligatoria prevista dall'art. 37, comma 10, del D.Lgs. 81/08 e dall'Accordo Stato-Regioni del 17 aprile 2025, nonché gli aggiornamenti periodici;",
      "l'esercizio delle attribuzioni e dei diritti riconosciuti dall'art. 50 del D.Lgs. 81/08;",
      "l'accesso alla documentazione aziendale in materia di salute e sicurezza, nei limiti previsti dalla normativa vigente;",
      "il tempo necessario allo svolgimento dell'incarico, senza perdita di retribuzione.",
    ]) +
    testo("Il Datore di Lavoro provvederà inoltre alla comunicazione del nominativo del Rappresentante dei Lavoratori per la Sicurezza all'INAIL, ai sensi dell'art. 18, comma 1, lett. aa), del D.Lgs. 81/08.", { before: 120 }) +
    testo("Il presente verbale viene letto, confermato e sottoscritto dai presenti.", { before: 120 }) +
    testo(`${d.luogo ? d.luogo + ", " : ""}${dataItaliana(d.data)}`, { align: "left", before: 200, bold: true }) +
    firmeAffiancate(
      `Per accettazione dell'incarico\nil Rappresentante dei Lavoratori\n${d.rlsNome}`,
      "Il Datore di Lavoro\n" + d.datore
    )
  );
}

// --- 4. verbale di avvenuta informazione art. 36 -----------------------------

export function corpoArt36(d) {
  return (
    intestazione(d) +
    titolo(
      "VERBALE DI AVVENUTA INFORMAZIONE AI LAVORATORI",
      "(ai sensi dell'art. 36 del D.Lgs. 9 aprile 2008, n. 81 e s.m.i.)"
    ) +
    testo(`Azienda: ${d.azienda}`, { after: 40 }) +
    testo(`Sede: ${d.sede}`, { after: 40 }) +
    testo(`Datore di lavoro: ${d.datore}`, { after: 160 }) +
    par("PREMESSO CHE", { bold: true, align: "center", size: 20, before: 120, after: 100 }) +
    testo("l'art. 36 del D.Lgs. 81/08 stabilisce che il datore di lavoro provveda affinché ciascun lavoratore riceva un'adeguata informazione in materia di salute e sicurezza sul lavoro, e che il contenuto dell'informazione sia facilmente comprensibile e consenta di acquisire le relative conoscenze,") +
    par("SI ATTESTA CHE", { bold: true, align: "center", size: 20, before: 200, after: 100 }) +
    testo(`in data ${dataItaliana(d.data)} il Sig. ${d.datore}, in qualità di datore di lavoro di ${d.azienda}, ha fornito ai lavoratori dell'azienda adeguata informazione in merito a:`, { after: 60 }) +
    punti(d.argomenti) +
    testo("L'informazione è stata resa in forma verbale, con illustrazione della documentazione aziendale di sicurezza, in modo comprensibile per tutti i presenti.", { before: 120 }) +
    testo("Si precisa che l'informazione di cui all'art. 36 non sostituisce la formazione di cui all'art. 37 del D.Lgs. 81/08, che viene erogata separatamente e attestata dai relativi attestati di frequenza.", { size: 18, italic: true }) +
    testo("I lavoratori sottoscritti dichiarano di aver ricevuto le informazioni sopra indicate e si impegnano a rispettare le disposizioni aziendali in materia di sicurezza sul lavoro.", { before: 120 }) +
    tabellaPresenti(d.presenti) +
    testo(`${d.luogo ? d.luogo + ", " : ""}${dataItaliana(d.data)}`, { align: "left", before: 240, bold: true }) +
    firmeAffiancate("Il Datore di Lavoro\n" + d.datore, "") +
    testo("Il presente verbale è redatto e conservato agli atti aziendali ai fini della dimostrazione dell'avvenuta informazione ai sensi dell'art. 36 del D.Lgs. 81/08.", { before: 400, size: 17, italic: true })
  );
}

// --- 5. nomina del medico competente -----------------------------------------

export function corpoMedico(d) {
  const iscrizione = d.medicoIscrizione
    ? ` e della Sua iscrizione all'elenco nazionale dei medici competenti di cui all'art. 38, comma 4, del medesimo decreto (n. ${d.medicoIscrizione})`
    : "";
  return (
    intestazione(d) +
    testo("Spett.le", { after: 20, align: "left" }) +
    testo(d.medicoNome, { bold: true, after: 20, align: "left" }) +
    testo(d.medicoQualifica, { after: 20, align: "left" }) +
    testo(d.medicoStudio, { after: 200, align: "left" }) +
    titolo("NOMINA DEL MEDICO COMPETENTE", "(ai sensi dell'art. 18, comma 1, lett. a), e dell'art. 25 del D.Lgs. 9 aprile 2008, n. 81 e s.m.i.)") +
    testo(`In relazione a quanto stabilito dall'art. 2, comma 1, lett. h), dall'art. 18, comma 1, lett. a), nonché dall'art. 25 e dal Titolo I, Capo III, Sezione V del D.Lgs. 81/08, e in considerazione delle Sue qualifiche professionali${iscrizione}, il sottoscritto ${d.datore}, in qualità di datore di lavoro e legale rappresentante di ${d.azienda}, con sede in ${d.sede}, con la presente La nomina formalmente Medico Competente dell'Azienda.`) +
    testo("L'accettazione della nomina comporta l'assunzione dei compiti e degli obblighi previsti dall'art. 25 del D.Lgs. 81/08, e in particolare:", { after: 60 }) +
    punti([
      "collaborare con il datore di lavoro e con il servizio di prevenzione e protezione alla valutazione dei rischi e alla predisposizione delle misure per la tutela della salute e dell'integrità psico-fisica dei lavoratori;",
      "programmare ed effettuare la sorveglianza sanitaria attraverso protocolli sanitari definiti in funzione dei rischi specifici;",
      "collaborare all'attività di formazione e informazione dei lavoratori per la parte di propria competenza e all'organizzazione del servizio di primo soccorso;",
      "partecipare alla riunione periodica di cui all'art. 35 del D.Lgs. 81/08, nei casi in cui essa è prevista;",
      "istituire, aggiornare e custodire la cartella sanitaria e di rischio di ciascun lavoratore, secondo i requisiti minimi dell'Allegato 3A, nel rispetto del segreto professionale e della normativa sulla protezione dei dati personali (Reg. UE 2016/679 e D.Lgs. 196/2003 come modificato);",
      "visitare gli ambienti di lavoro almeno una volta l'anno, o con la diversa periodicità stabilita in base alla valutazione dei rischi, comunicandola per l'annotazione nel DVR;",
      "comunicare per iscritto, in occasione delle riunioni periodiche, al datore di lavoro, al RSPP e al RLS i risultati anonimi collettivi della sorveglianza sanitaria, fornendo indicazioni sul loro significato;",
      "consegnare al datore di lavoro, alla cessazione dell'incarico, e al lavoratore, alla cessazione del rapporto di lavoro, la documentazione sanitaria in Suo possesso, con le informazioni sulla necessità di conservazione.",
    ]) +
    sezione("VISITE MEDICHE (ART. 41 D.LGS. 81/08)") +
    testo("Ella si impegna a effettuare le visite mediche:", { after: 60 }) +
    punti([
      "preventive, per constatare l'assenza di controindicazioni al lavoro cui il lavoratore è destinato e valutarne l'idoneità alla mansione specifica;",
      "periodiche, per controllare lo stato di salute ed esprimere il giudizio di idoneità alla mansione specifica, di norma con cadenza annuale o diversa se stabilita in funzione della valutazione dei rischi;",
      "su richiesta del lavoratore, quando ritenuta correlata ai rischi professionali;",
      "in occasione del cambio della mansione, per verificare l'idoneità alla mansione specifica;",
      "alla cessazione del rapporto di lavoro, nei casi previsti dalla normativa vigente.",
    ]) +
    testo("Le visite e gli accertamenti integrativi ritenuti necessari sono a cura e spese del datore di lavoro. All'esito Ella esprimerà uno dei giudizi previsti dall'art. 41, comma 6: idoneità; idoneità parziale, temporanea o permanente, con prescrizioni o limitazioni; inidoneità temporanea, con indicazione dei limiti temporali di validità; inidoneità permanente. Il giudizio è comunicato per iscritto al datore di lavoro e al lavoratore.", { before: 120 }) +
    sezione("DURATA E CUSTODIA DELLA DOCUMENTAZIONE") +
    testo(`L'incarico ha durata di ${d.medicoDurata} mesi a decorrere dalla data di sottoscrizione e si intende tacitamente rinnovato salvo revoca o rinuncia di una delle parti, da comunicare in forma scritta con preavviso di almeno 60 (sessanta) giorni.`) +
    testo(`Le cartelle sanitarie e di rischio sono custodite presso lo studio del Medico Competente, in ${d.medicoStudio}, con salvaguardia del segreto professionale.`) +
    testo("La presente è redatta in n. 2 copie di pari tenore; per la validità dell'atto entrambe devono essere sottoscritte dalle parti.") +
    testo(`${d.luogo ? d.luogo + ", " : ""}${dataItaliana(d.data)}`, { align: "left", before: 200, bold: true }) +
    firmeAffiancate(
      "Il Datore di Lavoro\n" + d.datore,
      "Per accettazione\nIl Medico Competente\n" + d.medicoNome,
      { firmaDestra: d.firma }
    )
  );
}

// Il documento viene impacchettato una volta sola: lo stesso file che l'utente
// scarica e' quello che viene allegato alla nomina in Cardine. Se si generasse
// due volte, prima o poi le due copie divergerebbero.
async function costruisciDocx(files) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const [percorso, contenuto] of Object.entries(files)) {
    if (contenuto && typeof contenuto === "object" && contenuto.base64) {
      zip.file(percorso, contenuto.base64, { base64: true });
    } else {
      zip.file(percorso, contenuto);
    }
  }
  return zip.generateAsync({ type: "blob", mimeType: MIME_DOCX });
}

function scaricaBlob(blob, nomeFile) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// --- 6. verbale di riunione periodica (art. 35) ------------------------------

const ODG_RIUNIONE = [
  "il documento di valutazione dei rischi (art. 35, comma 2, lett. a);",
  "l'andamento degli infortuni e delle malattie professionali e della sorveglianza sanitaria (lett. b);",
  "i criteri di scelta, le caratteristiche tecniche e l'efficacia dei dispositivi di protezione individuale (lett. c);",
  "i programmi di informazione e formazione dei dirigenti, dei preposti e dei lavoratori (lett. d).",
];

const TITOLI_ODG = [
  "1. Documento di valutazione dei rischi",
  "2. Andamento degli infortuni, delle malattie professionali e della sorveglianza sanitaria",
  "3. Dispositivi di protezione individuale",
  "4. Informazione e formazione",
];

function partecipanti(righe) {
  const L = [4200, 5400];
  return tabella(L, righe.filter((r) => r[1]).map(([qualifica, nome]) => riga(
    cella(par(qualifica, { size: 18, bold: true }), L[0]) +
    cella(par(nome, { size: 18 }), L[1]),
    { altezza: 320 }
  )));
}

export function corpoRiunione(d) {
  const obbligatoria = d.numeroLavoratori > 15;
  return (
    intestazione(d) +
    titolo(
      "VERBALE DI RIUNIONE PERIODICA",
      "(ai sensi dell'art. 35 del D.Lgs. 9 aprile 2008, n. 81 e s.m.i.)"
    ) +
    testo(`${dataDistesa(d.data)}, presso la sede di ${d.azienda} in ${d.sede}, si è tenuta la riunione periodica di prevenzione e protezione dai rischi, indetta dal datore di lavoro ai sensi dell'art. 35 del D.Lgs. 81/08.`) +
    (obbligatoria
      ? testo(`L'azienda occupa n. ${d.numeroLavoratori} lavoratori: la riunione è indetta con periodicità almeno annuale, come prescritto dall'art. 35, comma 1.`)
      : testo(`L'azienda occupa n. ${d.numeroLavoratori} lavoratori: la riunione non è obbligatoria ai sensi dell'art. 35, comma 1, ed è stata comunque indetta dal datore di lavoro.`)) +
    sezione("PARTECIPANTI") +
    partecipanti([
      ["Datore di lavoro", d.datore],
      ["Responsabile del Servizio di Prevenzione e Protezione", d.rsppRiunione],
      ["Medico competente", d.medicoNome],
      ["Rappresentante dei lavoratori per la sicurezza", d.rlsNome],
    ]) +
    sezione("ORDINE DEL GIORNO") +
    testo("Il datore di lavoro sottopone all'esame dei partecipanti:", { after: 60 }) +
    punti(ODG_RIUNIONE) +
    sezione("SVOLGIMENTO DELLA RIUNIONE") +
    d.punti.map((contenuto, i) =>
      par(TITOLI_ODG[i], { bold: true, size: 19, before: 160, after: 60 }) +
      testo(contenuto && contenuto.trim() ? contenuto : "________________________________________________________________")
    ).join("") +
    sezione("OBIETTIVI DI MIGLIORAMENTO E BUONE PRASSI") +
    testo("Ai sensi dell'art. 35, comma 3, del D.Lgs. 81/08 i partecipanti individuano:", { after: 60 }) +
    testo(d.obiettivi && d.obiettivi.trim() ? d.obiettivi : "________________________________________________________________") +
    testo("Null'altro essendovi da trattare, la riunione si chiude. Il presente processo verbale è redatto ai sensi dell'art. 35, comma 5, del D.Lgs. 81/08 ed è tenuto a disposizione dei partecipanti per la consultazione.", { before: 160 }) +
    testo(`${d.luogo ? d.luogo + ", " : ""}${dataItaliana(d.data)}`, { align: "left", before: 200, bold: true }) +
    firmeAffiancate("Il Datore di Lavoro\n" + d.datore, "Il R.S.P.P.\n" + (d.rsppRiunione || "")) +
    firmeAffiancate(
      "Il Medico Competente\n" + (d.medicoNome || ""),
      "Il R.L.S.\n" + (d.rlsNome || ""),
      { firmaSinistra: d.firma }
    )
  );
}

// --- 7. sopralluogo del medico competente negli ambienti di lavoro -----------

export function corpoSopralluogo(d) {
  const righeAmbienti = String(d.ambienti || "").split("\n").map((r) => r.trim()).filter(Boolean);
  return (
    intestazione(d) +
    titolo(
      "VERBALE DI SOPRALLUOGO NEGLI AMBIENTI DI LAVORO",
      "(ai sensi dell'art. 25, comma 1, lett. l), del D.Lgs. 9 aprile 2008, n. 81 e s.m.i.)"
    ) +
    testo(`${dataDistesa(d.data)} la sottoscritta ${d.medicoNome}, ${d.medicoQualifica}, medico competente di ${d.azienda}, ha effettuato il sopralluogo negli ambienti di lavoro dell'azienda, con sede in ${d.sede}.`) +
    sezione("PRESENTI AL SOPRALLUOGO") +
    partecipanti([
      ["Medico competente", d.medicoNome],
      ["Datore di lavoro", d.datore],
      ["Responsabile del Servizio di Prevenzione e Protezione", d.rsppRiunione],
      ["Rappresentante dei lavoratori per la sicurezza", d.rlsNome],
    ]) +
    sezione("AMBIENTI E REPARTI VISITATI") +
    (righeAmbienti.length
      ? punti(righeAmbienti)
      : testo("________________________________________________________________")) +
    sezione("OSSERVAZIONI") +
    testo(d.osservazioni && d.osservazioni.trim() ? d.osservazioni : "________________________________________________________________") +
    sezione("PROTOCOLLO SANITARIO") +
    testo(d.protocollo && d.protocollo.trim() ? d.protocollo : "________________________________________________________________") +
    sezione("INDICAZIONI E PROPOSTE AL DATORE DI LAVORO") +
    testo(d.indicazioni && d.indicazioni.trim() ? d.indicazioni : "________________________________________________________________") +
    sezione("PERIODICITÀ DEL SOPRALLUOGO") +
    testo(d.periodicita === "annuale"
      ? "Il sopralluogo negli ambienti di lavoro è effettuato con cadenza annuale, ai sensi dell'art. 25, comma 1, lett. l), del D.Lgs. 81/08."
      : `Il sopralluogo negli ambienti di lavoro è effettuato con cadenza ${d.periodicitaAltra || "___________"}, stabilita in base alla valutazione dei rischi. La diversa periodicità viene comunicata al datore di lavoro affinché ne sia data annotazione nel documento di valutazione dei rischi, come previsto dall'art. 25, comma 1, lett. l), del D.Lgs. 81/08.`) +
    testo("Copia del presente verbale è consegnata al datore di lavoro ed è conservata agli atti aziendali insieme al documento di valutazione dei rischi.", { before: 140 }) +
    testo(`${d.luogo ? d.luogo + ", " : ""}${dataItaliana(d.data)}`, { align: "left", before: 200, bold: true }) +
    firmeAffiancate(
      "Il Medico Competente\n" + (d.medicoNome || ""),
      "Il Datore di Lavoro\n" + d.datore,
      { firmaSinistra: d.firma }
    )
  );
}

// --- pannello ----------------------------------------------------------------

export default function DocumentiSicurezza({
  employees = [], appointments = [], onCreaNomina, onAggiornaNomina, onCreaAllegato,
}) {
  const { company } = useAuth();
  const [f, setF] = useState(null);
  const [errore, setErrore] = useState("");
  const [fatto, setFatto] = useState("");
  // Registrare la nomina in Cardine e' il comportamento normale: un documento
  // firmato che non risulta da nessuna parte e' esattamente il problema che
  // questa scheda serve a togliere. Resta disattivabile per le ristampe.
  const [registra, setRegistra] = useState(true);
  // La firma si scarica una volta sola per sessione: e' un file statico.
  const firmaRef = useRef(undefined);
  const firmaMedico = async () => {
    if (firmaRef.current === undefined) firmaRef.current = await caricaFirma(FIRMA_MEDICO);
    return firmaRef.current;
  };

  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const setData = (chiave, valore) => setF((p) => ({ ...p, date: { ...p.date, [chiave]: valore } }));

  // Chi ha un certo incarico: si guarda sia il ruolo in anagrafica sia le
  // nomine registrate, perche' l'uno puo' esserci senza l'altra.
  const haRuolo = (e, ruolo) => {
    const n = nomeCompleto(e);
    return e.security_role === ruolo ||
      appointments.some((a) => a.role === ruolo && (a.person_name || "").trim() === n);
  };

  useEffect(() => {
    if (!company) return;
    if (f && f.presenti.length) return;
    const sede = company.sede_operativa || company.sede_legale || "";
    const nominaDatore = appointments.find((a) => DATORE_ROLES.includes(a.role));
    const empDatore = employees.find((e) => DATORE_ROLES.includes(e.security_role));
    const datore = nominaDatore?.person_name || (empDatore ? nomeCompleto(empDatore) : "");
    const rls = appointments.find((a) => a.role === RLS_ROLE);
    const lavoratori = employees.filter((e) => !DATORE_ROLES.includes(e.security_role));
    const conRuolo = (ruolo) => lavoratori.filter((e) => haRuolo(e, ruolo)).map(nomeCompleto);
    const ant = conRuolo(ANTINCENDIO_ROLE);
    const ps = conRuolo(PRIMO_ROLE);
    const rsppInterno = employees.some((e) => e.security_role === RSPP_DL_ROLE) ||
      appointments.some((a) => a.role === RSPP_DL_ROLE);
    const rsppExt = appointments.find((a) => a.role === RSPP_EXT_ROLE);
    setF({
      // Una data per documento, non una sola: nella pratica il verbale di
      // elezione del RLS, il verbale dell'art. 36 e la nomina del medico
      // competente portano date diverse. Tutte partono da oggi.
      date: {
        rsppDl: oggi(), rsppExt: oggi(),
        designazione: oggi(), svolgAnt: oggi(), svolgPs: oggi(),
        rls: oggi(), art36: oggi(), medico: oggi(),
        riunione: oggi(), sopralluogo: oggi(),
      },
      rsppDatore: rsppInterno || !rsppExt,
      rsppEsterno: !!rsppExt,
      rsppNome: rsppExt?.person_name || "",
      rsppQualifica: "",
      rsppIndirizzo: "",
      luogo: comuneDa(sede),
      sede,
      datore,
      tipologia: "altre",
      // Due spunte indipendenti e non una scelta a tre: il datore di lavoro
      // puo' tenere l'incarico E avere anche dei lavoratori incaricati, ed e'
      // il caso normale quando lavora in reparto.
      antDatore: !ant.length,
      antIncaricati: ant.length > 0,
      psDatore: !ps.length,
      psIncaricati: ps.length > 0,
      incAntincendio: ant,
      incPrimo: ps,
      modoRls: rls ? "eletto" : "rlst",
      rlsNome: rls?.person_name || "",
      argomenti36: ARGOMENTI_36.map(() => true),
      altro36: "",
      presenti: lavoratori.map((e) => ({
        nome: nomeCompleto(e),
        mansione: e.job_role || "",
        presente: true,
        nota: "",
      })),
      medicoNome: "Dott.ssa Attardi Mary Stella",
      medicoQualifica: "Specialista in Medicina del Lavoro",
      medicoStudio: "Via Carabiniere 1, Gravina di Catania",
      medicoIscrizione: "",
      medicoDurata: "12",
      // riunione periodica (art. 35) e sopralluogo del medico competente
      riuRspp: "",
      riuPunti: ["", "", "", ""],
      riuObiettivi: "",
      sopAmbienti: Array.from(new Set(
        employees.map((e) => (e.department || "").trim()).filter(Boolean)
      )).join("\n"),
      sopOsservazioni: "",
      sopProtocollo: "",
      sopIndicazioni: "",
      sopPeriodicita: "annuale",
      sopPeriodicitaAltra: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, employees.length, appointments.length]);

  if (!f) return <p className="sub">Caricamento dei dati dell'azienda...</p>;

  const presentiScelti = f.presenti.filter((p) => p.presente);
  const nomiLavoratori = f.presenti.map((p) => p.nome);

  const base = {
    azienda: company?.name || "",
    piva: company?.piva || "",
    sede: f.sede,
    datore: f.datore,
    luogo: f.luogo,
    tipologia: f.tipologia,
    rlsNome: f.rlsNome,
    numeroLavoratori: f.presenti.length,
  };

  // nomine: elenco di { persona, ruolo } che il documento formalizza. Se la
  // nomina esiste gia' per quella persona e quel ruolo viene aggiornata con la
  // data del documento e con il documento stesso in allegato, invece di
  // crearne una seconda: nomine doppie sullo stesso nome sono gia' costate care.
  const scarica = async (corpo, nome, nomine = [], opzioni = {}) => {
    setErrore("");
    setFatto("");
    if (!f.datore.trim()) { setErrore("Manca il nominativo del datore di lavoro."); return; }
    try {
      const nomeFile = `${nome}_${pulisciNomeFile(company?.name)}.docx`;
      const firma = opzioni.conFirma ? await firmaMedico() : null;
      const blob = await costruisciDocx(impacchetta(typeof corpo === "function" ? corpo(firma) : corpo, firma));
      scaricaBlob(blob, nomeFile);

      const allegato = opzioni.allegato;
      if (!registra || (!nomine.length && !allegato)) return;
      const path = await uploadAttachment(company.id, new File([blob], nomeFile, { type: MIME_DOCX }));

      if (allegato && onCreaAllegato) {
        await onCreaAllegato({
          kind: "allegato",
          title: allegato.titolo,
          doc_date: allegato.data || null,
          attachment_path: path,
          note: allegato.nota || "",
        });
        setFatto(`Registrato in Cardine — "${allegato.titolo}" è ora fra gli allegati al DVR.`);
      }
      if (!nomine.length || !onCreaNomina) return;
      const creati = [];
      const aggiornati = [];
      for (const n of nomine) {
        const persona = (n.persona || "").trim();
        if (!persona) continue;
        const esistente = appointments.find(
          (a) => a.role === n.ruolo && (a.person_name || "").trim() === persona
        );
        if (esistente) {
          await onAggiornaNomina(esistente.id, {
            nomina_issue_date: n.data || null,
            nomina_attachment_path: path,
          });
          aggiornati.push(`${persona} — ${n.ruolo}`);
        } else {
          await onCreaNomina({
            person_name: persona,
            role: n.ruolo,
            nomina_issue_date: n.data || null,
            nomina_attachment_path: path,
          });
          creati.push(`${persona} — ${n.ruolo}`);
        }
      }
      const parti = [];
      if (creati.length) parti.push(`nuove nomine: ${creati.join(", ")}`);
      if (aggiornati.length) parti.push(`nomine aggiornate con il documento: ${aggiornati.join(", ")}`);
      if (parti.length) setFatto(`Registrato in Cardine — ${parti.join("; ")}. Lo trovi in Nomine e Attestati e nell'organigramma.`);
    } catch (e) {
      setErrore("Non è stato possibile generare il documento: " + (e?.message || e));
    }
  };

  const designati = () => {
    const mappa = new Map();
    const aggiungi = (nome, chiave) => {
      const p = f.presenti.find((x) => x.nome === nome);
      if (!mappa.has(nome)) mappa.set(nome, { nome, mansione: p?.mansione || "", antincendio: false, primo: false });
      mappa.get(nome)[chiave] = true;
    };
    if (f.antIncaricati) f.incAntincendio.forEach((n) => aggiungi(n, "antincendio"));
    if (f.psIncaricati) f.incPrimo.forEach((n) => aggiungi(n, "primo"));
    return Array.from(mappa.values());
  };

  const classe = ALLEGATO2.find((c) => c.id === f.tipologia) || ALLEGATO2[3];
  const fuoriSoglia = f.presenti.length > classe.limite;

  const spunta = (campo, nome) => {
    const attuale = f[campo];
    set({ [campo]: attuale.includes(nome) ? attuale.filter((x) => x !== nome) : [...attuale, nome] });
  };

  const cambiaPresente = (i, patch) => {
    const copia = f.presenti.map((p, k) => (k === i ? { ...p, ...patch } : p));
    set({ presenti: copia });
  };

  const listaNomi = (campo) => (
    <ul className="corso-elenco">
      {nomiLavoratori.map((n) => (
        <li key={n}>
          <label className="corso-check">
            <input type="checkbox" checked={f[campo].includes(n)} onChange={() => spunta(campo, n)} />
            <span className="corso-nome">{n}</span>
          </label>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="corso-panel">
      <div className="panel-head">
        <div>
          <h3 style={{ margin: "0 0 6px" }}>Documenti accessori al DVR</h3>
          <p className="sub" style={{ margin: 0 }}>
            I documenti escono compilati con i dati di questa azienda: nomi, mansioni, sede e date
            vengono dall'anagrafica, non da un file riusato. Le spunte servono a dire come sono
            organizzati in concreto gli incarichi.
          </p>
        </div>
      </div>

      {errore && (
        <p className="corso-avviso"><AlertTriangle size={15} /> {errore}</p>
      )}
      {fatto && <p className="corso-esito">{fatto}</p>}

      <label className="corso-check doc-registra">
        <input type="checkbox" checked={registra} onChange={() => setRegistra(!registra)} />
        <span className="corso-nome">
          Registra le nomine in Cardine quando genero il documento — la persona compare
          nell'organigramma e in "Nomine e Attestati", con il documento allegato
        </span>
      </label>

      <div className="corso-sezione">Dati comuni a tutti i documenti</div>
      <div className="moduli-scelta">
        <label className="field-label doc-campo">
          <span>Datore di lavoro</span>
          <input type="text" value={f.datore} onChange={(e) => set({ datore: e.target.value })} />
        </label>
        <label className="field-label doc-campo">
          <span>Sede</span>
          <input type="text" value={f.sede} onChange={(e) => set({ sede: e.target.value })} />
        </label>
        <label className="field-label doc-campo">
          <span>Luogo di sottoscrizione</span>
          <input type="text" value={f.luogo} onChange={(e) => set({ luogo: e.target.value })} />
        </label>
      </div>

      {/* ---- servizio di prevenzione e protezione ---- */}
      <div className="corso-sezione">Servizio di prevenzione e protezione</div>
      <div className="doc-blocco">
        <div className="doc-scelta">
          <label className="corso-check">
            <input type="checkbox" checked={f.rsppDatore}
              onChange={() => set({ rsppDatore: !f.rsppDatore })} />
            <span className="corso-nome">Svolto direttamente dal datore di lavoro (art. 34)</span>
          </label>
          <label className="corso-check">
            <input type="checkbox" checked={f.rsppEsterno}
              onChange={() => set({ rsppEsterno: !f.rsppEsterno })} />
            <span className="corso-nome">Affidato a un RSPP esterno (artt. 31 e 32)</span>
          </label>
        </div>
        {f.rsppEsterno && (
          <div className="moduli-scelta">
            <label className="field-label doc-campo">
              <span>Nominativo del RSPP</span>
              <input type="text" value={f.rsppNome} onChange={(e) => set({ rsppNome: e.target.value })} />
            </label>
            <label className="field-label doc-campo">
              <span>Qualifica</span>
              <input type="text" value={f.rsppQualifica}
                onChange={(e) => set({ rsppQualifica: e.target.value })} />
            </label>
            <label className="field-label doc-campo">
              <span>Indirizzo / studio</span>
              <input type="text" value={f.rsppIndirizzo}
                onChange={(e) => set({ rsppIndirizzo: e.target.value })} />
            </label>
          </div>
        )}
      </div>

      {(f.rsppDatore || f.antDatore || f.psDatore) && (
        <div className="doc-blocco">
          <label className="field-label doc-campo">
            <span>Tipologia dell'azienda ai fini dell'Allegato 2 (limite per lo svolgimento diretto)</span>
            <select value={f.tipologia} onChange={(e) => set({ tipologia: e.target.value })}>
              {ALLEGATO2.map((c) => (
                <option key={c.id} value={c.id}>{c.label} — fino a {c.limite} lavoratori</option>
              ))}
            </select>
          </label>
          <p className="sub" style={{ margin: "6px 0 0" }}>
            Vale per tutti e tre gli incarichi che il datore di lavoro può tenere su di sé: RSPP,
            antincendio e primo soccorso.
          </p>
          {fuoriSoglia && (
            <p className="corso-avviso">
              <AlertTriangle size={15} />
              L'azienda ha {f.presenti.length} lavoratori, oltre il limite di {classe.limite} previsto
              dall'Allegato 2 per questa tipologia: il datore di lavoro non può svolgere direttamente
              questi compiti. Va designato un RSPP esterno e vanno designati dei lavoratori incaricati.
            </p>
          )}
        </div>
      )}

      <div className="quadro-azione">
        {f.rsppDatore && !fuoriSoglia && (
          <span className="doc-azione">
            <label className="doc-data"><span>data</span>
              <input type="date" value={f.date.rsppDl} onChange={(e) => setData("rsppDl", e.target.value)} />
            </label>
            <button type="button" className="btn-primary"
              onClick={() => scarica(corpoRsppDatore({ ...base, data: f.date.rsppDl }), "RSPP_Datore_di_Lavoro",
                [{ persona: f.datore, ruolo: RSPP_DL_ROLE, data: f.date.rsppDl }])}>
              <FileDown size={15} /> RSPP datore di lavoro
            </button>
          </span>
        )}
        {f.rsppEsterno && (
          <span className="doc-azione">
            <label className="doc-data"><span>data</span>
              <input type="date" value={f.date.rsppExt} onChange={(e) => setData("rsppExt", e.target.value)} />
            </label>
            <button type="button" className="btn-primary" disabled={!f.rsppNome.trim()}
              onClick={() => scarica(corpoRsppEsterno({ ...base, ...f, data: f.date.rsppExt }), "Designazione_RSPP_Esterno",
                [{ persona: f.rsppNome, ruolo: RSPP_EXT_ROLE, data: f.date.rsppExt }])}>
              <FileDown size={15} /> Designazione RSPP esterno
            </button>
          </span>
        )}
      </div>

      {/* ---- emergenze ---- */}
      <div className="corso-sezione">Gestione delle emergenze</div>
      <p className="sub" style={{ marginTop: 0 }}>
        Antincendio e primo soccorso sono due incarichi distinti: il datore di lavoro può tenerne
        uno e affidare l'altro, oppure tenerli entrambi, oppure affidarli entrambi.
      </p>

      <div className="doc-blocco">
        <strong>Prevenzione incendi, lotta antincendio ed evacuazione</strong>
        <div className="doc-scelta">
          <label className="corso-check">
            <input type="checkbox" checked={f.antDatore}
              onChange={() => set({ antDatore: !f.antDatore })} />
            <span className="corso-nome">Svolto direttamente dal datore di lavoro</span>
          </label>
          <label className="corso-check">
            <input type="checkbox" checked={f.antIncaricati}
              onChange={() => set({ antIncaricati: !f.antIncaricati })} />
            <span className="corso-nome">Affidato a lavoratori incaricati</span>
          </label>
        </div>
        {f.antIncaricati && listaNomi("incAntincendio")}
      </div>

      <div className="doc-blocco">
        <strong>Primo soccorso</strong>
        <div className="doc-scelta">
          <label className="corso-check">
            <input type="checkbox" checked={f.psDatore}
              onChange={() => set({ psDatore: !f.psDatore })} />
            <span className="corso-nome">Svolto direttamente dal datore di lavoro</span>
          </label>
          <label className="corso-check">
            <input type="checkbox" checked={f.psIncaricati}
              onChange={() => set({ psIncaricati: !f.psIncaricati })} />
            <span className="corso-nome">Affidato a lavoratori incaricati</span>
          </label>
        </div>
        {f.psIncaricati && listaNomi("incPrimo")}
      </div>

      <div className="quadro-azione">
        {designati().length > 0 && (
          <span className="doc-azione">
            <label className="doc-data"><span>data</span>
              <input type="date" value={f.date.designazione}
                onChange={(e) => setData("designazione", e.target.value)} />
            </label>
            <button type="button" className="btn-primary"
              onClick={() => scarica(corpoDesignazione({ ...base, data: f.date.designazione, designati: designati() }), "Designazione_Incaricati_Emergenza",
                designati().flatMap((p) => [
                  ...(p.antincendio ? [{ persona: p.nome, ruolo: ANTINCENDIO_ROLE, data: f.date.designazione }] : []),
                  ...(p.primo ? [{ persona: p.nome, ruolo: PRIMO_ROLE, data: f.date.designazione }] : []),
                ]))}>
              <FileDown size={15} /> Designazione incaricati
            </button>
          </span>
        )}
        {f.antDatore && !fuoriSoglia && (
          <span className="doc-azione">
            <label className="doc-data"><span>data</span>
              <input type="date" value={f.date.svolgAnt}
                onChange={(e) => setData("svolgAnt", e.target.value)} />
            </label>
            <button type="button" className="btn-secondary"
              onClick={() => scarica(corpoSvolgimento({ ...base, data: f.date.svolgAnt }, "antincendio"), "Svolgimento_Diretto_Antincendio",
                [{ persona: f.datore, ruolo: ANTINCENDIO_ROLE, data: f.date.svolgAnt }])}>
              <FileDown size={15} /> Svolgimento diretto — antincendio
            </button>
          </span>
        )}
        {f.psDatore && !fuoriSoglia && (
          <span className="doc-azione">
            <label className="doc-data"><span>data</span>
              <input type="date" value={f.date.svolgPs}
                onChange={(e) => setData("svolgPs", e.target.value)} />
            </label>
            <button type="button" className="btn-secondary"
              onClick={() => scarica(corpoSvolgimento({ ...base, data: f.date.svolgPs }, "primosoccorso"), "Svolgimento_Diretto_Primo_Soccorso",
                [{ persona: f.datore, ruolo: PRIMO_ROLE, data: f.date.svolgPs }])}>
              <FileDown size={15} /> Svolgimento diretto — primo soccorso
            </button>
          </span>
        )}
      </div>

      {/* ---- elenco dei lavoratori ---- */}
      <div className="corso-sezione">Elenco dei lavoratori</div>
      <p className="sub" style={{ marginTop: 0 }}>
        Questo elenco vale sia per il verbale del RLS sia per il verbale dell'art. 36: è lo stesso,
        quindi i due documenti non possono più riportare persone diverse. La nota si stampa nella
        colonna della firma (per esempio "maternità").
      </p>
      <ul className="corso-elenco doc-presenti">
        {f.presenti.map((p, i) => (
          <li key={p.nome + i}>
            <label className="corso-check">
              <input type="checkbox" checked={p.presente}
                onChange={() => cambiaPresente(i, { presente: !p.presente })} />
              <span className="corso-nome">{p.nome}</span>
            </label>
            <input type="text" className="doc-nota" placeholder="nota" value={p.nota}
              onChange={(e) => cambiaPresente(i, { nota: e.target.value })} />
          </li>
        ))}
      </ul>

      {/* ---- RLS ---- */}
      <div className="corso-sezione">Rappresentante dei lavoratori per la sicurezza</div>
      <div className="doc-blocco">
        <div className="doc-scelta">
          {[["eletto", "Eletto dai lavoratori al loro interno"],
            ["rsa", "Designato nell'ambito delle rappresentanze sindacali"],
            ["rlst", "Nessun RLS eletto: si ricorre al RLST"]].map(([id, label]) => (
            <label key={id} className="corso-check">
              <input type="radio" name="modoRls" checked={f.modoRls === id}
                onChange={() => set({ modoRls: id })} />
              <span className="corso-nome">{label}</span>
            </label>
          ))}
        </div>
        {f.modoRls !== "rlst" && (
          <label className="field-label doc-campo">
            <span>Nominativo del RLS</span>
            <select value={f.rlsNome} onChange={(e) => set({ rlsNome: e.target.value })}>
              <option value="">— scegli —</option>
              {nomiLavoratori.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <p className="sub" style={{ margin: "8px 0 0" }}>
          Con {f.presenti.length} lavoratori il verbale citerà l'art. 47, comma{" "}
          {f.presenti.length > 15 ? "4" : "3"}.
        </p>
      </div>
      <div className="quadro-azione">
        <label className="doc-data"><span>data</span>
          <input type="date" value={f.date.rls} onChange={(e) => setData("rls", e.target.value)} />
        </label>
        <button type="button" className="btn-primary"
          disabled={f.modoRls !== "rlst" && !f.rlsNome}
          onClick={() => scarica(corpoRls({ ...base, data: f.date.rls, modo: f.modoRls, presenti: presentiScelti }), "Verbale_RLS",
            f.modoRls === "rlst" ? [] : [{ persona: f.rlsNome, ruolo: RLS_ROLE, data: f.date.rls }])}>
          <FileDown size={15} /> Verbale RLS
        </button>
      </div>

      {/* ---- art. 36 ---- */}
      <div className="corso-sezione">Informazione ai lavoratori (art. 36)</div>
      <ul className="corso-elenco">
        {ARGOMENTI_36.map((a, i) => (
          <li key={i}>
            <label className="corso-check">
              <input type="checkbox" checked={f.argomenti36[i]}
                onChange={() => set({ argomenti36: f.argomenti36.map((v, k) => (k === i ? !v : v)) })} />
              <span className="corso-nome">{a}</span>
            </label>
          </li>
        ))}
      </ul>
      <label className="field-label doc-campo" style={{ marginTop: 8 }}>
        <span>Altri argomenti trattati (uno per riga)</span>
        <textarea rows={2} value={f.altro36} onChange={(e) => set({ altro36: e.target.value })} />
      </label>
      <div className="quadro-azione">
        <label className="doc-data"><span>data</span>
          <input type="date" value={f.date.art36} onChange={(e) => setData("art36", e.target.value)} />
        </label>
        <button type="button" className="btn-primary"
          onClick={() => scarica(corpoArt36({
            ...base,
            data: f.date.art36,
            presenti: presentiScelti,
            argomenti: [
              ...ARGOMENTI_36.filter((_, i) => f.argomenti36[i]),
              ...f.altro36.split("\n").map((s) => s.trim()).filter(Boolean),
            ],
          }), "Verbale_Informazione_art36")}>
          <FileDown size={15} /> Verbale art. 36
        </button>
      </div>

      {/* ---- medico competente ---- */}
      <div className="corso-sezione">Nomina del medico competente</div>
      <div className="moduli-scelta">
        <label className="field-label doc-campo">
          <span>Medico competente</span>
          <input type="text" value={f.medicoNome} onChange={(e) => set({ medicoNome: e.target.value })} />
        </label>
        <label className="field-label doc-campo">
          <span>Qualifica</span>
          <input type="text" value={f.medicoQualifica} onChange={(e) => set({ medicoQualifica: e.target.value })} />
        </label>
        <label className="field-label doc-campo">
          <span>Studio (custodia delle cartelle sanitarie)</span>
          <input type="text" value={f.medicoStudio} onChange={(e) => set({ medicoStudio: e.target.value })} />
        </label>
        <label className="field-label doc-campo">
          <span>N. elenco nazionale medici competenti (facoltativo)</span>
          <input type="text" value={f.medicoIscrizione} onChange={(e) => set({ medicoIscrizione: e.target.value })} />
        </label>
        <label className="field-label doc-campo">
          <span>Durata dell'incarico (mesi)</span>
          <input type="number" min="1" value={f.medicoDurata} onChange={(e) => set({ medicoDurata: e.target.value })} />
        </label>
      </div>
      <div className="quadro-azione">
        <label className="doc-data"><span>data</span>
          <input type="date" value={f.date.medico} onChange={(e) => setData("medico", e.target.value)} />
        </label>
        <button type="button" className="btn-primary"
          onClick={() => scarica(
            (firma) => corpoMedico({ ...base, ...f, data: f.date.medico, firma }),
            "Nomina_Medico_Competente",
            [{ persona: f.medicoNome, ruolo: MEDICO_ROLE, data: f.date.medico }],
            { conFirma: true }
          )}>
          <FileDown size={15} /> Nomina medico competente
        </button>
      </div>

      {/* ---- riunione periodica ---- */}
      <div className="corso-sezione">Riunione periodica (art. 35)</div>
      <p className="sub" style={{ marginTop: 0 }}>
        {f.presenti.length > 15
          ? `Con ${f.presenti.length} lavoratori la riunione è obbligatoria almeno una volta l'anno.`
          : `Con ${f.presenti.length} lavoratori la riunione non è obbligatoria: il verbale lo dice, così non sembra un adempimento mancato quando non c'è.`}
      </p>
      <div className="doc-blocco">
        <label className="field-label doc-campo">
          <span>R.S.P.P. presente alla riunione</span>
          <input type="text" value={f.riuRspp} onChange={(e) => set({ riuRspp: e.target.value })}
            placeholder={f.rsppDatore ? f.datore : f.rsppNome} />
        </label>
        {TITOLI_ODG.map((t, i) => (
          <label key={i} className="field-label doc-campo">
            <span>{t}</span>
            <textarea rows={2} value={f.riuPunti[i]}
              onChange={(e) => set({ riuPunti: f.riuPunti.map((v, k) => (k === i ? e.target.value : v)) })} />
          </label>
        ))}
        <label className="field-label doc-campo">
          <span>Obiettivi di miglioramento e buone prassi</span>
          <textarea rows={2} value={f.riuObiettivi}
            onChange={(e) => set({ riuObiettivi: e.target.value })} />
        </label>
        <p className="sub" style={{ margin: "6px 0 0" }}>
          I punti lasciati vuoti escono con una riga da completare a penna, non con una frase
          inventata.
        </p>
      </div>
      <div className="quadro-azione">
        <label className="doc-data"><span>data</span>
          <input type="date" value={f.date.riunione} onChange={(e) => setData("riunione", e.target.value)} />
        </label>
        <button type="button" className="btn-primary"
          onClick={() => scarica(
            (firma) => corpoRiunione({
              ...base,
              data: f.date.riunione,
              medicoNome: f.medicoNome,
              rsppRiunione: f.riuRspp.trim() || (f.rsppDatore ? f.datore : f.rsppNome),
              punti: f.riuPunti,
              obiettivi: f.riuObiettivi,
              firma,
            }),
            "Verbale_Riunione_Periodica",
            [],
            { conFirma: true, allegato: { titolo: "Verbale riunione periodica", data: f.date.riunione } }
          )}>
          <FileDown size={15} /> Verbale riunione periodica
        </button>
      </div>

      {/* ---- sopralluogo del medico competente ---- */}
      <div className="corso-sezione">Sopralluogo del medico competente (art. 25)</div>
      <div className="doc-blocco">
        <label className="field-label doc-campo">
          <span>Ambienti e reparti visitati (uno per riga)</span>
          <textarea rows={3} value={f.sopAmbienti}
            onChange={(e) => set({ sopAmbienti: e.target.value })} />
        </label>
        <label className="field-label doc-campo">
          <span>Osservazioni</span>
          <textarea rows={3} value={f.sopOsservazioni}
            onChange={(e) => set({ sopOsservazioni: e.target.value })} />
        </label>
        <label className="field-label doc-campo">
          <span>Protocollo sanitario</span>
          <textarea rows={2} value={f.sopProtocollo}
            onChange={(e) => set({ sopProtocollo: e.target.value })} />
        </label>
        <label className="field-label doc-campo">
          <span>Indicazioni e proposte al datore di lavoro</span>
          <textarea rows={2} value={f.sopIndicazioni}
            onChange={(e) => set({ sopIndicazioni: e.target.value })} />
        </label>
        <div className="doc-scelta">
          <label className="corso-check">
            <input type="radio" name="periodicita" checked={f.sopPeriodicita === "annuale"}
              onChange={() => set({ sopPeriodicita: "annuale" })} />
            <span className="corso-nome">Cadenza annuale</span>
          </label>
          <label className="corso-check">
            <input type="radio" name="periodicita" checked={f.sopPeriodicita !== "annuale"}
              onChange={() => set({ sopPeriodicita: "altra" })} />
            <span className="corso-nome">Cadenza diversa, stabilita in base alla valutazione dei rischi</span>
          </label>
        </div>
        {f.sopPeriodicita !== "annuale" && (
          <label className="field-label doc-campo">
            <span>Quale cadenza (es. "biennale")</span>
            <input type="text" value={f.sopPeriodicitaAltra}
              onChange={(e) => set({ sopPeriodicitaAltra: e.target.value })} />
          </label>
        )}
      </div>
      <div className="quadro-azione">
        <label className="doc-data"><span>data</span>
          <input type="date" value={f.date.sopralluogo} onChange={(e) => setData("sopralluogo", e.target.value)} />
        </label>
        <button type="button" className="btn-primary"
          onClick={() => scarica(
            (firma) => corpoSopralluogo({
              ...base,
              data: f.date.sopralluogo,
              medicoNome: f.medicoNome,
              medicoQualifica: f.medicoQualifica,
              rsppRiunione: f.riuRspp.trim() || (f.rsppDatore ? f.datore : f.rsppNome),
              ambienti: f.sopAmbienti,
              osservazioni: f.sopOsservazioni,
              protocollo: f.sopProtocollo,
              indicazioni: f.sopIndicazioni,
              periodicita: f.sopPeriodicita,
              periodicitaAltra: f.sopPeriodicitaAltra,
              firma,
            }),
            "Verbale_Sopralluogo_Medico_Competente",
            [],
            { conFirma: true, allegato: { titolo: "Verbale di sopralluogo del medico competente", data: f.date.sopralluogo } }
          )}>
          <FileDown size={15} /> Verbale di sopralluogo
        </button>
      </div>

      <p className="corso-nota" style={{ marginTop: 22 }}>
        Il modulo di consegna dei DPI non è ancora qui: è l'unico che richiede un dato che l'app
        non ha, cioè l'elenco dei DPI previsti per ogni mansione dal DVR. Va costruito prima quello.
      </p>
    </div>
  );
}
