import React, { useCallback, useEffect, useState } from "react";
import { KeyRound, UserPlus, Copy, AlertTriangle, RefreshCw, Trash2, Check } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";

const FUNZIONE = "swift-api";  // nome assegnato da Supabase alla function delle credenziali

// Password leggibile: si detta al telefono senza equivoci, e non contiene
// caratteri che si confondono (niente 0/O, 1/l).
function passwordProposta() {
  const parole = ["mela", "sole", "porto", "lampo", "cielo", "fiume", "bosco", "pane", "vela", "torre", "prato", "neve"];
  const p = () => parole[Math.floor(Math.random() * parole.length)];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${p()}-${p()}-${n}`;
}

export default function AccessoAzienda() {
  const { company } = useAuth();
  const [utenti, setUtenti] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");
  const [inCorso, setInCorso] = useState(false);

  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [password, setPassword] = useState(passwordProposta());
  const [appenaCreato, setAppenaCreato] = useState(null);
  const [cambiaPer, setCambiaPer] = useState(null);
  const [nuovaPassword, setNuovaPassword] = useState("");

  const chiama = useCallback(async (corpo) => {
    const { data, error } = await supabase.functions.invoke(FUNZIONE, { body: corpo });
    if (error) throw new Error(error.message || "chiamata non riuscita");
    if (data?.errore) throw new Error(data.errore);
    return data;
  }, []);

  const carica = useCallback(async () => {
    if (!company?.id) return;
    setCaricamento(true);
    setErrore("");
    try {
      const d = await chiama({ azione: "elenco", company_id: company.id });
      setUtenti(d.utenti || []);
    } catch (e) {
      setErrore("Elenco non disponibile: " + e.message);
    } finally {
      setCaricamento(false);
    }
  }, [company?.id, chiama]);

  useEffect(() => {
    carica();
    setEmail(company?.owner_email || "");
    setNome("");
    setAppenaCreato(null);
    setPassword(passwordProposta());
  }, [company?.id, carica, company?.owner_email]);

  const crea = async (e) => {
    e.preventDefault();
    if (!email.trim() || password.length < 8) { setErrore("Servono email e una password di almeno 8 caratteri."); return; }
    setErrore("");
    setInCorso(true);
    try {
      const d = await chiama({
        azione: "crea", company_id: company.id,
        email: email.trim().toLowerCase(), password, nome: nome.trim() || null,
      });
      setAppenaCreato({ email: email.trim().toLowerCase(), password, gia_esistente: d.gia_esistente });
      setNome("");
      setPassword(passwordProposta());
      await carica();
    } catch (e2) {
      setErrore("Creazione non riuscita: " + e2.message);
    } finally {
      setInCorso(false);
    }
  };

  const cambiaPassword = async (user_id) => {
    if (nuovaPassword.length < 8) { setErrore("La password deve avere almeno 8 caratteri."); return; }
    setErrore("");
    setInCorso(true);
    try {
      await chiama({ azione: "password", company_id: company.id, user_id, password: nuovaPassword });
      setAppenaCreato({ email: utenti.find((u) => u.user_id === user_id)?.email, password: nuovaPassword, cambio: true });
      setCambiaPer(null);
      setNuovaPassword("");
    } catch (e) {
      setErrore("Cambio password non riuscito: " + e.message);
    } finally {
      setInCorso(false);
    }
  };

  const revoca = async (user_id, etichetta) => {
    if (!window.confirm(`Togliere l'accesso a ${etichetta}? L'utente resta, ma non vedrà più i dati di questa azienda.`)) return;
    setInCorso(true);
    setErrore("");
    try {
      await chiama({ azione: "revoca", company_id: company.id, user_id });
      await carica();
    } catch (e) {
      setErrore("Revoca non riuscita: " + e.message);
    } finally {
      setInCorso(false);
    }
  };

  const copia = (testo) => navigator.clipboard?.writeText(testo);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Accesso dell'azienda</h2>
          <p className="sub">
            Le credenziali con cui <strong>{company?.name || "l'azienda"}</strong> entra nell'app e compila i
            registri. Le crei tu: l'azienda riceve email e password e le cambia quando vuole dal proprio profilo.
          </p>
        </div>
      </div>

      {errore && <p className="form-error"><AlertTriangle size={13} /> {errore}</p>}

      {appenaCreato && (
        <div className="credenziali-box">
          <p className="sub" style={{ margin: 0 }}>
            {appenaCreato.cambio
              ? "Password cambiata. Comunicala all'azienda: da qui non si rivede più."
              : appenaCreato.gia_esistente
                ? "L'utente esisteva già ed è stato collegato a questa azienda, mantenendo la sua password."
                : "Credenziali create. Annotale adesso: la password non si rivede più."}
          </p>
          <div className="credenziali-riga">
            <span>{appenaCreato.email}</span>
            <button type="button" className="link-btn" onClick={() => copia(appenaCreato.email)}><Copy size={13} /> copia</button>
          </div>
          {!appenaCreato.gia_esistente && (
            <div className="credenziali-riga">
              <strong>{appenaCreato.password}</strong>
              <button type="button" className="link-btn" onClick={() => copia(appenaCreato.password)}><Copy size={13} /> copia</button>
            </div>
          )}
          <button type="button" className="link-btn" onClick={() => setAppenaCreato(null)}>Ho annotato, nascondi</button>
        </div>
      )}

      <h3 className="section-title">Chi ha accesso oggi</h3>
      {caricamento ? (
        <p className="sub">Caricamento…</p>
      ) : utenti.length === 0 ? (
        <div className="empty"><p>Nessun utente collegato: l'azienda non può ancora entrare.</p></div>
      ) : (
        <ul className="log-list">
          {utenti.map((u) => (
            <li key={u.user_id} className="log-row" style={{ flexWrap: "wrap" }}>
              <KeyRound size={15} color="#2F6F4E" />
              <span className="log-main">
                <strong>{u.email || "(email non disponibile)"}</strong>
                {u.nome ? <span className="log-unit"> {u.nome}</span> : null}
              </span>
              <span className="log-note">
                {u.ultimo_accesso
                  ? "ultimo accesso " + new Date(u.ultimo_accesso).toLocaleDateString("it-IT")
                  : "non è mai entrato"}
              </span>
              <button type="button" className="link-btn" onClick={() => { setCambiaPer(u.user_id); setNuovaPassword(passwordProposta()); }}>
                <RefreshCw size={13} /> cambia password
              </button>
              <button type="button" className="icon-btn" disabled={inCorso} onClick={() => revoca(u.user_id, u.email)} aria-label="Togli l'accesso">
                <Trash2 size={14} />
              </button>
              {cambiaPer === u.user_id && (
                <div className="row-form" style={{ width: "100%", marginTop: 8 }}>
                  <input type="text" value={nuovaPassword} onChange={(e) => setNuovaPassword(e.target.value)} className="note-input" />
                  <button type="button" className="btn-primary" disabled={inCorso} onClick={() => cambiaPassword(u.user_id)}>
                    <Check size={15} /> Conferma
                  </button>
                  <button type="button" className="link-btn" onClick={() => setCambiaPer(null)}>Annulla</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="section-title">Nuovo accesso</h3>
      <form onSubmit={crea} className="traccia-form">
        <div className="row-form">
          <input type="email" required placeholder="Email di chi entrerà" value={email} onChange={(e) => setEmail(e.target.value)} className="note-input" />
          <input type="text" placeholder="Nome e cognome (facoltativo)" value={nome} onChange={(e) => setNome(e.target.value)} className="note-input" />
        </div>
        <div className="row-form">
          <input type="text" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="note-input" />
          <button type="button" className="link-btn" onClick={() => setPassword(passwordProposta())}><RefreshCw size={13} /> proponine un'altra</button>
        </div>
        <p className="sub" style={{ margin: 0 }}>
          La password proposta si detta al telefono senza equivoci. L'email indicata è quella con cui si entra:
          conviene usare quella personale del titolare, che non la dimentica.
        </p>
        <button type="submit" className="btn-primary" disabled={inCorso} style={{ alignSelf: "flex-start" }}>
          <UserPlus size={16} /> {inCorso ? "Creazione…" : "Crea l'accesso"}
        </button>
      </form>
    </div>
  );
}
