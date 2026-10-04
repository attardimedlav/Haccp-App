// Firma del responsabile a partire da una foto.
//
// Il responsabile firma su un foglio bianco e lo fotografa col telefono.
// Quella foto, così com'è, dentro un documento non si può mettere: è un
// rettangolo di carta con la firma piccola in mezzo, il bordo del foglio, il
// tavolo intorno e quasi sempre un'ombra di traverso. Qui diventa una firma
// utilizzabile — solo il tratto, su fondo trasparente, ritagliato stretto.
//
// La prima versione separava inchiostro e carta con una soglia fissa di
// luminosità, e si rompeva appena il foglio era in ombra: tutto il foglio
// finiva sotto la soglia, niente diventava trasparente e nel manuale entrava
// la fotografia intera. Il metodo giusto non guarda quanto un pixel è scuro
// in assoluto, ma quanto è più scuro di ciò che gli sta intorno — e per di
// più solo se appartiene a una struttura sottile.
//
// Si chiama top-hat nero: si prende la chiusura dell'immagine (dilatazione
// seguita da erosione) con una finestra poco più larga del tratto di penna.
// La chiusura riempie le righe sottili e lascia intatte le superfici grandi,
// quindi la differenza fra chiusura e originale contiene il tratto e nient'altro:
// non il tavolo scuro, non l'ombra, e soprattutto non il bordo del foglio, che
// alle soglie semplici somigliava a una riga di penna.
//
// Tutto avviene nel browser di chi carica: la foto non viene spedita.

export const FIRMA_W = 1200;
export const FIRMA_H = 400;

// Oltre questa quota di pixel "inchiostro" non è una firma su foglio bianco:
// è una foto di altro, e conviene dirlo invece di produrre una macchia.
const QUOTA_MASSIMA = 0.25;

const PESO_MASSIMO = 420 * 1024;

function leggiImmagine(file) {
  return new Promise((risolvi, rifiuta) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); risolvi(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rifiuta(new Error("Il file non è un'immagine leggibile.")); };
    img.src = url;
  });
}

// Massimo (o minimo) scorrevole su una riga, in tempo lineare: la finestra
// tiene una coda di indici i cui valori sono in ordine, e l'estremo cercato
// è sempre il primo. Fatto con un ciclo per ogni pixel sarebbe k volte più
// lento, e su una foto da due megapixel si sentirebbe.
function scorrevole(sorgente, destinazione, lunghezza, passo, inizio, k, massimo) {
  const coda = new Int32Array(lunghezza);
  let testa = 0, fine = 0;
  const r = k >> 1;
  const meglio = massimo ? (a, b) => a >= b : (a, b) => a <= b;
  for (let i = 0; i < lunghezza + r; i++) {
    if (i < lunghezza) {
      const v = sorgente[inizio + i * passo];
      while (fine > testa && meglio(v, sorgente[inizio + coda[fine - 1] * passo])) fine--;
      coda[fine++] = i;
    }
    const centro = i - r;
    if (centro >= 0) {
      while (coda[testa] < centro - r) testa++;
      destinazione[inizio + centro * passo] = sorgente[inizio + coda[testa] * passo];
    }
  }
}

function filtroSeparabile(dati, w, h, k, massimo) {
  const tmp = new Float32Array(dati.length);
  for (let y = 0; y < h; y++) scorrevole(dati, tmp, w, 1, y * w, k, massimo);
  const out = new Float32Array(dati.length);
  for (let x = 0; x < w; x++) scorrevole(tmp, out, h, w, x, k, massimo);
  return out;
}

// Percentile su un istogramma a 256 caselle: basta e avanza, e non costringe
// a ordinare due milioni di valori.
function percentile(valori, quota) {
  const isto = new Int32Array(257);
  let massimo = 0;
  for (let i = 0; i < valori.length; i++) if (valori[i] > massimo) massimo = valori[i];
  if (massimo <= 0) return 0;
  for (let i = 0; i < valori.length; i++) {
    const b = Math.min(256, Math.round((valori[i] / massimo) * 256));
    isto[b]++;
  }
  const bersaglio = valori.length * quota;
  let somma = 0;
  for (let b = 0; b <= 256; b++) {
    somma += isto[b];
    if (somma >= bersaglio) return (b / 256) * massimo;
  }
  return massimo;
}

// Estremi robusti di una proiezione: si scarta lo 0,3% per lato, così una
// macchia isolata o un granello non allargano il ritaglio.
function estremi(proiezione, totale) {
  const coda = totale * 0.003;
  let somma = 0, primo = 0, ultimo = proiezione.length - 1;
  for (let i = 0; i < proiezione.length; i++) {
    somma += proiezione[i];
    if (somma >= coda) { primo = i; break; }
  }
  somma = 0;
  for (let i = proiezione.length - 1; i >= 0; i--) {
    somma += proiezione[i];
    if (somma >= coda) { ultimo = i; break; }
  }
  return [primo, Math.max(primo + 1, ultimo)];
}

