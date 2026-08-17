import { supabase } from "../supabaseClient";

// Carica un file nel bucket "attachments", dentro la cartella dell'azienda.
// Ritorna il "path" da salvare nel database (non l'URL: il bucket è privato).
export async function uploadAttachment(companyId, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${companyId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("attachments").upload(path, file);
  if (error) throw error;
  return path;
}

// Genera un link temporaneo (1 ora) per scaricare/visualizzare un allegato privato.
export async function getAttachmentUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}
