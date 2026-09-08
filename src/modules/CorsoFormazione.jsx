import React, { useState } from "react";
import { Plus, Trash2, FileDown, Save, X, AlertTriangle } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

// Costruzione del registro presenze in formato Word (.docx).
//
// Perche' non si usa un modello con i segnaposto come per le nomine: il
// registro non ha una forma fissa. Ha una pagina per ogni giornata del corso e
// una riga per ogni partecipante, numeri che cambiano da corso a corso. La
// sostituzione di segnaposto sa riempire caselle, non sa moltiplicare pagine
// e righe: il documento va costruito.
//
// Questa funzione non conosce ne' JSZip ne' il browser: ritorna soltanto la
// mappa "percorso interno -> contenuto" dei file che compongono un .docx.
// Cosi' la si puo' provare fuori dall'app, generando un documento vero e
// guardandolo, invece di scoprire gli errori in produzione.

const GIORNI = ["domenica", "lunedi'", "martedi'", "mercoledi'", "giovedi'", "venerdi'", "sabato"];

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dataEstesa(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!d) return String(iso);
  const g = new Date(Number(y), Number(m) - 1, Number(d));
  return `${d}/${m}/${y} (${GIORNI[g.getDay()]})`;
}

function dataBreve(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  return d ? `${d}/${m}/${y}` : String(iso);
}

function ora(t) {
  return t ? String(t).slice(0, 5) : "";
}

// --- mattoni WordprocessingML ------------------------------------------------

function par(testo, o = {}) {
  const rpr =
    `<w:rPr>` +
    (o.bold ? "<w:b/>" : "") +
    (o.italic ? "<w:i/>" : "") +
    `<w:sz w:val="${o.size || 20}"/><w:szCs w:val="${o.size || 20}"/>` +
    (o.color ? `<w:color w:val="${o.color}"/>` : "") +
    `</w:rPr>`;
  const ppr =
    `<w:pPr>` +
    (o.align ? `<w:jc w:val="${o.align}"/>` : "") +
    `<w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? 60 : o.after}"/>` +
    (o.pageBreakBefore ? "<w:pageBreakBefore/>" : "") +
    (o.bordoSotto ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:color="777777"/></w:pBdr>` : "") +
    `</w:pPr>`;
  const righe = String(testo ?? "").split("\n");
  const runs = righe
    .map((r, i) => `<w:r>${rpr}${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(r)}</w:t></w:r>`)
    .join("");
  return `<w:p>${ppr}${runs}</w:p>`;
}

function cella(contenuto, larghezza, o = {}) {
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${larghezza}" w:type="dxa"/>` +
    (o.sfondo ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.sfondo}"/>` : "") +
    `<w:vAlign w:val="center"/></w:tcPr>${contenuto}</w:tc>`
  );
}

