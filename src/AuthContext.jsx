import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = ancora da caricare
  const [company, setCompany] = useState(null);
  const [homeCompanyId, setHomeCompanyId] = useState(null); // l'azienda "propria" dell'utente (se dipendente/titolare)
  const [homeCompanyName, setHomeCompanyName] = useState("");
  const [consultantCompanies, setConsultantCompanies] = useState([]); // aziende clienti accessibili come consulente
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [error, setError] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);

  // silent = true: aggiorna i dati dell'azienda in background (usato quando il
  // browser torna in primo piano su una scheda già aperta) senza mostrare la
  // schermata "Caricamento azienda…", che smonterebbe la pagina corrente e
  // farebbe tornare l'utente alla Panoramica.
  const loadCompany = useCallback(async (userId, { silent = false } = {}) => {
    if (!silent) setLoadingCompany(true);
    setError("");

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, full_name")
      .eq("id", userId)
      .single();

    const ownCompanyId = profile?.company_id || null;
    setHomeCompanyId(ownCompanyId);

    const { data: ccRows } = await supabase
      .from("consultant_companies")
      .select("company_id, companies(id, name, subscription_end, subscription_status, tos_accepted_at, dpa_signed_at)")
      .eq("consultant_id", userId);

    const clientList = (ccRows || [])
      .map((r) => r.companies)
      .filter(Boolean);
    setConsultantCompanies(clientList);

    const initialId = ownCompanyId || (clientList[0] && clientList[0].id) || null;

    if (!initialId) {
      if (!silent) {
        setError("Il tuo utente non è ancora collegato a nessuna azienda. Contatta il consulente.");
        setCompany(null);
      }
      if (!silent) setLoadingCompany(false);
      return;
    }

    const { data: companyRow } = await supabase
      .from("companies")
      .select("*")
      .eq("id", initialId)
      .single();

    setCompany(companyRow || null);
    if (ownCompanyId && companyRow && companyRow.id === ownCompanyId) {
      setHomeCompanyName(companyRow.name || "");
    } else if (ownCompanyId) {
      const { data: ownRow } = await supabase.from("companies").select("name").eq("id", ownCompanyId).single();
      setHomeCompanyName(ownRow?.name || "");
    }
    if (!silent) setLoadingCompany(false);
  }, []);

  const loadedUserIdRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadedUserIdRef.current = data.session.user.id;
        loadCompany(data.session.user.id);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      if (newSession?.user) {
        // Il token viene rinnovato automaticamente ogni volta che il browser
        // torna in primo piano su una scheda già aperta (cambio scheda/finestra):
        // se è lo stesso utente già caricato, aggiorniamo comunque i dati
        // dell'azienda (così restano aggiornati anche cambiando scheda), ma in
        // modo silenzioso — senza mostrare "Caricamento azienda…", che
        // smonterebbe la pagina corrente e farebbe tornare sempre alla Panoramica.
        const isSameUserAlreadyLoaded = loadedUserIdRef.current === newSession.user.id;
        loadedUserIdRef.current = newSession.user.id;
        loadCompany(newSession.user.id, { silent: isSameUserAlreadyLoaded });
      } else {
        loadedUserIdRef.current = null;
        setCompany(null);
        setConsultantCompanies([]);
        setHomeCompanyId(null);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [loadCompany]);

  const switchCompany = async (companyId) => {
    setError("");
    const { data, error: fetchError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();
    if (fetchError || !data) { setError("Non hai accesso a questa azienda."); return false; }
    setCompany(data);
    return true;
  };

  const signIn = async (email, password) => {
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message === "Invalid login credentials"
        ? "Email o password non corrette."
        : signInError.message);
      return false;
    }
    return true;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const updateCompany = async (fields) => {
    if (!company) return false;
    const { data, error: updateError } = await supabase
      .from("companies")
      .update(fields)
      .eq("id", company.id)
      .select()
      .single();
    if (updateError) { setError(updateError.message); return false; }
    setCompany(data);
    return true;
  };

  const requestPasswordReset = async (email) => {
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (resetError) { setError(resetError.message); return false; }
    return true;
  };

  const setNewPassword = async (password) => {
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setError(updateError.message); return false; }
    setRecoveryMode(false);
    return true;
  };

  return (
    <AuthContext.Provider value={{
      session, company, homeCompanyId, homeCompanyName, consultantCompanies, loadingCompany, error,
      signIn, signOut, updateCompany, recoveryMode, requestPasswordReset, setNewPassword, switchCompany,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
