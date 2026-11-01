// I registri a elenco: una riga per registrazione.
//
// I tre registri a calendario (temperature, pulizie, infestanti) stanno in
// registriStampa.js e hanno ciascuno una forma propria. Tutti gli altri
// moduli del manuale — acque, arrivo merci, fornitori, non conformità,
// manutenzione, olio, ghiaccio, abbattimento, cessioni — hanno invece la
// stessa identica forma: l'elenco di quello che è stato registrato nel
// mese, con quattro o cinque colonne. Quindi la funzione che li costruisce
// è una sola e per ciascun modulo si dichiara soltanto quali colonne porta.
//
// Come registriBase.js, questo file **non tocca il browser**: produce solo
// testo. È la condizione perché gli stessi registri li possa costruire
// anche la Edge Function che manda il riepilogo mensile, invece di avere
// due impaginazioni che col tempo divergono.
//
// Gli allegati non entrano nel registro: referti, bolle fotografate e
// rapporti di intervento restano nell'app. Nella colonna si legge che
// l'allegato c'è, non il file — un'email con tutti i documenti del mese
// pesherebbe decine di megabyte e il server di posta la rifiuterebbe.

import { esc, nomeMese, fmt, CSS, testata, firme } from "./registriBase.js";

// Un modulo senza registrazioni nel mese si manda lo stesso, con scritto
// che non ce ne sono state: in archivio una frase che lo dichiara vale, un
// foglio bianco sembra una dimenticanza. L'eccezione è il ritiro, che non
// è un registro ma un modulo da compilare se succede: quello si allega
// solo nei mesi in cui è stato usato.
export const SOLO_SE_USATO = ["ritiro"];

const si = (v) => (v ? "sì" : "—");
const testo = (v) => (v == null || v === "" ? "—" : String(v));
const data = (v) => (v ? fmt(v) : "—");

