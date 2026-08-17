import React, { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "./AuthContext";

export default function Login() {
  const { signIn, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await signIn(email, password);
    setBusy(false);
  };

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
      </form>
    </div>
  );
}
