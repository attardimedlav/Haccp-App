// L'etichetta da attaccare al prodotto.
//
// Il cartellino scritto a penna è il punto in cui la catena si rompe: i dati
// sono già tutti nell'app — denominazione, lotto, date, operatore — e finiscono
// ricopiati a mano su un pezzo di nastro, dove si cancellano, si staccano e
// qualche volta non si scrivono affatto.
//
// Qui l'etichetta si compone dai dati veri e si stampa. Non parla con nessuna
// stampante in particolare: costruisce una pagina della misura giusta e la
// manda alla stampa del browser, che è l'unica strada che funziona ovunque —
// una Brother QL collegata al computer, una termica di rete, l'AirPrint di un
// iPhone, o un foglio A4 di etichette adesive se il cliente non vuole comprare
// niente. Il giorno che si vorrà parlare direttamente a una stampante di rete,
// quel pezzo si aggiunge sopra senza toccare questo.
//
// La misura predefinita è quella del rotolo più comune, 62 x 29 mm.

const MM = (x) => `${x}mm`;

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtData(iso) {
  if (!iso) return "";
  const s = String(iso);
  const g = s.slice(0, 10).split("-");
  if (g.length !== 3) return s;
  const ora = s.length > 10 ? s.slice(11, 16) : "";
  return `${g[2]}/${g[1]}/${g[0]}${ora ? " " + ora : ""}`;
}

// Un'etichetta: un titolo (la denominazione del prodotto), le righe di dato e
// una riga finale piccola. Le righe vuote si saltano da sole, così la stessa
// funzione serve a tutte le schede senza che ognuna debba pensarci.
//
//   stampaEtichetta({
//     titolo: "Salmone",
//     righe: [["Lotto", "L-240"], ["Congelato il", "16/10/2026"]],
//   });
export function stampaEtichetta(et = {}, opzioni = {}) {
  const copie = Math.max(1, Math.min(20, Number(opzioni.copie) || 1));
  stampaEtichette(Array.from({ length: copie }, () => et), opzioni);
}

// Piu' etichette diverse in una stampa sola.
//
// Serve al frazionamento di un lotto: tre pezzi, tre cartellini che si
// distinguono solo per il progressivo. Chiamare tre volte stampaEtichetta
// aprirebbe tre finestre di stampa una dietro l'altra, e alla terza
// l'operatore ha gia' sbagliato: qui esce un documento solo, di tre pagine,
// dove ogni pagina e' un'etichetta.
// Le righe buone di un'etichetta: quelle vuote si saltano, cosi' la stessa
// etichetta serve sia dove il dato c'e' sia dove manca. Sta qui perche' la
// stampa e l'anteprima devono scartare esattamente le stesse righe: se una
// delle due ne mostrasse una in piu', l'OSA scriverebbe a penna una cosa
// diversa da quella che stampa il collega.
function righeBuone(et = {}) {
  return (et.righe || []).filter((r) => Array.isArray(r)
    ? String(r[1] ?? "").trim() !== ""
    : String(r ?? "").trim() !== "");
}

