import React, { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "./AuthContext";

export default function ResetPassword() {
  const { setNewPassword, error } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLocalError("");
    if (password.length < 6) { setLocalError("La password deve avere almeno 6 caratteri."); return; }
    if (password !== confirm) { setLocalError("Le due password non coincidono."); return; }
    setBusy(true);
    await setNewPassword(password);
    setBusy(false);
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-mark"><ShieldCheck size={16} /></span>
          <span>Autocontrollo HACCP</span>
        </div>
        <h1>Imposta una nuova password</h1>
        <label className="field-label">
          Nuova password
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        <label className="field-label">
          Ripeti la nuova password
          <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {(localError || error) && <p className="login-error">{localError || error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Salvataggio…" : "Salva nuova password"}
        </button>
      </form>
    </div>
  );
}
