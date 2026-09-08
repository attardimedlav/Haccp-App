import React, { useState } from "react";
import { FileDown, Award, AlertTriangle, X, CheckCircle2 } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import {
  par, cella, tabella, riga, dataBreve,
  pacchettoDocx, scaricaDocx, fileRegistro,
} from "./CorsoFormazione";

// Scheda di un corso gia' registrato: da qui escono i quattro documenti che
// l'Accordo Stato-Regioni 17/04/2025 richiede a chi organizza formazione, e
// da qui il corso si chiude scrivendo gli attestati in Cardine.
//
// La soglia del 90% non e' un dettaglio: e' la condizione per essere AMMESSI
// alla verifica finale. Chi resta sotto non sostiene la verifica e non ha
// diritto all'attestato, quindi non deve nemmeno finire fra le nomine.

const SOGLIA = 0.9;
const VALIDITA_ANNI = 5;

function piuAnni(iso, anni) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + anni);
  return d.toISOString().slice(0, 10);
}

const RIF_NORMATIVO =
  "art. 37 c. 12 del D.Lgs. 81/08 e Accordo Stato-Regioni del 17 aprile 2025 - Rep. Atti n. 59/CSR";

// --- documenti ---------------------------------------------------------------

function scheda(etichetta, valore) {
  return riga(
    cella(par(etichetta, { bold: true, size: 19 }), 3400, { sfondo: "EDF1F8" }) +
    cella(par(valore || "-", { size: 19 }), 6700)
  );
}

function corpoProgetto(d) {
  const p = [];
  p.push(par("PROGETTO FORMATIVO", { bold: true, size: 28, align: "center", after: 60 }));
  p.push(par(d.titolo, { bold: true, size: 22, align: "center", after: 60 }));
  p.push(par(RIF_NORMATIVO, { italic: true, size: 18, align: "center", after: 260 }));

  p.push(tabella([3400, 6700], [
    scheda("Soggetto organizzatore", d.organizzatore),
    scheda("Sede di svolgimento", d.sede),
    scheda("Responsabile del progetto formativo", d.responsabileProgetto),
    scheda("Docente/i", d.docenti),
    scheda("Durata complessiva", d.oreTotali ? `${d.oreTotali} ore` : "-"),
    scheda("Classe di rischio", d.classeRischio || "-"),
    scheda("Modalita' di erogazione", "In presenza"),
    scheda("Numero di partecipanti", String(d.partecipanti.length)),
  ]));

  p.push(par("1. Destinatari", { bold: true, size: 21, before: 300, after: 100, bordoSotto: true }));
  p.push(par(
    "Il corso e' rivolto ai lavoratori dell'azienda di seguito elencati, individuati in base alla " +
    "mansione svolta e alla valutazione dei rischi aziendale.", { size: 19, after: 120 }));
  p.push(tabella([700, 5000, 4400], [
    riga(["N.", "Cognome e nome", "Mansione"].map((t, i) =>
      cella(par(t, { bold: true, size: 18 }), [700, 5000, 4400][i], { sfondo: "EDF1F8" })).join(""),
      { intestazione: true }),
    ...d.partecipanti.map((x, i) => riga(
      cella(par(String(i + 1), { size: 18, align: "center" }), 700) +
      cella(par(x.nome, { size: 18 }), 5000) +
      cella(par(x.mansione || "-", { size: 18 }), 4400))),
  ]));

  p.push(par("2. Obiettivi", { bold: true, size: 21, before: 300, after: 100, bordoSotto: true }));
  [
    "Fornire ai lavoratori le conoscenze generali in materia di salute e sicurezza previste dall'art. 37 c. 1 lett. a del D.Lgs. 81/08.",
    "Far conoscere i rischi specifici presenti nell'azienda, cosi' come rilevati nel documento di valutazione dei rischi, e le misure e procedure di prevenzione e protezione adottate.",
    "Rendere i lavoratori capaci di riconoscere le situazioni di pericolo, di usare correttamente i dispositivi di protezione individuale e di comportarsi secondo le procedure di emergenza aziendali.",
  ].forEach((t) => p.push(par("- " + t, { size: 19, after: 60 })));

  p.push(par("3. Articolazione del percorso", { bold: true, size: 21, before: 300, after: 100, bordoSotto: true }));
  d.moduli.forEach((m, i) => {
    p.push(par(`${i + 1}. ${m.modulo}${m.ore ? ` - ${m.ore} ore` : ""}`,
      { bold: true, size: 19, before: 120, after: 50 }));
    String(m.argomenti || "").split("\n").filter((r) => r.trim())
      .forEach((r) => p.push(par("   - " + r.trim(), { size: 18, after: 20 })));
  });

  p.push(par("4. Metodologia didattica", { bold: true, size: 21, before: 300, after: 100, bordoSotto: true }));
  p.push(par(
    "Lezione frontale in presenza, con impiego di supporti visivi, esempi tratti dalle lavorazioni " +
    "aziendali e discussione guidata dei casi. E' prevista la verifica della comprensione della " +
    "lingua per i lavoratori di provenienza straniera.", { size: 19 }));

  p.push(par("5. Docenti", { bold: true, size: 21, before: 300, after: 100, bordoSotto: true }));
  p.push(par(
    "La docenza e' affidata a formatori in possesso dei requisiti previsti dal Decreto " +
    "Interministeriale 6 marzo 2013 e successive modifiche: " + (d.docenti || "-") + ".",
    { size: 19 }));

  p.push(par("6. Frequenza e verifica finale", { bold: true, size: 21, before: 300, after: 100, bordoSotto: true }));
  p.push(par(
    "La frequenza e' obbligatoria e viene documentata su registro presenze firmato in entrata e in " +
    "uscita da ciascuna giornata. E' ammesso alla verifica finale chi ha frequentato almeno il 90% " +
    "delle ore previste. La verifica si svolge mediante test di apprendimento e colloquio, ed e' " +
    "documentata da apposito verbale. A chi la supera viene rilasciato attestato di frequenza con " +
    `verifica dell'apprendimento, valido ${VALIDITA_ANNI} anni.`, { size: 19 }));

  p.push(par(`Luogo e data: ${d.sede || "____________________"},  ____ / ____ / ________`,
    { size: 19, before: 400 }));
  p.push(par("Il responsabile del progetto formativo", { bold: true, size: 18, before: 300 }));
  p.push(par(d.responsabileProgetto || "", { size: 18 }));
  p.push(par("____________________________", { size: 18, before: 300 }));
  return p.join("");
}

