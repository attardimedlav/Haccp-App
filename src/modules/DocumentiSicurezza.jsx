import React, { useEffect, useState } from "react";
import { FileDown, AlertTriangle } from "lucide-react";
import { useAuth } from "../AuthContext";
import { par, tabella, riga, cella, pacchettoDocx, scaricaDocx } from "./CorsoFormazione";

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

function firmeAffiancate(sinistra, destra) {
  const L = [4800, 4800];
  return tabella(L, [
    riga(
      cella(par(sinistra, { align: "center", bold: true, size: 18, before: 300 }), L[0]) +
      cella(par(destra, { align: "center", bold: true, size: 18, before: 300 }), L[1])
    ),
    riga(
      cella(sinistra ? par("_______________________________", { align: "center", size: 18, before: 260 }) : par("", {}), L[0]) +
      cella(destra ? par("_______________________________", { align: "center", size: 18, before: 260 }) : par("", {}), L[1])
    ),
  ], { senzaBordi: true });
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
    firmeAffiancate("Il Datore di Lavoro\n" + d.datore, "Per accettazione\nIl Medico Competente\n" + d.medicoNome)
  );
}

// --- pannello ----------------------------------------------------------------

export default function DocumentiSicurezza({ employees = [], appointments = [] }) {
  const { company } = useAuth();
  const [f, setF] = useState(null);
  const [errore, setErrore] = useState("");

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
    setF({
      // Una data per documento, non una sola: nella pratica il verbale di
      // elezione del RLS, il verbale dell'art. 36 e la nomina del medico
      // competente portano date diverse. Tutte partono da oggi.
      date: {
        designazione: oggi(), svolgAnt: oggi(), svolgPs: oggi(),
        rls: oggi(), art36: oggi(), medico: oggi(),
      },
      luogo: comuneDa(sede),
      sede,
      datore,
      tipologia: "altre",
      modoAntincendio: ant.length ? "incaricati" : "datore",
      modoPrimo: ps.length ? "incaricati" : "datore",
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

  const scarica = async (corpo, nome, opzioni) => {
    setErrore("");
    if (!f.datore.trim()) { setErrore("Manca il nominativo del datore di lavoro."); return; }
    try {
      await scaricaDocx(pacchettoDocx(corpo, opzioni), `${nome}_${pulisciNomeFile(company?.name)}.docx`);
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
    if (f.modoAntincendio !== "datore") f.incAntincendio.forEach((n) => aggiungi(n, "antincendio"));
    if (f.modoPrimo !== "datore") f.incPrimo.forEach((n) => aggiungi(n, "primo"));
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

      {/* ---- emergenze ---- */}
      <div className="corso-sezione">Gestione delle emergenze</div>
      <p className="sub" style={{ marginTop: 0 }}>
        Antincendio e primo soccorso sono due incarichi distinti: il datore di lavoro può tenerne
        uno e affidare l'altro, oppure tenerli entrambi, oppure affidarli entrambi.
      </p>

      <div className="doc-blocco">
        <strong>Prevenzione incendi, lotta antincendio ed evacuazione</strong>
        <div className="doc-scelta">
          {[["datore", "Svolto direttamente dal datore di lavoro"],
            ["incaricati", "Affidato a lavoratori incaricati"],
            ["entrambi", "Datore di lavoro e lavoratori incaricati"]].map(([id, label]) => (
            <label key={id} className="corso-check">
              <input type="radio" name="modoAnt" checked={f.modoAntincendio === id}
                onChange={() => set({ modoAntincendio: id })} />
              <span className="corso-nome">{label}</span>
            </label>
          ))}
        </div>
        {f.modoAntincendio !== "datore" && listaNomi("incAntincendio")}
      </div>

      <div className="doc-blocco">
        <strong>Primo soccorso</strong>
        <div className="doc-scelta">
          {[["datore", "Svolto direttamente dal datore di lavoro"],
            ["incaricati", "Affidato a lavoratori incaricati"],
            ["entrambi", "Datore di lavoro e lavoratori incaricati"]].map(([id, label]) => (
            <label key={id} className="corso-check">
              <input type="radio" name="modoPs" checked={f.modoPrimo === id}
                onChange={() => set({ modoPrimo: id })} />
              <span className="corso-nome">{label}</span>
            </label>
          ))}
        </div>
        {f.modoPrimo !== "datore" && listaNomi("incPrimo")}
      </div>

      {(f.modoAntincendio !== "incaricati" || f.modoPrimo !== "incaricati") && (
        <div className="doc-blocco">
          <label className="field-label doc-campo">
            <span>Tipologia dell'azienda ai fini dell'Allegato 2 (limite per lo svolgimento diretto)</span>
            <select value={f.tipologia} onChange={(e) => set({ tipologia: e.target.value })}>
              {ALLEGATO2.map((c) => (
                <option key={c.id} value={c.id}>{c.label} — fino a {c.limite} lavoratori</option>
              ))}
            </select>
          </label>
          {fuoriSoglia && (
            <p className="corso-avviso">
              <AlertTriangle size={15} />
              L'azienda ha {f.presenti.length} lavoratori, oltre il limite di {classe.limite} previsto
              dall'Allegato 2 per questa tipologia: il datore di lavoro non può svolgere direttamente
              questi compiti. Vanno designati dei lavoratori incaricati.
            </p>
          )}
        </div>
      )}

      <div className="quadro-azione">
        {designati().length > 0 && (
          <span className="doc-azione">
            <label className="doc-data"><span>data</span>
              <input type="date" value={f.date.designazione}
                onChange={(e) => setData("designazione", e.target.value)} />
            </label>
            <button type="button" className="btn-primary"
              onClick={() => scarica(corpoDesignazione({ ...base, data: f.date.designazione, designati: designati() }), "Designazione_Incaricati_Emergenza")}>
              <FileDown size={15} /> Designazione incaricati
            </button>
          </span>
        )}
        {f.modoAntincendio !== "incaricati" && !fuoriSoglia && (
          <span className="doc-azione">
            <label className="doc-data"><span>data</span>
              <input type="date" value={f.date.svolgAnt}
                onChange={(e) => setData("svolgAnt", e.target.value)} />
            </label>
            <button type="button" className="btn-secondary"
              onClick={() => scarica(corpoSvolgimento({ ...base, data: f.date.svolgAnt }, "antincendio"), "Svolgimento_Diretto_Antincendio")}>
              <FileDown size={15} /> Svolgimento diretto — antincendio
            </button>
          </span>
        )}
        {f.modoPrimo !== "incaricati" && !fuoriSoglia && (
          <span className="doc-azione">
            <label className="doc-data"><span>data</span>
              <input type="date" value={f.date.svolgPs}
                onChange={(e) => setData("svolgPs", e.target.value)} />
            </label>
            <button type="button" className="btn-secondary"
              onClick={() => scarica(corpoSvolgimento({ ...base, data: f.date.svolgPs }, "primosoccorso"), "Svolgimento_Diretto_Primo_Soccorso")}>
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
          onClick={() => scarica(corpoRls({ ...base, data: f.date.rls, modo: f.modoRls, presenti: presentiScelti }), "Verbale_RLS")}>
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
          onClick={() => scarica(corpoMedico({ ...base, ...f, data: f.date.medico }), "Nomina_Medico_Competente")}>
          <FileDown size={15} /> Nomina medico competente
        </button>
      </div>

      <p className="corso-nota" style={{ marginTop: 22 }}>
        Il modulo di consegna dei DPI non è ancora qui: è l'unico che richiede un dato che l'app
        non ha, cioè l'elenco dei DPI previsti per ogni mansione dal DVR. Va costruito prima quello.
      </p>
    </div>
  );
}
