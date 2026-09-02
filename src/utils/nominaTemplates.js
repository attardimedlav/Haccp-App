import JSZip from "jszip";
import { uploadAttachment } from "../hooks/useAttachment";

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

    return await uploadAttachment(company.id, file);
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
