import JSZip from "jszip";
import { uploadAttachment } from "../hooks/useAttachment";
import { supabase } from "../supabaseClient";

// Modelli Word disponibili per la generazione automatica della nomina, per
// ruolo di sicurezza. Il file deve trovarsi in "public/templates/" (servito
// da Vite/Vercel come file statico) e contenere i segnaposto tra parentesi
// quadre elencati sotto in REPLACEMENTS. Per aggiungere un nuovo modello in
// futuro basta genericizzare il documento reale, salvarlo in
// public/templates/ e aggiungere una riga qui: nessun'altra modifica al
// codice è necessaria, il modulo che crea/assegna il ruolo lo userà da solo.
const TEMPLATES = {
  "RSPP Datore di Lavoro": "/templates/modello_nomina_rspp_datore_lavoro.docx",
  "Preposto": "/templates/modello_nomina_preposto.docx",
};

// Come si chiama, in ciascun modello, il segnaposto della persona che riceve
// la nomina. Non è sempre lo stesso: nella nomina RSPP la persona nominata è
// il datore di lavoro, nella nomina a preposto il datore di lavoro è invece
// chi firma, e il nominato è un'altra persona. Tenere le due cose distinte
// evita di scrivere il nome del preposto al posto di quello del titolare.
const PERSON_PLACEHOLDER = {
  "RSPP Datore di Lavoro": "[NOME E COGNOME DATORE DI LAVORO]",
  "Preposto": "[NOME E COGNOME PREPOSTO]",
};

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Prova a ricavare il comune dalla sede legale (es. "Via Rossi 1, 95037 San
// Giovanni La Punta (CT)" -> "San Giovanni La Punta"), cercando il pattern
// CAP (5 cifre) seguito dal nome del comune. Se l'indirizzo non è scritto in
// questo formato, torna semplicemente vuoto (il segnaposto [LUOGO] resta).
function extractComune(sedeLegale) {
  if (!sedeLegale) return "";
  const match = sedeLegale.match(/\b\d{5}\s+([^,(\n]+)/);
  return match ? match[1].trim() : "";
}

function formatDateIt(isoDate) {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}


// --- firma del datore di lavoro -------------------------------------------
//
// I modelli portano il segnaposto [FIRMA DATORE DI LAVORO] nel punto in cui
// la firma va apposta, sopra la riga di sottoscrizione. Se l'azienda ha una
// firma attiva in archivio, quel segnaposto diventa l'immagine; altrimenti
// sparisce e resta la riga vuota da firmare a penna, che è il comportamento
// di sempre.
//
// Non si appone mai la firma di un lavoratore: in archivio quelle firme non
// si caricano affatto, e qui si cerca soltanto il datore di lavoro.

const SEGNAPOSTO_FIRMA = "[FIRMA DATORE DI LAVORO]";
const FIRMA_CM = { larghezza: 4.5, altezza: 1.5 };

async function firmaDatore(companyId) {
  try {
    const { data } = await supabase
      .from("signature_images")
      .select("id, file_path, person_name")
      .eq("scope", "azienda")
      .eq("company_id", companyId)
      .eq("person_role", "Datore di lavoro")
      .eq("active", true)
      .limit(1);
    const riga = (data || [])[0];
    if (!riga?.file_path) return null;
    const scarico = await supabase.storage.from("attachments").download(riga.file_path);
    if (scarico.error || !scarico.data) return null;
    return { ...riga, byte: new Uint8Array(await scarico.data.arrayBuffer()) };
  } catch (err) {
    console.error("Firma del datore non recuperata:", err);
    return null;
  }
}

// Il primo identificativo di relazione libero nel modello: i modelli veri
// hanno già i loro (stili, tema, note), e riusarne uno romperebbe il file.
function rIdLibero(relsXml) {
  const usati = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  return "rId" + (Math.max(0, ...usati) + 1);
}

function disegnoFirma(rId) {
  const cx = Math.round(FIRMA_CM.larghezza * 360000);
  const cy = Math.round(FIRMA_CM.altezza * 360000);
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${900 + Math.floor(Math.random() * 90)}" name="Firma del datore di lavoro"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="firma.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

// Il segnaposto vive dentro un <w:t>, quindi non si può sostituire la parola
// con un'immagine: verrebbe un run annidato dentro il testo, che Word ignora
// in silenzio — è l'errore che ha fatto uscire la prima nomina senza firma.
// Si sostituisce l'intero run che lo contiene, o l'intero paragrafo quando la
// firma non c'è e la riga va tolta.
function sostituisciRun(xml, segnaposto, nuovoRun) {
  const i = xml.indexOf(segnaposto);
  if (i < 0) return xml;
  const inizio = xml.lastIndexOf("<w:r>", i);
  const fine = xml.indexOf("</w:r>", i);
  if (inizio < 0 || fine < 0) return xml.split(segnaposto).join("");
  return xml.slice(0, inizio) + nuovoRun + xml.slice(fine + 6);
}

function togliParagrafo(xml, segnaposto) {
  const i = xml.indexOf(segnaposto);
  if (i < 0) return xml;
  const inizio = xml.lastIndexOf("<w:p>", i);
  const fine = xml.indexOf("</w:p>", i);
  if (inizio < 0 || fine < 0) return xml.split(segnaposto).join("");
  return xml.slice(0, inizio) + xml.slice(fine + 6);
}

// Mette la firma nel pacchetto e restituisce l'XML con il segnaposto
// sostituito. Il file dell'immagine, la relazione e il tipo di contenuto
// devono esserci tutti e tre: se ne manca uno Word apre il documento e al
// posto della firma mostra una croce rossa.
async function applicaFirma(zip, xml, firma) {
  const relsPath = "word/_rels/document.xml.rels";
  const rels = await zip.file(relsPath).async("string");
  const rId = rIdLibero(rels);

  zip.file("word/media/firma-datore.png", firma.byte);
  zip.file(relsPath, rels.replace("</Relationships>",
    `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/firma-datore.png"/></Relationships>`));

  const ctPath = "[Content_Types].xml";
  const ct = await zip.file(ctPath).async("string");
  if (ct.indexOf('Extension="png"') < 0) {
    zip.file(ctPath, ct.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>'));
  }
  return sostituisciRun(xml, SEGNAPOSTO_FIRMA, disegnoFirma(rId));
}

// Genera automaticamente il documento di nomina Word per il ruolo indicato
// (se esiste un modello — vedi TEMPLATES), sostituendo i segnaposto con i
// dati reali dell'azienda e della persona, lo carica come allegato privato
// e ritorna il "path" da salvare in nomina_attachment_path.
//
// Se il ruolo non ha un modello associato, o se qualcosa va storto (modello
// non raggiungibile, upload fallito...), ritorna null senza lanciare errori:
// chi chiama questa funzione deve trattare null come "nessun allegato
// automatico", e lasciare che la nomina venga comunque salvata (l'utente
// potrà sempre allegare il documento a mano in un secondo momento).
export async function generateNominaAttachment({ role, company, personName, nominaDate, rlsName, datoreName }) {
  const templateUrl = TEMPLATES[role];
  if (!templateUrl || !company?.id) return null;

  try {
    const response = await fetch(templateUrl);
    if (!response.ok) throw new Error(`Modello non trovato (${response.status})`);
    const templateBuffer = await response.arrayBuffer();

    const zip = await JSZip.loadAsync(templateBuffer);
    const docXmlPath = "word/document.xml";
    const documentFile = zip.file(docXmlPath);
    if (!documentFile) throw new Error("Modello non valido: manca word/document.xml");
    let xml = await documentFile.async("string");

    const comune = extractComune(company.sede_legale);

    // Prima si sostituisce il segnaposto della persona nominata, poi quello del
    // datore di lavoro: nella nomina RSPP i due coincidono, e in quel caso la
    // prima sostituzione ha già consumato il segnaposto.
    const personPlaceholder = PERSON_PLACEHOLDER[role] || "[NOME E COGNOME]";

    const REPLACEMENTS = [
      [personPlaceholder, escapeXml(personName) || personPlaceholder],
      ["[NOME E COGNOME DATORE DI LAVORO]", escapeXml(datoreName) || "[NOME E COGNOME DATORE DI LAVORO]"],
      ["[DENOMINAZIONE SOCIALE AZIENDA]", escapeXml(company.name) || "[DENOMINAZIONE SOCIALE AZIENDA]"],
      ["[FORMA GIURIDICA]", escapeXml(company.forma_giuridica) || "[FORMA GIURIDICA]"],
      ["[CODICE FISCALE / P.IVA]", escapeXml(company.piva) || "[CODICE FISCALE / P.IVA]"],
      ["[PROVINCIA] - [NUMERO REA]", escapeXml(company.numero_rea) || "[NUMERO REA]"],
      ["[PEC / DOMICILIO DIGITALE AZIENDA]", escapeXml(company.pec) || "[PEC / DOMICILIO DIGITALE AZIENDA]"],
      ["[INDIRIZZO], [CAP] [COMUNE] ([PROVINCIA])", escapeXml(company.sede_legale) || "[INDIRIZZO], [CAP] [COMUNE] ([PROVINCIA])"],
      ["[NOME E COGNOME RLS]", escapeXml(rlsName) || "RLS non ancora nominato"],
      ["[LUOGO], [DATA]", `${escapeXml(comune) || "[LUOGO]"}, ${formatDateIt(nominaDate) || "[DATA]"}`],
    ];

    for (const [placeholder, value] of REPLACEMENTS) {
      xml = xml.split(placeholder).join(value);
    }

    const firma = await firmaDatore(company.id);
    if (firma) xml = await applicaFirma(zip, xml, firma);
    else xml = togliParagrafo(xml, SEGNAPOSTO_FIRMA);

    zip.file(docXmlPath, xml);
    const blob = await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const safeName = (personName || "nomina").trim().replace(/[^a-zA-Z0-9]+/g, "_") || "nomina";
    const fileName = `Nomina_${role.replace(/[^a-zA-Z0-9]+/g, "_")}_${safeName}.docx`;
    const file = new File([blob], fileName, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const path = await uploadAttachment(company.id, file);

    // Il registro delle apposizioni: è quello che permette di rispondere, anche
    // fra tre anni, alla domanda "chi ha messo questa firma su questo foglio".
    if (firma && path) {
      try {
        await supabase.from("signature_applications").insert({
          signature_id: firma.id,
          company_id: company.id,
          document_kind: "nomina",
          document_ref: fileName,
          user_agent: typeof navigator === "undefined" ? null : navigator.userAgent,
        });
      } catch (err) {
        // la registrazione non deve impedire la consegna del documento
        console.error("Apposizione non registrata:", err);
      }
    }

    return path;
  } catch (err) {
    console.error("Generazione automatica della nomina non riuscita:", err);
    return null;
  }
}

// Cerca, tra le nomine già registrate, il nominativo attualmente indicato
// come RLS (Rappresentante dei Lavoratori per la Sicurezza) dell'azienda.
// Usato per compilare da solo il relativo campo nei modelli generati.
export function findRlsName(appointments) {
  const rls = (appointments || []).find((a) => a.role === "RLS");
  return rls?.person_name || "";
}

// Cerca il nominativo del datore di lavoro: serve a firmare le nomine in cui
// il nominato è un'altra persona, come quella a preposto. Si guarda prima tra
// le nomine registrate e poi, come riserva, tra i ruoli di sicurezza in
// anagrafica, così il nome si trova anche prima che la nomina sia protocollata.
export function findDatoreName(appointments, employees) {
  const ROLES = ["Datore di Lavoro", "RSPP Datore di Lavoro"];
  const nomina = (appointments || []).find((a) => ROLES.includes(a.role));
  if (nomina?.person_name) return nomina.person_name;
  const emp = (employees || []).find((e) => ROLES.includes(e.security_role));
  return emp ? `${emp.first_name} ${emp.last_name}`.trim() : "";
}
