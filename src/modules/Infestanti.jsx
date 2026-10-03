import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, Paperclip, FileText, Download, Map, Target, Check, X, Info, Pencil } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

// Monitoraggio infestanti.
//
// Il monitoraggio non è un controllo generico per area: è il giro delle
// postazioni segnate sulla planimetria. Finché la scheda registrava
// "Cucina — nessuna traccia", il documento non diceva quante esche ci
// sono, dove stanno, né quali sono state controllate: in ispezione è la
// prima cosa che viene chiesta, planimetria alla mano.
//
// Qui la planimetria è il documento di riferimento, le postazioni sono
// numerate come su quel disegno, e ogni giro produce un esito per
// ciascuna postazione. Un giro con metà postazioni non controllate resta
// visibilmente incompleto, che è esattamente quello che è.

const MAX_FILE_BYTES = 8 * 1024 * 1024;

const TIPI = [
  "Esca rodenticida",
  "Trappola a cattura",
  "Trappola collante",
  "Lampada UV insetticida",
  "Trappola a feromoni",
  "Altro",
];

const ESITI = [
  { id: "integra", label: "Integra, nessun consumo" },
  { id: "consumo", label: "Consumo di esca" },
  { id: "cattura", label: "Cattura rilevata" },
  { id: "mancante", label: "Postazione mancante o danneggiata" },
  { id: "sostituita", label: "Esca sostituita" },
];

const ESITI_ALLARME = ["consumo", "cattura", "mancante"];

const oggi = () => new Date().toISOString().slice(0, 10);

function fmt(iso) {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}

function giorniDa(iso) {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10));
  const o = new Date();
  o.setHours(0, 0, 0, 0);
  return Math.floor((o - d) / 86400000);
}

function AttachmentLink(props) {
  const [url, setUrl] = useState(null);
  React.useEffect(function () {
    if (props.path) getAttachmentUrl(props.path).then(setUrl);
  }, [props.path]);
  if (!props.path) return <span className="none-label">{props.vuoto || "Nessun documento allegato"}</span>;
  if (!url) return <span className="none-label">Caricamento allegato…</span>;
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} /><span className="attachment-name">{props.nome || "Documento"}</span><Download size={14} />
    </a>
  );
}

