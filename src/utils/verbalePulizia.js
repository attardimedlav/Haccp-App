import { stampaHtml } from "./etichetta";

// Il verbale di campionamento delle superfici, da stampare.
//
// Il modulo cartaceo della Dott.ssa Attardi esisteva già e si compilava a
// mano: due pagine, la seconda con il foglietto del produttore. L'app
// raccoglieva tutti quei dati ma non sapeva rimetterli in fila, e
// premendo «Esporta PDF» usciva la scheda con una riga di riepilogo —
// non un verbale. Un documento che in ispezione si consegna deve avere
// le stesse voci nello stesso ordine di quello cartaceo, perché è
// l'ordine che un controllo si aspetta di trovare.
//
// La seconda pagina non è decorazione: contiene marca, distributore,
// sensibilità e criterio di lettura del test. Senza, il verbale dichiara
// un esito senza dire con che cosa è stato misurato.
//
// Nota importante sui colori: il foglietto PRO-Clean parla di verde,
// GRIGIO e viola. Il giallo non esiste, e un verbale che nomina un
// colore che il kit non produce si smonta da solo.

const esc = (t) =>
  String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const data = (iso) => {
  if (!iso) return "__ / __ / ____";
  const p = String(iso).slice(0, 10).split("-");
  return `${p[2]} / ${p[1]} / ${p[0]}`;
};

const ora = (t) => (t ? String(t).slice(0, 5) : "______");

// Una casella del modulo cartaceo: barrata quando il dato dice di sì.
const box = (acceso, testo) =>
  `<span class="box">${acceso ? "☒" : "☐"} ${esc(testo)}</span>`;

const SIGLA_COLORE = { Verde: "V", Grigio: "G", Viola: "Vi" };
const SIGLA_ESITO = { Conforme: "C", Attenzione: "A", "Non conforme": "NC" };