function tabella(larghezze, righe) {
  const grid = larghezze.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${larghezze.reduce((a, b) => a + b, 0)}" w:type="dxa"/>` +
    `<w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((b) => `<w:${b} w:val="single" w:sz="6" w:space="0" w:color="666666"/>`)
      .join("") +
    `</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${righe.join("")}</w:tbl>`
  );
}

function riga(celle, o = {}) {
  // altezza minima: le righe da firmare devono avere lo spazio per la firma,
  // altrimenti il registro e' inutilizzabile a penna.
  const pr =
    o.intestazione ? "<w:trPr><w:tblHeader/></w:trPr>" :
    o.altezza ? `<w:trPr><w:trHeight w:val="${o.altezza}"/></w:trPr>` : "";
  return `<w:tr>${pr}${celle}</w:tr>`;
}

// --- il documento ------------------------------------------------------------

// dati = {
//   azienda, sede, organizzatore, responsabileProgetto,
//   titolo, riferimentoNormativo, classeRischio, oreTotali,
//   sessioni: [{ data, oraInizio, oraFine, ore, modulo, argomenti, docente }],
//   partecipanti: [{ nome, codiceFiscale, mansione }],
// }
function corpoRegistro(dati) {
  const L = [8300, 1200, 2600, 1900, 1300, 1300]; // n. | nome | CF | mansione -> ricalcolate sotto
  const COL = [700, 3000, 2600, 1900, 1900];      // N. | COGNOME E NOME | CODICE FISCALE | FIRMA ENTRATA | FIRMA USCITA
  const p = [];

  // --- copertina
  p.push(par(dati.titolo || "CORSO DI FORMAZIONE DEI LAVORATORI", { bold: true, size: 28, align: "center", after: 80 }));
  if (dati.classeRischio) {
    p.push(par(`Classe di rischio ${dati.classeRischio} — durata ${dati.oreTotali || "—"} ore`,
      { bold: true, size: 22, align: "center", after: 60 }));
  }
  p.push(par(dati.riferimentoNormativo ||
    "art. 37 c. 12 del D.Lgs. 81/08 e Accordo Stato-Regioni del 17 aprile 2025 — Rep. Atti n. 59/CSR",
    { italic: true, size: 18, align: "center", after: 240 }));
  p.push(par("REGISTRO PRESENZE ALLIEVI", { bold: true, size: 26, align: "center", after: 300 }));

  const box = (etichetta, valore) =>
    riga(
      cella(par(etichetta, { bold: true, size: 19 }), 3200, { sfondo: "EDF1F8" }) +
      cella(par(valore || "—", { size: 19 }), 6900)
    );

  p.push(tabella([3200, 6900], [
    box("Soggetto organizzatore", dati.organizzatore || dati.azienda),
    box("Sede di svolgimento", dati.sede),
    box("Responsabile del progetto formativo", dati.responsabileProgetto),
    box("Docente/i", [...new Set((dati.sessioni || []).map((s) => s.docente).filter(Boolean))].join(", ")),
    box("Periodo formativo", (dati.sessioni || []).map((s) => dataBreve(s.data)).filter(Boolean).join(" · ")),
    box("Ore totali", dati.oreTotali ? `${dati.oreTotali} ore` : "—"),
    box("Partecipanti", String((dati.partecipanti || []).length)),
  ]));

  p.push(par("", { after: 200 }));
  p.push(par(
    "Il presente registro e' composto dalle pagine numerate in calce. La frequenza minima per essere " +
    "ammessi alla verifica finale e' del 90% delle ore previste.",
    { italic: true, size: 18, color: "444444" }));

  // --- una pagina per ogni giornata
  (dati.sessioni || []).forEach((s, idx) => {
    p.push(par(dati.titolo || "CORSO DI FORMAZIONE DEI LAVORATORI",
      { bold: true, size: 20, pageBreakBefore: true, after: 40, bordoSotto: true }));
    p.push(par(
      `PRESENZE DEL GIORNO ${dataEstesa(s.data)} — DALLE ORE ${ora(s.oraInizio)} ALLE ORE ${ora(s.oraFine)}`,
      { bold: true, size: 21, before: 80, after: 40 }));
    p.push(par(`${s.modulo || `Modulo ${idx + 1}`}${s.ore ? ` — ${s.ore} ore` : ""}`,
      { bold: true, size: 19, color: "1F3864", after: 120 }));

    if (s.argomenti) {
      p.push(par("Argomenti trattati", { bold: true, size: 18, after: 40 }));
      String(s.argomenti).split("\n").filter((r) => r.trim()).forEach((r) => {
        p.push(par(`•  ${r.trim()}`, { size: 18, after: 20 }));
      });
      p.push(par("", { after: 120 }));
    }

    const intest = riga(
      ["N.", "COGNOME E NOME", "CODICE FISCALE", "FIRMA ENTRATA", "FIRMA USCITA"]
        .map((t, i) => cella(par(t, { bold: true, size: 17, align: "center" }), COL[i], { sfondo: "EDF1F8" }))
        .join(""),
      { intestazione: true });

    const corpo = (dati.partecipanti || []).map((x, i) =>
      riga(
        cella(par(String(i + 1), { size: 18, align: "center" }), COL[0]) +
        cella(par(x.nome, { size: 18 }), COL[1]) +
        cella(par(x.codiceFiscale || "", { size: 16 }), COL[2]) +
        cella(par("", { size: 18 }), COL[3]) +
        cella(par("", { size: 18 }), COL[4]),
        { altezza: 560 }
      ));

    p.push(tabella(COL, [intest, ...corpo]));
    p.push(par(`Firma del docente (${s.docente || "—"}):  ______________________________`,
      { size: 18, before: 200 }));
  });

  // --- chiusura
  p.push(par("CHIUSURA DEL REGISTRO", { bold: true, size: 21, pageBreakBefore: true, after: 120, bordoSotto: true }));
  p.push(par(
    "Il sottoscritto responsabile del progetto formativo attesta che il presente registro e' stato " +
    "compilato durante lo svolgimento del corso e che le firme in esso apposte sono state raccolte in " +
    "entrata e in uscita da ciascuna giornata formativa.",
    { size: 19, before: 80, after: 300 }));
  p.push(tabella([5050, 5050], [
    riga(
      cella(par("Il responsabile del progetto formativo", { bold: true, size: 18 }) +
            par(dati.responsabileProgetto || "", { size: 18, before: 40 }) +
            par("", { after: 400 }) + par("____________________________", { size: 18 }), 5050) +
      cella(par("Il legale rappresentante", { bold: true, size: 18 }) +
            par(dati.legaleRappresentante || "", { size: 18, before: 40 }) +
            par("", { after: 400 }) + par("____________________________", { size: 18 }), 5050)
    ),
  ]));
  p.push(par(`Luogo e data:  ${dati.sede || "____________________"},  ____ / ____ / ________`,
    { size: 18, before: 300 }));

  return p.join("");
}

// Piè di pagina con "Pagina X di Y": il totale lo calcola Word da solo, cosi'
// il numero dichiarato non puo' essere sbagliato.
const FOOTER_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:p><w:pPr><w:jc w:val="center"/></w:pPr>
<w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve">Pagina </w:t></w:r>
<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>
<w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve"> di </w:t></w:r>
<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>
</w:p></w:ftr>`;

function fileRegistro(dati) {
  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${corpoRegistro(dati)}
<w:sectPr>
<w:footerReference w:type="default" r:id="rId10"/>
<w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="850" w:header="708" w:footer="708" w:gutter="0"/>
</w:sectPr></w:body></w:document>`;

  return {
    "[Content_Types].xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`,
    "_rels/.rels":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    "word/_rels/document.xml.rels":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`,
    "word/styles.xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="it-IT"/>
</w:rPr></w:rPrDefault></w:docDefaults>
</w:styles>`,
    "word/footer1.xml": FOOTER_XML,
    "word/document.xml": document,
  };
}