export default function Infestanti() {
  const { company } = useAuth();
  const companyId = company?.id;
  const { items: planimetrie, add: addPlanimetria, remove: removePlanimetria } = useTable("pest_plans", companyId);
  const { items: postazioni, add: addPostazione, remove: removePostazione, update: updatePostazione, reload: reloadPostazioni, loading } =
    useTable("pest_stations", companyId);
  const { items: giri, add: addGiro, remove: removeGiro, reload: reloadGiri } = useTable("pest_rounds", companyId);
  const { items: esiti, add: addEsito, reload: reloadEsiti } = useTable("pest_station_checks", companyId);

  const responsabile = (company?.haccp_manager || "").trim();
  const ogniGiorni = Number(company?.pest_round_days) || 30;

  const [vista, setVista] = useState("giri");
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);

  // --- planimetria ---
  const [filePlan, setFilePlan] = useState(null);
  const [dataPlan, setDataPlan] = useState(oggi());
  const [notaPlan, setNotaPlan] = useState("");

  const planimetriaCorrente = [...planimetrie]
    .sort(function (a, b) { return (a.plan_date || "") < (b.plan_date || "") ? 1 : -1; })[0] || null;

  const caricaPlanimetria = async function (e) {
    e.preventDefault();
    if (!filePlan) { setErrore("Scegli il file della planimetria."); return; }
    setBusy(true); setErrore("");
    try {
      const attachment_path = await uploadAttachment(companyId, filePlan);
      await addPlanimetria({ attachment_path: attachment_path, plan_date: dataPlan, note: notaPlan.trim() || null });
      setFilePlan(null); setNotaPlan("");
      const input = document.getElementById("planimetria-file");
      if (input) input.value = "";
    } catch (err) {
      setErrore("Errore durante il caricamento: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  // --- postazioni ---
  const [quante, setQuante] = useState(6);
  const [prefisso, setPrefisso] = useState("P");
  const [tipoBlocco, setTipoBlocco] = useState(TIPI[0]);
  const [codice, setCodice] = useState("");
  const [tipo, setTipo] = useState(TIPI[0]);
  const [collocazione, setCollocazione] = useState("");
  const [interna, setInterna] = useState(false);
  const [mod, setMod] = useState(null);

  const attive = [...postazioni]
    .filter(function (p) { return p.active !== false; })
    .sort(function (a, b) {
      return String(a.code).localeCompare(String(b.code), "it", { numeric: true });
    });

  // Creazione in blocco: le postazioni sono numerate come sulla
  // planimetria, quindi crearle una per una è lavoro inutile.
  const creaInBlocco = async function () {
    const n = Math.max(1, Math.min(60, Number(quante) || 0));
    setBusy(true); setErrore("");
    try {
      const esistenti = new Set(postazioni.map(function (p) { return String(p.code).toUpperCase(); }));
      let create = 0;
      for (let i = 1; i <= n; i++) {
        const cod = (prefisso || "P").trim().toUpperCase() + i;
        if (esistenti.has(cod)) continue;
        await addPostazione({
          code: cod,
          kind: tipoBlocco,
          plan_id: planimetriaCorrente ? planimetriaCorrente.id : null,
        });
        create += 1;
      }
      await reloadPostazioni();
      if (create === 0) setErrore("Esistono già tutte le postazioni con questi numeri.");
    } catch (err) {
      setErrore("Errore durante la creazione: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const aggiungiUna = async function (e) {
    e.preventDefault();
    if (!codice.trim()) { setErrore("Indica il numero della postazione."); return; }
    setBusy(true); setErrore("");
    try {
      await addPostazione({
        code: codice.trim().toUpperCase(),
        kind: tipo,
        placement: collocazione.trim() || null,
        indoor: interna,
        plan_id: planimetriaCorrente ? planimetriaCorrente.id : null,
      });
      setCodice(""); setCollocazione("");
      await reloadPostazioni();
    } catch (err) {
      setErrore(/duplicate|unique/i.test(err.message)
        ? "Esiste già una postazione con questo numero."
        : "Errore durante il salvataggio: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  // --- giri di monitoraggio ---
  const [giroAperto, setGiroAperto] = useState(false);
  const [dataGiro, setDataGiro] = useState(oggi());
  const [operatore, setOperatore] = useState(responsabile);
  const [ditta, setDitta] = useState("");
  const [notaGiro, setNotaGiro] = useState("");
  const [fileGiro, setFileGiro] = useState(null);
  const [scelte, setScelte] = useState({});

  React.useEffect(function () {
    if (responsabile) setOperatore(function (prec) { return prec ? prec : responsabile; });
  }, [responsabile]);

  const apriGiro = function () {
    const iniziali = {};
    attive.forEach(function (p) { iniziali[p.id] = { outcome: "integra", note: "" }; });
    setScelte(iniziali);
    setDataGiro(oggi());
    setOperatore(responsabile);
    setNotaGiro("");
    setFileGiro(null);
    setErrore("");
    setGiroAperto(true);
  };

  const salvaGiro = async function () {
    if (!operatore.trim()) { setErrore("Indica chi ha eseguito il giro."); return; }
    setBusy(true); setErrore("");
    try {
      let attachment_path = null;
      if (fileGiro) attachment_path = await uploadAttachment(companyId, fileGiro);
      const giro = await addGiro({
        round_date: dataGiro,
        operator: operatore.trim(),
        company_name: ditta.trim() || null,
        attachment_path: attachment_path,
        note: notaGiro.trim() || null,
      });
      if (!giro?.id) throw new Error("giro non creato");
      for (const p of attive) {
        const s = scelte[p.id] || { outcome: "integra", note: "" };
        await addEsito({
          round_id: giro.id,
          station_id: p.id,
          outcome: s.outcome,
          note: (s.note || "").trim() || null,
        });
      }
      await reloadGiri();
      await reloadEsiti();
      setGiroAperto(false);
    } catch (err) {
      setErrore("Errore durante il salvataggio: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const giriOrdinati = [...giri].sort(function (a, b) {
    return (a.round_date || "") < (b.round_date || "") ? 1 : -1;
  });
  const ultimoGiro = giriOrdinati[0] || null;
  const giorniDallUltimo = ultimoGiro ? giorniDa(ultimoGiro.round_date) : null;
  const scaduto = giorniDallUltimo === null || giorniDallUltimo > ogniGiorni;

  const esitiDi = function (giroId) {
    return esiti.filter(function (e) { return e.round_id === giroId; });
  };
  const nomePostazione = function (id) {
    const p = postazioni.find(function (x) { return x.id === id; });
    return p ? p.code : "—";
  };
  const etichettaEsito = function (id) {
    const e = ESITI.find(function (x) { return x.id === id; });
    return e ? e.label : id;
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Monitoraggio infestanti</h2>
          <p className="sub">
            Planimetria con le postazioni, giro periodico di controllo ed esito di ogni esca.
          </p>
        </div>
        {attive.length > 0 && (
          <div className={"pill " + (scaduto ? "pill-alert" : "pill-ok")}>
            {scaduto ? <AlertTriangle size={14} /> : <Check size={14} />}
            {ultimoGiro
              ? scaduto
                ? "Ultimo giro " + giorniDallUltimo + " giorni fa"
                : "Ultimo giro il " + fmt(ultimoGiro.round_date)
              : "Nessun giro registrato"}
          </div>
        )}
      </div>

      <div className="config-subtabs">
        <button type="button" className={"config-subtab" + (vista === "giri" ? " active" : "")} onClick={function () { setVista("giri"); }}>
          <Target size={15} /> Giri di monitoraggio
        </button>
        <button type="button" className={"config-subtab" + (vista === "postazioni" ? " active" : "")} onClick={function () { setVista("postazioni"); }}>
          <Target size={15} /> Postazioni
          {attive.length > 0 && <span className="lot-tag">{attive.length}</span>}
        </button>
        <button type="button" className={"config-subtab" + (vista === "planimetria" ? " active" : "")} onClick={function () { setVista("planimetria"); }}>
          <Map size={15} /> Planimetria
        </button>
      </div>

      {errore && <span className="file-error" style={{ marginTop: 12 }}><AlertTriangle size={13} /> {errore}</span>}

      {/* ---------------- planimetria ---------------- */}
      {vista === "planimetria" && (
        <div style={{ marginTop: 16 }}>
          <p className="login-info" style={{ marginBottom: 12 }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            Sulla planimetria si segnano le postazioni con il loro numero: è il documento che
            l'Autorità di controllo chiede per primo, perché dice quante esche ci sono e dove.
            Numera le postazioni sul disegno con gli stessi codici che userai qui (P1, P2, P3…).
          </p>

          {planimetriaCorrente && (
            <div className="dish-row" style={{ marginBottom: 12 }}>
              <div className="dish-top">
                <div>
                  <Map size={13} style={{ marginRight: 6, verticalAlign: -2 }} color="#2F6F4E" />
                  <strong>Planimetria in uso</strong>
                  <span className="lot-tag">del {fmt(planimetriaCorrente.plan_date)}</span>
                </div>
                <button className="icon-btn" aria-label="Elimina"
                  onClick={function () {
                    if (window.confirm("Eliminare questa planimetria? Le postazioni restano.")) removePlanimetria(planimetriaCorrente.id);
                  }}>
                  <Trash2 size={14} />
                </button>
              </div>
              {planimetriaCorrente.note && <p className="pest-note">{planimetriaCorrente.note}</p>}
              <AttachmentLink path={planimetriaCorrente.attachment_path} nome="Planimetria" vuoto="Nessuna planimetria allegata" />
            </div>
          )}

          <form onSubmit={caricaPlanimetria} className="traccia-form">
            <label className="file-drop" htmlFor="planimetria-file">
              <Paperclip size={15} />
              <span>{filePlan ? filePlan.name : planimetriaCorrente ? "Carica una planimetria aggiornata (PDF o immagine)" : "Allega la planimetria con le postazioni (PDF o immagine)"}</span>
              <input
                id="planimetria-file" type="file" accept=".pdf,image/*" hidden
                onChange={function (e) {
                  const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                  setErrore("");
                  if (f && f.size > MAX_FILE_BYTES) { setErrore("File troppo grande (limite 8 MB)."); setFilePlan(null); e.target.value = ""; return; }
                  setFilePlan(f);
                }}
              />
            </label>
            <div className="row-form">
              <label className="field-label">Data della planimetria
                <input type="date" value={dataPlan} onChange={function (e) { setDataPlan(e.target.value); }} />
              </label>
              <input
                type="text" className="note-input" placeholder="Nota (opzionale)"
                value={notaPlan} onChange={function (e) { setNotaPlan(e.target.value); }}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
              <Plus size={16} /> {busy ? "Caricamento…" : "Carica la planimetria"}
            </button>
            <p className="range-hint">
              Le planimetrie precedenti restano in archivio: quando le esche si spostano, la vecchia
              planimetria è la prova di dov'erano al tempo dei controlli già registrati.
            </p>
          </form>

          {planimetrie.length > 1 && (
            <>
              <h3 className="section-title">Planimetrie precedenti</h3>
              <ul className="dish-list">
                {planimetrie
                  .filter(function (x) { return x.id !== planimetriaCorrente.id; })
                  .sort(function (a, b) { return (a.plan_date || "") < (b.plan_date || "") ? 1 : -1; })
                  .map(function (x) {
                    return (
                      <li key={x.id} className="dish-row">
                        <div className="dish-top">
                          <div><strong>Planimetria del {fmt(x.plan_date)}</strong></div>
                          <button className="icon-btn" aria-label="Elimina" onClick={function () { removePlanimetria(x.id); }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <AttachmentLink path={x.attachment_path} nome="Planimetria" />
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ---------------- postazioni ---------------- */}
      {vista === "postazioni" && (
        <div style={{ marginTop: 16 }}>
          <p className="login-info" style={{ marginBottom: 12 }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            Le postazioni sono le esche e le trappole segnate sulla planimetria, numerate allo stesso
            modo. Ogni giro di monitoraggio le elenca tutte: è così che si vede, a colpo d'occhio,
            se ne è stata saltata una.
          </p>

          <div className="nc-edit-block" style={{ marginBottom: 14 }}>
            <p className="field-label" style={{ margin: "0 0 8px" }}>Crea le postazioni numerate</p>
            <div className="row-form" style={{ margin: 0 }}>
              <label className="field-label">Quante
                <input
                  type="number" min="1" max="60" className="num"
                  value={quante} onChange={function (e) { setQuante(e.target.value); }}
                />
              </label>
              <label className="field-label">Sigla
                <input
                  type="text" style={{ width: 70 }} value={prefisso}
                  onChange={function (e) { setPrefisso(e.target.value); }}
                />
              </label>
              <label className="field-label">Tipo
                <select value={tipoBlocco} onChange={function (e) { setTipoBlocco(e.target.value); }}>
                  {TIPI.map(function (t) { return <option key={t} value={t}>{t}</option>; })}
                </select>
              </label>
              <button type="button" className="btn-primary" disabled={busy} onClick={creaInBlocco}>
                <Plus size={15} /> {busy ? "Creazione…" : "Crea"}
              </button>
            </div>
            <p className="range-hint">
              Crea {prefisso || "P"}1 … {prefisso || "P"}{Math.max(1, Number(quante) || 1)}. Quelle che
              esistono già vengono saltate, così puoi rilanciarlo per aggiungerne altre.
            </p>
          </div>

          <form onSubmit={aggiungiUna} className="traccia-form">
            <div className="row-form" style={{ marginTop: 0 }}>
              <input
                type="text" className="note-input" style={{ maxWidth: 120 }} placeholder="Numero (es. P7)"
                value={codice} onChange={function (e) { setCodice(e.target.value); }}
              />
              <select value={tipo} onChange={function (e) { setTipo(e.target.value); }}>
                {TIPI.map(function (t) { return <option key={t} value={t}>{t}</option>; })}
              </select>
              <input
                type="text" className="note-input" placeholder="Dove si trova"
                value={collocazione} onChange={function (e) { setCollocazione(e.target.value); }}
              />
              <label className="checkbox-row" style={{ margin: 0 }}>
                <input type="checkbox" checked={interna} onChange={function (e) { setInterna(e.target.checked); }} />
                interna
              </label>
              <button type="submit" className="btn-primary" disabled={busy}><Plus size={15} /> Aggiungi</button>
            </div>
          </form>

          {loading ? (
            <p className="sub">Caricamento…</p>
          ) : attive.length === 0 ? (
            <div className="empty"><p>Nessuna postazione censita.</p></div>
          ) : (
            <ul className="dish-list">
              {attive.map(function (p) {
                if (mod && mod.id === p.id) {
                  return (
                    <li key={p.id} className="dish-row">
                      <div className="row-form" style={{ margin: 0 }}>
                        <input
                          type="text" className="note-input" style={{ maxWidth: 120 }} value={mod.code}
                          onChange={function (e) { setMod({ ...mod, code: e.target.value }); }}
                        />
                        <select value={mod.kind} onChange={function (e) { setMod({ ...mod, kind: e.target.value }); }}>
                          {TIPI.map(function (t) { return <option key={t} value={t}>{t}</option>; })}
                        </select>
                        <input
                          type="text" className="note-input" placeholder="Dove si trova"
                          value={mod.placement || ""}
                          onChange={function (e) { setMod({ ...mod, placement: e.target.value }); }}
                        />
                        <label className="checkbox-row" style={{ margin: 0 }}>
                          <input
                            type="checkbox" checked={!!mod.indoor}
                            onChange={function (e) { setMod({ ...mod, indoor: e.target.checked }); }}
                          />
                          interna
                        </label>
                        <button
                          type="button" className="btn-primary" disabled={busy}
                          onClick={async function () {
                            setBusy(true);
                            try {
                              await updatePostazione(mod.id, {
                                code: String(mod.code).trim().toUpperCase(),
                                kind: mod.kind,
                                placement: (mod.placement || "").trim() || null,
                                indoor: !!mod.indoor,
                              });
                              setMod(null);
                            } catch (err) {
                              setErrore("Errore durante la modifica: " + err.message);
                            } finally { setBusy(false); }
                          }}
                        >
                          <Check size={15} /> Salva
                        </button>
                        <button type="button" className="link-btn" onClick={function () { setMod(null); }}>Annulla</button>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={p.id} className="dish-row">
                    <div className="dish-top">
                      <div style={{ minWidth: 0 }}>
                        <strong>{p.code}</strong>
                        <span className="lot-tag">{p.kind}</span>
                        {p.indoor ? <span className="doc-type-tag">interna</span> : <span className="doc-type-tag">esterna</span>}
                      </div>
                      <div style={{ display: "flex", gap: 2 }}>
                        <button className="icon-btn icon-btn-ok" aria-label="Modifica"
                          onClick={function () { setMod({ ...p }); setErrore(""); }}>
                          <Pencil size={14} />
                        </button>
                        <button className="icon-btn" aria-label="Elimina"
                          onClick={function () {
                            if (window.confirm("Eliminare la postazione " + p.code + " e i suoi esiti?")) removePostazione(p.id);
                          }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {p.placement && <p className="pest-note">{p.placement}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ---------------- giri ---------------- */}
      {vista === "giri" && (
        <div style={{ marginTop: 16 }}>
          {attive.length === 0 ? (
            <div className="empty">
              <p>
                Prima di registrare un giro servono le postazioni: allega la planimetria e crea le
                esche numerate nella scheda Postazioni.
              </p>
            </div>
          ) : (
            <>
              <div className="quadro-azione" style={{ marginTop: 0, marginBottom: 12 }}>
                <button type="button" className="btn-primary" onClick={function () { giroAperto ? setGiroAperto(false) : apriGiro(); }}>
                  <Plus size={15} /> {giroAperto ? "Annulla" : "Nuovo giro di monitoraggio"}
                </button>
                <span className="sub">
                  {attive.length} postazioni da controllare · da ripetere ogni {ogniGiorni} giorni
                </span>
              </div>

              {giroAperto && (
                <div className="nc-edit-block" style={{ marginBottom: 16 }}>
                  <div className="row-form" style={{ margin: "0 0 8px" }}>
                    <label className="field-label">Data
                      <input type="date" value={dataGiro} onChange={function (e) { setDataGiro(e.target.value); }} />
                    </label>
                    <input
                      type="text" className="note-input" placeholder="Eseguito da"
                      value={operatore} onChange={function (e) { setOperatore(e.target.value); }}
                    />
                    <input
                      type="text" className="note-input" placeholder="Ditta esterna (se incaricata)"
                      value={ditta} onChange={function (e) { setDitta(e.target.value); }}
                    />
                  </div>

                  <ul className="tr-list">
                    {attive.map(function (p) {
                      const s = scelte[p.id] || { outcome: "integra", note: "" };
                      const allarme = ESITI_ALLARME.indexOf(s.outcome) >= 0;
                      return (
                        <li key={p.id} className="tr-item">
                          <div className="row-form" style={{ margin: 0, alignItems: "center" }}>
                            <strong style={{ minWidth: 54 }}>{p.code}</strong>
                            <span className="sub" style={{ minWidth: 120 }}>{p.kind}</span>
                            <select
                              value={s.outcome}
                              onChange={function (e) { setScelte({ ...scelte, [p.id]: { ...s, outcome: e.target.value } }); }}
                            >
                              {ESITI.map(function (x) { return <option key={x.id} value={x.id}>{x.label}</option>; })}
                            </select>
                            <input
                              type="text" className="note-input" placeholder={allarme ? "Che cosa hai trovato e cosa hai fatto" : "Nota (opzionale)"}
                              value={s.note}
                              onChange={function (e) { setScelte({ ...scelte, [p.id]: { ...s, note: e.target.value } }); }}
                            />
                          </div>
                          {p.placement && <p className="pest-note" style={{ margin: "2px 0 0" }}>{p.placement}</p>}
                        </li>
                      );
                    })}
                  </ul>

                  <label className="file-drop" htmlFor="giro-file" style={{ marginTop: 10 }}>
                    <Paperclip size={15} />
                    <span>{fileGiro ? fileGiro.name : "Allega il rapporto della ditta (PDF o immagine)"}</span>
                    <input
                      id="giro-file" type="file" accept=".pdf,image/*" hidden
                      onChange={function (e) {
                        const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                        setErrore("");
                        if (f && f.size > MAX_FILE_BYTES) { setErrore("File troppo grande (limite 8 MB)."); setFileGiro(null); e.target.value = ""; return; }
                        setFileGiro(f);
                      }}
                    />
                  </label>
                  <input
                    type="text" className="full-input" placeholder="Nota sul giro (opzionale)"
                    value={notaGiro} onChange={function (e) { setNotaGiro(e.target.value); }}
                    style={{ marginTop: 8 }}
                  />

                  <div className="row-form" style={{ margin: "10px 0 0" }}>
                    <button type="button" className="btn-primary" disabled={busy} onClick={salvaGiro}>
                      <Check size={15} /> {busy ? "Salvataggio…" : "Registra il giro (" + attive.length + " postazioni)"}
                    </button>
                    <button type="button" className="link-btn" onClick={function () { setGiroAperto(false); }}>Annulla</button>
                  </div>
                </div>
              )}

              {giriOrdinati.length === 0 ? (
                <div className="empty"><p>Nessun giro registrato.</p></div>
              ) : (
                <ul className="dish-list">
                  {giriOrdinati.map(function (g) {
                    const suoi = esitiDi(g.id);
                    const allarmi = suoi.filter(function (e) { return ESITI_ALLARME.indexOf(e.outcome) >= 0; });
                    const mancanti = attive.length - suoi.length;
                    return (
                      <li key={g.id} className={"dish-row" + (allarmi.length ? " row-warn" : "")}>
                        <div className="dish-top">
                          <div style={{ minWidth: 0 }}>
                            <strong>Giro del {fmt(g.round_date)}</strong>
                            {allarmi.length > 0
                              ? <span className="lot-tag" style={{ background: "#FBEEEC", color: "#B3432E" }}>{allarmi.length} postazioni con rilievi</span>
                              : <span className="lot-tag">tutte integre</span>}
                          </div>
                          <button className="icon-btn" aria-label="Elimina"
                            onClick={function () {
                              if (window.confirm("Eliminare il giro del " + fmt(g.round_date) + " e i suoi esiti?")) removeGiro(g.id);
                            }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="traccia-meta">
                          <span className="doc-type-tag">{g.operator}</span>
                          {g.company_name && <span className="doc-type-tag">{g.company_name}</span>}
                          <span className="doc-type-tag">{suoi.length} di {attive.length} postazioni</span>
                          {mancanti > 0 && (
                            <span className="pill pill-warn">{mancanti} non controllate</span>
                          )}
                        </div>
                        {g.note && <p className="pest-note">{g.note}</p>}

                        {allarmi.length > 0 && (
                          <ul className="tr-list">
                            {allarmi.map(function (e) {
                              return (
                                <li key={e.id} className="tr-item">
                                  <div className="tr-item-top">
                                    <span className="tr-kind">{nomePostazione(e.station_id)}</span>
                                    <span className="pill pill-alert">{etichettaEsito(e.outcome)}</span>
                                  </div>
                                  {e.note && <p className="pest-note" style={{ margin: "4px 0 0" }}>{e.note}</p>}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        <AttachmentLink path={g.attachment_path} nome="Rapporto di intervento" vuoto="Nessun rapporto allegato" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
