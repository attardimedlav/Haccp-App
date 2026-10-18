import { stampaHtml } from "./etichetta";
import { copreIlGiorno, chiusuraSettimanale } from "./chiusure";

// I registri da esibire al controllo.
//
// Le schede dell'app si leggono bene su un telefono, ma quando l'organo
// di controllo chiede «mi stampi il registro delle temperature di
// settembre» serve un'altra cosa: un foglio con le stesse colonne del
// modulo cartaceo, dove si legge in un colpo d'occhio quali giorni sono
// stati compilati e quali no.
//
// Da qui nascono tre registri mensili, uno per scheda, con la stessa
// struttura degli allegati del manuale: una riga per giorno (o per
// operazione), una colonna per impianto, e in coda l'elenco dei giorni
// in cui non c'era nulla da registrare. Quest'ultimo pezzo non è un di
// più: senza, i giorni di chiusura sembrano giorni dimenticati, ed è
// esattamente la domanda che un ispettore fa per prima.

const esc = (t) =>
  String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export const meseCorrente = () => new Date().toISOString().slice(0, 7);

const giorniDelMese = (mese) => {
  const [a, m] = String(mese).split("-").map(Number);
  return new Date(a, m, 0).getDate();
};

const isoGiorno = (mese, g) => `${mese}-${String(g).padStart(2, "0")}`;

const nomeMese = (mese) => {
  const [a, m] = String(mese).split("-").map(Number);
  return `${MESI[m - 1]} ${a}`;
};

const fmt = (iso) => {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  return `${p[2]}/${p[1]}/${p[0]}`;
};

// Il giorno della settimana in lettera, per far vedere a colpo d'occhio
// dove cadono le domeniche: su un registro mensile è il modo più rapido
// per capire se un buco è un giorno di chiusura.
const LETTERA = ["D", "L", "M", "M", "G", "V", "S"];
const letteraGiorno = (mese, g) => {
  const [a, m] = String(mese).split("-").map(Number);
  return LETTERA[new Date(a, m - 1, g).getDay()];
};

const CSS = `
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

function testata(azienda, titolo, mese, modulo) {
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
function coda(azienda, fuori) {
  const sx = bloccoChiusure(fuori) || "<p class=\"nota\">Nel mese non ci sono stati giorni di chiusura.</p>";
  return `<table style="border:0;margin-top:7pt" class="coda">
    <tr>
      <td style="border:0;width:50%;padding:0 8pt 0 0;vertical-align:top">${sx}</td>
      <td style="border:0;padding:0;vertical-align:top">${firme(azienda)}</td>
    </tr>
  </table>`;
}

function firme(azienda) {
  return `<table class="firme">
    <tr><th style="width:50%">Il responsabile del piano di autocontrollo</th><th>Verifica del consulente</th></tr>
    <tr><td>${esc(azienda?.haccp_manager || "")}</td><td>${esc(azienda?.consultant_name || "")}</td></tr>
  </table>`;
}

// I giorni del mese in cui non c'era nulla da registrare, con il motivo.
// Si costruisce una volta e si stampa in coda a tutti e tre i registri.
function giorniSenzaObbligo(mese, azienda, chiusure) {
  const fuori = [];
  for (let g = 1; g <= giorniDelMese(mese); g++) {
    const iso = isoGiorno(mese, g);
    const c = (chiusure || []).find((x) => copreIlGiorno(x, iso)) || chiusuraSettimanale(azienda, iso);
    if (c) fuori.push({ giorno: g, motivo: c.reason || "Attività chiusa" });
  }
  return fuori;
}

function bloccoChiusure(fuori) {
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

// ----------------------------------------------------------------------
// 1. Registro delle temperature — M01
//
// Righe i giorni, colonne gli impianti: è la forma del modulo cartaceo,
// e serve a vedere subito la riga vuota. Nella cella il valore letto
// quando c'è, altrimenti la spunta: il valore in gradi resta facoltativo
// quando la temperatura è nel range, e il registro non deve far sembrare
// incompleto ciò che il manuale dichiara facoltativo.
// ----------------------------------------------------------------------
export function htmlRegistroTemperature({ mese, azienda, impianti, letture, chiusure, spegnimenti }) {
  const gg = giorniDelMese(mese);
  const attivi = (impianti || []).filter((u) => {
    // Un impianto spento per tutto il mese non entra nel registro: una
    // colonna vuota per trenta giorni è un invito a chiedere perché.
    const periodi = (spegnimenti || []).filter((p) => p.unit_label === u.label);
    const giorniCoperti = [];
    for (let g = 1; g <= gg; g++) {
      if (periodi.some((p) => copreIlGiorno(p, isoGiorno(mese, g)))) giorniCoperti.push(g);
    }
    return giorniCoperti.length < gg;
  });

  // Una registrazione che esiste si stampa sempre, anche se quel giorno
  // risulta di chiusura: il registro non nasconde mai un dato, semmai lo
  // spiega. Capita — si entra a locale chiuso per un controllo, e quella
  // lettura vale.
  const cella = (u, iso, chiuso) => {
    const l = (letture || []).find((x) => x.unit === u.label && String(x.created_at).slice(0, 10) === iso);
    if (!l) {
      const spenta = (spegnimenti || []).some((p) => p.unit_label === u.label && copreIlGiorno(p, iso));
      if (spenta) return `<td class="c vuoto">spenta</td>`;
      return `<td class="c vuoto">${chiuso ? "chiuso" : "—"}</td>`;
    }
    const valore = l.value != null ? `${String(l.value).replace(".", ",")}` : "✓";
    const fuori = l.in_range === false;
    return `<td class="c"${fuori ? ' style="background:#FBEDEA;font-weight:bold"' : ""}>${esc(valore)}${fuori ? " !" : ""}</td>`;
  };

  let righe = "";
  for (let g = 1; g <= gg; g++) {
    const iso = isoGiorno(mese, g);
    const lettera = letteraGiorno(mese, g);
    const chiuso = (chiusure || []).some((c) => copreIlGiorno(c, iso)) || !!chiusuraSettimanale(azienda, iso);
    const op = (letture || []).find((x) => String(x.created_at).slice(0, 10) === iso)?.operator || "";
    righe += `<tr${chiuso ? ' class="festivo"' : ""}>
      <td class="g">${g} ${lettera}</td>
      ${attivi.map((u) => cella(u, iso, chiuso)).join("")}
      <td>${esc(op)}</td></tr>`;
  }

  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>Registro temperature — ${esc(nomeMese(mese))}</title><style>${CSS}</style></head><body>
${testata(azienda, "Registro delle temperature", mese, "M01")}
<table>
  <tr>
    <th style="width:34pt">Giorno</th>
    ${attivi.map((u) => `<th>${esc(u.label)}<br><span style="font-weight:normal">${u.min_temp}°C / ${u.max_temp}°C</span></th>`).join("")}
    <th style="width:18%">Firma / operatore</th>
  </tr>
  ${righe}
</table>
<p class="nota">Nella cella è riportata la temperatura letta; la spunta ✓ indica lettura entro i limiti senza annotazione del valore, facoltativa secondo il manuale. Le celle evidenziate con «!» sono letture fuori limite: la relativa non conformità è registrata nel modulo M07. «—» indica lettura non registrata.</p>
${coda(azienda, giorniSenzaObbligo(mese, azienda, chiusure))}
<p class="piede">Registro generato dall'applicativo gestionale dell'autocontrollo il ${fmt(new Date().toISOString())} — ${esc(azienda?.name || "")}. Le registrazioni originali sono conservate nel sistema informatico secondo la procedura allegata al manuale.</p>
</body></html>`;
}