// Confeziona i file in un .docx e lo fa scaricare. JSZip e' importato qui
// dentro e in modo dinamico di proposito: cosi' fileRegistro resta una
// funzione pura, provabile fuori dal browser.
async function scaricaRegistro(dati, nomeFile) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const files = fileRegistro(dati);
  for (const [percorso, contenuto] of Object.entries(files)) {
    zip.file(percorso, contenuto);
  }
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFile || "Registro_presenze.docx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}


// Corso di formazione organizzato dall'azienda stessa (art. 37 D.Lgs. 81/08,
// Accordo Stato-Regioni 17/04/2025, Rep. Atti n. 59/CSR).
//
// L'Accordo consente al datore di lavoro di erogare la formazione ai propri
// lavoratori, a tre condizioni: docenti con i requisiti del D.I. 6/03/2013,
// un progetto formativo con un responsabile (ruolo distinto da quello del
// docente), e la documentazione del corso — registro presenze, frequenza
// minima del 90%, verifica finale con verbale, attestato.
//
// Questo pannello raccoglie i dati una volta sola: da qui escono tutti i
// documenti, che altrimenti si compilerebbero quattro volte a mano.

const CLASSI = {
  Basso: { ore: 8, specifica: 4 },
  Medio: { ore: 12, specifica: 8 },
  Alto: { ore: 16, specifica: 12 },
};

// PROGRAMMI DEI CORSI
//
// La formazione generale dura 4 ore per tutte le classi di rischio e i suoi
// contenuti sono fissati dall'art. 37 c. 1 lett. a: sono gli stessi per
// qualunque azienda, quindi si possono scrivere una volta per tutte.
//
// La formazione specifica e' un'altra cosa. L'Accordo 17/04/2025 ne fissa la
// DURATA in base alla classe di rischio del codice ATECO — 4, 8, 12 ore — ma
// NON detta un elenco nazionale tassativo di argomenti: i contenuti vanno
// tarati sui rischi realmente rilevati nel DVR dell'azienda (art. 37 c. 1
// lett. b). Quelli che seguono sono percio' programmi BASE, costruiti sui
// macro-argomenti consolidati e dimensionati sulle ore: servono a non partire
// da una casella vuota, non a sostituire la valutazione dei rischi. Vanno
// letti e adattati, togliendo cio' che nell'azienda non c'e' e aggiungendo i
// suoi rischi propri.

