import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

// Hook generico: legge le righe di una tabella per l'azienda attualmente
// selezionata, e permette di aggiungerne, modificarne e cancellarne.
//
// Il filtro esplicito su company_id non è una ridondanza delle policy RLS.
// Un utente consulente ha legittimamente accesso a TUTTE le aziende che
// segue, quindi per il database sono tutte visibili allo stesso modo. Quale
// di quelle aziende sia "aperta" in questo momento lo sa solo l'app (è lo
// stato React gestito da switchCompany in AuthContext), e il database non
// ha modo di saperlo. Senza questo filtro un consulente con più di un
// cliente vedrebbe i registri di tutte le sue aziende mescolati in un unico
// elenco. Filtrare qui rende anche molto più leggere le pagine, perché
// scarica solo le righe dell'azienda aperta invece di tutto lo storico.

// Ripulisce gli spazi iniziali e finali da tutti i campi di testo prima di
// scrivere sul database. Non è una pulizia estetica: in questa app le persone
// si collegano alle nomine, ai corsi e alle visite mediche confrontando il
// nome come stringa, quindi un solo spazio invisibile spezza il collegamento
// senza dare nessun errore. È già successo con un dipendente salvato come
// "MARIA ANGELA ANICETO ": le sue nomine risultavano di un'altra persona.
function trimStrings(row) {
  const out = {};
  for (const key of Object.keys(row)) {
    const value = row[key];
    out[key] = typeof value === "string" ? value.trim() : value;
  }
  return out;
}

export function useTable(tableName, companyId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from(tableName)
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (fetchError) setError(fetchError.message);
    else setItems(data || []);
    setLoading(false);
  }, [tableName, companyId]);

  useEffect(() => { reload(); }, [reload]);

  // Ritorna la riga appena creata (non solo true): serve a chi deve
  // agganciare subito qualcos'altro al record, per esempio un corso di
  // formazione alla nomina appena registrata. In caso di errore torna false.
  const add = useCallback(async (row) => {
    const { data, error: insertError } = await supabase
      .from(tableName)
      .insert([{ ...trimStrings(row), company_id: companyId }])
      .select()
      .single();
    if (insertError) { setError(insertError.message); return false; }
    await reload();
    return data;
  }, [tableName, companyId, reload]);

  // Su cancellazione e modifica il vincolo su company_id vale come rete di
  // sicurezza: impedisce che un id rimasto in un elenco non aggiornato possa
  // toccare la riga di un'altra azienda.
  const remove = useCallback(async (id) => {
    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
    if (deleteError) { setError(deleteError.message); return false; }
    await reload();
    return true;
  }, [tableName, companyId, reload]);

  const update = useCallback(async (id, fields) => {
    const { error: updateError } = await supabase
      .from(tableName)
      .update(trimStrings(fields))
      .eq("id", id)
      .eq("company_id", companyId);
    if (updateError) { setError(updateError.message); return false; }
    await reload();
    return true;
  }, [tableName, companyId, reload]);

  return { items, add, remove, update, loading, error, reload };
}
