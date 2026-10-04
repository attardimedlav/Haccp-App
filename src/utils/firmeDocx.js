// Le firme dell'archivio applicate ai documenti che l'app genera.
//
// L'archivio (tabella signature_images) tiene la firma di ogni persona una
// volta sola: il docente, il responsabile del progetto formativo, il datore di
// lavoro. Qui quelle firme vengono messe al posto della riga di puntini, ma
// solo dove il nome scritto nel documento coincide con il nome in archivio.
//
// Il nome e' l'unico aggancio, e questo e' voluto: non c'e' una casella in piu'
// da riempire per ogni corso, e il nome resta scritto in un posto solo — il
// campo del corso. Se la firma non c'e', o il nome e' scritto in modo diverso,
// il documento esce con lo spazio bianco come prima: mai un errore, mai una
// firma apposta a una persona sbagliata.
//
// Quello che qui NON si firma mai: le colonne firma entrata e firma uscita del
// registro presenze. Quelle attestano un fatto dei partecipanti, e stamparle
// gia' firmate documenterebbe una presenza che puo' non esserci stata.

import { supabase } from "../supabaseClient";

const CM = 360000;                  // EMU per centimetro
const LARGHEZZA_CM = 4.6;           // quanto larga esce la firma nel documento

// Gli identificativi delle relazioni partono da rId50 per stare lontani da
// quelli che pacchettoDocx usa gia': rId1 stili, rId10 pie' di pagina,
// rId20 impostazioni, rId30 in su le immagini del manuale.
const RID_BASE = 50;

// Titoli e abbreviazioni che si scrivono a volte si' e a volte no: "Geom.
// Castrogiovanni Giuseppe" e "Castrogiovanni Giuseppe" sono la stessa persona,
// e l'ordine fra nome e cognome cambia da un campo all'altro. Si confrontano
// le parole, non la stringa.
const TITOLI = new Set([
  "dott", "dottssa", "dr", "drssa", "sig", "sigra", "geom", "ing", "arch",
  "prof", "profssa", "rag", "avv", "p", "per", "ind", "perito",
]);