const MODULO_GENERALE = {
  modulo: "Formazione Generale",
  ore: 4,
  argomenti: [
    "Concetti di base in materia di salute e sicurezza sul lavoro: pericolo, rischio, prevenzione, protezione.",
    "Organizzazione della prevenzione aziendale: datore di lavoro, dirigenti, preposti, RSPP, RLS, medico competente, lavoratori.",
    "Diritti, doveri e responsabilita' dei soggetti aziendali.",
    "Concetti di danno, infortunio, malattia professionale, near miss.",
    "Misure generali di tutela previste dal D.Lgs. 81/08.",
    "Organi di vigilanza, controllo e assistenza.",
  ].join("\n"),
};

const SPECIFICA = {
  Basso: [
    {
      modulo: "Formazione Specifica",
      ore: 4,
      argomenti: [
        "Rischi infortunistici dell'ambiente di lavoro: scivolamenti, cadute in piano, urti, tagli.",
        "Rischio elettrico legato all'uso di apparecchiature e impianti.",
        "Attrezzature di lavoro e videoterminali: postura, ergonomia, pause.",
        "Movimentazione manuale dei carichi nelle attivita' d'ufficio e di servizio.",
        "Microclima, illuminazione e qualita' dell'aria nei luoghi di lavoro.",
        "Dispositivi di protezione individuale in dotazione: scelta, uso e conservazione.",
        "Segnaletica di sicurezza, gestione delle emergenze, vie di esodo ed evacuazione.",
        "Stress lavoro-correlato e organizzazione del lavoro.",
        "Procedure di sicurezza aziendali, comunicazione dei pericoli, infortuni e near miss.",
        "Verifica finale di apprendimento.",
      ].join("\n"),
    },
  ],
  Medio: [
    {
      modulo: "Formazione Specifica (1/2) — rischi infortunistici",
      ore: 4,
      argomenti: [
        "Rischi meccanici generali: macchine, attrezzature e utensili di lavoro.",
        "Protezioni e dispositivi di sicurezza; manutenzione e pulizia in condizioni di sicurezza.",
        "Rischio elettrico e impianti.",
        "Cadute dall'alto, lavori in quota, scale portatili.",
        "Movimentazione manuale dei carichi.",
        "Movimentazione delle merci: transpallet, carrelli, apparecchi di sollevamento.",
        "Scivolamenti, cadute in piano, urti, tagli e proiezione di schegge.",
        "Ambienti di lavoro, vie di circolazione e depositi.",
        "Dispositivi di protezione individuale: scelta, uso e manutenzione.",
      ].join("\n"),
    },
    {
      modulo: "Formazione Specifica (2/2) — rischi igienico-ambientali e organizzativi",
      ore: 4,
      argomenti: [
        "Rischio chimico: etichettatura CLP, schede dati di sicurezza, stoccaggio e uso dei prodotti.",
        "Agenti fisici: rumore, vibrazioni, microclima e illuminazione.",
        "Rischio biologico, ove presente.",
        "Videoterminali, postura ed ergonomia.",
        "Stress lavoro-correlato e organizzazione del lavoro.",
        "Segnaletica di sicurezza e gestione delle emergenze: allarme, esodo, antincendio, primo soccorso.",
        "Procedure di sicurezza aziendali, comunicazione dei pericoli, infortuni e near miss.",
        "Verifica finale di apprendimento.",
      ].join("\n"),
    },
  ],
  Alto: [
    {
      modulo: "Formazione Specifica (1/3) — macchine, attrezzature e rischi infortunistici",
      ore: 4,
      argomenti: [
        "Rischi meccanici generali: macchine, impianti e attrezzature di produzione.",
        "Protezioni e dispositivi di sicurezza; manutenzione, pulizia e sblocco in condizioni di sicurezza.",
        "Rischio elettrico e impianti.",
        "Cadute dall'alto, lavori in quota, scale e trabattelli.",
        "Movimentazione manuale dei carichi: tecniche, limiti, ausili.",
        "Movimentazione delle merci: transpallet, carrelli elevatori, apparecchi di sollevamento.",
        "Scivolamenti, cadute in piano, urti, tagli, ustioni.",
        "Dispositivi di protezione individuale: scelta, uso e manutenzione.",
      ].join("\n"),
    },
    {
      modulo: "Formazione Specifica (2/3) — rischi igienico-ambientali",
      ore: 4,
      argomenti: [
        "Rischio chimico: etichettatura CLP, schede dati di sicurezza, stoccaggio e uso dei prodotti.",
        "Polveri, nebbie, oli, fumi e vapori prodotti dalle lavorazioni.",
        "Agenti cancerogeni e agenti biologici, ove presenti.",
        "Agenti fisici: rumore, vibrazioni, radiazioni.",
        "Microclima, illuminazione e ventilazione degli ambienti di lavoro.",
        "Rischio incendio ed esplosione; atmosfere esplosive ove presenti.",
        "Dispositivi di protezione individuale per i rischi igienico-ambientali.",
      ].join("\n"),
    },
    {
      modulo: "Formazione Specifica (3/3) — organizzazione, emergenze e procedure",
      ore: 4,
      argomenti: [
        "Ambienti di lavoro, vie di circolazione, depositi; spazi confinati ove presenti.",
        "Segnaletica di sicurezza.",
        "Gestione delle emergenze: allarme, vie di esodo, evacuazione, antincendio, primo soccorso.",
        "Videoterminali, postura ed ergonomia.",
        "Stress lavoro-correlato e organizzazione del lavoro.",
        "Differenze di genere e di eta', lavoratrici madri, lavoro notturno, lavoratori provenienti da altri Paesi.",
        "Procedure di sicurezza aziendali, comunicazione dei pericoli, infortuni e near miss.",
        "Verifica finale di apprendimento.",
      ].join("\n"),
    },
  ],
};

