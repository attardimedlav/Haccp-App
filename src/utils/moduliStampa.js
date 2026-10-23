// I moduli di registrazione in bianco, uno per uno, da stampare o salvare
// in PDF.
//
// Il .docx con tutti i moduli resta: serve al consulente che deposita
// l'allegato insieme al manuale. Questo e' un'altra cosa — l'OSA che ha
// finito i fogli del registro temperature e ne vuole ristampare due, senza
// scaricare venti pagine e cercare quella giusta. Dal dialogo di stampa del
// browser «Salva come PDF» produce il file, che e' la richiesta: un PDF per
// modulo, preso da un elenco.
//
// Il contenuto e' lo stesso del .docx (moduliRegistrazioneDocx.js) e i
// codici vengono dallo stesso elenco (moduliElenco.js): un modulo stampato
// da qui e lo stesso modulo preso dall'allegato devono essere il medesimo
// foglio, altrimenti in ispezione si vedono due versioni dello stesso
// registro.

import { stampaHtml } from "./etichetta";
import { elencoModuli } from "./moduliElenco";

const esc = (t) =>
  String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const dataIt = (iso) => {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [a, m, g] = s.split("-");
  return `${g}/${m}/${a}`;
};

const css = (orizzontale) => `
  @page { size: A4 ${orizzontale ? "landscape" : "portrait"}; margin: 10mm 10mm 9mm; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, Carlito, Arial, sans-serif; color: #1B2A22; margin: 0; }
  h1 { font-size: 13pt; margin: 0 0 3pt; letter-spacing: .2px;
       border-bottom: 1px solid #777; padding-bottom: 3pt; }
  .sotto { font-size: 8pt; color: #3F5147; margin: 0 0 7pt; }
  .campi { font-size: 10pt; font-weight: 600; margin: 0 0 6pt; }
  .nota { font-size: 7.6pt; color: #3F5147; font-style: italic; margin: 6pt 0 0; line-height: 1.35; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th, td { border: .6pt solid #6b7a70; padding: 2pt 3pt; font-size: 8pt;
           vertical-align: top; word-wrap: break-word; }
  th { background: #E6EFE8; font-size: 7.4pt; text-align: center; font-weight: 700; }
  td.vuota { height: 22pt; }
  table.scheda td.et { background: #F1F4F0; font-weight: 600; width: 38%; }
  table.scheda td { height: 21pt; }
  table.fitta td.vuota { height: 15pt; }
  .cartellino { margin: 0 0 9pt; }
  .cartellino td { height: 40pt; }
  .firma { font-size: 9pt; margin: 14pt 0 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

// Intestazione comune: la stessa del .docx, con il responsabile accanto al
// titolo e non in fondo, cosi' la firma non si porta via mezzo foglio.
function testata(azienda, modulo, revisione) {
  const resp = azienda?.haccp_manager || "____________________";
  const rev = revisione && revisione.numero
    ? `   ·   Allegato al Manuale rev. ${esc(revisione.numero)}${dataIt(revisione.data) ? " del " + dataIt(revisione.data) : ""}`
    : "";
  return `<h1>${esc(modulo.codice)} — ${esc(modulo.intestazione)}</h1>
