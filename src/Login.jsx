import React, { useState } from "react";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { useAuth } from "./AuthContext";

export default function Login() {
  const { signIn, error, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await signIn(email, password);
    setBusy(false);
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await requestPasswordReset(email);
    setBusy(false);
    if (ok) setResetSent(true);
  };

  if (mode === "forgot") {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={submitReset}>
          <div className="login-brand">
            <span className="brand-mark"><ShieldCheck size={16} /></span>
            <span>Autocontrollo HACCP</span>
          </div>
          <h1>Recupera password</h1>
          {resetSent ? (
            <p className="login-info"><CheckCircle2 size={14} /> Ti abbiamo inviato un'email con il link per reimpostare la password. Controlla anche nello spam.</p>
          ) : (
            <>
              <p className="sub" style={{ margin: 0 }}>Inserisci l'email con cui accedi: ti mandiamo un link per scegliere una nuova password.</p>
              <label className="field-label">
                Email
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </label>
              {error && <p className="login-error">{error}</p>}
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Invio in corso…" : "Invia link di recupero"}
              </button>
            </>
          )}
          <button type="button" className="link-btn" onClick={() => { setMode("login"); setResetSent(false); }}>
            ← Torna al login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-mark"><ShieldCheck size={16} /></span>
          <span>Autocontrollo HACCP</span>
        </div>
        <h1>Accedi</h1>
        <label className="field-label">
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="field-label">
          Password
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Accesso in corso…" : "Accedi"}
        </button>
        <button type="button" className="link-btn" onClick={() => setMode("forgot")}>
          Password dimenticata?
        </button>
      </form>
    </div>
  );
}