function corpoVerbale(d) {
  const COL = [600, 3400, 2400, 1100, 900, 1700];
  const p = [];
  p.push(par("VERBALE DI VERIFICA FINALE DELL'APPRENDIMENTO", { bold: true, size: 26, align: "center", after: 60 }));
  p.push(par(d.titolo, { bold: true, size: 21, align: "center", after: 60 }));
  p.push(par(RIF_NORMATIVO, { italic: true, size: 18, align: "center", after: 240 }));

  p.push(tabella([3400, 6700], [
    scheda("Soggetto organizzatore", d.organizzatore),
    scheda("Tipologia e durata del corso", `${d.titolo} - ${d.oreTotali || "-"} ore`),
    scheda("Periodo di svolgimento", d.periodo),
    scheda("Sede di svolgimento", d.sede),
    scheda("Modalita' di erogazione", "In presenza"),
    scheda("Responsabile del progetto formativo", d.responsabileProgetto),
    scheda("Docente/i", d.docenti),
    scheda("Data della verifica finale", dataBreve(d.dataVerifica)),
  ]));

  p.push(par(
    "Il giorno indicato si e' svolta la verifica finale di apprendimento. Sono stati ammessi alla " +
    `verifica i partecipanti che hanno frequentato almeno il 90% delle ore previste, come risulta ` +
    "dal registro presenze. La verifica si e' svolta mediante test di apprendimento e colloquio.",
    { size: 19, before: 260, after: 160 }));

  p.push(tabella(COL, [
    riga(["N.", "Cognome e nome", "Codice fiscale", "Ore freq.", "%", "Esito"]
      .map((t, i) => cella(par(t, { bold: true, size: 17, align: "center" }), COL[i], { sfondo: "EDF1F8" })).join(""),
      { intestazione: true }),
    ...d.partecipanti.map((x, i) => riga(
      cella(par(String(i + 1), { size: 17, align: "center" }), COL[0]) +
      cella(par(x.nome, { size: 17 }), COL[1]) +
      cella(par(x.codiceFiscale || "", { size: 15 }), COL[2]) +
      cella(par(String(x.oreFrequentate ?? ""), { size: 17, align: "center" }), COL[3]) +
      cella(par(x.percentuale, { size: 17, align: "center" }), COL[4]) +
      cella(par(x.esito, { size: 17, align: "center", bold: true }), COL[5]),
      { altezza: 340 })),
  ]));

  if (d.note) p.push(par("Note: " + d.note, { size: 18, before: 200 }));

  p.push(par(
    "Ai partecipanti che hanno superato la verifica viene rilasciato attestato di frequenza con " +
    `verifica dell'apprendimento, valido ${VALIDITA_ANNI} anni dalla data di svolgimento.`,
    { size: 19, before: 240 }));

  p.push(par(`Luogo e data: ${d.sede || "____________________"},  ${dataBreve(d.dataVerifica) || "____ / ____ / ________"}`,
    { size: 19, before: 360 }));
  p.push(tabella([5050, 5050], [
    riga(
      cella(par("Il responsabile del progetto formativo", { bold: true, size: 18 }) +
            par(d.responsabileProgetto || "", { size: 18, before: 40 }) +
            par("", { after: 400 }) + par("____________________________", { size: 18 }), 5050) +
      cella(par("Il docente", { bold: true, size: 18 }) +
            par(d.docenti || "", { size: 18, before: 40 }) +
            par("", { after: 400 }) + par("____________________________", { size: 18 }), 5050)
    ),
  ]));
  return p.join("");
}

