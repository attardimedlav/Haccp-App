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
  const larghezza = Number(opzioni.larghezzaMm) || 62;
  const altezza = Number(opzioni.altezzaMm) || 29;
  const copie = Math.max(1, Math.min(20, Number(opzioni.copie) || 1));

  const righe = (et.righe || [])
    .filter((r) => Array.isArray(r) ? String(r[1] ?? "").trim() !== "" : String(r ?? "").trim() !== "")
    .map((r) => Array.isArray(r)
      ? `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`
      : `<tr><td colspan="2">${esc(r)}</td></tr>`)
    .join("");

  const una = `
    <div class="et">
      <div class="tit">${esc(et.titolo || "")}</div>
      ${righe ? `<table>${righe}</table>` : ""}
      ${et.piede ? `<div class="pie">${esc(et.piede)}</div>` : ""}
    </div>`;

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
</style></head><body>${una.repeat(copie)}</body></html>`;

  stampaHtml(doc);
}

// Manda in stampa una pagina HTML completa.
//
// Un iframe nascosto e non una finestra nuova: window.open lo bloccano i
// browser quando la stampa non parte da un click diretto, e su iPhone lascia
// aperta una scheda vuota che l'operatore deve chiudere a mano.
export function stampaHtml(doc) {
  const telaio = document.createElement("iframe");
  telaio.setAttribute("aria-hidden", "true");
  telaio.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(telaio);

  const via = () => { try { document.body.removeChild(telaio); } catch { /* già tolto */ } };

  telaio.onload = () => {
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
