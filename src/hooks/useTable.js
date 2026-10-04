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

// Normalizza gli spazi in tutti i campi di testo prima di scrivere sul
// database: via quelli iniziali e finali, e ogni sequenza interna ridotta a
// un solo spazio. Non è una pulizia estetica: in questa app le persone si
// collegano alle nomine, ai corsi e alle visite mediche confrontando il nome
// come stringa, quindi uno spazio invisibile spezza il collegamento senza
// dare nessun errore. È già successo due volte: "MARIA ANGELA ANICETO " con
// lo spazio in coda, che ha prodotto nomine doppie, e "JADER MARIA
// CASTROGIOVANNI" con due spazi in mezzo, che compariva due volte
// nell'organigramma.
//
// Gli a capo restano intatti: si normalizzano solo spazi e tabulazioni, così
// le note su più righe non vengono appiattite.
function trimStrings(row) {
  const out = {};
  for (const key of Object.keys(row)) {
    const value = row[key];
    out[key] = typeof value === "string" ? value.trim().replace(/[ \t]+/g, " ") : value;
  }
  return out;
}

// Avviso di scrittura.
//
// Alcune informazioni sono lette in due punti diversi dell'app con due copie
// separate delle stesse righe: la piu' visibile e' il nominativo del RSPP, che
// sta nella riga in cima alla pagina (App.jsx) e dentro l'organigramma. Ogni
// copia si aggiorna solo quando il suo componente si monta, quindi dopo aver
// aggiunto una persona nell'organigramma la riga in alto continuava a dire
// "RSPP non ancora nominato" fino al ricaricamento della pagina: sembrava un
// dato mancante e non lo era. Chi scrive lo annuncia, chi tiene una copia
// altrove si rilegge.
export const EVENTO_SCRITTURA = "cardine:tabella-scritta";

function annunciaScrittura(tableName) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_SCRITTURA, { detail: { tableName } }));
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

  // Rilettura automatica, per due motivi diversi.
  //
  // Il primo: la stessa tabella è letta da più schede dell'app, ognuna con la
  // sua copia. Finora chi scriveva annunciava la scrittura ma nessuno
  // ascoltava, tranne la riga in cima alla pagina: così una persona aggiunta
  // in Configurazione compariva nell'organigramma solo riaprendolo. Adesso
  // ogni copia della stessa tabella si rilegge da sola.
  //
  // Il secondo: l'app resta aperta per ore su una scheda sola. Quando si torna
  // dopo aver lavorato altrove — o dopo che l'ha usata il cliente dal suo
  // accesso — i dati a schermo possono essere di stamattina. Al ritorno sulla
  // finestra si rilegge, ma non più di una volta al minuto, per non
  // interrogare il database a ogni passaggio di finestra.
  useEffect(() => {
    if (!companyId || typeof window === "undefined") return;
    let ultima = Date.now();

    const suScrittura = (e) => {
      if (e?.detail?.tableName === tableName) { ultima = Date.now(); reload(); }
    };
    const suRitorno = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultima < 60000) return;
      ultima = Date.now();
      reload();
    };

    window.addEventListener(EVENTO_SCRITTURA, suScrittura);
    document.addEventListener("visibilitychange", suRitorno);
    window.addEventListener("focus", suRitorno);
    return () => {
      window.removeEventListener(EVENTO_SCRITTURA, suScrittura);
      document.removeEventListener("visibilitychange", suRitorno);
      window.removeEventListener("focus", suRitorno);
    };
  }, [tableName, companyId, reload]);

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
    annunciaScrittura(tableName);
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
    annunciaScrittura(tableName);
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
    annunciaScrittura(tableName);
    return true;
  }, [tableName, companyId, reload]);

  return { items, add, remove, update, loading, error, reload };
}
