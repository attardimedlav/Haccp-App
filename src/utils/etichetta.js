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
//     piede: "ATTARDIMEDLAV",
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
export function stampaEtichette(elenco = [], opzioni = {}) {
  const larghezza = Number(opzioni.larghezzaMm) || 62;
  const altezza = Number(opzioni.altezzaMm) || 29;

  const una = (et = {}) => {
    const righe = (et.righe || [])
      .filter((r) => Array.isArray(r) ? String(r[1] ?? "").trim() !== "" : String(r ?? "").trim() !== "")
      .map((r) => Array.isArray(r)
        ? `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`
        : `<tr><td colspan="2">${esc(r)}</td></tr>`)
      .join("");

    return `
    <div class="et">
      <div class="tit">${esc(et.titolo || "")}</div>
      ${righe ? `<table>${righe}</table>` : ""}
      ${et.piede ? `<div class="pie">${esc(et.piede)}</div>` : ""}
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
  }
  .et:last-child { page-break-after: auto; break-after: auto; }
  .tit {
    font-size: 8.5pt; font-weight: bold; line-height: 1.05;
    text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    border-bottom: 0.3mm solid #000; padding-bottom: 0.5mm; margin-bottom: 0.6mm;
  }
  table { width: 100%; border-collapse: collapse; }
  /* Niente grigi e niente sfumature: la stampa termica non ha mezzi toni,
     tutto quello che non e' nero pieno esce sporco o non esce. */
  th {
    text-align: left; font-size: 5.2pt; font-weight: normal;
    text-transform: uppercase; letter-spacing: 0.02em;
    width: 19mm; padding: 0.05mm 0; line-height: 1.15; vertical-align: baseline;
  }
  td { font-size: 6.8pt; font-weight: bold; padding: 0.05mm 0; line-height: 1.15; vertical-align: baseline; }
  td[colspan] { font-size: 5.6pt; font-weight: normal; line-height: 1.1; padding-top: 0.4mm; }
  .pie { font-size: 5pt; margin-top: 0.4mm; }
</style></head><body>${(elenco.length ? elenco : [{}]).map(una).join("")}</body></html>`;

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

// Le date si scrivono uguali su tutte le etichette: scriverle a mano in ogni
// scheda e' il modo per ritrovarsele in tre formati diversi.
export const dataEtichetta = fmtData;

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