export function stampaEtichette(elenco = [], opzioni = {}) {
  const larghezza = Number(opzioni.larghezzaMm) || 62;
  const altezza = Number(opzioni.altezzaMm) || 29;

  // La riga e' una riga, non una tabella.
  //
  // Con due colonne il valore lungo — il nome del fornitore, «non riportata
  // dal fornitore» — andava a capo e mangiava due righe di rotolo. In linea,
  // l'etichetta e il suo valore stanno quasi sempre su una riga sola, e nello
  // stesso spazio ci sta il doppio delle informazioni.
  const una = (et = {}) => {
    const righe = righeBuone(et)
      .map((r) => Array.isArray(r)
        ? `<div class="r"><span class="k">${esc(r[0])}</span> <span class="v">${esc(r[1])}</span></div>`
        : `<div class="n">${esc(r)}</div>`)
      .join("");

    return `
    <div class="et">
      <div class="dentro">
        <div class="tit">${esc(et.titolo || "")}</div>
        ${righe}
      </div>
    </div>`;
  };

  const doc = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Etichetta</title>
<style>
  @page { size: ${MM(larghezza)} ${MM(altezza)}; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; }
  .et {
    width: ${MM(larghezza)}; height: ${MM(altezza)};
    padding: 1.2mm 1.8mm; overflow: hidden;
    page-break-after: always; break-after: page;
    --k: 1;
  }
  .et:last-child { page-break-after: auto; break-after: auto; }
  .tit {
    font-size: calc(8.5pt * var(--k)); font-weight: bold; line-height: 1.05;
    text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    border-bottom: 0.3mm solid #000; padding-bottom: 0.5mm; margin-bottom: 0.6mm;
  }
  /* Niente grigi e niente sfumature: la stampa termica non ha mezzi toni,
     tutto quello che non e' nero pieno esce sporco o non esce. */
  /* La misura sta sulla riga e non solo sui due pezzi dentro: altrimenti
     l'altezza della riga la decide il carattere del documento, che e' grande
     il triplo, e l'etichetta cresce senza che il testo cresca. */
  .r { font-size: calc(6.8pt * var(--k)); line-height: 1.18; }
  .k {
    font-size: calc(5.2pt * var(--k)); text-transform: uppercase;
    letter-spacing: 0.02em; white-space: nowrap;
  }
  .v { font-size: calc(6.8pt * var(--k)); font-weight: bold; }
  .n {
    font-size: calc(5.6pt * var(--k)); line-height: 1.1;
    margin-top: 0.5mm; padding-top: 0.4mm; border-top: 0.2mm solid #000;
  }
  /* Niente nome dell'azienda in fondo: su un 50 x 30 quella riga mangia
     spazio e non dice niente a nessuno — chi guarda il cartellino e' gia'
     dentro quell'azienda. Lo spazio serve al prodotto e al lotto. */
</style></head><body>${(elenco.length ? elenco : [{}]).map(una).join("")}
<script>
/* L'ETICHETTA CHE NON CI STA
   Il riquadro ha overflow:hidden, quindi fino a ieri quello che avanzava
   veniva tagliato via in silenzio: l'etichetta usciva dalla stampante senza
   le ultime righe e nessuno se ne accorgeva. Su un cartellino dove le ultime
   righe sono la conservazione e la scadenza, e' il difetto peggiore.
   Qui, prima di stampare, ogni etichetta si misura e si rimpicciolisce
   quanto basta per entrare nel rotolo. Non si taglia niente: il cartellino
   interno non e' destinato al consumatore, quindi non ha l'altezza minima dei
   caratteri del Reg. UE 1169/2011 e puo' essere scritto piu' piccolo. Sotto
   una certa misura pero' non si leggerebbe piu': li' ci si ferma, e meglio un
   rotolo piu' grande che un'etichetta illeggibile. */
(function () {
  var ets = document.querySelectorAll(".et");
  for (var i = 0; i < ets.length; i++) {
    var et = ets[i], dentro = et.firstElementChild, k = 1;
    while (dentro.scrollHeight > et.clientHeight - 2 && k > 0.6) {
      k -= 0.02;
      et.style.setProperty("--k", k.toFixed(2));
    }
  }
})();
</script></body></html>`;

  stampaHtml(doc);
}

// Manda in stampa una pagina HTML completa.
//
// Un iframe nascosto e non una finestra nuova: window.open lo bloccano i
// browser quando la stampa non parte da un click diretto, e su iPhone lascia
// aperta una scheda vuota che l'operatore deve chiudere a mano.
// Le opzioni servono all'etichetta di vendita, che ha un obbligo che il
// cartellino interno non ha: l'altezza minima dei caratteri del Reg. UE
// 1169/2011. Se il testo non entra nel rotolo a quella dimensione non si puo'
// rimpicciolire — si deve dirlo. Passando `altezzaMaxMm` e `seNonCiSta` la
// stampa viene fermata prima di partire e l'app avvisa, invece di stampare
// un'etichetta tagliata o fuori norma senza che nessuno se ne accorga.
export function stampaHtml(doc, opzioni = {}) {
  const telaio = document.createElement("iframe");
  telaio.setAttribute("aria-hidden", "true");
  telaio.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(telaio);

  const via = () => { try { document.body.removeChild(telaio); } catch { /* già tolto */ } };

  // Il browser lavora in pixel CSS: 1 mm sono 96/25,4 px. La conversione sta
  // qui una volta sola, cosi' chi chiama ragiona in millimetri come il rotolo.
  const PX_PER_MM = 96 / 25.4;

  telaio.onload = () => {
    const limite = Number(opzioni.altezzaMaxMm) || 0;
    if (limite && typeof opzioni.seNonCiSta === "function") {
      try {
        const corpo = telaio.contentDocument.body;
        const altezzaMm = corpo.scrollHeight / PX_PER_MM;
        // Un millimetro di tolleranza: gli arrotondamenti del browser non
        // devono far scattare l'avviso su un'etichetta che in realta' entra.
        if (altezzaMm > limite + 1) {
          via();
          opzioni.seNonCiSta(Math.ceil(altezzaMm));
          return;
        }
      } catch { /* se non si riesce a misurare, si stampa: meglio provare */ }
    }
    try {
      telaio.contentWindow.focus();
      telaio.contentWindow.print();
    } catch {
      via();
      return;
    }
    // Si toglie dopo, non subito: se lo si rimuove mentre la finestra di
    // stampa e' aperta, Chrome stampa una pagina bianca.
    setTimeout(via, 60000);
  };

  telaio.srcdoc = doc;
}

// ---------------------------------------------------------------------------
// L'ANTEPRIMA: l'etichetta da ricopiare a penna
//
// Non tutte le aziende comprano la stampante, e quelle che non la comprano non
// e' che smettano di dover identificare il prodotto: continuano a scrivere a
// mano, come hanno sempre fatto, e scrivono quello che si ricordano — che e'
// il punto in cui la catena si rompe davvero.
//
// L'anteprima mostra a schermo, in grande, esattamente i dati che sarebbero
// finiti sull'etichetta: l'OSA tiene aperto il telefono e li ricopia su un
// cartellino o su un pezzo di nastro. Non e' un ripiego di serie B — e' la
// stessa informazione, presa dagli stessi dati, con l'unica differenza che la
// mano che la scrive e' la sua.
//
// Due regole che valgono per sempre qui dentro:
//   1. l'anteprima NON e' una seconda versione dell'etichetta. Prende lo
//      stesso oggetto {titolo, righe} che si darebbe alla stampa e scarta le
//      stesse righe vuote. Il giorno che si aggiunge un dato all'etichetta,
//      compare in tutti e due i posti senza toccare niente.
//   2. l'anteprima non registra niente. Si apre sulla registrazione che esiste
//      gia', esattamente come il tasto di stampa: un cartellino, scritto a
//      penna o stampato, di un'operazione mai registrata resta un cartellino
//      che non si puo' dimostrare.
// ---------------------------------------------------------------------------

// Mostra una pagina HTML dentro l'app, in un riquadro che si chiude.
//
// Un iframe e non un pezzo di pagina: cosi' il documento mostrato e' lo stesso
// identico che si stamperebbe, con i suoi stili, senza che il foglio di stile
// dell'app gli entri dentro e gli cambi i caratteri.
export function anteprimaHtml(doc, opzioni = {}) {
  const fondo = document.createElement("div");
  fondo.style.cssText =
    "position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.45);" +
    "display:flex;align-items:center;justify-content:center;padding:16px;";

  const scheda = document.createElement("div");
  scheda.style.cssText =
    "background:#fff;border-radius:12px;max-width:620px;width:100%;max-height:92vh;" +
    "display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.3);" +
    "font-family:Arial,Helvetica,sans-serif;color:#1B2A22;";

  const testa = document.createElement("div");
  testa.style.cssText = "padding:14px 16px 10px;border-bottom:1px solid #EDF0EB;";
  testa.innerHTML =
    `<strong style="font-size:16px;display:block">${esc(opzioni.titolo || "Da scrivere sull'etichetta")}</strong>` +
    `<span style="font-size:13px;color:#4C5A52;display:block;margin-top:4px">${esc(
      opzioni.nota ||
      "Ricopia questi dati sul cartellino o sull'etichetta adesiva. Devono restare leggibili " +
      "e non cancellarsi fino al consumo del prodotto."
    )}</span>`;

  const telaio = document.createElement("iframe");
  telaio.setAttribute("title", "Anteprima dell'etichetta");
  telaio.style.cssText = "border:0;width:100%;flex:1;min-height:240px;background:#fff;";

  const piede = document.createElement("div");
  piede.style.cssText =
    "padding:10px 16px 14px;border-top:1px solid #EDF0EB;display:flex;gap:10px;" +
    "align-items:center;flex-wrap:wrap;";

  const via = () => { try { document.body.removeChild(fondo); } catch { /* gia' chiuso */ } };

  // Chi la stampante ce l'ha non deve uscire e rientrare: da qui si stampa.
  if (typeof opzioni.stampa === "function") {
    const stampa = document.createElement("button");
    stampa.type = "button";
    stampa.textContent = "Stampa l'etichetta";
    stampa.style.cssText =
      "font:inherit;font-size:14px;padding:9px 14px;border-radius:8px;border:none;" +
      "background:#2F6F4E;color:#fff;cursor:pointer;";
    stampa.onclick = () => { via(); opzioni.stampa(); };
    piede.appendChild(stampa);
  }

  const chiudi = document.createElement("button");
  chiudi.type = "button";
  chiudi.textContent = "Chiudi";
  chiudi.style.cssText =
    "font:inherit;font-size:14px;padding:9px 14px;border-radius:8px;" +
    "border:1px solid #D8DED6;background:#fff;color:#1B2A22;cursor:pointer;margin-left:auto;";
  chiudi.onclick = via;
  piede.appendChild(chiudi);

  fondo.onclick = (e) => { if (e.target === fondo) via(); };
  const tasto = (e) => { if (e.key === "Escape") { via(); document.removeEventListener("keydown", tasto); } };
  document.addEventListener("keydown", tasto);

  scheda.append(testa, telaio, piede);
  fondo.appendChild(scheda);
  document.body.appendChild(fondo);
  telaio.srcdoc = doc;
}

// L'anteprima delle etichette nel formato {titolo, righe}, la stessa che usano
// abbattimento, congelamento, bonifica, frazionamento e cartellino interno.
//
// A schermo non si imita il rotolo: un 62 x 29 mm sul telefono sarebbe
// illeggibile, e questa pagina serve proprio a essere letta mentre si scrive.
// Le etichette diventano righe grandi, una sotto l'altra, con la dicitura
// finale per esteso.
export function anteprimaEtichette(elenco = [], opzioni = {}) {
  const una = (et = {}, i, tot) => {
    const righe = righeBuone(et).map((r) => Array.isArray(r)
      ? `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`
      : `<tr><td colspan="2" class="dicitura">${esc(r)}</td></tr>`).join("");
    const numero = tot > 1 ? `<div class="num">Etichetta ${i + 1} di ${tot}</div>` : "";
    return `<div class="et">${numero}<div class="tit">${esc(et.titolo || "")}</div>
      ${righe ? `<table>${righe}</table>` : ""}</div>`;
  };

  const lista = elenco.length ? elenco : [{}];
  const doc = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Anteprima</title><style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1B2A22; margin: 0; padding: 14px 16px; }
  .et { border: 1px solid #D8DED6; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
  .num { font-size: 12px; color: #6E7C73; margin-bottom: 4px; }
  .tit { font-size: 19px; font-weight: bold; text-transform: uppercase; line-height: 1.2;
         border-bottom: 2px solid #1B2A22; padding-bottom: 6px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 12px; font-weight: normal; color: #4C5A52;
       text-transform: uppercase; letter-spacing: 0.02em; width: 38%;
       padding: 5px 8px 5px 0; vertical-align: baseline; }
  td { font-size: 17px; font-weight: bold; padding: 5px 0; vertical-align: baseline; }
  .dicitura { font-size: 13px; font-weight: normal; color: #1B2A22; line-height: 1.35;
              padding-top: 8px; border-top: 1px dashed #D8DED6; }
</style></head><body>${lista.map((et, i) => una(et, i, lista.length)).join("")}</body></html>`;

  anteprimaHtml(doc, {
    titolo: opzioni.titolo || (lista.length > 1
      ? `Da scrivere su ${lista.length} etichette`
      : "Da scrivere sull'etichetta"),
    nota: opzioni.nota,
    // Si stampa con le stesse opzioni con cui sarebbe partita la stampa, cosi'
    // il formato del rotolo non cambia solo perche' si e' passati da qui.
    stampa: opzioni.senzaStampa ? undefined : () => stampaEtichette(elenco, opzioni),
  });
}

