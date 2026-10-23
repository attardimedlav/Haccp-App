import { supabase } from "../supabaseClient";
import { vociStandardMancanti, VOCI_STANDARD_VECCHIE } from "./pianoPulizie";

// Allinea il piano di pulizia di un'azienda al piano standard.
//
// Gira sia dal Piano pulizie sia dalla Panoramica: la Panoramica è la prima
// pagina che si apre, e se l'allineamento partisse solo dal Piano pulizie
// gli avvisi mostrerebbero ancora le voci vecchie finché qualcuno non apre
// quella scheda.
//
// - le voci della prima versione standard (una per superficie) si tolgono;
// - con `soloSeVuoto` le voci standard si aggiungono solo se l'azienda non
//   ha nessuna voce nelle aree base (un cliente nuovo); senza, si
//   aggiungono tutte quelle che mancano.
//
// Il piano si rilegge dal database ogni volta: l'elenco a schermo, allo
// scambio di azienda, può essere ancora quello del cliente di prima.
// Torna { cambiato, errore }.
export async function allineaPianoStandard(companyId, aree, soloSeVuoto) {
  if (!companyId) return { cambiato: false, errore: "" };
  const { data: attuale, error: errLettura } = await supabase
    .from("cleaning_plan").select("*").eq("company_id", companyId);
  if (errLettura) return { cambiato: false, errore: "Errore nel leggere il piano: " + errLettura.message };

  const vecchie = (attuale || []).filter((r) => VOCI_STANDARD_VECCHIE.indexOf(r.operation) >= 0);
  if (vecchie.length) {
    const { error } = await supabase
      .from("cleaning_plan").delete().eq("company_id", companyId)
      .in("id", vecchie.map((r) => r.id));
    if (error) return { cambiato: false, errore: "Errore nel sostituire il piano: " + error.message };
  }
  const rimaste = (attuale || []).filter((r) => vecchie.indexOf(r) < 0);
  const haVociBase = rimaste.some((r) => aree.indexOf(r.area) >= 0 && !r.requires_flag);
  const mancanti = vociStandardMancanti(rimaste);
  if ((soloSeVuoto && haVociBase) || !mancanti.length) {
    return { cambiato: vecchie.length > 0, errore: "" };
  }
  const { error } = await supabase
    .from("cleaning_plan")
    .insert(mancanti.map((v) => ({ ...v, company_id: companyId })));
  if (error) return { cambiato: vecchie.length > 0, errore: "Errore nel caricare il piano standard: " + error.message };
  return { cambiato: true, errore: "" };
}
