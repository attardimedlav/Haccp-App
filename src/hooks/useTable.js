import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

// Hook generico: legge tutte le righe di una tabella (RLS filtra già
// automaticamente per azienda), permette di aggiungerne e cancellarne.
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
      .order("created_at", { ascending: false });
    if (fetchError) setError(fetchError.message);
    else setItems(data || []);
    setLoading(false);
  }, [tableName, companyId]);

  useEffect(() => { reload(); }, [reload]);

  const add = useCallback(async (row) => {
    const { error: insertError } = await supabase
      .from(tableName)
      .insert([{ ...row, company_id: companyId }]);
    if (insertError) { setError(insertError.message); return false; }
    await reload();
    return true;
  }, [tableName, companyId, reload]);

  const remove = useCallback(async (id) => {
    const { error: deleteError } = await supabase.from(tableName).delete().eq("id", id);
    if (deleteError) { setError(deleteError.message); return false; }
    await reload();
    return true;
  }, [tableName, reload]);

  const update = useCallback(async (id, fields) => {
    const { error: updateError } = await supabase.from(tableName).update(fields).eq("id", id);
    if (updateError) { setError(updateError.message); return false; }
    await reload();
    return true;
  }, [tableName, reload]);

  return { items, add, remove, update, loading, error, reload };
}