<p class="sotto">${esc(azienda?.name || "")}   ·   Responsabile del Piano di Autocontrollo: ${esc(resp)}   ·   Firma ____________________${rev}</p>`;
}

const intesta = (celle) =>
  "<tr>" + celle.map((c) => {
    const [t, w] = Array.isArray(c) ? c : [c, null];
    return `<th${w ? ` style="width:${w}"` : ""}>${String(t).replace(/\|/g, "<br>")}</th>`;
  }).join("") + "</tr>";

const righeVuote = (n, colonne) =>
  Array.from({ length: n }, () =>
    "<tr>" + Array.from({ length: colonne }, () => '<td class="vuota"></td>').join("") + "</tr>").join("");

const tabellaVuota = (celle, n, o = {}) =>
  `<table${o.fitta ? ' class="fitta"' : ""}>${intesta(celle)}${righeVuote(n, celle.length)}</table>`;

const schedaVuota = (voci) =>
  `<table class="scheda">` +
  voci.map((v) => `<tr><td class="et">${esc(v)}</td><td></td></tr>`).join("") +
  `</table>`;

const nota = (t) => `<p class="nota">${t}</p>`;

// ----------------------------------------------------------------------
// Il corpo di ciascun modulo. La chiave e' quella di moduliElenco.js.
// Ritorna { orizzontale, html }.
// ----------------------------------------------------------------------
function corpo(chiave, dati, cod) {
  const { azienda = {}, impianti = [], piano = [], postazioni = [] } = dati || {};

  if (chiave === "temperature") {
    const MESI = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
    const righe = [];
    for (let g = 1; g <= 31; g++) {
      righe.push(`<tr><td style="text-align:center">${g}</td>` +
        MESI.map(() => '<td class="vuota"></td>').join("") + "</tr>");
    }
    righe.push('<tr><td style="text-align:center;font-weight:700;font-size:6.6pt">FIRMA</td>' +
      MESI.map(() => '<td class="vuota"></td>').join("") + "</tr>");
    return {
      orizzontale: false,
      html:
        nota("Rilevazione una volta al giorno, alla stessa ora. Una scheda per ciascun impianto, per anno solare.") +
        schedaVuota(["Impianto da controllare", "Limiti di conformità", "Ora di rilevamento", "Anno"]) +
        '<p class="campi">&nbsp;</p>' +
        `<table class="fitta">${intesta([["G.", "34pt"], ...MESI])}${righe.join("")}</table>` +
        nota(`Valore fuori limite: annotare l'accaduto sul modulo ${esc(cod("nonconformita"))} «Registrazione non conformità» e applicare l'azione correttiva prevista dal manuale.`) +
        (impianti.length
          ? nota("Impianti censiti in azienda: " + impianti.map((u) => esc(u.label)).join(" · ") + ". Una scheda per ciascuno.")
          : ""),
    };
  }

  if (chiave === "olio") {
    return {
      orizzontale: false,
      html:
        nota("Si registra ogni sostituzione dell'olio. Il controllo sensoriale quotidiano è buona prassi e non si registra.") +
        tabellaVuota([["DATA", "11%"], "MOTIVO DELLA SOSTITUZIONE", ["LITRI", "9%"], ["COMPOSTI POLARI|(se misurati)", "15%"], ["FIRMA", "13%"]], 22) +
        nota("Motivo: sostituzione programmata · colore scuro · odore acre · fumo alla temperatura di esercizio · schiuma persistente · aumento della viscosità · composti polari prossimi al 25%.") +
        nota("L'olio esausto è raccolto in contenitore chiuso omologato e conferito a ditta autorizzata: conservare i documenti di conferimento."),
    };
  }

  if (chiave === "acque") {
    return {
      orizzontale: false,
      html:
        nota("Frequenze secondo il libretto d'uso e manutenzione del produttore del dispositivo.") +
        tabellaVuota([["DATA", "11%"], "TIPO DI INTERVENTO", ["ESEGUITO DA", "18%"], ["ESITO / NOTE", "20%"], ["FIRMA", "12%"]], 22) +
        nota("Tipo di intervento: sostituzione del filtro · ricarica del dosatore · sanificazione dell'impianto · flussaggio dopo fermo superiore a due giorni · manutenzione del tecnico · campionamento e analisi.") +
        nota("I rapporti di prova delle analisi, il libretto del dispositivo e la dichiarazione di conformità dei materiali a contatto si conservano allegati al manuale."),
    };
  }

  if (chiave === "pulizie") {
    const attive = (piano || [])
      .filter((r) => r.active !== false)
      .filter((r) => !r.requires_flag || azienda[r.requires_flag])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const FASCE = [
      { titolo: "OGNI GIORNO", test: (g) => g === 1 },
      { titolo: "OGNI SETTIMANA", test: (g) => g > 1 && g <= 14 },
      { titolo: "OGNI MESE", test: (g) => g > 14 && g <= 90 },
      { titolo: "PIÙ VOLTE L'ANNO", test: (g) => g > 90 },
      { titolo: "QUANDO OCCORRE", test: (g) => !g || g <= 0 },
    ];
    const celleGiorni = Array.from({ length: 31 }, () => '<td class="vuota"></td>').join("");
    let righe = "";
    if (attive.length) {
      FASCE.forEach((f) => {
        const r = attive.filter((x) => f.test(Number(x.frequency_days)));
        if (!r.length) return;
        righe += `<tr><td colspan="33" style="background:#DCE6DD;font-weight:700;font-size:7.6pt">${esc(f.titolo)}</td></tr>`;
        r.forEach((x) => {
          righe += `<tr><td style="font-size:7.4pt">${esc(x.operation)}${x.area ? ` <span style="color:#3F5147">(${esc(x.area)})</span>` : ""}</td>` +
            `<td style="font-size:7pt">${esc(x.product || "")}</td>${celleGiorni}</tr>`;
        });
      });
    } else {
      righe = Array.from({ length: 22 }, () =>
        `<tr><td class="vuota"></td><td class="vuota"></td>${celleGiorni}</tr>`).join("");
    }
    const giorni = Array.from({ length: 31 }, (_, i) => [String(i + 1), "2.1%"]);
    return {
      orizzontale: true,
      html:
        '<p class="campi">Mese ____________________     Anno 20______</p>' +
        nota(attive.length
          ? "Una scheda per mese: barrare la casella del giorno in cui l'intervento è stato eseguito. Le voci e le frequenze sono quelle del programma di pulizia dell'azienda."
          : "Una scheda per mese: barrare la casella del giorno in cui l'intervento è stato eseguito.") +
        `<table class="fitta">${intesta([["ATTREZZATURA / AREA", "26%"], ["SANIFICANTE USATO", "11%"], ...giorni])}${righe}</table>` +
        nota("Concentrazioni e tempi di contatto: seguire le schede tecniche dei prodotti. Gli interventi non previsti in elenco si annotano sul retro del foglio."),
    };
  }

  if (chiave === "arrivomerci") {
    return {
      orizzontale: true,
      html:
        nota("Si compila per le consegne il cui documento non riporta lotto e scadenza. Per le altre è sufficiente conservare bolla o fattura.") +
        tabellaVuota([["DATA", "7%"], "PRODOTTO", "FORNITORE", ["LOTTO / QUANTITÀ", "11%"],
          ["N. BOLLA O FATTURA", "11%"], ["STATO DELLA MERCE|C / NC", "10%"],
          ["ETICHETTATURA|C / NC", "9%"], ["SCADENZA|C / NC", "8%"], ["FIRMA", "8%"]], 15) +
        nota("C = conforme · NC = non conforme. Stato della merce: controllo sensoriale della catena del freddo — refrigerati freddi al tatto, surgelati duri, senza brina abbondante né confezioni ammorbidite.") +
        nota(`In caso di non conformità: contrassegnare la merce «Non toccare — da restituire al fornitore», respingerla e registrare l'evento sul modulo ${esc(cod("nonconformita"))}.`),
    };
  }

  if (chiave === "fornitori") {
    const voci = [
      "Denominazione del fornitore",
      "Sede e ragione sociale",
      "Prodotto o servizio fornito",
      "Dichiarazione di applicazione dell'autocontrollo (data)",
      "Dichiarazione di conformità MOCA (se pertinente)",
      "Modalità di consegna",
      "Verifiche eseguite prima dell'introduzione del prodotto",
      "Sorveglianza rinforzata sulla catena del freddo (data e motivo)",
    ];
    return {
      orizzontale: false,
      html:
        nota("Una scheda per fornitore. Si aggiorna all'inserimento di un nuovo fornitore e a ogni variazione.") +
        schedaVuota(voci) + '<p class="campi">&nbsp;</p>' + schedaVuota(voci),
    };
  }

  if (chiave === "nonconformita") {
    return {
      orizzontale: false,
      html:
        nota("Si registra ogni scostamento rilevato: merce respinta, temperatura fuori limite, esito analitico non conforme, presenza di infestanti, guasto di un'attrezzatura, reclamo del cliente.") +
        tabellaVuota([["DATA", "11%"], "IDENTIFICAZIONE DELLA NON CONFORMITÀ", "AZIONE CORRETTIVA ADOTTATA", ["ESITO", "10%"], ["FIRMA", "11%"]], 18) +
        nota("Il prodotto non conforme viene isolato e identificato con la dicitura «Non toccare — merce non conforme» fino alla decisione del responsabile."),
    };
  }

  if (chiave === "manutenzione") {
    return {
      orizzontale: false,
      html:
        nota("Manutenzione ordinaria a cura del personale interno, straordinaria a cura di ditte qualificate. Comprende la taratura dei termometri e la sostituzione dei filtri.") +
        tabellaVuota([["DATA", "11%"], "IDENTIFICAZIONE ATTREZZATURA", ["ESEGUITO DA", "19%"], "ESITO DELL'INTERVENTO", ["FIRMA", "11%"]], 18) +
        nota("Dopo ogni intervento si ripristinano le condizioni igieniche secondo la procedura di pulizia e sanificazione."),
    };
  }

  if (chiave === "infestanti") {
    const attive = (postazioni || []).filter((p) => p.active !== false)
      .sort((a, b) => String(a.code).localeCompare(String(b.code), "it", { numeric: true }));
    const giri = Array.from({ length: 13 }, () => ["data|___/___", "5.6%"]);
    let tabella;
    if (attive.length) {
      const righe = attive.map((p) =>
        `<tr><td style="text-align:center">${esc(p.code || "")}</td>` +
        `<td style="font-size:7.4pt">${esc([p.kind, p.placement, p.indoor ? "interna" : "esterna"].filter(Boolean).join(" — "))}</td>` +
        Array.from({ length: 13 }, () => '<td class="vuota"></td>').join("") + "</tr>").join("");
      tabella = `<table class="fitta">${intesta([["N.", "5%"], ["TIPO E COLLOCAZIONE", "22%"], ...giri])}${righe}</table>`;
    } else {
      tabella = tabellaVuota([["DATA", "9%"], ["ALATI", "8%"], ["STRISCIANTI", "10%"],
        ["RODITORI", "9%"], "LIVELLO DI PRESENZA", "AMBIENTE INTERESSATO", ["FIRMA", "12%"]], 18);
    }
    return {
      orizzontale: true,
      html:
        '<p class="campi">Trimestre  da ____________________  a ____________________     Anno 20______</p>' +
        nota("Ispezione settimanale a cura del responsabile del piano di autocontrollo. Una colonna per giro: si scrive la data in testa e l'esito rilevato su ciascuna postazione.") +
        tabella +
        nota("Per ogni postazione: A assente · T tracce · C catture · M esca mancante o danneggiata. Il giro si considera eseguito quando tutte le postazioni risultano controllate.") +
        nota("Livello di presenza: assente · bassa · media · alta. Da «media» in su il responsabile ricorre a ditta specializzata, seguita dalla sanificazione dei locali; l'intervento si registra su questa stessa scheda e il rapporto della ditta si conserva agli atti."),
    };
  }

  if (chiave === "ritiro") {
    return {
      orizzontale: false,
      html:
        nota("Da compilare e trasmettere all'Autorità sanitaria competente, ai sensi dell'art. 19 del Reg. (CE) n. 178/2002.") +
        schedaVuota([
          "Data della comunicazione", "Autorità sanitaria destinataria", "Denominazione del prodotto",
          "Fornitore / produttore", "Lotto e termine di conservazione", "Quantità interessata",
          "Quantità ancora giacente in azienda", "Motivo del ritiro", "Origine della segnalazione",
          "Provvedimenti adottati",
        ]) +
        nota("La merce interessata viene isolata, identificata con la dicitura «Merce non conforme — non utilizzare» e tenuta a disposizione dell'Autorità di controllo, che ne stabilisce la destinazione.") +
        '<p class="firma">Luogo e data  ______________________________________</p>',
    };
  }

  if (chiave === "ghiaccio") {
    return {
      orizzontale: false,
      html:
        nota(`Qui si annotano gli interventi che non hanno una cadenza: pulizia straordinaria, intervento della ditta esterna, sostituzione del filtro dell'acqua, decalcificazione. L'ispezione del contenitore e la pulizia ordinaria, che hanno una frequenza stabilita, si registrano sul programma di sanificazione (${esc(cod("pulizie"))}).`) +
        tabellaVuota([["DATA", "10%"], "TIPO DI INTERVENTO", ["ESEGUITO DA", "16%"], ["PRODOTTO USATO", "16%"], "ESITO / NOTE", ["FIRMA", "10%"]], 18) +
        nota("Il ghiaccio destinato al contatto con gli alimenti è ottenuto da acqua potabile (Reg. CE 852/2004, Allegato II, Capitolo VII)."),
    };
  }

  if (chiave === "raffreddamento") {
    return {
      orizzontale: false,
      html:
        nota("Un rigo per ciclo. Si registrano la temperatura e l'ora di inizio e di fine. Qui il tempo è un riferimento e non un limite: gli abbattitori recenti si fermano sulla sonda, e quello che conta è la temperatura raggiunta al cuore del prodotto.") +
        tabellaVuota([["DATA", "10%"], "PRODOTTO", ["QUANTITÀ", "10%"], ["INIZIO|ora / °C", "14%"], ["FINE|ora / °C", "14%"], ["DESTINAZIONE", "14%"], ["FIRMA", "9%"]], 18) +
        nota(`Il prodotto raffreddato si etichetta con la data di produzione e il termine di conservazione, e si conserva in frigorifero fino all'impiego. Un ciclo che non arriva alla temperatura prevista si annota su ${esc(cod("nonconformita"))} con l'azione correttiva adottata.`),
    };
  }

  if (chiave === "congelamento") {
    return {
      orizzontale: false,
      html:
        nota("Per le partite congelate allo scopo di conservarle: gelati, semifreddi, tavola calda, preparati di laboratorio. Non è la bonifica del pesce crudo, che è un trattamento sanitario e ha una scheda propria. La riga si chiude quando la partita esce dal congelatore.") +
        tabellaVuota(["PRODOTTO E LOTTO", ["PRODOTTO IL", "12%"], ["CONGELATO IL", "12%"],
          ["T. AL CUORE|°C", "10%"], ["USCITO IL", "11%"], ["COME SCONGELATO", "17%"], ["FIRMA", "9%"]], 18) +
        nota("Ogni partita porta un cartellino con denominazione, lotto e data di congelamento. Lo scongelamento si fa in frigorifero a non più di +4 °C, oppure per cottura diretta se il prodotto è già porzionato: mai a temperatura ambiente. Il prodotto scongelato non si ricongela."),
    };
  }

  if (chiave === "bonifica") {
    return {
      orizzontale: false,
      html:
        nota("Trattamento sanitario obbligatorio per il pesce destinato a essere consumato crudo, marinato o poco cotto (Reg. CE 853/2004, allegato III, sezione VIII). I parametri non si scelgono: −20 °C per 24 ore oppure −35 °C per 15 ore, in tutte le parti del prodotto.") +
        tabellaVuota([["DATA", "9%"], "PRODOTTO E LOTTO", ["QUANTITÀ", "10%"],
          ["TRATTAMENTO|−20 °C/24 h · −35 °C/15 h", "20%"], ["INIZIO|ora", "9%"], ["FINE|ora", "9%"], ["FIRMA", "12%"]], 18) +
        nota("Qui, a differenza del raffreddamento dei cotti, la durata È il limite: un trattamento più breve del dovuto non ha ucciso le larve di Anisakis, e il prodotto non può essere servito crudo. Ora di inizio e ora di fine vanno scritte entrambe.") +
        nota("Il pesce bonificato si identifica con il lotto e la data del trattamento fino al momento del servizio."),
    };
  }

  if (chiave === "cartellini") {
    const uno = `<table class="cartellino">${intesta([["DENOMINAZIONE DEL PRODOTTO", "46%"], "PRODOTTO IL", "DA CONSUMARSI ENTRO"])}<tr><td></td><td></td><td></td></tr></table>`;
    return {
      orizzontale: false,
      html:
        nota("Da compilare, ritagliare e attaccare al contenitore di ogni preparato messo in conservazione: semilavorati, creme, ripieni, impasti, prodotti finiti.") +
        uno.repeat(5) +
        nota("Chi ha la stampante di etichette non usa questo foglio: l'etichetta si stampa dalla scheda Preparazioni con i dati già scritti, e riporta anche il lotto interno e gli allergeni."),
    };
  }

  if (chiave === "cessioni") {
    return {
      orizzontale: false,
      html:
        nota("Si registra quello che viene ceduto ad altre imprese — bar, ristoranti, negozi, mense, grossisti — come previsto dall'art. 18 del Reg. (CE) n. 178/2002. Le vendite al consumatore finale non si registrano.") +
        tabellaVuota([["DATA", "10%"], "DESTINATARIO", "PRODOTTO", ["LOTTO", "11%"],
          ["QUANTITÀ", "10%"], ["DOCUMENTO", "12%"], ["FIRMA", "9%"]], 18) +
        nota("Se un lotto viene richiamato, è da questo foglio che si ricava l'elenco delle imprese da avvisare. Il documento di accompagnamento (DDT, fattura) si conserva insieme al registro."),
    };
  }

  return { orizzontale: false, html: "" };
}

// Il documento completo di un modulo. dati: { azienda, impianti, piano,
// postazioni, revisione }.
export function htmlModulo(chiave, dati = {}) {
  const azienda = dati.azienda || {};
  const moduli = elencoModuli(azienda);
  const modulo = moduli.find((m) => m.chiave === chiave);
  if (!modulo) return "";
  const cod = (k) => (moduli.find((m) => m.chiave === k) || {}).codice || "";
  const { orizzontale, html } = corpo(chiave, dati, cod);
  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>${esc(modulo.codice)} — ${esc(modulo.titolo)}</title>
<style>${css(orizzontale)}</style></head><body>
${testata(azienda, modulo, dati.revisione)}
${html}
</body></html>`;
}

export function stampaModulo(chiave, dati = {}) {
  const doc = htmlModulo(chiave, dati);
  if (doc) stampaHtml(doc);
}