function programma(classe) {
  return [MODULO_GENERALE, ...(SPECIFICA[classe] || [])];
}

function nuovaSessione(o = {}) {
  return {
    key: Math.random().toString(36).slice(2),
    data: o.data || "",
    oraInizio: o.oraInizio || "09:00",
    oraFine: o.oraFine || "13:00",
    ore: o.ore ?? 4,
    modulo: o.modulo || "",
    argomenti: o.argomenti || "",
    docente: o.docente || "",
  };
}

function sessioniDaProgramma(classe) {
  return programma(classe).map((m) => nuovaSessione(m));
}

export default function CorsoFormazione({ righeFormazione, employees, onChiudi }) {
  const { company } = useAuth();
  const { items: docenti, add: addDocente } = useTable("trainers", company?.id);
  const { add: addCorso } = useTable("training_courses", company?.id);
  const { add: addSessione } = useTable("training_course_sessions", company?.id);
  const { add: addPartecipante } = useTable("training_course_participants", company?.id);

  // Chi non ha mai fatto il corso, o ce l'ha scaduto, parte gia' spuntato:
  // e' esattamente l'elenco di chi la formazione la deve fare.
  const daFormare = new Set(
    (righeFormazione || []).filter((r) => r.cls === "pill-alert" || r.cls === "pill-warn").map((r) => r.name)
  );
  const [scelti, setScelti] = useState(daFormare);

  const [classe, setClasse] = useState("Alto");
  const [titolo, setTitolo] = useState("Corso di formazione dei lavoratori — settore di rischio alto");
  const [oreTotali, setOreTotali] = useState(16);
  const [sede, setSede] = useState(company?.sede_operativa || company?.sede_legale || "");
  const [organizzatore, setOrganizzatore] = useState(company?.name || "");
  const [responsabile, setResponsabile] = useState("");
  const [legale, setLegale] = useState("");
  const [sessioni, setSessioni] = useState(() => sessioniDaProgramma("Alto"));

  const [nuovoDocente, setNuovoDocente] = useState("");
  const [nuovaQualifica, setNuovaQualifica] = useState("");
  const [docenteOpen, setDocenteOpen] = useState(false);

  const [confermaProgramma, setConfermaProgramma] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState("");

  // Il programma si ricarica da solo quando si cambia classe, ma solo se non
  // e' ancora stato compilato niente: se ci sono gia' date o docenti, non si
  // butta via il lavoro dell'utente senza che l'abbia chiesto.
  const compilato = () => sessioni.some((s) => s.data || s.docente);

  const cambiaClasse = (c) => {
    setClasse(c);
    setOreTotali(CLASSI[c]?.ore || 16);
    setTitolo(`Corso di formazione dei lavoratori — settore di rischio ${c.toLowerCase()}`);
    if (!compilato()) setSessioni(sessioniDaProgramma(c));
  };

  const ricaricaProgramma = () => {
    setSessioni(sessioniDaProgramma(classe));
    setConfermaProgramma(false);
  };

  const toggle = (nome) => {
    const s = new Set(scelti);
    if (s.has(nome)) s.delete(nome); else s.add(nome);
    setScelti(s);
  };

  const datiPartecipanti = (righeFormazione || [])
    .filter((r) => scelti.has(r.name))
    .map((r) => {
      const emp = (employees || []).find((e) => `${e.first_name} ${e.last_name}`.trim() === r.name);
      return { nome: r.name, codiceFiscale: emp?.tax_code || "", mansione: emp?.job_role || "", employee_id: emp?.id || null };
    });

  const senzaCf = datiPartecipanti.filter((p) => !p.codiceFiscale);
  const oreProgrammate = sessioni.reduce((n, s) => n + (Number(s.ore) || 0), 0);

  const datiDocumento = () => ({
    azienda: company?.name || "",
    organizzatore,
    sede,
    responsabileProgetto: responsabile,
    legaleRappresentante: legale,
    titolo: (titolo || "").toUpperCase(),
    classeRischio: classe.toLowerCase(),
    oreTotali,
    sessioni: sessioni.map((s) => ({
      data: s.data, oraInizio: s.oraInizio, oraFine: s.oraFine,
      ore: s.ore, modulo: s.modulo, argomenti: s.argomenti, docente: s.docente,
    })),
    partecipanti: datiPartecipanti,
  });

  const controlla = () => {
    if (datiPartecipanti.length === 0) return "Seleziona almeno un lavoratore.";
    if (!responsabile.trim()) return "Manca il responsabile del progetto formativo: l'Accordo lo richiede.";
    if (sessioni.some((s) => !s.data)) return "Ogni giornata deve avere una data.";
    if (sessioni.some((s) => !s.docente)) return "Ogni modulo deve avere un docente.";
    return "";
  };

  const scarica = async () => {
    const problema = controlla();
    if (problema) { setErrore(problema); return; }
    setErrore(""); setEsito("");
    try {
      await scaricaRegistro(datiDocumento(),
        `Registro_presenze_${(company?.name || "corso").replace(/[^a-zA-Z0-9]+/g, "_")}.docx`);
    } catch (e) {
      setErrore("Non sono riuscito a generare il registro: " + (e?.message || e));
    }
  };

  const salva = async () => {
    const problema = controlla();
    if (problema) { setErrore(problema); return; }
    setErrore(""); setEsito(""); setBusy(true);

    const corso = await addCorso({
      title: titolo,
      risk_class: classe,
      total_hours: oreTotali,
      venue: sede,
      organizer: organizzatore,
      project_manager: responsabile,
      status: "in preparazione",
      note: "",
    });

    if (!corso) { setBusy(false); setErrore("Salvataggio del corso non riuscito."); return; }

    for (let i = 0; i < sessioni.length; i++) {
      const s = sessioni[i];
      await addSessione({
        course_id: corso.id,
        session_date: s.data || null,
        start_time: s.oraInizio || null,
        end_time: s.oraFine || null,
        hours: Number(s.ore) || null,
        module_title: s.modulo,
        topics: s.argomenti,
        teacher_name: s.docente,
        sort_order: i,
      });
    }
    for (const p of datiPartecipanti) {
      await addPartecipante({
        course_id: corso.id,
        employee_id: p.employee_id,
        person_name: p.nome,
        tax_code: p.codiceFiscale || null,
        job_role: p.mansione || null,
      });
    }
    setBusy(false);
    setEsito(`Corso salvato con ${datiPartecipanti.length} partecipanti e ${sessioni.length} moduli.`);
  };

  const salvaDocente = async () => {
    if (!nuovoDocente.trim()) return;
    await addDocente({ full_name: nuovoDocente, qualification: nuovaQualifica });
    setNuovoDocente(""); setNuovaQualifica(""); setDocenteOpen(false);
  };

  const aggiornaSessione = (key, campo, valore) =>
    setSessioni(sessioni.map((s) => (s.key === key ? { ...s, [campo]: valore } : s)));

  return (
    <div className="corso-panel">
      <div className="panel-head">
        <div>
          <h3 style={{ margin: "0 0 6px" }}>Corso di formazione dei lavoratori</h3>
          <p className="sub" style={{ margin: 0 }}>
            Organizzato dall'azienda ai sensi dell'art. 37 D.Lgs. 81/08 e dell'Accordo Stato-Regioni
            del 17/04/2025. Da qui esce il registro presenze.
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onChiudi} aria-label="Chiudi"><X size={16} /></button>
      </div>

      {/* --- 1. chi va formato --- */}
      <p className="corso-sezione">1 · Chi partecipa</p>
      <p className="sub" style={{ margin: "0 0 10px" }}>
        Chi non ha mai fatto il corso o ce l'ha scaduto è già spuntato. Puoi aggiungere o togliere chiunque.
      </p>
      <ul className="corso-elenco">
        {(righeFormazione || []).map((r) => (
          <li key={r.key}>
            <label className="corso-check">
              <input type="checkbox" checked={scelti.has(r.name)} onChange={() => toggle(r.name)} />
              <span className="corso-nome">{r.name}</span>
              <span className={"pill " + r.cls}>{r.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="sub" style={{ margin: "8px 0 0" }}>
        Selezionati: <strong>{datiPartecipanti.length}</strong>
        {datiPartecipanti.length > 30 && " — attenzione: l'Accordo fissa il massimo a 30 partecipanti per corso."}
      </p>
      {senzaCf.length > 0 && (
        <p className="corso-avviso">
          <AlertTriangle size={14} /> {senzaCf.length === 1 ? "Manca il codice fiscale di " : "Mancano i codici fiscali di "}
          {senzaCf.map((p) => p.nome).join(", ")}. Nel registro la casella resterà vuota, e senza codice
          fiscale l'attestato non è valido: inseriscilo in Dipendenti.
        </p>
      )}

      {/* --- 2. il corso --- */}
      <p className="corso-sezione">2 · Il corso</p>
      <div className="row-form">
        <label className="field-label">Classe di rischio
          <select value={classe} onChange={(e) => cambiaClasse(e.target.value)}>
            {Object.keys(CLASSI).map((c) => <option key={c} value={c}>{c} — {CLASSI[c].ore} ore</option>)}
          </select>
        </label>
        <label className="field-label">Ore totali
          <input type="number" min="1" value={oreTotali} onChange={(e) => setOreTotali(e.target.value)} className="num" />
        </label>
      </div>
      <input type="text" value={titolo} onChange={(e) => setTitolo(e.target.value)}
        className="full-input" placeholder="Titolo del corso" style={{ marginBottom: 8 }} />
      <input type="text" value={sede} onChange={(e) => setSede(e.target.value)}
        className="full-input" placeholder="Sede di svolgimento" style={{ marginBottom: 8 }} />
      <input type="text" value={organizzatore} onChange={(e) => setOrganizzatore(e.target.value)}
        className="full-input" placeholder="Soggetto organizzatore" style={{ marginBottom: 8 }} />
      <div className="row-form" style={{ margin: 0 }}>
        <input type="text" value={responsabile} onChange={(e) => setResponsabile(e.target.value)}
          className="note-input" placeholder="Responsabile del progetto formativo" />
        <input type="text" value={legale} onChange={(e) => setLegale(e.target.value)}
          className="note-input" placeholder="Legale rappresentante (firma il registro)" />
      </div>
      <p className="sub" style={{ margin: "6px 0 0" }}>
        Responsabile del progetto formativo e docente sono due ruoli distinti: possono essere la stessa
        persona, ma vanno indicati entrambi.
      </p>

      {/* --- 3. docenti --- */}
      <p className="corso-sezione">3 · Docenti</p>
      {docenti.length === 0 && !docenteOpen && (
        <p className="none-label" style={{ margin: "0 0 8px" }}>Nessun docente in elenco.</p>
      )}
      {docenti.length > 0 && (
        <ul className="corso-docenti">
          {docenti.map((d) => (
            <li key={d.id}>
              <strong>{d.full_name}</strong>
              {d.qualification && <span className="log-note"> — {d.qualification}</span>}
            </li>
          ))}
        </ul>
      )}
      {docenteOpen ? (
        <div className="row-form" style={{ marginTop: 8 }}>
          <input type="text" value={nuovoDocente} onChange={(e) => setNuovoDocente(e.target.value)}
            className="note-input" placeholder="Nome e cognome del docente" />
          <input type="text" value={nuovaQualifica} onChange={(e) => setNuovaQualifica(e.target.value)}
            className="note-input" placeholder="Qualifica (requisiti D.I. 6/03/2013)" />
          <button type="button" className="btn-primary" onClick={salvaDocente}><Plus size={14} /> Salva</button>
          <button type="button" className="link-btn" onClick={() => setDocenteOpen(false)}>Annulla</button>
        </div>
      ) : (
        <button type="button" className="link-btn" onClick={() => setDocenteOpen(true)}>+ Aggiungi docente</button>
      )}

      {/* --- 4. giornate --- */}
      <p className="corso-sezione">4 · Giornate e moduli</p>
      <p className="sub" style={{ margin: "0 0 6px" }}>
        Il programma è già impostato per la classe <strong>{classe}</strong>: {sessioni.length} moduli,
        ore programmate <strong>{oreProgrammate}</strong> su {oreTotali}.
        {oreProgrammate !== Number(oreTotali) && " I due numeri non coincidono."}
        {" "}Restano da mettere data, orario e docente.
      </p>
      <p className="corso-nota">
        La <strong>formazione generale</strong> è uguale per tutte le aziende: i contenuti sono quelli
        dell'art. 37 c. 1 lett. a. La <strong>formazione specifica</strong> no — l'Accordo 17/04/2025 ne
        fissa le ore ma non detta un elenco nazionale di argomenti, perché vanno tarati sui rischi
        rilevati nel DVR di questa azienda. Quello qui sotto è un programma base: togli ciò che qui
        non c'è e aggiungi i rischi propri dell'attività.
      </p>
      <div className="row-form" style={{ margin: "0 0 10px" }}>
        {confermaProgramma ? (
          <>
            <button type="button" className="btn-primary" onClick={ricaricaProgramma}>
              Sì, ricarica: le date e i docenti inseriti andranno persi
            </button>
            <button type="button" className="link-btn" onClick={() => setConfermaProgramma(false)}>Annulla</button>
          </>
        ) : (
          <button type="button" className="link-btn"
            onClick={() => (compilato() ? setConfermaProgramma(true) : ricaricaProgramma())}>
            Ricarica il programma standard per la classe {classe}
          </button>
        )}
      </div>
      {sessioni.map((s, i) => (
        <div key={s.key} className="corso-sessione">
          <div className="row-form" style={{ margin: 0 }}>
            <label className="field-label">Data
              <input type="date" value={s.data} onChange={(e) => aggiornaSessione(s.key, "data", e.target.value)} />
            </label>
            <label className="field-label">Dalle
              <input type="time" value={s.oraInizio} onChange={(e) => aggiornaSessione(s.key, "oraInizio", e.target.value)} />
            </label>
            <label className="field-label">Alle
              <input type="time" value={s.oraFine} onChange={(e) => aggiornaSessione(s.key, "oraFine", e.target.value)} />
            </label>
            <label className="field-label">Ore
              <input type="number" min="1" step="0.5" value={s.ore} className="num"
                onChange={(e) => aggiornaSessione(s.key, "ore", e.target.value)} />
            </label>
            <button type="button" className="icon-btn" aria-label="Elimina modulo"
              onClick={() => setSessioni(sessioni.filter((x) => x.key !== s.key))}><Trash2 size={14} /></button>
          </div>
          <div className="row-form" style={{ marginTop: 8 }}>
            <input type="text" value={s.modulo} className="note-input" placeholder={`Titolo del modulo ${i + 1}`}
              onChange={(e) => aggiornaSessione(s.key, "modulo", e.target.value)} />
            <select value={s.docente} onChange={(e) => aggiornaSessione(s.key, "docente", e.target.value)}>
              <option value="">Docente…</option>
              {docenti.map((d) => <option key={d.id} value={d.full_name}>{d.full_name}</option>)}
            </select>
          </div>
          <textarea className="full-input nc-textarea" value={s.argomenti}
            placeholder="Argomenti trattati, uno per riga"
            onChange={(e) => aggiornaSessione(s.key, "argomenti", e.target.value)} style={{ marginTop: 8 }} />
        </div>
      ))}
      <button type="button" className="link-btn" onClick={() => setSessioni([...sessioni, nuovaSessione()])}>
        + Aggiungi una giornata o un modulo
      </button>

      {errore && <p className="corso-avviso"><AlertTriangle size={14} /> {errore}</p>}
      {esito && <p className="corso-esito">{esito}</p>}

      <div className="row-form" style={{ marginTop: 16 }}>
        <button type="button" className="btn-primary" onClick={scarica}>
          <FileDown size={15} /> Scarica il registro presenze
        </button>
        <button type="button" className="link-btn" onClick={salva} disabled={busy}>
          <Save size={14} /> {busy ? "Salvataggio…" : "Salva il corso in archivio"}
        </button>
      </div>
    </div>
  );
}