function parole(testo) {
  return String(testo || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // via gli accenti
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")                        // via punti e virgole
    .split(/\s+/)
    .filter((p) => p && !TITOLI.has(p));
}

export function chiaveNome(testo) {
  const p = parole(testo);
  return p.length ? p.slice().sort().join(" ") : "";
}

// Le firme caricate per il documento che si sta generando. Stanno qui, e non
// passate di funzione in funzione, perche' i punti da firmare sono sparsi in
// quattro documenti e una ventina di punti: passarle a mano significherebbe
// dimenticarsene nei documenti nuovi. Fuori dalla generazione l'elenco e'
// vuoto, cosi' nessun documento porta una firma per sbaglio.
let firmeCorrenti = [];
let contatoreDisegni = 1000;

export function liberaFirme() {
  firmeCorrenti = [];
}

// Legge dall'archivio le firme attive utilizzabili per questa azienda: quelle
// del consulente, che valgono su tutti i clienti, e quella del datore di
// lavoro di questa azienda soltanto.
export async function preparaFirme(companyId) {
  liberaFirme();
  try {
    const { data, error } = await supabase
      .from("signature_images")
      .select("id, scope, company_id, person_name, person_role, file_path, consent_date, active")
      .eq("active", true);
    if (error || !data) return [];

    const utili = data.filter((f) =>
      f.file_path && f.consent_date &&
      (f.scope === "consulente" || (f.scope === "azienda" && f.company_id === companyId)));

    const caricate = [];
    for (let i = 0; i < utili.length; i += 1) {
      const f = utili[i];
      const immagine = await scaricaImmagine(f.file_path);
      if (!immagine) continue;
      caricate.push({
        id: f.id,
        nome: f.person_name,
        ruolo: f.person_role,
        chiave: chiaveNome(f.person_name),
        rId: "rId" + (RID_BASE + caricate.length),
        nomeFile: "firma-archivio-" + caricate.length + ".png",
        usata: false,
        ...immagine,
      });
    }
    firmeCorrenti = caricate;
    return caricate;
  } catch (e) {
    return [];
  }
}

// Larghezza e altezza si leggono dal blocco IHDR del PNG (byte 16-23) invece
// di decodificare l'immagine: serve solo il rapporto, per non deformarla.
async function scaricaImmagine(percorso) {
  try {
    const scarico = await supabase.storage.from("attachments").download(percorso);
    if (scarico.error || !scarico.data) return null;
    const bytes = new Uint8Array(await scarico.data.arrayBuffer());
    if (bytes.length < 24) return null;
    const px = (i) => (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
    const larghezza = px(16);
    const altezza = px(20);
    if (!larghezza || !altezza) return null;
    const cx = Math.round(LARGHEZZA_CM * CM);
    return { bytes, cx, cy: Math.round((cx * altezza) / larghezza) };
  } catch (e) {
    return null;
  }
}

export function firmaDi(nome) {
  const k = chiaveNome(nome);
  if (!k) return null;
  // Un campo che contiene piu' nomi ("Rossi Mario, Bianchi Luigi") non trova
  // riscontro, e va bene cosi': su una riga sola non si possono apporre due
  // firme, e sceglierne una sarebbe peggio che lasciare lo spazio bianco.
  return firmeCorrenti.find((f) => f.chiave === k) || null;
}

// Il disegno della firma, in un paragrafo suo. Se la persona non ha una firma
// in archivio torna il pezzo di documento che il chiamante usava prima — di
// norma la riga di puntini — e il documento resta identico a com'era.
export function spazioFirma(nome, fallback, o = {}) {
  const f = firmaDi(nome);
  if (!f) return fallback;
  f.usata = true;
  contatoreDisegni += 1;
  const cx = f.cx;
  const cy = f.cy;
  return (
    `<w:p><w:pPr><w:spacing w:before="${o.before == null ? 120 : o.before}" w:after="${o.after == null ? 0 : o.after}"/>` +
    (o.align ? `<w:jc w:val="${o.align}"/>` : "") + `</w:pPr>` +
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${contatoreDisegni}" name="Firma"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${contatoreDisegni}" name="firma.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${f.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
}

// Aggiunge al pacchetto .docx i file delle firme effettivamente disegnate.
// Va chiamata DOPO aver costruito il corpo: e' il corpo che, disegnando, dice
// quali firme servono. Quelle rimaste inutilizzate non entrano nel file.
export function aggiungiFirme(files) {
  const usate = firmeCorrenti.filter((f) => f.usata);
  if (usate.length === 0) return files;

  // Il namespace del disegno lo dichiara gia' pacchettoDocx. Dichiararlo due
  // volte produce un attributo ripetuto sull'elemento radice: XML non valido,
  // e Word si rifiuta di aprire il file senza spiegare perche'.
  if (files["word/document.xml"].indexOf("wordprocessingDrawing") < 0) {
    files["word/document.xml"] = files["word/document.xml"].replace(
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
      ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    );
  }
  if (files["[Content_Types].xml"].indexOf('Extension="png"') < 0) {
    files["[Content_Types].xml"] = files["[Content_Types].xml"]
      .replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
  }
  let rels = "";
  usate.forEach((f) => {
    files["word/media/" + f.nomeFile] = f.bytes;
    rels += `<Relationship Id="${f.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${f.nomeFile}"/>`;
  });
  files["word/_rels/document.xml.rels"] = files["word/_rels/document.xml.rels"]
    .replace("</Relationships>", rels + "</Relationships>");
  return files;
}

// Chi ha firmato il documento appena generato: serve per dirlo in chiaro
// all'utente, invece di lasciargli aprire il file per scoprirlo.
export function firmeApposte() {
  return firmeCorrenti.filter((f) => f.usata).map((f) => f.nome);
}