export function htmlVerbalePulizia(verbale, punti, azienda, numero) {
  const righe = (punti || []).map((p, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(p.point_label)}</td>
      <td>${esc(p.material || "")}</td>
      <td class="c">${ora(p.sample_time)}</td>
      <td class="c">${p.color ? SIGLA_COLORE[p.color] || esc(p.color) : ""}</td>
      <td class="c">${p.outcome ? SIGLA_ESITO[p.outcome] || esc(p.outcome) : ""}</td>
      <td>${esc(p.action_taken || "")}</td>
    </tr>`).join("");

  const att = (v) => (azienda?.tipologia_attivita || "").toLowerCase().includes(v);

  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>Verbale di campionamento delle superfici</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 8.8pt; color: #111; margin: 0; }
  .testata { display: flex; justify-content: space-between; border-bottom: 1.5pt solid #1B2A22;
             padding-bottom: 4pt; margin-bottom: 8pt; font-size: 8pt; color: #3F5147; }
  h1 { font-size: 12pt; margin: 0 0 2pt; text-align: center; }
  .sub { text-align: center; font-size: 8.5pt; color: #3F5147; margin: 0 0 10pt; }
  h2 { font-size: 9.5pt; margin: 7pt 0 3pt; padding: 2pt 5pt; background: #E6EFE8; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 0.6pt solid #9AA79F; padding: 2.2pt 4pt; vertical-align: top; }
  th { background: #E6EFE8; font-size: 8.5pt; }
  td.et { background: #F1F4F0; font-weight: bold; width: 26%; }
  td.c { text-align: center; }
  .capo td { white-space: nowrap; }
  .capo td.et { width: auto; }
  .box { white-space: nowrap; margin-right: 10pt; }
  .nota { font-size: 7.5pt; color: #3F5147; margin-top: 3pt; }
  .firme { margin-top: 8pt; }
  .firme td { height: 46pt; vertical-align: top; }
  .piede { margin-top: 10pt; font-size: 7.5pt; color: #3F5147; border-top: 0.6pt solid #9AA79F; padding-top: 4pt; }
  .pagina2 { page-break-before: always; break-before: page; }
  .due { width: 100%; border-collapse: separate; border-spacing: 10pt 0; }
  .due > tbody > tr > td { border: 0; padding: 0; width: 50%; vertical-align: top; }
  .due h3 { font-size: 9pt; margin: 8pt 0 2pt; }
  .due p, .due li { font-size: 8pt; margin: 2pt 0; }
  ul { margin: 2pt 0 2pt 12pt; padding: 0; }
</style></head><body>

<div class="testata">
  <span>${esc(azienda?.consultant_name || "ATTARDIMEDLAV")} — Verbale di campionamento delle superfici — test rapido PRO-Clean</span>
  <span>pag. 1 di 2</span>
</div>

<h1>VERBALE DI CAMPIONAMENTO DELLE SUPERFICI</h1>
<p class="sub">Verifica interna dell'efficacia della pulizia con test rapido per residui proteici PRO-Clean — Reg. (CE) n. 852/2004, art. 5</p>

<table class="capo">
  <tr>
    <td class="et">Verbale n.</td><td>${esc(numero || "")} / ${String(verbale.check_date || "").slice(0, 4)}</td>
    <td class="et">Data</td><td>${data(verbale.check_date)}</td>
    <td class="et">Ora inizio</td><td>${ora(verbale.time_start)}</td>
    <td class="et">Ora fine</td><td>${ora(verbale.time_end)}</td>
  </tr>
</table>

<h2>1. Operatore del settore alimentare</h2>
<table>
  <tr><td class="et">Ragione sociale</td><td colspan="3">${esc(azienda?.name || "")}</td></tr>
  <tr><td class="et">Indirizzo unità produttiva</td><td colspan="3">${esc(azienda?.sede_operativa || azienda?.sede_legale || "")}</td></tr>
  <tr><td class="et">P.IVA / C.F.</td><td>${esc(azienda?.piva || "")}</td>
      <td class="et">Attività</td><td>${esc(azienda?.tipologia_attivita || "")}</td></tr>
  <tr><td class="et">Presente al campionamento</td>
      <td colspan="3">${esc(verbale.present_name || "__________________________")} &nbsp; in qualità di ${esc(verbale.present_role || "__________________")}</td></tr>
</table>

<h2>2. Incaricato, kit e motivo del campionamento</h2>
<table>
  <tr><td class="et">Incaricato</td><td colspan="3">${esc(verbale.inspector || azienda?.consultant_name || "")} — ATTARDIMEDLAV, consulenza in igiene degli alimenti</td></tr>
  <tr><td class="et">Kit</td><td colspan="3">PRO-Clean — test rapido colorimetrico per residui proteici (Hygiena, distribuito da Tecnafood srl) — istruzioni del produttore riportate a pagina 2</td></tr>
  <tr><td class="et">Lotto del kit</td><td>${esc(verbale.kit_lot || "")}</td>
      <td class="et">Scadenza</td><td>${verbale.kit_expiry ? data(verbale.kit_expiry) : ""}</td></tr>
  <tr><td class="et">Verifiche sul kit</td><td colspan="3">
    ${box(verbale.kit_stored_ok !== false, "conservato fra 2 e 25 °C")}
    ${box(verbale.kit_not_expired !== false, "non scaduto")}
    ${box(verbale.kit_at_room_temp !== false, "portato a temperatura ambiente (21-25 °C) prima dell'uso")}
  </td></tr>
  <tr><td class="et">Motivo</td><td colspan="3">${esc(verbale.reason || "")}</td></tr>
  <tr><td class="et">Condizioni</td><td colspan="3">
    ${box(verbale.before_disinfection !== false, "superfici campionate dopo detersione e risciacquo, prima della disinfezione")}
    <br>Ultima pulizia ore ${ora(verbale.last_cleaning_time)} &nbsp;·&nbsp; Detergente usato ${esc(verbale.detergent || "__________________")}
  </td></tr>
</table>
<p class="nota">Tecnica: area di 10 × 10 cm, strofinamento incrociato (verticale, orizzontale, diagonale) ruotando il tampone; attivazione del bulbo, agitazione 5-10 secondi, lettura del colore dopo 10 minuti a temperatura ambiente.</p>

<h2>3. Punti di campionamento e risultati</h2>
<table>
  <tr>
    <th style="width:4%">N.</th><th style="width:21%">Punto di campionamento</th>
    <th style="width:15%">Superficie (materiale)</th><th style="width:9%">Ora prelievo</th>
    <th style="width:9%">Colore a 10 min</th><th style="width:8%">Esito</th>
    <th>Azione presa</th>
  </tr>
  ${righe}
</table>
<p class="nota">V verde = test superato, superficie pulita (C conforme) · G grigio = piccole quantità di residui (A attenzione) · Vi viola = test non superato (NC non conforme). Sensibilità del kit: 20 µg di proteine dopo 10 minuti. Il test reagisce anche a zuccheri semplici, tannini e acido ascorbico.</p>

<h2>4. Esito e azioni conseguenti</h2>
<table>
  <tr><td class="et">Esito complessivo</td><td colspan="3"><strong>${esc(verbale.outcome || "")}</strong></td></tr>
  <tr><td class="et">Esito A o NC</td><td colspan="3">Nuova pulizia del punto e ripetizione immediata del test; richiamo dell'addetto alla procedura di pulizia; registrazione nel modulo di non conformità del manuale.</td></tr>
  <tr><td class="et">NC ripetuta sullo stesso punto</td><td colspan="3">Al secondo esito non conforme consecutivo: tamponi di superficie presso laboratorio accreditato (carica mesofila totale, Enterobatteriacee e, dove pertinente, <i>Listeria monocytogenes</i>) e revisione della procedura di pulizia.</td></tr>
  <tr><td class="et">Azioni disposte / note</td><td colspan="3">${esc(verbale.notes || "")}</td></tr>
</table>

<table class="firme">
  <tr><th>L'incaricato del campionamento</th><th>L'OSA, per presa visione e ricevuta di copia</th></tr>
  <tr><td>${esc(verbale.inspector || azienda?.consultant_name || "")}</td><td>${esc(azienda?.haccp_manager || "")}</td></tr>
</table>

<p class="piede">Verifica interna nell'ambito dell'autocontrollo: non sostituisce le analisi di laboratorio accreditato previste dal piano analitico del manuale HACCP. Verbale in due copie: una resta all'OSA ed è conservata con le registrazioni del manuale, una all'incaricato. I dispositivi usati sono smaltiti dall'incaricato.</p>

<div class="pagina2">
  <div class="testata">
    <span>${esc(azienda?.consultant_name || "ATTARDIMEDLAV")} — Verbale di campionamento delle superfici — test rapido PRO-Clean</span>
    <span>pag. 2 di 2</span>
  </div>
  <h1 style="font-size:11pt">ALLEGATO — Istruzioni del produttore del kit PRO-Clean</h1>

  <table class="due"><tr><td>
      <h3>Descrizione e uso previsto</h3>
      <p>PRO-Clean è un dispositivo rapido e di pronto uso per la rilevazione di residui proteici sulle superfici dopo la pulizia. In un campione sono presenti proteine, PRO-Clean virerà dal verde al viola: maggiore è la quantità di proteine presenti nel campione raccolto, più rapidamente e di tonalità più scura sarà il viraggio del colore.</p>
      <p>PRO-Clean serve alla rapida validazione dello stato di pulizia delle superfici e a fornire l'adeguata verifica richiesta dai programmi HACCP. Non è in grado di rilevare anche altre sostanze riducenti, come zuccheri semplici, tannini e acido ascorbico. Sovraccaricare il tampone di materiale, strofinando su superfici visibilmente sporche, inibisce la reazione di bioluminescenza e porta a risultati imprecisi.</p>

      <h3>Istruzioni</h3>
      <ul>
        <li>Prima dell'uso, lasciare che PRO-Clean raggiunga la temperatura ambiente (21-25 °C), mantenendo saldamente il tubo del tampone; rimuovere ed estrarre la parte superiore del tampone dal tubo.</li>
        <li>Strofinare un'area standard di 10 × 10 cm con movimento incrociato verticalmente, orizzontalmente e in entrambe le direzioni diagonali, ruotando il tampone durante il prelievo. Su superfici irregolari, effettuare lo strofinamento con una tecnica di esecuzione costante per tutti i test, conducendo il prelievo su un'area sufficientemente estesa.</li>
        <li>Non toccare con le dita il tampone né la parte interna del dispositivo di campionamento.</li>
        <li>Dopo aver strofinato la superficie interessata, reinserire il tampone nel proprio tubo.</li>
        <li>Per attivare il dispositivo, mantenere saldamente il tubo del tampone e utilizzare il pollice e l'indice per spezzare la Snap-Valve, premendo il bulbo in avanti e indietro. Spremere il bulbo due volte, mescolandone tutto il contenuto in basso, sullo stelo del tampone.</li>
        <li>Agitare la punta del tampone nel liquido agitandola per 5-10 secondi.</li>
        <li>Attendere 10 minuti a temperatura ambiente e leggere il colore. Confrontarlo con la scala di colorazione riportata sull'etichetta del tubo e registrare il risultato. Se si verifica prima di 10 minuti, non occorre protrarre ulteriormente l'incubazione.</li>
      </ul>
    </td><td>
      <h3>Interpretazione dei risultati</h3>
      <p>Colore della soluzione PRO-Clean e tempo di viraggio sono parametri indicativi del livello di residui proteici presenti nel campione.</p>
      <ul>
        <li><strong>Verde</strong> — test superato (negativo). Superficie pulita, nessuna ulteriore azione richiesta.</li>
        <li><strong>Grigio</strong> — attenzione. Rilevate piccole quantità di residui: ritestare, sciacquare o pulire di nuovo, nuovamente testare.</li>
        <li><strong>Viola</strong> — test non superato (positivo). Pulire di nuovo e testare.</li>
      </ul>

      <h3>Sensibilità (a 21-25 °C)</h3>
      <ul>
        <li>80 µg dopo 1 minuto</li>
        <li>50 µg dopo 5 minuti</li>
        <li>20 µg dopo 10 minuti</li>
      </ul>

      <h3>Agenti igienizzanti</h3>
      <p>A concentrazioni normali i comuni agenti igienizzanti non interferiscono né causano falsi positivi. Ad alte concentrazioni, gli agenti igienizzanti alcalini possono talvolta causare falsi negativi; gli agenti disinfettanti a base di perossido possono causare una reazione falsa positiva di viraggio del colore. Prima di testare una superficie con PRO-Clean dopo averla igienizzata, è opportuno attendere un tempo appropriato: l'igienizzazione comprende solitamente due fasi, pulizia con un detergente e, seguita e facoltativamente, una disinfezione. Per garantire i migliori risultati, raccogliere i campioni con PRO-Clean dopo la fase di pulizia con detergente e aver risciacquato, ma prima di qualsiasi disinfezione terminale.</p>

      <h3>Conservazione e validità</h3>
      <ul>
        <li>Conservare a 2-25 °C.</li>
        <li>I dispositivi si conservano per 18 mesi; verificare la data di scadenza riportata sull'etichetta.</li>
      </ul>

      <h3>Smaltimento e sicurezza</h3>
      <p>I dispositivi PRO-Clean sono realizzati in plastica riciclabile al 100% e possono essere smaltiti come tali. I componenti di PRO-Clean non pongono alcun rischio per la salute se usati conformemente alle pratiche di laboratorio standard e alle procedure delineate nel presente inserto. Per ulteriori istruzioni sulla sicurezza, fare riferimento alla Scheda Dati di Sicurezza (SDS).</p>

      <h3>Distributore</h3>
      <p>Tecnafood srl — via Repubblica di Montefiorino 2/R, 41030 Villavara di Bomporto (MO).</p>
    </td></tr></table>
  <p class="piede">Copia del foglietto illustrativo del produttore, riportata per esteso. Le figure dell'originale sono omesse; il foglietto originale è disponibile presso l'incaricato del campionamento.</p>
</div>

</body></html>`;
}

export function stampaVerbalePulizia(verbale, punti, azienda, numero) {
  stampaHtml(htmlVerbalePulizia(verbale, punti, azienda, numero));
}
