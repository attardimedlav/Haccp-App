// Le parti comuni dei registri compilati: intestazione, stile di pagina,
// coda con i giorni di chiusura e firma dell'OSA.
//
// Stanno in un file a sé per due ragioni. La prima è che i registri sono
// diventati due famiglie — quelli a calendario (temperature, pulizie,
// infestanti) e quelli a elenco (acque, arrivo merci, non conformità...) —
// e un'intestazione scritta due volte col tempo diventa due intestazioni
// diverse. La seconda è che questo file non tocca il browser: niente
// `document`, niente `window`, solo testo. Così lo stesso codice che
// stampa dall'app può girare anche dentro la Edge Function che manda il
// riepilogo mensile per email, e il registro archiviato dal cliente è
// identico a quello esibito al controllo.

import { copreIlGiorno, chiusuraSettimanale } from "./chiusure.js";

export const esc = (t) =>
  String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export const meseCorrente = () => new Date().toISOString().slice(0, 7);

export const giorniDelMese = (mese) => {
  const [a, m] = String(mese).split("-").map(Number);
  return new Date(a, m, 0).getDate();
};

export const isoGiorno = (mese, g) => `${mese}-${String(g).padStart(2, "0")}`;

export const nomeMese = (mese) => {
  const [a, m] = String(mese).split("-").map(Number);
  return `${MESI[m - 1]} ${a}`;
};

export const fmt = (iso) => {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  return `${p[2]}/${p[1]}/${p[0]}`;
};

// Il giorno della settimana in lettera, per far vedere a colpo d'occhio
// dove cadono le domeniche: su un registro mensile è il modo più rapido
// per capire se un buco è un giorno di chiusura.
export const LETTERA = ["D", "L", "M", "M", "G", "V", "S"];
export const letteraGiorno = (mese, g) => {
  const [a, m] = String(mese).split("-").map(Number);
  return LETTERA[new Date(a, m - 1, g).getDay()];
};

export const CSS = `
  @page { size: A4 landscape; margin: 8mm 9mm; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 7.6pt; color: #111; margin: 0; }
  .testata { display: flex; justify-content: space-between; align-items: flex-end;
             border-bottom: 1.5pt solid #1B2A22; padding-bottom: 4pt; margin-bottom: 6pt; }
  .testata .chi { font-size: 8pt; color: #3F5147; }
  h1 { font-size: 12pt; margin: 0; }
  h2 { font-size: 9pt; margin: 7pt 0 3pt; padding: 2pt 5pt; background: #E6EFE8; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 0.5pt solid #9AA79F; padding: 0.8pt 3pt; }
  th { background: #E6EFE8; font-size: 7.5pt; font-weight: bold; }
  td.g { background: #F1F4F0; font-weight: bold; text-align: center; width: 22pt; }
  td.c { text-align: center; }
  td.festivo { background: #F6F2E6; }
  .vuoto { color: #B9C2BC; }
  .nota { font-size: 7.2pt; color: #3F5147; margin-top: 3pt; margin-bottom: 0; }
  .firme { margin-top: 0; break-inside: avoid; page-break-inside: avoid; }
  .coda { break-inside: avoid; page-break-inside: avoid; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .firme td { height: 30pt; vertical-align: top; }
  .piede { margin-top: 6pt; font-size: 7pt; color: #3F5147; border-top: 0.5pt solid #9AA79F; padding-top: 3pt; }
`;

export function testata(azienda, titolo, mese, modulo) {
  return `<div class="testata">
    <div>
      <h1>${esc(titolo)}</h1>
      <div class="chi">${esc(azienda?.name || "")}${azienda?.sede_operativa ? " — " + esc(azienda.sede_operativa) : ""}</div>
      <div class="chi">Responsabile del piano di autocontrollo: ${esc(azienda?.haccp_manager || "____________________")}</div>
    </div>
    <div class="chi" style="text-align:right">
      <div><strong>${esc(nomeMese(mese))}</strong></div>
      <div>${esc(modulo)} — manuale di autocontrollo</div>
    </div>
  </div>`;
}

// La coda del registro: i giorni senza obbligo e le firme, affiancati.
// Da soli occupavano due blocchi in colonna e spingevano le firme da
// sole sulla pagina successiva — un foglio con due righe di firma in
// cima si prende per un allegato perso.
export function coda(azienda, fuori) {
  const sx = bloccoChiusure(fuori) || "<p class=\"nota\">Nel mese non ci sono stati giorni di chiusura.</p>";
  return `<table style="border:0;margin-top:7pt" class="coda">
    <tr>
      <td style="border:0;width:50%;padding:0 8pt 0 0;vertical-align:top">${sx}</td>
      <td style="border:0;padding:0;vertical-align:top">${firme(azienda)}</td>
    </tr>
  </table>`;
}

// Una firma sola, quella dell'OSA.
//
// Prima c'era anche una casella «Verifica del consulente»: è sbagliata,
// perche' questi sono registri che l'operatore compila da se'. Una
// casella di firma per il consulente dichiara una verifica che non c'e'
// stata, e in ispezione un documento che promette un controllo e lo
// lascia in bianco pesa piu' della sua assenza.
export function firme(azienda) {
  return `<table class="firme">
    <tr><th>Il responsabile del piano di autocontrollo, per conferma delle registrazioni</th></tr>
    <tr><td>${esc(azienda?.haccp_manager || "")}<br><span class="nota">firma ____________________________</span></td></tr>
  </table>`;
}

// I giorni del mese in cui non c'era nulla da registrare, con il motivo.
// Si costruisce una volta e si stampa in coda a tutti e tre i registri.
export function giorniSenzaObbligo(mese, azienda, chiusure) {
  const fuori = [];
  for (let g = 1; g <= giorniDelMese(mese); g++) {
    const iso = isoGiorno(mese, g);
    const c = (chiusure || []).find((x) => copreIlGiorno(x, iso)) || chiusuraSettimanale(azienda, iso);
    if (c) fuori.push({ giorno: g, motivo: c.reason || "Attività chiusa" });
  }
  return fuori;
}

export function bloccoChiusure(fuori) {
  if (fuori.length === 0) return "";
  // I giorni con lo stesso motivo si raggruppano: «1, 8, 15, 22, 29 —
  // giorno di chiusura settimanale» si legge, trenta righe no.
  const perMotivo = new Map();
  fuori.forEach((f) => {
    if (!perMotivo.has(f.motivo)) perMotivo.set(f.motivo, []);
    perMotivo.get(f.motivo).push(f.giorno);
  });
  const righe = [...perMotivo.entries()]
    .map(([motivo, giorni]) => `<tr><td style="width:30%">${esc(motivo)}</td><td>giorni ${giorni.join(", ")}</td></tr>`)
    .join("");
  return `<h2>Giorni in cui non erano dovute registrazioni</h2>
    <table>${righe}</table>
    <p class="nota">Nei giorni elencati l'attività era chiusa: l'assenza di registrazioni non costituisce un controllo omesso.</p>`;
}