export function anteprimaEtichetta(et = {}, opzioni = {}) {
  anteprimaEtichette([et], opzioni);
}

// Le date si scrivono uguali su tutte le etichette: scriverle a mano in ogni
// scheda e' il modo per ritrovarsele in tre formati diversi.
export const dataEtichetta = fmtData;

// ---------------------------------------------------------------------------
// I DATI CHE NON POSSONO MANCARE
//
// Le righe vuote si saltano (righeBuone), ed e' giusto per le righe davvero
// facoltative. Non lo e' per la scadenza: se l'arrivo merci non la riporta, la
// riga sparisce e il cartellino in cella risulta senza scadenza — sembra
// completo e non lo e'. Chi lo guarda, in un controllo, non puo' sapere se la
// data manca perche' il fornitore non l'ha messa o perche' l'app se l'e' persa.
//
// Un dato che manca si scrive che manca. E' un'informazione vera, e sposta la
// domanda dove deve stare: sul documento del fornitore.
export function oppure(valore, seManca) {
  const v = String(valore ?? "").trim();
  return v !== "" ? v : seManca;
}

// La temperatura di conservazione, scritta come va scritta su un'etichetta.
//
// Una tabella sola perche' il codice sta nel database (lot_splits) e il testo
// finisce stampato: se le due cose vivessero in posti diversi, prima o poi lo
// stesso codice uscirebbe stampato «+4» in un punto e «+2» in un altro.
export const CONSERVAZIONE = {
  refrigerato_4: "≤ +4 °C",
  refrigerato_2: "≤ +2 °C",
  congelato: "≤ −18 °C",
  ambiente: "temperatura ambiente",
};

