// Il diagramma di flusso disegnato, non impaginato.
//
// Fino al 23/10/2026 il diagramma era una tabella di Word: una colonna di
// riquadri incolonnati, con la striscia verde a fare da linea. Funzionava,
// ma restava una lista messa in cornice — e un diagramma di flusso non e'
// una lista: ha frecce vere, ha un rombo che apre un bivio, ha un ramo che
// si stacca e uno che rientra. Con le celle di una tabella quelle cose non
// si disegnano.
//
// Qui il diagramma si disegna su un canvas e finisce nel .docx come
// immagine, come gia' succede per la firma del responsabile. Il disegno e'
// fatto a scala doppia e rimpicciolito in pagina, cosi' in stampa non
// sgrana.
//
// Se il canvas non e' disponibile — ambiente senza DOM, prova fuori dal
// browser — la funzione torna null e il generatore ricade sulla vecchia
// tabella: il manuale esce comunque.

const S = 2;                      // scala di disegno
const LARG_RAMI = 1120;           // con un ramo laterale da far uscire
const LARG_DRITTO = 660;          // ciclo lineare: il disegno si stringe
const BOX_W = 330;                // riquadro della fase
const BOX_LAT_W = 290;            // riquadro del ramo laterale
const GAP = 52;                   // spazio fra un riquadro e il successivo
const MARG = 26;

const VERDE = "#2F6F4E";
const VERDE_SCURO = "#1B2A22";
const VERDE_FONDO = "#F4F7F2";
const VERDE_OMBRA = "#CBD9CE";
const ROSSO = "#A83A2C";
const ROSSO_FONDO = "#FBEDEC";
const ROSSO_OMBRA = "#E3BDB7";
const GIALLO = "#C9A227";
const GIALLO_FONDO = "#FBF4DA";
const GIALLO_OMBRA = "#E6D9A8";
const GRIGIO = "#9AA39C";
const GRIGIO_FONDO = "#F2F2F0";
const GRIGIO_OMBRA = "#D8DCD6";
const TESTO = "#1B2A22";

const FONT = (px, bold) =>
  `${bold ? "600 " : ""}${px}px "Calibri","Carlito","Helvetica Neue",Arial,sans-serif`;

// Una fase si scrive "Nome | dettaglio | CCP 1" oppure "Nome | CCP 1".
// Una decisione comincia con ? :  "? Domanda? | NO: che cosa si fa".
// E' la stessa grammatica che legge il generatore del manuale: il catalogo
// resta uno solo e non si tocca.
export function leggiFlusso(flow) {
  return (flow || []).map(function (grezzo) {
    const t = String(grezzo || "").trim();
    if (t.startsWith("?")) {
      const pz = t.slice(1).split("|").map(function (x) { return x.trim(); });
      return {
        tipo: "decisione",
        nome: pz[0],
        ramo: (pz[1] || "").replace(/^NO\s*[:\-]\s*/i, ""),
        dettaglio: "",
        marcatore: "",
      };
    }
    const pz = t.split("|").map(function (x) { return x.trim(); });
    return {
      tipo: "fase",
      nome: pz[0],
      dettaglio: pz.length > 2 ? pz[1] : "",
      marcatore: (pz.length > 2 ? pz[2] : (pz.length === 2 ? pz[1] : "")) || "CP",
    };
  });
}

// Spezza un testo in righe che stanno dentro una larghezza data.
function righe(ctx, testo, larghezza, font) {
  ctx.font = font;
  const parole = String(testo || "").split(/\s+/).filter(Boolean);
  const out = [];
  let riga = "";
  parole.forEach(function (w) {
    const prova = riga ? riga + " " + w : w;
    if (ctx.measureText(prova).width <= larghezza || !riga) riga = prova;
    else { out.push(riga); riga = w; }
  });
  if (riga) out.push(riga);
  return out;
}