// L'attestato e' l'unico documento di tutto il pacchetto che finisce in mano
// al lavoratore e viene appeso, mostrato, fotocopiato. Merita una veste da
// documento e non da stampato di servizio: cornice di pagina, un carattere con
// le grazie per le parti solenni, e il programma sul retro.
const SERIF = "Cambria";
const BLU = "1F3864";

function corpoAttestati(d) {
  const p = [];
  const anno = String(d.dataVerifica || "").slice(0, 4) || new Date().getFullYear();
  const filetto = (o = {}) => par("✦", {
    size: 20, align: "center", color: "B08D57", before: o.before ?? 300, after: o.after ?? 300,
  });

  d.partecipanti.forEach((x, i) => {
    const numero = `${String(i + 1).padStart(2, "0")}/${anno}`;

    // Il salto pagina sta su un paragrafo, non sulla tabella: una tabella non
    // porta pageBreakBefore, e senza questa riga il secondo attestato
    // ripartirebbe in coda al programma del primo.
    if (i > 0) p.push(par("", { size: 2, after: 0, saltoPagina: true }));

    // --- fascia dell'organizzatore
    p.push(tabella([10100], [
      riga(cella(
        par("SOGGETTO ORGANIZZATORE DEL CORSO", {
          size: 15, align: "center", color: "6E7C73", spaziatura: 60, after: 30 }) +
        par(d.organizzatore || d.azienda, {
          bold: true, size: 22, align: "center", font: SERIF, color: BLU, after: 0 }),
        10100, { sfondo: "F2F5FA" }),
      { altezza: 900 }),
    ], { senzaBordi: true }));

    p.push(filetto({ before: 460, after: 260 }));

    p.push(par("Attestato di Frequenza", {
      bold: true, size: 52, align: "center", font: SERIF, color: BLU, after: 150 }));
    p.push(par("Formazione Generale e Specifica dei Lavoratori", {
      size: 24, align: "center", font: SERIF, after: 110 }));
    p.push(par(
      `settori della classe di rischio ${String(d.classeRischio || "")}` +
      (d.ateco ? `  ·  codice ATECO ${d.ateco}` : ""),
      { size: 17, align: "center", color: "6E7C73", maiuscoletto: true, spaziatura: 40, after: 0 }));

    p.push(filetto());

    p.push(par("Si attesta che", { size: 20, align: "center", italic: true, font: SERIF, after: 220 }));
    p.push(par(x.nome, {
      bold: true, size: 36, align: "center", font: SERIF, color: BLU, spaziatura: 30, after: 170 }));
    p.push(par(
      `codice fiscale ${x.codiceFiscale || "non indicato"}` +
      (x.mansione ? `  ·  dipendente di ${d.azienda} con la qualifica di ${x.mansione}` : `  ·  dipendente di ${d.azienda}`),
      { size: 18, align: "center", color: x.codiceFiscale ? "6E7C73" : "B03A2E", after: 560 }));

    p.push(par(
      `ha frequentato con profitto — con almeno il 90% delle ore previste e con superamento del test finale ` +
      `di verifica — il corso di formazione generale e specifica dei lavoratori per i settori della classe di ` +
      `rischio ${String(d.classeRischio || "").toLowerCase()}, della durata complessiva di ${d.oreTotali} ore ` +
      `(${d.oreGenerale} di formazione generale e ${d.oreSpecifica} di formazione specifica), svoltosi presso ` +
      `${d.sede || "la sede aziendale"} nei giorni ${d.giorni}, secondo la durata, le modalita' ed i contenuti ` +
      `previsti dall'art. 37 del D.Lgs. 81/08 e s.m.i. e dall'Accordo Stato-Regioni del 17 aprile 2025 ` +
      `(Rep. Atti n. 59/CSR) e s.m.i.`,
      { size: 19, align: "both", interlinea: 300, after: 460 }));

    p.push(tabella([10100], [
      riga(cella(par(
        `L'attestato ha validita' di ${VALIDITA_ANNI} anni. L'aggiornamento dovra' essere effettuato entro il ${dataBreve(d.scadenza)}.`,
        { bold: true, size: 19, align: "center", color: BLU, after: 0 }),
        10100, { sfondo: "F2F5FA" }), { altezza: 620 }),
    ], { senzaBordi: true }));

    p.push(par("", { after: 1500 }));
    p.push(tabella([5050, 5050], [
      riga(
        cella(par("_____________________________", { size: 18, align: "center", color: "888888", after: 60 }) +
              par("Il Soggetto Organizzatore", { bold: true, size: 17, align: "center", after: 20 }) +
              par(d.organizzatore || d.azienda, { size: 16, align: "center", color: "6E7C73" }), 5050) +
        cella(par("_____________________________", { size: 18, align: "center", color: "888888", after: 60 }) +
              par("Il Responsabile del Progetto Formativo", { bold: true, size: 17, align: "center", after: 20 }) +
              par(d.responsabileProgetto || "", { size: 16, align: "center", color: "6E7C73" }), 5050)
      ),
    ], { senzaBordi: true }));

    p.push(par(
      `${d.sede || "____________________"}, li' ${dataBreve(d.dataVerifica)}      ·      Attestato n. ${numero}`,
      { size: 16, align: "center", color: "6E7C73", before: 620 }));

    // --- retro: il programma, per ogni attestato
    p.push(par("Programma del corso", {
      bold: true, size: 30, align: "center", font: SERIF, color: BLU,
      after: 50, saltoPagina: true }));
    p.push(par(`Formazione lavoratori — rischio ${String(d.classeRischio || "").toLowerCase()}  ·  ${d.oreTotali} ore`,
      { size: 19, align: "center", maiuscoletto: true, spaziatura: 30, color: "6E7C73", after: 40 }));
    p.push(par(
      "(art. 37 del D.Lgs. 81/2008 e Accordo Stato-Regioni del 17 aprile 2025, Rep. Atti n. 59/CSR)",
      { italic: true, size: 16, align: "center", color: "888888", after: 60 }));
    p.push(par(`Rilasciato a ${x.nome} — attestato n. ${numero}`,
      { size: 17, align: "center", color: "6E7C73", after: 260 }));

    (d.moduli || []).forEach((m, k) => {
      p.push(tabella([10100], [
        riga(cella(par(
          `${k + 1}.  ${m.modulo || `Modulo ${k + 1}`}${m.ore ? `   ·   ${m.ore} ore` : ""}`,
          { bold: true, size: 20, font: SERIF, color: BLU, after: 0 }),
          10100, { sfondo: "F2F5FA" }), { altezza: 420 }),
      ], { senzaBordi: true }));
      p.push(par("", { after: 60 }));
      String(m.argomenti || "").split("\n").filter((r) => r.trim()).forEach((r) => {
        p.push(par(`—   ${r.trim()}`, { size: 18, after: 40, interlinea: 260 }));
      });
      p.push(par("", { after: 140 }));
    });

    p.push(par("Metodologia didattica:  lezioni frontali interattive, analisi di casi ed esercitazioni pratiche.",
      { italic: true, size: 17, color: "6E7C73", before: 180, after: 30 }));
    p.push(par("Modalita' di verifica:  test finale e colloquio, con esito documentato a verbale.",
      { italic: true, size: 17, color: "6E7C73", after: 320 }));
    p.push(par("_____________________________", { size: 18, color: "888888", after: 60 }));
    p.push(par("Il Responsabile del Progetto Formativo", { bold: true, size: 17, after: 20 }));
    p.push(par(d.responsabileProgetto || "", { size: 16, color: "6E7C73" }));
  });
  return p.join("");
}