export const CONSERVAZIONE_SCELTE = [
  { id: "refrigerato_4", label: "Refrigerato, ≤ +4 °C" },
  { id: "refrigerato_2", label: "Refrigerato, ≤ +2 °C (carni fresche)" },
  { id: "congelato", label: "Congelato, ≤ −18 °C" },
  { id: "ambiente", label: "Temperatura ambiente" },
];

export function conservazione(codice) {
  return CONSERVAZIONE[codice] || "";
}

// Il conto della data entro cui consumare.
//
// Si fa qui e non nelle schede perche' i punti sono due — i cotti raffreddati
// e i congelati — e una data calcolata in due posti prima o poi viene diversa
// nei due posti. Se la durata non e' stata dichiarata non si restituisce
// niente: l'etichetta allora rimanda al manuale, che e' la verita'. Inventare
// una scadenza per conto dell'azienda vorrebbe dire stampare una data falsa, e
// sul cartellino di un alimento non e' un dettaglio.
function aData(iso) {
  if (!iso) return null;
  const s = String(iso);
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function scriviData(d) {
  const gg = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${gg}/${mm}/${d.getFullYear()}`;
}

export function dataPiuGiorni(iso, giorni) {
  const d = aData(iso);
  const n = Number(giorni);
  if (!d || !n || n <= 0) return "";
  d.setDate(d.getDate() + n);
  return scriviData(d);
}

export function dataPiuMesi(iso, mesi) {
  const d = aData(iso);
  const n = Number(mesi);
  if (!d || !n || n <= 0) return "";
  const giorno = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  // Il 31 gennaio piu' un mese, in JavaScript, diventa il 3 marzo: una
  // scadenza piu' lunga di quella dichiarata. Si taglia all'ultimo giorno del
  // mese giusto.
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(giorno, ultimo));
  return scriviData(d);
}

// Il filo fra il cartellino e la registrazione.
//
// La domanda, in un controllo ufficiale, e' sempre la stessa: «fammi vedere la
// registrazione di questo cartellino». Finora bisognava cercarla a occhio
// nella lista. Le ultime sei cifre dell'identificativo bastano a trovarla e
// occupano una riga sola.
export function riferimento(id) {
  const s = String(id ?? "").replace(/[^0-9a-zA-Z]/g, "");
  return s ? s.slice(-6).toUpperCase() : "";
}

// La misura del rotolo di quell'azienda, da passare a stampaEtichetta.
//
// Sta qui e non nei punti di stampa perche' i punti sono tre — abbattimento,
// congelamento, bonifica — e una misura ripetuta in tre posti e' una misura
// che prima o poi diventa diversa in uno dei tre.
//
// Il valore si imposta in Configurazione, perche' il rotolo lo compra il
// cliente e nessuno puo' saperlo per lui. Se non l'ha impostato restano i
// 62 x 29 mm, che e' il formato piu' diffuso: cosi' chi non ha una stampante
// di etichette non deve configurare niente.
export function formatoEtichetta(azienda = {}) {
  return {
    larghezzaMm: Number(azienda?.label_width_mm) || 62,
    altezzaMm: Number(azienda?.label_height_mm) || 29,
  };
}

// Il rotolo dell'etichetta di vendita, che e' un'altra cosa dal cartellino.
//
// Qui non c'e' un valore predefinito e il ritorno e' null quando l'azienda non
// l'ha impostato: senza rotolo dichiarato l'etichetta di vendita resta un
// foglio, come prima. Inventarsi una misura vorrebbe dire stampare
// un'etichetta destinata al consumatore su una carta che nessuno ha scelto.
export function formatoEtichettaVendita(azienda = {}) {
  const l = Number(azienda?.label_sale_width_mm) || 0;
  const h = Number(azienda?.label_sale_height_mm) || 0;
  return l && h ? { larghezzaMm: l, altezzaMm: h } : null;
}
