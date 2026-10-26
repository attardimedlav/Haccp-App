import React, { useState, useEffect } from "react";
import { Building2, ArrowRight, User, FileWarning, Plus, AlertTriangle, X, Gauge, Paperclip } from "lucide-react";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import { uploadAttachment } from "../hooks/useAttachment";
import { getSubscriptionStatus, pillClassFor } from "../subscriptionStatus";

function legalMissingLabel(c) {
  if (!c) return null;
  const missingTos = !c.tos_accepted_at;
  const missingDpa = !c.dpa_signed_at;
  if (!missingTos && !missingDpa) return null;
  if (missingTos && missingDpa) return "Termini e Accordo mancanti";
  if (missingTos) return "Termini mancanti";
  return "Accordo mancante";
}

// Stessa conversione usata per bolle, etichette e registrazione sanitaria: i
// PDF passano interi, le foto si rimpiccioliscono a 2000 px prima di partire.
function fileInBase64(file) {
  return new Promise((resolve, reject) => {
    if (file.type === "application/pdf") {
      const r = new FileReader();
      r.onload = () => resolve({ data: String(r.result).split(",")[1], media_type: "application/pdf" });
      r.onerror = reject;
      r.readAsDataURL(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const lato = 2000;
      const scala = Math.min(1, lato / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scala);
      canvas.height = Math.round(img.height * scala);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], media_type: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Immagine non leggibile")); };
    img.src = url;
  });
}

const CAMPI_VUOTI = {
  name: "", owner_email: "", piva: "", pec: "",
  sede_legale: "", sede_operativa: "", codice_ateco: "",
  tipologia_attivita: "", forma_giuridica: "", numero_rea: "",
  active_haccp: true, active_work_safety: true,
  active_equipment_checks: true, active_medical_surveillance: true,
};

// Quanto costa la lettura automatica dei documenti, azienda per azienda.
//
// Il numero esisteva gia' — ogni lettura scrive in ai_usage il costo
// congelato — ma viveva soltanto nell'editor SQL. Un costo che per vederlo
// bisogna scrivere una query nei fatti non lo guarda nessuno, e questo e'
// invece il numero che dice se l'abbonamento che si chiede a un cliente
// regge. Qui sta accanto all'elenco dei clienti, che e' dove si ragiona di
// clienti.
//
// Sono dollari, perche' in dollari e' il listino del modello: convertirli in
// euro con un cambio inventato sarebbe un numero finto.
function ConsumiLettura() {
  const [giorni, setGiorni] = useState(30);
  const [righe, setRighe] = useState(null);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let vivo = true;
    setRighe(null); setErrore("");
    supabase.rpc("consumi_ai", { p_giorni: giorni }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) { setErrore(error.message); setRighe([]); return; }
      setRighe(data || []);
    });
    return () => { vivo = false; };
  }, [giorni]);

  const perAzienda = [];
  (righe || []).forEach((r) => {
    let a = perAzienda.find((x) => x.id === r.company_id);
    if (!a) { a = { id: r.company_id, nome: r.azienda, letture: 0, dollari: 0, tipi: [] }; perAzienda.push(a); }
    a.letture += Number(r.letture) || 0;
    a.dollari += Number(r.dollari) || 0;
    a.tipi.push({ tipo: r.tipo, letture: Number(r.letture) || 0, dollari: Number(r.dollari) || 0 });
  });
  perAzienda.sort((a, b) => b.dollari - a.dollari);
  const totale = perAzienda.reduce((n, a) => n + a.dollari, 0);
  const letture = perAzienda.reduce((n, a) => n + a.letture, 0);
  const soldi = (n) => "$ " + n.toFixed(2);

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-head">
        <div>
          <h3 style={{ margin: "0 0 6px" }}><Gauge size={16} /> Lettura automatica dei documenti</h3>
          <p className="sub" style={{ margin: 0 }}>
            Quanto costa a te far leggere all'intelligenza artificiale le foto e i PDF che i clienti
            caricano. Il costo e' quello del momento della lettura, non ricalcolato a posteriori.
          </p>
        </div>
      </div>

      <div className="row-form" style={{ marginTop: 10 }}>
        {[[30, "30 giorni"], [90, "3 mesi"], [365, "12 mesi"]].map(([g, etichetta]) => (
          <button key={g} type="button"
            className={giorni === g ? "btn-primary" : "link-btn"}
            onClick={() => setGiorni(g)}>{etichetta}</button>
        ))}
      </div>

      {errore && <p className="corso-avviso"><AlertTriangle size={14} /> {errore}</p>}

      {righe === null ? (
        <p className="sub">Calcolo…</p>
      ) : perAzienda.length === 0 ? (
        <div className="empty"><p>Nessuna lettura nel periodo scelto.</p></div>
      ) : (
        <>
          <p style={{ margin: "10px 0 4px", fontWeight: 600 }}>
            {soldi(totale)} in tutto — {letture} {letture === 1 ? "lettura" : "letture"},
            {" "}{soldi(letture ? totale / letture : 0)} in media
          </p>
          <ul className="dish-list">
            {perAzienda.map((a) => (
              <li key={a.id} className="dish-row">
                <div className="dish-top" style={{ marginBottom: 4 }}>
                  <strong>{a.nome}</strong>
                  <span>{soldi(a.dollari)}</span>
                </div>
                <div className="traccia-meta">
                  <span className="doc-type-tag">{a.letture} {a.letture === 1 ? "lettura" : "letture"}</span>
                  {a.tipi.sort((x, y) => y.dollari - x.dollari).map((t) => (
                    <span key={t.tipo} className="doc-type-tag">
                      {t.tipo}: {t.letture} · {soldi(t.dollari)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function MieiClienti({ goTo }) {
  const { company, homeCompanyId, homeCompanyName, consultantCompanies, switchCompany, reloadClienti } = useAuth();
  const enter = async (id) => {
    const ok = await switchCompany(id);
    if (ok) goTo("dashboard");
  };

  // --- nuovo cliente ---------------------------------------------------------
  // La creazione passa dalla funzione crea_azienda_cliente sul database, non da
  // una insert: le policy non permettono all'app di scrivere in "companies" per
  // una riga che non esiste ancora, ne' in "consultant_companies". La funzione
  // fa le due cose insieme, cosi' un'azienda non puo' nascere scollegata dal
  // consulente — errore gia' commesso creandole a mano.
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [campi, setCampi] = useState(CAMPI_VUOTI);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [creata, setCreata] = useState(null);

  // La visura, qui, prima che l'azienda esista.
  //
  // E' il momento giusto: questi campi si compilano una volta sola, e se li
  // si batte a mano l'errore nasce qui e poi viene copiato in ogni nomina,
  // in ogni verbale e nel frontespizio del manuale. Il file non si puo'
  // caricare subito — lo storage vuole l'id dell'azienda, che ancora non
  // c'e' — quindi si tiene da parte e si allega appena la creazione
  // riesce. Se quel secondo passaggio fallisce, l'azienda resta creata coi
  // dati giusti: si riallega la visura da Configurazione.
  const [visuraFile, setVisuraFile] = useState(null);
  const [visuraData, setVisuraData] = useState("");
  const [visuraRappresentante, setVisuraRappresentante] = useState("");
  const [visuraBusy, setVisuraBusy] = useState(false);
  const [visuraNota, setVisuraNota] = useState("");
  const [visuraErrore, setVisuraErrore] = useState("");

  const set = (k, v) => setCampi((c) => ({ ...c, [k]: v }));

  const azzeraVisura = () => {
    setVisuraFile(null); setVisuraData(""); setVisuraRappresentante("");
    setVisuraNota(""); setVisuraErrore("");
  };

  const apri = () => { setCampi(CAMPI_VUOTI); azzeraVisura(); setErrore(""); setCreata(null); setNuovoAperto(true); };

  const onVisura = async (e) => {
    const f = e.target.files?.[0] || null;
    setVisuraErrore(""); setVisuraNota("");
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) {
      setVisuraErrore("File troppo grande (limite 12 MB).");
      e.target.value = "";
      return;
    }
    setVisuraFile(f);
    setVisuraBusy(true);
    try {
      const { data: b64, media_type } = await fileInBase64(f);
      const { data, error: err } = await supabase.functions.invoke("clever-responder", {
        body: { file_base64: b64, media_type, tipo: "visura" },
      });
      if (err) throw new Error(err.message || "Lettura non riuscita");
      if (data?.errore) throw new Error(data.errore);

      const letti = [];
      const metti = (valore, chiave, etichetta) => {
        const v = String(valore || "").trim();
        if (!v) return;
        set(chiave, v);
        letti.push(etichetta);
      };
      metti(data?.denominazione, "name", "ragione sociale");
      metti(data?.forma_giuridica, "forma_giuridica", "forma giuridica");
      metti(data?.piva, "piva", "P.IVA");
      metti(data?.numero_rea, "numero_rea", "numero REA");
      metti(data?.sede_legale, "sede_legale", "sede legale");
      metti(data?.sede_operativa, "sede_operativa", "sede operativa");
      metti(data?.pec, "pec", "PEC");
      metti(data?.codice_ateco, "codice_ateco", "codice ATECO");
      metti(data?.attivita, "tipologia_attivita", "attività svolta");
      if (data?.data_visura) setVisuraData(String(data.data_visura));
      if (data?.legale_rappresentante) {
        setVisuraRappresentante(String(data.legale_rappresentante).trim());
        letti.push("legale rappresentante");
      }
      if (letti.length === 0) {
        setVisuraErrore("Dalla visura non è stato letto nessun campo: compila a mano. Il documento resta allegato alla creazione.");
      } else {
        setVisuraNota("Letti dalla visura: " + letti.join(", ") + ". Controllali prima di creare.");
      }
    } catch (e2) {
      setVisuraErrore("Lettura non riuscita (" + e2.message + "): compila a mano. Il documento resta allegato alla creazione.");
    } finally {
      setVisuraBusy(false);
    }
  };

  const crea = async () => {
    if (!campi.name.trim()) { setErrore("La ragione sociale è obbligatoria."); return; }
    setBusy(true); setErrore("");
    const { data, error } = await supabase.rpc("crea_azienda_cliente", {
      p_name: campi.name,
      p_owner_email: campi.owner_email,
      p_piva: campi.piva,
      p_pec: campi.pec,
      p_sede_legale: campi.sede_legale,
      p_sede_operativa: campi.sede_operativa,
      p_codice_ateco: campi.codice_ateco,
      p_tipologia_attivita: campi.tipologia_attivita,
      p_forma_giuridica: campi.forma_giuridica,
      p_numero_rea: campi.numero_rea,
      p_active_haccp: campi.active_haccp,
      p_active_work_safety: campi.active_work_safety,
      p_active_equipment_checks: campi.active_equipment_checks,
      p_active_medical_surveillance: campi.active_medical_surveillance,
    });
    if (error) { setBusy(false); setErrore(error.message); return; }

    let avviso = "";
    // L'azienda ora esiste: si allega la visura e si scrivono i due dati che
    // la funzione di creazione non prende (la visura stessa e il legale
    // rappresentante letto da lei).
    if (visuraFile || visuraData || visuraRappresentante) {
      try {
        const aggiornamento = {};
        if (visuraFile) {
          aggiornamento.chamber_doc_path = await uploadAttachment(data, visuraFile);
        }
        if (visuraData) aggiornamento.chamber_doc_date = visuraData;
        if (visuraRappresentante) aggiornamento.haccp_manager = visuraRappresentante;
        const res = await supabase.from("companies").update(aggiornamento).eq("id", data);
        if (res.error) throw new Error(res.error.message);
      } catch (e2) {
        // L'azienda c'è e i campi sono salvi: manca solo l'allegato. L'avviso
        // non può stare nel riquadro, che fra un attimo si chiude: va accanto
        // alla riga «è stata creata», che resta sotto gli occhi.
        avviso = "Azienda creata, ma la visura non è stata allegata (" + e2.message + "): puoi ricaricarla da Configurazione → Generale.";
      }
    }

    setBusy(false);
    setCreata({ id: data, nome: campi.name.trim(), avviso });
    setNuovoAperto(false);
    azzeraVisura();
    if (reloadClienti) await reloadClienti();
  };

  const homeSub = company?.id === homeCompanyId ? getSubscriptionStatus(company) : null;
  const homeLegalMissing = company?.id === homeCompanyId ? legalMissingLabel(company) : null;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>I miei clienti</h2>
          <p className="sub">Passa da un'azienda all'altra senza rifare il login. Stai visualizzando: <strong>{company?.name}</strong>.</p>
        </div>
        {!nuovoAperto && (
          <button className="btn-primary" onClick={apri}><Plus size={15} /> Aggiungi cliente</button>
        )}
      </div>

      {creata && (
        <>
          <div className="cliente-creato">
            <span><strong>{creata.nome}</strong> è stata creata ed è collegata a te.</span>
            <button className="btn-primary" onClick={() => enter(creata.id)}>Entra <ArrowRight size={14} /></button>
          </div>
          {creata.avviso && <p className="corso-avviso"><AlertTriangle size={14} /> {creata.avviso}</p>}
        </>
      )}

      {nuovoAperto && (
        <div className="corso-panel" style={{ marginBottom: 18 }}>
          <div className="panel-head">
            <div>
              <h3 style={{ margin: "0 0 6px" }}>Nuovo cliente</h3>
              <p className="sub" style={{ margin: 0 }}>
                Carica la visura camerale e i campi si compilano da soli. Solo la ragione sociale è
                obbligatoria: il resto si può completare dopo, in Configurazione.
              </p>
            </div>
            <button type="button" className="icon-btn" onClick={() => setNuovoAperto(false)} aria-label="Chiudi"><X size={16} /></button>
          </div>

          <div style={{ marginTop: 12, padding: "12px 14px", border: "1px solid #E1E5DF", borderRadius: 10, background: "#F7F9F6" }}>
            <label className="field-label" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              <Paperclip size={14} />
              {visuraBusy
                ? "Lettura della visura in corso…"
                : (visuraFile ? "Visura: " + visuraFile.name + " — sostituisci" : "Carica la visura camerale (PDF o foto, max 12 MB)")}
              <input type="file" accept="application/pdf,image/*" disabled={visuraBusy || busy} onChange={onVisura} />
            </label>
            <p className="sub" style={{ marginTop: 6, marginBottom: 0 }}>
              Ragione sociale, forma giuridica, P.IVA, numero REA, sede, PEC e codice ATECO vengono
              letti dalla visura e scritti qui sotto. Il documento resta allegato all'azienda.
            </p>
            {visuraNota && <p className="sub" style={{ marginTop: 6, marginBottom: 0, color: "#1f6b3a" }}>{visuraNota}</p>}
            {visuraRappresentante && (
              <p className="sub" style={{ marginTop: 6, marginBottom: 0 }}>
                Legale rappresentante letto: <strong>{visuraRappresentante}</strong> — diventa il responsabile del piano di autocontrollo.
              </p>
            )}
            {visuraErrore && <p className="sub" style={{ marginTop: 6, marginBottom: 0, color: "#a33" }}>{visuraErrore}</p>}
          </div>

          <input type="text" className="full-input" placeholder="Ragione sociale"
            value={campi.name} onChange={(e) => set("name", e.target.value)} style={{ marginTop: 10 }} />
          <div className="row-form">
            <input type="text" className="note-input" placeholder="Partita IVA / codice fiscale"
              value={campi.piva} onChange={(e) => set("piva", e.target.value)} />
            <input type="text" className="note-input" placeholder="Numero REA"
              value={campi.numero_rea} onChange={(e) => set("numero_rea", e.target.value)} />
            <input type="text" className="note-input" placeholder="Forma giuridica"
              value={campi.forma_giuridica} onChange={(e) => set("forma_giuridica", e.target.value)} />
          </div>
          <div className="row-form" style={{ marginTop: 0 }}>
            <input type="email" className="note-input" placeholder="Email del titolare (per gli avvisi di scadenza)"
              value={campi.owner_email} onChange={(e) => set("owner_email", e.target.value)} />
            <input type="text" className="note-input" placeholder="PEC"
              value={campi.pec} onChange={(e) => set("pec", e.target.value)} />
          </div>
          <input type="text" className="full-input" placeholder="Sede legale"
            value={campi.sede_legale} onChange={(e) => set("sede_legale", e.target.value)} style={{ marginBottom: 8 }} />
          <input type="text" className="full-input" placeholder="Sede operativa (lascia vuoto se coincide con la legale)"
            value={campi.sede_operativa} onChange={(e) => set("sede_operativa", e.target.value)} />
          <div className="row-form">
            <input type="text" className="note-input" placeholder="Codice ATECO"
              value={campi.codice_ateco} onChange={(e) => set("codice_ateco", e.target.value)} />
            <input type="text" className="note-input" placeholder="Attività svolta"
              value={campi.tipologia_attivita} onChange={(e) => set("tipologia_attivita", e.target.value)} />
          </div>

          <p className="corso-sezione">Moduli attivi</p>
          <div className="moduli-scelta">
            {[
              ["active_haccp", "HACCP — autocontrollo alimentare"],
              ["active_work_safety", "Sicurezza sul lavoro"],
              ["active_equipment_checks", "Attrezzature"],
              ["active_medical_surveillance", "Sorveglianza sanitaria"],
            ].map(([k, etichetta]) => (
              <label key={k} className="corso-check">
                <input type="checkbox" checked={campi[k]} onChange={(e) => set(k, e.target.checked)} />
                <span>{etichetta}</span>
              </label>
            ))}
          </div>
          <p className="sub" style={{ margin: "8px 0 0" }}>
            Si possono cambiare in qualsiasi momento da Configurazione. Spegnere un modulo nasconde
            le sue schede, non cancella nulla.
          </p>

          {errore && <p className="corso-avviso"><AlertTriangle size={14} /> {errore}</p>}

          <div className="row-form" style={{ marginTop: 14 }}>
            <button type="button" className="btn-primary" onClick={crea} disabled={busy}>
              <Plus size={15} /> {busy ? "Creazione…" : "Crea il cliente"}
            </button>
            <button type="button" className="link-btn" onClick={() => setNuovoAperto(false)}>Annulla</button>
          </div>
        </div>
      )}
      <ul className="dish-list">
        {homeCompanyId && (
          <li className={"dish-row client-row" + (company?.id === homeCompanyId ? " client-row-active" : "")}>
            <div className="client-row-info">
              <User size={16} color="#2F6F4E" />
              <div>
                <strong>La tua azienda</strong>
                <span className="log-note" style={{ display: "block" }}>{homeCompanyName}</span>
              </div>
              {homeSub && <span className={"pill " + pillClassFor(homeSub.state)}>{homeSub.label}</span>}
              {homeLegalMissing && (
                <span className="pill pill-warn"><FileWarning size={12} /> {homeLegalMissing}</span>
              )}
            </div>
            {company?.id !== homeCompanyId && (
              <button className="btn-primary" onClick={() => enter(homeCompanyId)}>
                Entra <ArrowRight size={14} />
              </button>
            )}
          </li>
        )}
        {consultantCompanies.map((c) => {
          const sub = getSubscriptionStatus(c);
          const legalMissing = legalMissingLabel(c);
          return (
            <li key={c.id} className={"dish-row client-row" + (company?.id === c.id ? " client-row-active" : "")}>
              <div className="client-row-info">
                <Building2 size={16} color="#2F6F4E" />
                <strong>{c.name}</strong>
                {sub && <span className={"pill " + pillClassFor(sub.state)}>{sub.label}</span>}
                {legalMissing && (
                  <span className="pill pill-warn"><FileWarning size={12} /> {legalMissing}</span>
                )}
              </div>
              {company?.id !== c.id && (
                <button className="btn-primary" onClick={() => enter(c.id)}>
                  Entra <ArrowRight size={14} />
                </button>
              )}
            </li>
          );
        })}
        {consultantCompanies.length === 0 && (
          <div className="empty"><p>Non hai ancora clienti collegati al tuo account consulente.</p></div>
        )}
      </ul>

      <ConsumiLettura />
    </div>
  );
}