// --- scheda del corso --------------------------------------------------------

function SchedaCorso({ corso, sessioni, partecipanti, formazioneRole, onChiudi, onAggiornato }) {
  const { company } = useAuth();
  const { items: nomine, add: addNomina, reload: reloadNomine } = useTable("work_safety_appointments", company?.id);
  const { items: attestati, add: addAttestato } = useTable("work_safety_trainings", company?.id);
  const { update: aggiornaCorso } = useTable("training_courses", company?.id);
  const { update: aggiornaPartecipante } = useTable("training_course_participants", company?.id);

  const oreCorso = Number(corso.total_hours) || sessioni.reduce((n, s) => n + (Number(s.hours) || 0), 0);
  const date = sessioni.map((s) => s.session_date).filter(Boolean).sort();
  const dataFine = date[date.length - 1] || "";

  const [dataVerifica, setDataVerifica] = useState(corso.final_test_date || dataFine || "");
  const [note, setNote] = useState(corso.final_test_note || "");
  const [legale, setLegale] = useState("");
  const [ore, setOre] = useState(() => {
    const m = {};
    partecipanti.forEach((p) => { m[p.id] = p.hours_attended ?? oreCorso; });
    return m;
  });
  const [esiti, setEsiti] = useState(() => {
    const m = {};
    partecipanti.forEach((p) => { m[p.id] = p.outcome || "Idoneo"; });
    return m;
  });
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [fatto, setFatto] = useState("");
  const [conferma, setConferma] = useState(false);

  const concluso = corso.status === "concluso";
  const docenti = [...new Set(sessioni.map((s) => s.teacher_name).filter(Boolean))].join(", ");
  const periodo = date.length ? date.map(dataBreve).join(" · ") : "-";
  const giorni = date.length
    ? date.map(dataBreve).reduce((t, d, i, arr) =>
        i === 0 ? d : i === arr.length - 1 ? `${t} e ${d}` : `${t}, ${d}`, "")
    : "-";
  // Le ore si dividono leggendo il titolo del modulo: e' il generale a essere
  // riconoscibile, tutto il resto e' specifica.
  const oreGenerale = sessioni
    .filter((x) => /generale/i.test(x.module_title || ""))
    .reduce((n, x) => n + (Number(x.hours) || 0), 0);

  const calcolati = partecipanti.map((p) => {
    const frequentate = Number(ore[p.id]) || 0;
    const perc = oreCorso ? frequentate / oreCorso : 0;
    const ammesso = perc >= SOGLIA;
    const esito = ammesso ? (esiti[p.id] || "Idoneo") : "Non ammesso";
    return {
      ...p, frequentate, ammesso, esito,
      percentuale: oreCorso ? `${Math.round(perc * 100)}%` : "-",
    };
  });

  const idonei = calcolati.filter((x) => x.esito === "Idoneo");
  const scadenza = piuAnni(dataVerifica || dataFine, VALIDITA_ANNI);

  const datiDoc = (elenco) => ({
    organizzatore: corso.organizer || company?.name || "",
    azienda: company?.name || "",
    ateco: company?.codice_ateco || "",
    titolo: (corso.title || "").toUpperCase(),
    classeRischio: corso.risk_class,
    oreTotali: oreCorso,
    oreGenerale,
    oreSpecifica: Math.max(oreCorso - oreGenerale, 0),
    giorni,
    sede: corso.venue,
    responsabileProgetto: corso.project_manager,
    legaleRappresentante: legale,
    docenti,
    periodo,
    dataVerifica: dataVerifica || dataFine,
    scadenza,
    note,
    partecipanti: (elenco || calcolati).map((x) => ({
      nome: x.person_name, codiceFiscale: x.tax_code, mansione: x.job_role,
      oreFrequentate: x.frequentate, percentuale: x.percentuale, esito: x.esito,
    })),
    moduli: sessioni.map((s) => ({ modulo: s.module_title, ore: s.hours, argomenti: s.topics })),
  });

  const nomeFile = (che) =>
    `${che}_${(corso.title || "corso").replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40)}.docx`;

  const scaricaProgetto = () => scaricaDocx(pacchettoDocx(corpoProgetto(datiDoc())), nomeFile("Progetto_formativo"));
  const scaricaVerbale = () => scaricaDocx(pacchettoDocx(corpoVerbale(datiDoc())), nomeFile("Verbale_verifica_finale"));
  const scaricaAttestati = () => {
    if (idonei.length === 0) { setErrore("Nessun partecipante idoneo: non ci sono attestati da rilasciare."); return; }
    setErrore("");
    return scaricaDocx(
      pacchettoDocx(corpoAttestati(datiDoc(idonei)), { conPiePagina: false, cornice: true }),
      nomeFile("Attestati"));
  };
  const scaricaIlRegistro = () => scaricaDocx(fileRegistro({
    organizzatore: corso.organizer || company?.name || "",
    titolo: (corso.title || "").toUpperCase(),
    classeRischio: corso.risk_class, oreTotali: oreCorso,
    sede: corso.venue, responsabileProgetto: corso.project_manager, legaleRappresentante: legale,
    sessioni: sessioni.map((s) => ({
      data: s.session_date, oraInizio: s.start_time, oraFine: s.end_time,
      ore: s.hours, modulo: s.module_title, argomenti: s.topics, docente: s.teacher_name,
    })),
    partecipanti: calcolati.map((x) => ({ nome: x.person_name, codiceFiscale: x.tax_code })),
  }), nomeFile("Registro_presenze"));

  // Chiusura: scrive in Cardine la nomina e l'attestato di ogni idoneo, cosi'
  // il quadro della formazione passa da rosso a verde da solo. Chi non e'
  // idoneo non viene scritto: l'attestato non gli spetta.
  const chiudi = async () => {
    if (!dataVerifica) { setErrore("Indica la data della verifica finale."); return; }
    if (idonei.length === 0) { setErrore("Nessun partecipante idoneo da registrare."); return; }
    setErrore(""); setBusy(true);

    let creati = 0;
    for (const x of idonei) {
      const nome = (x.person_name || "").trim();
      let nomina = nomine.find(
        (n) => n.role === formazioneRole && (n.person_name || "").trim() === nome);
      const giaFormato = nomina
        ? attestati.some((t) => t.appointment_id === nomina.id)
        : false;

      if (!nomina) {
        nomina = await addNomina({
          role: formazioneRole,
          person_name: nome,
          nomina_issue_date: dataVerifica,
          issue_date: null, validity_years: null, expiry_date: null,
          nomina_attachment_path: null, attestato_attachment_path: null,
          note: "",
        });
        if (!nomina) continue;
      }

      const ok = await addAttestato({
        appointment_id: nomina.id,
        course_kind: giaFormato ? "Aggiornamento" : "Corso base",
        issue_date: dataVerifica,
        validity_years: VALIDITA_ANNI,
        expiry_date: scadenza,
        attachment_path: null,
        note: `${corso.title} - ${oreCorso} ore - corso organizzato dall'azienda`,
      });
      if (ok) {
        creati++;
        // Il numero dell'attestato e' lo stesso stampato sul documento: si
        // salva perche' un attestato senza un numero rintracciabile agli atti
        // non si puo' ritrovare quando qualcuno lo esibisce.
        const numero = `${String(idonei.indexOf(x) + 1).padStart(2, "0")}/${String(dataVerifica).slice(0, 4)}`;
        await aggiornaPartecipante(x.id, {
          hours_attended: x.frequentate,
          outcome: x.esito,
          certificate_number: numero,
          exported_at: new Date().toISOString(),
        });
      }
    }

    for (const x of calcolati.filter((y) => y.esito !== "Idoneo")) {
      await aggiornaPartecipante(x.id, { hours_attended: x.frequentate, outcome: x.esito });
    }

    await aggiornaCorso(corso.id, {
      status: "concluso",
      final_test_date: dataVerifica,
      final_test_note: note,
    });
    await reloadNomine();
    setBusy(false);
    setConferma(false);
    setFatto(`Registrati ${creati} attestati. Il quadro della formazione è aggiornato.`);
    if (onAggiornato) onAggiornato();
  };

  return (
    <div className="corso-panel">
      <div className="panel-head">
        <div>
          <h3 style={{ margin: "0 0 6px" }}>{corso.title}</h3>
          <p className="sub" style={{ margin: 0 }}>
            {oreCorso} ore · {periodo} · {corso.venue || "sede non indicata"}
            {concluso && " · corso concluso"}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onChiudi} aria-label="Chiudi"><X size={16} /></button>
      </div>

      <p className="corso-sezione">Verifica finale</p>
      <div className="row-form" style={{ marginTop: 0 }}>
        <label className="field-label">Data della verifica
          <input type="date" value={dataVerifica} onChange={(e) => setDataVerifica(e.target.value)} disabled={concluso} />
        </label>
        <input type="text" className="note-input" placeholder="Legale rappresentante (firma gli attestati)"
          value={legale} onChange={(e) => setLegale(e.target.value)} />
      </div>
      <input type="text" className="full-input" placeholder="Note sul verbale (facoltative)"
        value={note} onChange={(e) => setNote(e.target.value)} />

      <p className="corso-sezione">Frequenza ed esiti</p>
      <p className="sub" style={{ margin: "0 0 10px" }}>
        Corso di <strong>{oreCorso} ore</strong>. È ammesso alla verifica chi ne ha frequentate almeno
        il 90%, cioè <strong>{Math.ceil(oreCorso * SOGLIA)}</strong>. Sotto quella soglia l'esito
        diventa "Non ammesso" e l'attestato non viene rilasciato.
      </p>
      <ul className="corso-esiti">
        {calcolati.map((x) => (
          <li key={x.id} className={x.ammesso ? "" : "fuori-soglia"}>
            <span className="corso-nome">{x.person_name}</span>
            <span className="log-cf">{x.tax_code || "senza codice fiscale"}</span>
            <label className="field-label" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              ore
              <input type="number" min="0" step="0.5" className="num" value={ore[x.id] ?? ""}
                disabled={concluso}
                onChange={(e) => setOre({ ...ore, [x.id]: e.target.value })} />
            </label>
            <span className="corso-perc">{x.percentuale}</span>
            {x.ammesso ? (
              <select value={esiti[x.id]} disabled={concluso}
                onChange={(e) => setEsiti({ ...esiti, [x.id]: e.target.value })}>
                <option value="Idoneo">Idoneo</option>
                <option value="Non idoneo">Non idoneo</option>
              </select>
            ) : (
              <span className="pill pill-alert">Non ammesso</span>
            )}
          </li>
        ))}
      </ul>

      <p className="corso-sezione">Documenti</p>
      <div className="row-form" style={{ marginTop: 0 }}>
        <button type="button" className="link-btn" onClick={scaricaProgetto}><FileDown size={14} /> Progetto formativo</button>
        <button type="button" className="link-btn" onClick={scaricaIlRegistro}><FileDown size={14} /> Registro presenze</button>
        <button type="button" className="link-btn" onClick={scaricaVerbale}><FileDown size={14} /> Verbale di verifica finale</button>
        <button type="button" className="link-btn" onClick={scaricaAttestati}><FileDown size={14} /> Attestati ({idonei.length})</button>
      </div>

      {errore && <p className="corso-avviso"><AlertTriangle size={14} /> {errore}</p>}
      {fatto && <p className="corso-esito"><CheckCircle2 size={14} /> {fatto}</p>}

      {!concluso && (
        <>
          <p className="corso-sezione">Chiusura del corso</p>
          <p className="sub" style={{ margin: "0 0 10px" }}>
            Chiudendo il corso, per ciascuno dei <strong>{idonei.length}</strong> idonei viene registrato
            in Cardine l'attestato di formazione lavoratori con data <strong>{dataBreve(dataVerifica) || "—"}</strong> e
            scadenza <strong>{dataBreve(scadenza) || "—"}</strong>. Chi non è idoneo non viene registrato.
          </p>
          {conferma ? (
            <div className="row-form" style={{ marginTop: 0 }}>
              <button type="button" className="btn-primary" onClick={chiudi} disabled={busy}>
                {busy ? "Registrazione…" : `Sì, registra ${idonei.length} attestati e chiudi`}
              </button>
              <button type="button" className="link-btn" onClick={() => setConferma(false)}>Annulla</button>
            </div>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setConferma(true)}>
              <Award size={15} /> Chiudi il corso e registra gli attestati
            </button>
          )}
        </>
      )}
    </div>
  );
}