// Per ogni modulo: da quale elenco si pesca, quale campo porta la data su
// cui si filtra il mese, e le colonne del registro.
export const SPEC = {
  acque: {
    sorgente: "acque",
    campoData: "control_date",
    colonne: [
      ["Data", (r) => data(r.control_date), "9%"],
      ["Punto di prelievo", (r) => testo(r.sampling_point), "14%"],
      ["Tipo di controllo", (r) => testo(r.control_type), "20%"],
      ["Esito", (r) => testo(r.result), "9%"],
      ["Valore", (r) => testo(r.value), "8%"],
      ["Laboratorio", (r) => testo(r.lab), "12%"],
      ["Operatore", (r) => testo(r.operator), "12%"],
      ["Note", (r) => testo(r.note), null],
    ],
  },
  arrivomerci: {
    sorgente: "arrivi",
    campoData: "received_date",
    colonne: [
      ["Data", (r) => data(r.received_date), "9%"],
      ["Fornitore", (r) => testo(r.supplier_name), "18%"],
      ["Prodotto", (r) => testo(r.prodotto || r.product_name), "22%"],
      ["Lotto", (r) => testo(r.lot_number), "13%"],
      ["Scadenza", (r) => data(r.expiry_date), "9%"],
      ["Quantità", (r) => [r.quantity, r.unit].filter(Boolean).join(" ") || "—", "9%"],
      ["Operatore", (r) => testo(r.operator), "10%"],
      // Non il numero della bolla — quel campo non esiste — ma se il
      // documento di consegna è stato allegato alla registrazione: è ciò
      // che lega la riga alla carta conservata.
      ["Documento", (r) => (r.attachment_path ? "allegato" : "—"), null],
    ],
  },
  // I fornitori non sono eventi del mese: è l'elenco dei qualificati, e si
  // fotografa com'è al momento dell'invio.
  fornitori: {
    sorgente: "fornitori",
    campoData: null,
    nota: "L'elenco riporta i fornitori qualificati alla data di emissione del presente registro.",
    colonne: [
      ["Fornitore", (r) => testo(r.name), "22%"],
      ["P.IVA", (r) => testo(r.vat), "11%"],
      ["Prodotti forniti", (r) => testo(r.supplied_goods), "26%"],
      ["Dich. autocontrollo", (r) => si(r.self_control_declaration), "11%"],
      ["Dich. MOCA", (r) => si(r.moca_declaration), "10%"],
      ["Sorveglianza rinforzata", (r) => (r.reinforced_watch
        ? "sì" + (r.reinforced_watch_since ? " dal " + fmt(r.reinforced_watch_since) : "")
        : "—"), null],
    ],
  },
  nonconformita: {
    sorgente: "nonconformita",
    campoData: "detected_date",
    colonne: [
      ["Data del rilievo", (r) => data(r.detected_date), "10%"],
      ["Area", (r) => testo(r.area), "13%"],
      ["Descrizione", (r) => testo(r.description), "27%"],
      ["Responsabile", (r) => testo(r.responsible), "12%"],
      ["Azione correttiva", (r) => testo(r.corrective_action), "27%"],
      ["Chiusa il", (r) => data(r.resolved_date), null],
    ],
  },
  manutenzione: {
    sorgente: "manutenzioni",
    campoData: "intervention_date",
    colonne: [
      ["Data", (r) => data(r.intervention_date), "10%"],
      ["Attrezzatura o impianto", (r) => testo(r.equipment), "22%"],
      ["Tipo di intervento", (r) => testo(r.intervention_type), "22%"],
      ["Eseguito da", (r) => testo(r.performed_by), "16%"],
      ["Esito", (r) => testo(r.outcome), "15%"],
      ["Prossima scadenza", (r) => data(r.next_due), null],
    ],
  },
  // Il ritiro si ricava dalle non conformità marcate come tali: prodotto,
  // lotto, quantità, autorità informata e provvedimenti sono già lì.
  ritiro: {
    sorgente: "nonconformita",
    campoData: "recall_date",
    filtro: (r) => !!r.is_recall,
    colonne: [
      ["Data", (r) => data(r.recall_date || r.detected_date), "9%"],
      ["Tipo", (r) => testo(r.recall_kind), "10%"],
      ["Prodotto", (r) => testo(r.recall_product), "17%"],
      ["Lotto", (r) => testo(r.recall_lot), "11%"],
      ["Quantità", (r) => testo(r.recall_quantity), "8%"],
      ["Fornitore", (r) => testo(r.recall_supplier), "13%"],
      ["Autorità informata", (r) => testo(r.recall_authority), "13%"],
      ["Provvedimenti adottati", (r) => testo(r.recall_measures), null],
    ],
  },
  olio: {
    sorgente: "olio",
    campoData: "change_date",
    colonne: [
      ["Data", (r) => data(r.change_date), "10%"],
      ["Friggitrice", (r) => testo(r.fryer), "16%"],
      ["Motivo della sostituzione", (r) => testo(r.reason), "24%"],
      ["Litri", (r) => testo(r.liters), "8%"],
      ["Composti polari", (r) => (r.polar_compounds == null || r.polar_compounds === "" ? "—" : r.polar_compounds + "%"), "12%"],
      ["Tipo di olio", (r) => testo(r.oil_type), "14%"],
      ["Operatore", (r) => testo(r.operator), null],
    ],
  },
  ghiaccio: {
    sorgente: "ghiaccio",
    campoData: "intervention_date",
    colonne: [
      ["Data", (r) => data(r.intervention_date), "11%"],
      ["Tipo di intervento", (r) => testo(r.intervention_type), "30%"],
      ["Prodotto impiegato", (r) => testo(r.sanitizer), "20%"],
      ["Operatore", (r) => testo(r.operator), "16%"],
      ["Note", (r) => testo(r.notes), null],
    ],
  },
  raffreddamento: {
    sorgente: "abbattimenti",
    campoData: "start_time",
    colonne: [
      ["Data", (r) => data(r.start_time), "9%"],
      ["Prodotto", (r) => testo(r.product_name), "22%"],
      ["Ciclo", (r) => testo(r.cycle_type), "11%"],
      ["Inizio / cuore", (r) => [ora(r.start_time), r.start_core_temp != null ? r.start_core_temp + "°C" : null].filter(Boolean).join(" · ") || "—", "14%"],
      ["Fine / cuore", (r) => [ora(r.end_time), r.end_core_temp != null ? r.end_core_temp + "°C" : null].filter(Boolean).join(" · ") || "—", "14%"],
      ["Limite", (r) => [r.target_temp != null ? r.target_temp + "°C" : null, r.max_minutes ? "entro " + r.max_minutes + " min" : null].filter(Boolean).join(" ") || "—", "13%"],
      ["Esito", (r) => testo(r.outcome), "9%"],
      ["Operatore", (r) => testo(r.operator), null],
    ],
  },
  congelamento: {
    sorgente: "congelamenti",
    campoData: "freezing_date",
    colonne: [
      ["Data di congelamento", (r) => data(r.freezing_date), "12%"],
      ["Prodotto", (r) => testo(r.product_name), "24%"],
      ["Lotto", (r) => testo(r.lot_number), "13%"],
      ["Prodotto il", (r) => data(r.production_date), "11%"],
      ["Temperatura", (r) => (r.blast_temp == null ? "—" : r.blast_temp + "°C"), "11%"],
      ["Operatore", (r) => testo(r.operator), "14%"],
      ["Note", (r) => testo(r.notes), null],
    ],
  },
  bonifica: {
    sorgente: "bonifiche",
    campoData: "start_time",
    colonne: [
      ["Data e ora di inizio", (r) => [data(r.start_time), ora(r.start_time)].filter((x) => x && x !== "—").join(" "), "16%"],
      ["Quantità (kg)", (r) => testo(r.kg), "10%"],
      ["Esito", (r) => testo(r.outcome), "12%"],
      ["Conclusa il", (r) => data(r.resolved_at), "12%"],
      ["Operatore", (r) => testo(r.operator), "16%"],
      ["Note", (r) => testo(r.note), null],
    ],
  },
  cessioni: {
    sorgente: "cessioni",
    campoData: "shipment_date",
    colonne: [
      ["Data", (r) => data(r.shipment_date), "9%"],
      ["Destinatario", (r) => testo(r.customer_name), "20%"],
      ["P.IVA", (r) => testo(r.customer_vat), "11%"],
      ["Prodotto", (r) => testo(r.product_name), "20%"],
      ["Lotto", (r) => testo(r.lot_number), "12%"],
      ["Quantità", (r) => testo(r.quantity), "8%"],
      ["Documento", (r) => testo(r.document_ref), null],
    ],
  },
};