function isolaTratto(img) {
  const scala = Math.min(1, 1500 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scala));
  const h = Math.max(1, Math.round(img.height * scala));

  const tela = document.createElement("canvas");
  tela.width = w; tela.height = h;
  const ctx = tela.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  const lum = new Float32Array(w * h);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    lum[i] = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
  }

  // finestra poco più larga del tratto di penna
  let k = Math.max(9, Math.round(Math.max(w, h) / 70));
  if (k % 2 === 0) k++;
  const chiusura = filtroSeparabile(filtroSeparabile(lum, w, h, k, true), w, h, k, false);

  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = Math.max(0, chiusura[i] - lum[i]);

  const picco = percentile(d, 0.998);
  const sogliaTratto = Math.max(18, picco * 0.5);   // inchiostro certo: decide il ritaglio
  const sogliaVelo = Math.max(10, picco * 0.22);    // sfumature del tratto: entrano nel disegno

  const perColonna = new Float32Array(w);
  const perRiga = new Float32Array(h);
  let forti = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[y * w + x] >= sogliaTratto) { perColonna[x]++; perRiga[y]++; forti++; }
    }
  }
  if (forti < 40) return null;
  if (forti / (w * h) > QUOTA_MASSIMA) return { troppo: true };

  const [x0, x1] = estremi(perColonna, forti);
  const [y0, y1] = estremi(perRiga, forti);
  const margine = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);

  return {
    d, w, h, picco, sogliaVelo,
    x: Math.max(0, x0 - margine),
    y: Math.max(0, y0 - margine),
    larghezza: Math.min(w, x1 + margine) - Math.max(0, x0 - margine) + 1,
    altezza: Math.min(h, y1 + margine) - Math.max(0, y0 - margine) + 1,
  };
}

// Il tratto si ridisegna, non si ritaglia dalla foto: inchiostro di un solo
// colore, con l'intensità presa dal filtro. Così la firma esce netta anche
// quando la fotografia era grigia e slavata, e stampata si vede.
function componi(t, larghezza, altezza) {
  const out = document.createElement("canvas");
  out.width = larghezza; out.height = altezza;
  const ctx = out.getContext("2d");
  const img = ctx.createImageData(larghezza, altezza);
  const dati = img.data;

  const s = Math.min(larghezza / t.larghezza, altezza / t.altezza);
  const dw = Math.max(1, Math.round(t.larghezza * s));
  const dh = Math.max(1, Math.round(t.altezza * s));
  const offX = Math.round((larghezza - dw) / 2);
  const offY = Math.round((altezza - dh) / 2);
  const pieno = Math.max(t.sogliaVelo + 1, t.picco * 0.62);

  for (let y = 0; y < dh; y++) {
    const sy = t.y + Math.min(t.altezza - 1, Math.floor(y / s));
    for (let x = 0; x < dw; x++) {
      const sx = t.x + Math.min(t.larghezza - 1, Math.floor(x / s));
      const v = t.d[sy * t.w + sx];
      if (v < t.sogliaVelo) continue;
      const forza = Math.min(1, (v - t.sogliaVelo) / (pieno - t.sogliaVelo));
      const i = ((y + offY) * larghezza + (x + offX)) * 4;
      dati[i] = 26; dati[i + 1] = 30; dati[i + 2] = 66;   // blu-nero da penna
      dati[i + 3] = Math.round(255 * Math.min(1, 0.45 + forza * 0.95));
    }
  }
  ctx.putImageData(img, 0, 0);
  return out.toDataURL("image/png");
}

export async function fotoInFirma(file) {
  const img = await leggiImmagine(file);
  const t = isolaTratto(img);
  if (!t) {
    throw new Error("Nella foto non si distingue nessun tratto di penna: serve una firma su foglio chiaro, inquadrata da vicino.");
  }
  if (t.troppo) {
    throw new Error("La foto contiene troppi segni scuri per riconoscere una firma: inquadra il solo foglio firmato, senza altri oggetti.");
  }
  let dataUrl = componi(t, FIRMA_W, FIRMA_H);
  if (dataUrl.length > PESO_MASSIMO) dataUrl = componi(t, 750, 250);
  const byte = daBase64(base64Di(dataUrl));
  return {
    dataUrl,
    file: new File([byte], "firma-responsabile-haccp.png", { type: "image/png" }),
  };
}

export function base64Di(dataUrl) {
  return String(dataUrl || "").replace(/^data:[^,]*,/, "");
}

function daBase64(puro) {
  const bin = atob(puro);
  const byte = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) byte[i] = bin.charCodeAt(i);
  return byte;
}

// L'allegato già caricato, riletto dallo storage e ridotto a base64: è la
// forma che serve al generatore del manuale.
export async function base64DaBlob(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 8192) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
  }
  return btoa(bin);
}