// formazioneRole arriva da SicurezzaLavoro (FORMAZIONE_ROLE): e' l'etichetta
// con cui l'app riconosce la nomina "Formazione Generale e Specifica
// Lavoratori". Passandola come proprieta' invece di importarla si evita un
// import circolare fra i due moduli, e la definizione resta una sola.
export default function ArchivioCorsi({ formazioneRole }) {
  const { company } = useAuth();
  const { items: corsi, loading, reload } = useTable("training_courses", company?.id);
  const { items: sessioni } = useTable("training_course_sessions", company?.id);
  const { items: partecipanti } = useTable("training_course_participants", company?.id);
  const [apertoId, setApertoId] = useState(null);

  if (loading) return <p className="sub">Caricamento…</p>;
  if (corsi.length === 0) {
    return (
      <p className="none-label" style={{ margin: "16px 0 0" }}>
        Nessun corso registrato. I corsi che salvi restano qui, con i loro documenti.
      </p>
    );
  }
  const aperto = corsi.find((c) => c.id === apertoId);

  return (
    <div style={{ marginTop: 18 }}>
      <div className="tr-head">
        <span className="appt-section-label">Corsi organizzati dall'azienda</span>
      </div>
      <ul className="dish-list">
        {corsi.map((c) => {
          const suoi = partecipanti.filter((p) => p.course_id === c.id);
          return (
            <li key={c.id} className="dish-row">
              <div className="dish-top">
                <div>
                  <strong>{c.title}</strong>
                  <span className="lot-tag">{suoi.length} partecipanti</span>
                </div>
                <div className="med-row-actions">
                  <span className={"pill " + (c.status === "concluso" ? "pill-ok" : "pill-warn")}>
                    {c.status === "concluso" ? `concluso il ${dataBreve(c.final_test_date)}` : "in preparazione"}
                  </span>
                  <button type="button" className="link-btn"
                    onClick={() => setApertoId(apertoId === c.id ? null : c.id)}>
                    {apertoId === c.id ? "Chiudi" : "Apri"}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {aperto && (
        <SchedaCorso
          corso={aperto}
          sessioni={sessioni.filter((s) => s.course_id === aperto.id)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))}
          partecipanti={partecipanti.filter((p) => p.course_id === aperto.id)
            .sort((a, b) => (a.person_name || "").localeCompare(b.person_name || "", "it"))}
          formazioneRole={formazioneRole}
          onChiudi={() => setApertoId(null)}
          onAggiornato={reload}
        />
      )}
    </div>
  );
}
