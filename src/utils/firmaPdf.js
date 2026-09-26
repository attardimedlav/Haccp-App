// Firma grafica di un PDF.
//
// La firma non viene sovrascritta sul testo del documento: si aggiunge in coda
// un "Foglio delle firme", dove ogni firmatario compare con nome, ruolo, data,
// ora e la propria firma disegnata. In fondo al foglio c'è l'impronta SHA-256
// del documento originale, quello a cui le firme si riferiscono: se qualcuno
// cambia anche una virgola del documento, l'impronta non torna più.
//
// È una firma elettronica semplice: vale come prova liberamente valutabile,
// non equivale all'autografa e da sola non dà data certa.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function improntaSha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const dataOra = (iso) =>
  new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

// firme: [{ nome, ruolo, firmaPng (dataURL), firmatoIl (ISO) }]
// meta:  { titolo, azienda, documento, improntaOriginale }
export async function aggiungiFoglioFirme(pdfBytes, firme, meta) {
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const normale = await pdf.embedFont(StandardFonts.Helvetica);
  const grassetto = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pagina = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = pagina.getSize();
  const margine = 56;
  const verde = rgb(0.18, 0.44, 0.31);
  const grigio = rgb(0.35, 0.42, 0.38);
  let y = height - margine;

  pagina.drawText("FOGLIO DELLE FIRME", { x: margine, y, size: 16, font: grassetto, color: verde });
  y -= 22;
  if (meta?.azienda) {
    pagina.drawText(meta.azienda, { x: margine, y, size: 11, font: normale, color: grigio });
    y -= 14;
  }
  if (meta?.documento) {
    pagina.drawText("Documento: " + meta.documento, { x: margine, y, size: 11, font: normale, color: grigio });
    y -= 20;
  }
  pagina.drawLine({
    start: { x: margine, y }, end: { x: width - margine, y },
    thickness: 1, color: rgb(0.85, 0.88, 0.85),
  });
  y -= 28;

  for (const f of firme) {
    if (y < 190) break; // il foglio è uno solo: le firme in eccesso restano nel registro
    pagina.drawText(f.nome || "", { x: margine, y, size: 12, font: grassetto, color: rgb(0.1, 0.12, 0.1) });
    y -= 15;
    if (f.ruolo) {
      pagina.drawText(f.ruolo, { x: margine, y, size: 10, font: normale, color: grigio });
      y -= 13;
    }
    pagina.drawText("Firmato il " + dataOra(f.firmatoIl), { x: margine, y, size: 10, font: normale, color: grigio });
    y -= 8;

    if (f.firmaPng) {
      const png = await pdf.embedPng(f.firmaPng);
      const larghezza = 200;
      const altezza = (png.height / png.width) * larghezza;
      pagina.drawImage(png, { x: margine, y: y - altezza, width: larghezza, height: altezza });
      y -= altezza + 6;
    }
    pagina.drawLine({
      start: { x: margine, y }, end: { x: margine + 240, y },
      thickness: 0.8, color: rgb(0.6, 0.66, 0.6),
    });
    y -= 26;
  }

  // Piede: a che cosa si riferiscono queste firme, e che valore hanno.
  let yp = 108;
  pagina.drawLine({
    start: { x: margine, y: yp + 16 }, end: { x: width - margine, y: yp + 16 },
    thickness: 0.8, color: rgb(0.85, 0.88, 0.85),
  });
  const impronta = meta?.improntaOriginale || "";
  pagina.drawText("Impronta SHA-256 del documento firmato:", { x: margine, y: yp, size: 8.5, font: grassetto, color: grigio });
  yp -= 11;
  pagina.drawText(impronta.slice(0, 64), { x: margine, y: yp, size: 8, font: normale, color: grigio });
  yp -= 18;
  [
    "Firme elettroniche semplici raccolte tramite l'applicativo gestionale: identificano il",
    "firmatario attraverso le credenziali di accesso e ne registrano data e ora. Ai sensi",
    "dell'art. 20 del D.Lgs. 82/2005 la loro efficacia probatoria è liberamente valutabile in",
    "giudizio; non equivalgono alla firma autografa e non attribuiscono data certa al documento.",
  ].forEach((riga) => {
    pagina.drawText(riga, { x: margine, y: yp, size: 8, font: normale, color: grigio });
    yp -= 10;
  });

  return await pdf.save();
}

// Percorso completo: dal PDF di partenza al PDF firmato, con la sua impronta.
export async function firmaDocumento(pdfBytes, firme, meta) {
  const improntaOriginale = await improntaSha256(pdfBytes);
  const firmato = await aggiungiFoglioFirme(pdfBytes, firme, { ...meta, improntaOriginale });
  const improntaFirmato = await improntaSha256(firmato);
  return { bytes: firmato, improntaOriginale, improntaFirmato };
}
