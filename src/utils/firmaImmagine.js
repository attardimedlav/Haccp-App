// Firma del responsabile a partire da una foto.
//
// Il responsabile firma su un foglio bianco e fotografa il foglio col
// telefono. Quella foto, così com'è, dentro un documento non si può mettere:
// è un rettangolo di carta grigia con la firma piccola in mezzo e il resto
// della pagina intorno. Qui la foto diventa una firma utilizzabile — tratto
// isolato dal fondo, carta resa trasparente, ritaglio stretto sul segno —
// e il risultato è sempre della stessa misura, perché il manuale ha un posto
// di dimensione fissa in cui infilarla.
//
// Tutto avviene nel browser, sul telefono o sul computer di chi carica: la
// foto originale non viene mai spedita da nessuna parte.

export const FIRMA_W = 1200;
export const FIRMA_H = 400;

// Oltre questa soglia di luminosità il pixel è carta, non inchiostro. 190 su
// 255 tiene dentro anche le foto riuscite male, con il foglio in ombra.
const SOGLIA = 190;

// Un data URL più pesante di così non vale la pena di tenerlo in banca dati
// per una firma: si rifà il lavoro a risoluzione minore.
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

// Isola il tratto e restituisce la tela di lavoro con il rettangolo che lo
// contiene. Sopra la soglia il pixel sparisce; sotto, diventa inchiostro più
// scuro di quanto la fotocamera l'abbia reso — una firma fotografata esce
// quasi sempre grigina, e stampata poi non si vede.
function isolaTratto(img, lato) {
  const scala = Math.min(1, lato / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scala));
  const h = Math.max(1, Math.round(img.height * scala));
  const tela = document.createElement("canvas");
  tela.width = w;
  tela.height = h;
  const ctx = tela.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const dati = ctx.getImageData(0, 0, w, h);
  const px = dati.data;
  let minX = w, minY = h, maxX = -1, maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      if (lum > SOGLIA || px[i + 3] < 20) { px[i + 3] = 0; continue; }
      const forza = Math.max(0, Math.min(1, (SOGLIA - lum) / SOGLIA));
      px[i + 3] = Math.round(255 * Math.min(1, 0.4 + forza * 1.4));
      const scuro = Math.round(lum * 0.5);
      px[i] = scuro;
      px[i + 1] = scuro;
      px[i + 2] = Math.min(255, scuro + 30);   // il nero puro sembra stampato: un filo di blu lo rende penna
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  ctx.putImageData(dati, 0, 0);

  const margine = Math.round(Math.max(w, h) * 0.012);
  return {
    tela,
    x: Math.max(0, minX - margine),
    y: Math.max(0, minY - margine),
    w: Math.min(w - 1, maxX + margine) - Math.max(0, minX - margine) + 1,
    h: Math.min(h - 1, maxY + margine) - Math.max(0, minY - margine) + 1,
  };
}

function componi(ritaglio, larghezza, altezza) {
  const out = document.createElement("canvas");
  out.width = larghezza;
  out.height = altezza;
  const ctx = out.getContext("2d");
  const s = Math.min(larghezza / ritaglio.w, altezza / ritaglio.h);
  const dw = Math.max(1, Math.round(ritaglio.w * s));
  const dh = Math.max(1, Math.round(ritaglio.h * s));
  ctx.drawImage(
    ritaglio.tela, ritaglio.x, ritaglio.y, ritaglio.w, ritaglio.h,
    Math.round((larghezza - dw) / 2), Math.round((altezza - dh) / 2), dw, dh
  );
  return out.toDataURL("image/png");
}

// Da file fotografato a firma pronta: l'anteprima da mostrare subito e il
// file PNG da allegare, che si carica nello storage dell'azienda con la
// stessa uploadAttachment delle nomine e degli altri allegati.
export async function fotoInFirma(file) {
  const img = await leggiImmagine(file);
  const ritaglio = isolaTratto(img, 1600);
  if (!ritaglio) {
    throw new Error("Nella foto non si distingue nessun tratto scuro: serve una firma a penna su foglio bianco, con una luce uniforme.");
  }
  let dataUrl = componi(ritaglio, FIRMA_W, FIRMA_H);
  if (dataUrl.length > PESO_MASSIMO) dataUrl = componi(ritaglio, 750, 250);
  const byte = daBase64(base64Di(dataUrl));
  return {
    dataUrl,
    file: new File([byte], "firma-responsabile-haccp.png", { type: "image/png" }),
  };
}

// Il base64 puro, che è la forma in cui l'immagine entra nel .docx.
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