// Il riquadro con l'ombra portata: due rettangoli, quello dietro spostato
// di tre punti. E' l'effetto dell'esempio cartaceo, ottenuto senza gradienti
// che in stampa in bianco e nero diventano una macchia.
function riquadro(ctx, x, y, w, h, fondo, bordo, ombra) {
  ctx.fillStyle = ombra;
  ctx.fillRect(x + 4, y + 4, w, h);
  ctx.fillStyle = fondo;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = bordo;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function rombo(ctx, cx, cy, w, h) {
  ctx.fillStyle = GIALLO_OMBRA;
  ctx.beginPath();
  ctx.moveTo(cx + 4, cy - h / 2 + 4); ctx.lineTo(cx + w / 2 + 4, cy + 4);
  ctx.lineTo(cx + 4, cy + h / 2 + 4); ctx.lineTo(cx - w / 2 + 4, cy + 4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = GIALLO_FONDO;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2); ctx.lineTo(cx - w / 2, cy);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = GIALLO; ctx.lineWidth = 1.4; ctx.stroke();
}

function punta(ctx, x, y, verso) {
  const d = 6;
  ctx.beginPath();
  if (verso === "giu") { ctx.moveTo(x - d, y - d); ctx.lineTo(x, y); ctx.lineTo(x + d, y - d); }
  else if (verso === "su") { ctx.moveTo(x - d, y + d); ctx.lineTo(x, y); ctx.lineTo(x + d, y + d); }
  else if (verso === "sinistra") { ctx.moveTo(x + d, y - d); ctx.lineTo(x, y); ctx.lineTo(x + d, y + d); }
  else { ctx.moveTo(x - d, y - d); ctx.lineTo(x, y); ctx.lineTo(x - d, y + d); }
  ctx.closePath(); ctx.fill();
}

function freccia(ctx, punti, verso, colore) {
  ctx.strokeStyle = colore || VERDE_SCURO;
  ctx.fillStyle = colore || VERDE_SCURO;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(punti[0][0], punti[0][1]);
  for (let i = 1; i < punti.length; i += 1) ctx.lineTo(punti[i][0], punti[i][1]);
  ctx.stroke();
  const ultimo = punti[punti.length - 1];
  punta(ctx, ultimo[0], ultimo[1], verso);
}

function testoCentrato(ctx, linee, cx, cy, interlinea, colore, font) {
  ctx.font = font;
  ctx.fillStyle = colore;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const alto = (linee.length - 1) * interlinea;
  linee.forEach(function (r, i) { ctx.fillText(r, cx, cy - alto / 2 + i * interlinea); });
}

// Misura in anticipo quanto e' alto ciascun nodo: serve a sapere l'altezza
// del canvas prima di disegnare, perche' un canvas ridimensionato dopo si
// cancella da solo.
function misura(ctx, nodi) {
  return nodi.map(function (n) {
    if (n.tipo === "decisione") {
      const r = righe(ctx, n.nome, BOX_W - 40, FONT(15, true));
      const h = Math.max(96, r.length * 19 + 56);
      const rl = n.ramo ? righe(ctx, n.ramo, BOX_LAT_W - 28, FONT(13, false)) : [];
      return { nodo: n, righeNome: r, righeRamo: rl, h: h, hRamo: Math.max(52, rl.length * 17 + 24) };
    }
    const rn = righe(ctx, n.nome, BOX_W - 28, FONT(15, true));
    const rd = n.dettaglio ? righe(ctx, n.dettaglio, BOX_W - 28, FONT(12.5, false)) : [];
    const h = Math.max(54, rn.length * 19 + rd.length * 16 + 26);
    return { nodo: n, righeNome: rn, righeDettaglio: rd, h: h };
  });
}

// Disegna il diagramma di un ciclo e lo restituisce come PNG in base64,
// senza il prefisso data: — e' quello che vuole pacchettoDocx.
// Torna { base64, larghezza, altezza } oppure null se non c'e' un canvas.
export function disegnaCiclo(ciclo, numeroCcp) {
  if (typeof document === "undefined" || !document.createElement) return null;
  const nodi = leggiFlusso(ciclo.flow);
  if (!nodi.length) return null;

  const prova = document.createElement("canvas");
  const pctx = prova.getContext("2d");
  if (!pctx) return null;
  const M = misura(pctx, nodi);

  // La larghezza del disegno dipende da quello che c'e' dentro. Un ciclo
  // lineare disegnato sulla tela larga arrivava in pagina ridotto a un
  // terzo, con due bande bianche ai lati e i riquadri illeggibili:
  // l'immagine in pagina e' sempre larga 16 cm, quindi quello che conta e'
  // che dentro non ci sia aria sprecata.
  const conRami = nodi.some(function (nn) { return nn.tipo === "decisione" && nn.ramo; });
  const LARG = conRami ? LARG_RAMI : LARG_DRITTO;

  const titoloH = 56;
  const altezza = MARG * 2 + titoloH + M.reduce(function (a, m) { return a + m.h + GAP; }, 0) - GAP + 10;

  const cv = document.createElement("canvas");
  cv.width = LARG * S;
  cv.height = Math.round(altezza) * S;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.scale(S, S);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, LARG, altezza);

  // La colonna centrale si sposta a destra solo quando a sinistra c'e' un
  // ramo da far uscire.
  const cx = Math.round(conRami ? LARG / 2 + 110 : LARG / 2);
  const xBox = cx - BOX_W / 2;

  // intestazione: numero e nome del ciclo, e la sua classificazione
  const critico = /CCP/i.test(ciclo.classification || "");
  ctx.fillStyle = VERDE_SCURO;
  ctx.fillRect(MARG, MARG, LARG - MARG * 2, 34);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = FONT(16, true);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText((ciclo.numero ? "Ciclo " + ciclo.numero : ciclo.code || "") + "   " + (ciclo.name || ""),
    MARG + 14, MARG + 17);
  ctx.textAlign = "right";
  ctx.font = FONT(13, true);
  ctx.fillText(critico ? "CCP" : "CP", LARG - MARG - 14, MARG + 17);

  let y = MARG + titoloH;
  let n = 0;

  M.forEach(function (m, i) {
    const nodo = m.nodo;
    const ultimo = i === M.length - 1;

    if (nodo.tipo === "decisione") {
      const cy = y + m.h / 2;
      rombo(ctx, cx, cy, BOX_W + 60, m.h);
      testoCentrato(ctx, m.righeNome, cx, cy, 19, TESTO, FONT(15, true));

      if (nodo.ramo) {
        // il ramo NO esce a sinistra e non rientra: e' quello che si fa
        // quando il controllo non torna, e il prodotto esce dal flusso
        const xr = MARG + 30;
        const wr = BOX_LAT_W;
        const yr = cy - m.hRamo / 2;
        freccia(ctx, [[cx - (BOX_W + 60) / 2, cy], [xr + wr + 10, cy]], "sinistra", GRIGIO);
        ctx.font = FONT(11.5, true);
        ctx.fillStyle = GIALLO;
        ctx.textAlign = "center";
        ctx.fillText("NO", (cx - (BOX_W + 60) / 2 + xr + wr) / 2, cy - 9);
        riquadro(ctx, xr, yr, wr, m.hRamo, GRIGIO_FONDO, GRIGIO, GRIGIO_OMBRA);
        testoCentrato(ctx, m.righeRamo, xr + wr / 2, yr + m.hRamo / 2, 17, "#4A4A46", FONT(13, false));
      }
      if (!ultimo) {
        freccia(ctx, [[cx, y + m.h], [cx, y + m.h + GAP - 4]], "giu");
        ctx.font = FONT(11.5, true);
        ctx.fillStyle = VERDE;
        ctx.textAlign = "left";
        ctx.fillText("SÌ", cx + 7, y + m.h + GAP / 2);
      }
      y += m.h + GAP;
      return;
    }

    n += 1;
    const ccp = /CCP/i.test(nodo.marcatore || "");
    riquadro(ctx, xBox, y, BOX_W, m.h,
      ccp ? ROSSO_FONDO : VERDE_FONDO, ccp ? ROSSO : VERDE, ccp ? ROSSO_OMBRA : VERDE_OMBRA);

    // il numero della fase, in una pastiglia sul bordo sinistro
    ctx.fillStyle = ccp ? ROSSO : VERDE;
    ctx.fillRect(xBox - 26, y + m.h / 2 - 13, 26, 26);
    ctx.font = FONT(13, true);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), xBox - 13, y + m.h / 2 + 1);

    const hTesto = m.righeNome.length * 19 + m.righeDettaglio.length * 16;
    let yt = y + m.h / 2 - hTesto / 2 + 9;
    ctx.textAlign = "center";
    ctx.font = FONT(15, true);
    ctx.fillStyle = TESTO;
    m.righeNome.forEach(function (r) { ctx.fillText(r, cx, yt); yt += 19; });
    if (m.righeDettaglio.length) {
      ctx.font = FONT(12.5, false);
      ctx.fillStyle = "#4A5A50";
      yt += 1;
      m.righeDettaglio.forEach(function (r) { ctx.fillText(r, cx, yt); yt += 16; });
    }

    // l'etichetta del punto: pastiglia piena solo quando e' critico
    // Il numero scritto sulla fase vince su quello del ciclo: la
    // conservazione a temperatura negativa e' un punto critico solo, che si
    // attraversa in piu' cicli, e deve portare sempre lo stesso numero.
    const numeroFase = (String(nodo.marcatore || "").match(/CCP\s*(\d+)/i) || [])[1];
    const etichetta = ccp
      ? (numeroFase ? "CCP " + numeroFase : (numeroCcp ? "CCP " + numeroCcp : "CCP"))
      : "CP";
    ctx.font = FONT(12, true);
    const we = ctx.measureText(etichetta).width + 18;
    const xe = xBox + BOX_W + 14;
    if (ccp) {
      ctx.fillStyle = ROSSO;
      ctx.fillRect(xe, y + m.h / 2 - 11, we, 22);
      ctx.fillStyle = "#FFFFFF";
    } else {
      ctx.fillStyle = "#6E8B78";
    }
    ctx.textAlign = "left";
    ctx.fillText(etichetta, xe + 9, y + m.h / 2 + 1);

    if (!ultimo) freccia(ctx, [[cx, y + m.h], [cx, y + m.h + GAP - 4]], "giu");
    y += m.h + GAP;
  });

  const dataUrl = cv.toDataURL("image/png");
  return {
    base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    larghezza: LARG,
    altezza: Math.round(altezza),
  };
}

// Quanto grande va messa l'immagine in pagina: larga quanto la colonna di
// testo (16 cm), alta in proporzione, e se viene troppo alta per una pagina
// A4 si rimpicciolisce finche' ci sta. Un diagramma spezzato su due pagine
// non e' un diagramma.
export function misuraInPagina(immagine, larghezzaCm, altezzaMaxCm) {
  const lw = larghezzaCm || 16;
  const hmax = altezzaMaxCm || 22;
  let w = lw;
  let h = (immagine.altezza / immagine.larghezza) * w;
  if (h > hmax) { w = w * (hmax / h); h = hmax; }
  return { larghezzaCm: Math.round(w * 100) / 100, altezzaCm: Math.round(h * 100) / 100 };
}