// ----------------------------------------------------------------------
// 2. Registro delle pulizie — M04
//
// Qui la forma si rovescia: righe le operazioni, colonne i giorni. È il
// calendario delle pulizie del manuale, e si guarda per riga — «la cappa
// l'hanno fatta?» — non per giorno.
// ----------------------------------------------------------------------
export function htmlRegistroSanificazione({ mese, azienda, piano, interventi, chiusure }) {
  const gg = giorniDelMese(mese);
  const righe = (piano || [])
    .filter((r) => r.active !== false)
    .filter((r) => !r.requires_flag || azienda?.[r.requires_flag])
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const quotidiane = righe.filter((r) => Number(r.frequency_days) === 1);
  const periodiche = righe.filter((r) => Number(r.frequency_days) !== 1);

  const fatto = (r, iso) => (interventi || []).some((s) =>
    s.area === r.area && (s.operation || "") === r.operation && String(s.created_at).slice(0, 10) === iso);

  const intestazioneGiorni = Array.from({ length: gg }, (_, i) =>
    `<th style="width:14pt">${i + 1}<br><span style="font-weight:normal">${letteraGiorno(mese, i + 1)}</span></th>`).join("");

  const rigaOperazione = (r) => {
    let celle = "";
    for (let g = 1; g <= gg; g++) {
      const iso = isoGiorno(mese, g);
      const chiuso = (chiusure || []).some((c) => copreIlGiorno(c, iso)) || !!chiusuraSettimanale(azienda, iso);
      celle += chiuso
        ? `<td class="c festivo vuoto">·</td>`
        : `<td class="c">${fatto(r, iso) ? "✓" : '<span class="vuoto">—</span>'}</td>`;
    }
    return `<tr><td>${esc(r.operation)}<br><span class="nota">${esc(r.area)}</span></td>${celle}</tr>`;
  };

  // Le periodiche non stanno in un calendario giornaliero: si elencano
  // con le date in cui sono state eseguite nel mese.
  const righePeriodiche = periodiche.map((r) => {
    const date = (interventi || [])
      .filter((s) => s.area === r.area && (s.operation || "") === r.operation &&
        String(s.created_at).slice(0, 7) === mese)
      .map((s) => fmt(s.created_at))
      .join(", ");
    return `<tr>
      <td style="width:34%">${esc(r.operation)}<br><span class="nota">${esc(r.area)}</span></td>
      <td style="width:14%" class="c">ogni ${esc(r.frequency_days)} giorni</td>
      <td>${date || '<span class="vuoto">nessuna esecuzione registrata nel mese</span>'}</td>
    </tr>`;
  }).join("");

  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>Registro pulizie — ${esc(nomeMese(mese))}</title><style>${CSS}</style></head><body>
${testata(azienda, "Registro delle pulizie e sanificazioni", mese, "M04")}

<h2>Interventi di ogni giorno</h2>
<table>
  <tr><th style="width:17%">Operazione</th>${intestazioneGiorni}</tr>
  ${quotidiane.map(rigaOperazione).join("") || '<tr><td colspan="' + (gg + 1) + '">Nessun intervento quotidiano previsto dal piano.</td></tr>'}
</table>
<p class="nota">✓ intervento eseguito e registrato · «—» non registrato · «·» giorno di chiusura. Il prodotto impiegato per ciascun intervento è riportato nel registro informatico.</p>

${periodiche.length ? `<h2>Interventi periodici</h2>
<table>
  <tr><th>Operazione</th><th>Frequenza</th><th>Date di esecuzione nel mese</th></tr>
  ${righePeriodiche}
</table>` : ""}

${coda(azienda, giorniSenzaObbligo(mese, azienda, chiusure))}
<p class="piede">Registro generato dall'applicativo gestionale dell'autocontrollo il ${fmt(new Date().toISOString())} — ${esc(azienda?.name || "")}. Il programma di pulizia è quello allegato al manuale di autocontrollo.</p>
</body></html>`;
}

// ----------------------------------------------------------------------
// 3. Registro del monitoraggio infestanti — M09
//
// Un giro per riga e una colonna per postazione: è la forma in cui lo si
// confronta con la planimetria, che è quello che un controllo fa.
// ----------------------------------------------------------------------
const ESITO_SIGLA = {
  integra: "I", consumo: "C", cattura: "K", mancante: "M", sostituita: "S",
};

export function htmlRegistroInfestanti({ mese, azienda, postazioni, giri, esiti }) {
  const attive = (postazioni || [])
    .filter((p) => p.active !== false)
    .sort((a, b) => String(a.code).localeCompare(String(b.code), "it", { numeric: true }));

  const delMese = (giri || [])
    .filter((g) => String(g.round_date).slice(0, 7) === mese)
    .sort((a, b) => (a.round_date > b.round_date ? 1 : -1));

  const righe = delMese.map((g) => {
    const suoi = (esiti || []).filter((e) => e.round_id === g.id);
    const celle = attive.map((p) => {
      const e = suoi.find((x) => x.station_id === p.id);
      const sigla = e ? ESITO_SIGLA[e.outcome] || "?" : "";
      const allarme = e && (e.outcome === "consumo" || e.outcome === "cattura" || e.outcome === "mancante");
      return `<td class="c"${allarme ? ' style="background:#FBEDEA;font-weight:bold"' : ""}>${sigla || '<span class="vuoto">—</span>'}</td>`;
    }).join("");
    return `<tr><td class="c">${fmt(g.round_date)}</td>${celle}<td>${esc(g.operator || "")}${g.company_name ? " — " + esc(g.company_name) : ""}</td></tr>`;
  }).join("");

  const note = delMese.filter((g) => g.note).map((g) =>
    `<tr><td style="width:14%" class="c">${fmt(g.round_date)}</td><td>${esc(g.note)}</td></tr>`).join("");

  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>Registro infestanti — ${esc(nomeMese(mese))}</title><style>${CSS}</style></head><body>
${testata(azienda, "Registro del monitoraggio infestanti", mese, "M09")}
<table>
  <tr>
    <th style="width:60pt">Data del giro</th>
    ${attive.map((p) => `<th>${esc(p.code)}<br><span style="font-weight:normal">${esc(p.indoor ? "int." : "est.")}</span></th>`).join("")}
    <th style="width:20%">Eseguito da</th>
  </tr>
  ${righe || `<tr><td colspan="${attive.length + 2}">Nessun giro di monitoraggio registrato nel mese.</td></tr>`}
</table>
<p class="nota"><strong>I</strong> integra, nessun consumo · <strong>C</strong> consumo di esca · <strong>K</strong> cattura rilevata · <strong>M</strong> postazione mancante o danneggiata · <strong>S</strong> esca sostituita. Le caselle evidenziate richiedono un'azione, registrata nel modulo delle non conformità (M07). La numerazione delle postazioni è quella della planimetria allegata al manuale.</p>

${note ? `<h2>Annotazioni dei giri</h2><table>${note}</table>` : ""}
${firme(azienda)}
<p class="piede">Registro generato dall'applicativo gestionale dell'autocontrollo il ${fmt(new Date().toISOString())} — ${esc(azienda?.name || "")}.</p>
</body></html>`;
}

export const stampaRegistroTemperature = (d) => stampaHtml(htmlRegistroTemperature(d));
export const stampaRegistroSanificazione = (d) => stampaHtml(htmlRegistroSanificazione(d));
export const stampaRegistroInfestanti = (d) => stampaHtml(htmlRegistroInfestanti(d));
