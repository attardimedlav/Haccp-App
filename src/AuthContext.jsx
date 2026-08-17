import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = ancora da caricare
  const [company, setCompany] = useState(null);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [error, setError] = useState("");

  const loadCompany = useCallback(async (userId) => {
    setLoadingCompany(true);
    setError("");
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id, full_name")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      setError("Il tuo utente non è ancora collegato a nessuna azienda. Contatta il consulente.");
      setCompany(null);
      setLoadingCompany(false);
      return;
    }

    const { data: companyRow } = await supabase
      .from("companies")
      .select("*")
      .eq("id", profile.company_id)
      .single();

    setCompany(companyRow || null);
    setLoadingCompany(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadCompany(data.session.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        loadCompany(newSession.user.id);
      } else {
        setCompany(null);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [loadCompany]);

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

  return (
    <AuthContext.Provider value={{ session, company, loadingCompany, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
