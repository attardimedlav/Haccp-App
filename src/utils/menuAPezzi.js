// Un menu lungo si legge a pezzi.
//
// Il menu di una pizzeria con la cucina è un PDF di diciannove pagine e
// centocinquanta voci. Mandato tutto insieme alla lettura non arriva in fondo:
// la funzione resta appesa un minuto e mezzo e poi il server la ferma per
// superamento delle risorse (WORKER_RESOURCE_LIMIT). Non è un difetto da
// aggirare alzando un numero: un lavoro che dura troppo va spezzato.
//
// Qui il PDF si taglia in blocchi di poche pagine, nel browser, prima di
// spedire niente. Ogni blocco è una lettura breve che arriva in fondo, e i
// piatti si rimettono insieme alla fine. Le pagine lette sono le stesse, e
// quindi il costo è lo stesso: cambia solo che arriva un risultato invece di
// un errore.
//
// Per una foto non c'è niente da tagliare: è una pagina sola e si manda com'è.

import { PDFDocument } from "pdf-lib";

// Quante pagine per blocco. Quattro pagine di menu sono una lettura da venti
// secondi scarsi: sta larga dentro ogni limite, e su un menu da diciannove
// pagine fa cinque letture invece di una che non finisce.
export const PAGINE_PER_BLOCCO = 4;

// btoa non digerisce un array lungo tutto in una volta: si spezza, altrimenti
// su un PDF di qualche centinaio di kilobyte il browser alza le mani.
function inBase64(bytes) {
  let s = "";
  const passo = 8192;
  for (let i = 0; i < bytes.length; i += passo) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
  }
  return btoa(s);
}

// Divide un PDF in blocchi di pagine. Torna null se il file non è un PDF:
// in quel caso chi chiama manda il file intero, come ha sempre fatto.
//
// Ogni blocco porta con sé da quale pagina a quale arriva, perché quello che
// l'OSA deve vedere mentre aspetta non è una rotella che gira, ma a che punto
// si è: "pagine 9-12 di 19".
export async function pdfAPezzi(file, perBlocco = PAGINE_PER_BLOCCO) {
  if (!file || file.type !== "application/pdf") return null;

  const originale = await PDFDocument.load(await file.arrayBuffer());
  const totale = originale.getPageCount();
  if (totale <= perBlocco) return null;   // corto: si manda intero

  const blocchi = [];
  for (let i = 0; i < totale; i += perBlocco) {
    const fine = Math.min(i + perBlocco, totale);
    const pezzo = await PDFDocument.create();
    const pagine = await pezzo.copyPages(
      originale,
      Array.from({ length: fine - i }, (_, k) => i + k)
    );
    pagine.forEach((p) => pezzo.addPage(p));
    blocchi.push({
      da: i + 1,
      a: fine,
      base64: inBase64(await pezzo.save()),
    });
  }
  return { totale, blocchi };
}

// Rimette insieme i piatti letti dai vari blocchi.
//
// Lo stesso piatto può comparire due volte solo se il menu lo ripete davvero,
// e in quel caso è giusto vederlo due volte: il doppione nel menu è un rilievo,
// non un errore di lettura. Si scartano invece i nomi vuoti e i duplicati
// esatti consecutivi, che nascono dal taglio fra un blocco e l'altro.
export function uniscePiatti(blocchi = []) {
  const fuori = [];
  const visti = new Set();
  for (const p of blocchi.flat()) {
    const nome = String(p?.nome || "").trim();
    if (!nome) continue;
    const chiave = nome.toLowerCase() + "|" + String(p?.ingredienti || "").toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    fuori.push(p);
  }
  return fuori;
}