const ora = (iso) => {
  if (!iso) return "";
  const s = String(iso);
  const p = s.includes("T") ? s.split("T")[1] : "";
  return p ? p.slice(0, 5) : "";
};

const nelMese = (valore, mese) => String(valore || "").slice(0, 7) === mese;

// Le righe del mese per un modulo, già ordinate.
export function righeDelMese(chiave, mese, dati) {
  const spec = SPEC[chiave];
  if (!spec) return [];
  let righe = (dati?.[spec.sorgente] || []).slice();
  if (spec.filtro) righe = righe.filter(spec.filtro);
  if (spec.campoData) {
    // Alcune registrazioni portano la data dell'evento e, separata, quella
    // di inserimento: si filtra sulla prima, perché è quella che il
    // registro dichiara, ma se manca si ricade sulla seconda invece di far
    // sparire la riga.
    righe = righe.filter((r) => nelMese(r[spec.campoData] || r.created_at, mese));
    righe.sort((a, b) => String(a[spec.campoData] || a.created_at).localeCompare(String(b[spec.campoData] || b.created_at)));
  } else {
    righe.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }
  return righe;
}

export function htmlRegistroElenco({ chiave, mese, azienda, codice, titolo, righe }) {
  const spec = SPEC[chiave];
  if (!spec) return "";
  const cols = spec.colonne;

  const intestazioni = cols
    .map(([et, , larg]) => `<th${larg ? ` style="width:${larg}"` : ""}>${esc(et)}</th>`)
    .join("");

  const corpo = righe.length
    ? righe.map((r) => `<tr>${cols.map(([, prendi]) => `<td>${esc(prendi(r))}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${cols.length}" style="text-align:center;padding:10pt">
         Nel mese non sono state effettuate registrazioni su questo modulo.
       </td></tr>`;

  const notaSpec = spec.nota ? `<p class="nota">${esc(spec.nota)}</p>` : "";
  const notaVuoto = righe.length === 0 && spec.campoData
    ? `<p class="nota">L'assenza di registrazioni è dichiarata e non costituisce un controllo omesso: su questo modulo si registra soltanto al verificarsi dell'evento.</p>`
    : "";

  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>${esc(titolo)} — ${esc(nomeMese(mese))}</title><style>${CSS}</style></head><body>
${testata(azienda, titolo, mese, codice)}
<table>
  <tr>${intestazioni}</tr>
  ${corpo}
</table>
${notaSpec}${notaVuoto}
<div style="margin-top:7pt">${firme(azienda)}</div>
<p class="piede">Registro generato dall'applicativo gestionale dell'autocontrollo il ${fmt(new Date().toISOString())} — ${esc(azienda?.name || "")}. Le registrazioni originali, con i relativi allegati, sono conservate nel sistema informatico secondo la procedura allegata al manuale.</p>
</body></html>`;
}
