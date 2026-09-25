import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, CheckCircle2, Snowflake, Timer, ThermometerSnowflake, XCircle } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

const TREATMENT_OPTIONS = [
  { id: "-20-24", label: "-20°C per 24 ore", temp: -20, hours: 24 },
  { id: "-35-15", label: "-35°C per 15 ore (abbattitore rapido)", temp: -35, hours: 15 },
  { id: "-15-96", label: "-15°C per 96 ore", temp: -15, hours: 96 },
];

const SUB_TABS = [
  { id: "cotti", label: "Prodotti cotti", icon: ThermometerSnowflake, requires: "has_blast_chiller" },
  { id: "abbattimento", label: "Pesce crudo", icon: Snowflake, requires: "serves_raw_fish" },
  { id: "scongelamento", label: "Scongelamento pesce", icon: Timer, requires: "serves_raw_fish" },
];

// Abbattimento rapido dei prodotti cotti: valori di buona prassi riportati nei
// manuali di autocontrollo, confermati dall'utente il 17/09/2026.
const CICLI = {
  positivo: { label: "Positivo — da +70°C a +3°C al cuore entro 90 minuti", target: 3, minuti: 90 },
  negativo: { label: "Negativo — da +70°C a -18°C al cuore entro 240 minuti", target: -18, minuti: 240 },
};

function minutiTrascorsi(da, a = Date.now()) {
  return Math.round((new Date(a).getTime() - new Date(da).getTime()) / 60000);
}

function AbbattimentoCotti({ company }) {
  const { items, add, update, remove, loading } = useTable("blast_chill_cycles", company?.id);
  const [prodotto, setProdotto] = useState("");
  const [tipo, setTipo] = useState("positivo");
  const [inizio, setInizio] = useState(nowLocalInput());
  const [tempInizio, setTempInizio] = useState("");
  const [operatore, setOperatore] = useState("");
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  React.useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  // chiusura di un ciclo: temperatura finale e ora di fine, per riga
  const [chiusura, setChiusura] = useState({});

  const avvia = async (e) => {
    e.preventDefault();
    if (!prodotto.trim() || !operatore.trim()) return;
    const c = CICLI[tipo];
    setBusy(true);
    await add({
      product_name: prodotto,
      cycle_type: tipo,
      target_temp: c.target,
      max_minutes: c.minuti,
      start_time: new Date(inizio).toISOString(),
      start_core_temp: tempInizio === "" ? null : Number(String(tempInizio).replace(",", ".")),
      operator: operatore,
    });
    setProdotto(""); setTempInizio(""); setOperatore(""); setInizio(nowLocalInput());
    setBusy(false);
  };

  const chiudi = async (ciclo) => {
    const dati = chiusura[ciclo.id] || {};
    if (dati.temp === undefined || dati.temp === "") return;
    const fine = dati.fine ? new Date(dati.fine) : new Date();
    const temp = Number(String(dati.temp).replace(",", "."));
    const minuti = minutiTrascorsi(ciclo.start_time, fine);
    const conforme = temp <= Number(ciclo.target_temp) && minuti <= ciclo.max_minutes;
    await update(ciclo.id, {
      end_time: fine.toISOString(),
      end_core_temp: temp,
      outcome: conforme ? "conforme" : "non_conforme",
    });
    setChiusura((c) => { const n = { ...c }; delete n[ciclo.id]; return n; });
  };

  return (
    <>
      <p className="range-hint">
        Il prodotto cotto va portato velocemente a bassa temperatura al cuore, misurata con la sonda: entro 90 minuti a +3°C (abbattimento positivo) o entro 240 minuti a -18°C (negativo). Se il limite non viene rispettato il ciclo risulta non conforme: valuta il prodotto e registra l'azione in Non conformità.
      </p>
      <form onSubmit={avvia} className="traccia-form">
        <div className="row-form">
          <input type="text" placeholder="Prodotto (es. Ragù, Crema pasticcera)" required value={prodotto} onChange={(e) => setProdotto(e.target.value)} className="note-input" />
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(CICLI).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
          </select>
        </div>
        <div className="row-form">
          <label className="field-label">Inizio abbattimento
            <input type="datetime-local" value={inizio} onChange={(e) => setInizio(e.target.value)} />
          </label>
          <input type="text" inputMode="decimal" placeholder="°C al cuore a inizio" value={tempInizio} onChange={(e) => setTempInizio(e.target.value)} style={{ width: 150 }} />
          <input type="text" placeholder="Operatore" required value={operatore} onChange={(e) => setOperatore(e.target.value)} className="note-input" />
          {company?.haccp_manager && (
            <button type="button" className="link-btn" onClick={() => setOperatore(company.haccp_manager)}>Usa responsabile HACCP</button>
          )}
        </div>
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> Avvia abbattimento
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun abbattimento registrato.</p></div>
      ) : (
        <ul className="dish-list">
          {items.map((c) => {
            const chiuso = !!c.outcome;
            const trascorsi = minutiTrascorsi(c.start_time);
            const scaduto = !chiuso && trascorsi > c.max_minutes;
            const nc = c.outcome === "non_conforme";
            return (
              <li key={c.id} className={"dish-row" + (nc || scaduto ? " row-warn" : "")}>
                <div className="dish-top">
                  <div>
                    <strong>{c.product_name}</strong>
                    <span className="lot-tag">{c.cycle_type === "positivo" ? "+3°C / 90 min" : "-18°C / 240 min"}</span>
                  </div>
                  <button className="icon-btn" onClick={() => { if (window.confirm("Eliminare questo ciclo?")) remove(c.id); }} aria-label="Elimina"><Trash2 size={14} /></button>
                </div>
                <div className="traccia-meta">
                  <span className="doc-type-tag">{c.operator}</span>
                  <span className="log-time">Inizio: {fmtDateTime(c.start_time)}{c.start_core_temp != null ? ` · ${c.start_core_temp}°C` : ""}</span>
                </div>
                {chiuso ? (
                  <div className="nc-resolved" style={nc ? { color: "#B3432E" } : undefined}>
                    {nc ? <XCircle size={13} color="#B3432E" /> : <CheckCircle2 size={13} color="#2F6F4E" />}
                    <span>
                      {nc ? "NON CONFORME" : "Conforme"}: {c.end_core_temp}°C al cuore dopo {minutiTrascorsi(c.start_time, c.end_time)} minuti (fine {fmtDateTime(c.end_time)})
                    </span>
                  </div>
                ) : (
                  <>
                    <p className={scaduto ? "pest-note" : "range-hint"} style={{ marginBottom: 8, ...(scaduto ? { color: "#B3432E", fontWeight: 500 } : {}) }}>
                      {scaduto
                        ? `Superati i ${c.max_minutes} minuti (${trascorsi} trascorsi): misura la temperatura e chiudi il ciclo.`
                        : `In corso da ${trascorsi} minuti — limite ${c.max_minutes}.`}
                    </p>
                    <div className="row-form" style={{ margin: "0 0 4px" }}>
                      <input type="text" inputMode="decimal" placeholder="°C al cuore a fine" value={chiusura[c.id]?.temp ?? ""} onChange={(e) => setChiusura((s) => ({ ...s, [c.id]: { ...s[c.id], temp: e.target.value } }))} style={{ width: 150 }} />
                      <label className="field-label">Fine (vuoto = adesso)
                        <input type="datetime-local" value={chiusura[c.id]?.fine ?? ""} onChange={(e) => setChiusura((s) => ({ ...s, [c.id]: { ...s[c.id], fine: e.target.value } }))} />
                      </label>
                      <button type="button" className="btn-primary" onClick={() => chiudi(c)}>
                        <CheckCircle2 size={14} /> Chiudi ciclo
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function hoursElapsed(startTime) {
  return (Date.now() - new Date(startTime).getTime()) / (1000 * 60 * 60);
}

export default function AbbattimentoPesce() {
  const { company } = useAuth();
  const visibleSubTabs = SUB_TABS.filter((t) => company?.[t.requires]);
  const [subTab, setSubTab] = useState(visibleSubTabs[0]?.id || "abbattimento");
  const { items: batches, add: addBatch, remove: removeBatch, update: updateBatch, loading: batchesLoading } = useTable("blast_chill_logs", company?.id);
  const { items: thaws, add: addThaw, remove: removeThaw, update: updateThaw, loading: thawsLoading } = useTable("thaw_logs", company?.id);
  // Stesso motivo della scheda non conformità: i lotti veri stanno in
  // traceability_records.
  const { items: lots } = useTable("traceability_records", company?.id);
  const { items: prodottiCatalogo } = useTable("products", company?.id);

  // --- Form: nuovo ciclo di abbattimento ---
  const [productName, setProductName] = useState("");
  const [lotId, setLotId] = useState("");
  const [kg, setKg] = useState("");
  const [treatment, setTreatment] = useState(TREATMENT_OPTIONS[0].id);
  const [startTime, setStartTime] = useState(nowLocalInput());
  const [operator, setOperator] = useState("");
  const [busy, setBusy] = useState(false);

  const submitBatch = async (e) => {
    e.preventDefault();
    if (!productName.trim() || !kg || !operator.trim()) return;
    const t = TREATMENT_OPTIONS.find((o) => o.id === treatment);
    setBusy(true);
    await addBatch({
      product_name: productName,
      traceability_record_id: lotId || null,
      kg: Number(kg),
      target_temp: t.temp,
      required_hours: t.hours,
      start_time: new Date(startTime).toISOString(),
      operator,
    });
    setProductName(""); setKg(""); setLotId(""); setOperator("");
    setStartTime(nowLocalInput());
    setBusy(false);
  };

  const completeBatch = async (batch) => {
    await updateBatch(batch.id, { completed: true, completed_at: new Date().toISOString() });
  };

  const kgRemaining = (batchId, totalKg) => {
    const used = thaws
      .filter((t) => t.blast_chill_log_id === batchId)
      .reduce((sum, t) => sum + Number(t.kg), 0);
    return Math.max(0, Number(totalKg) - used);
  };

  // --- Form: nuovo scongelamento ---
  const [thawBatchId, setThawBatchId] = useState("");
  const [thawKg, setThawKg] = useState("");
  const [thawStart, setThawStart] = useState(nowLocalInput());
  const [thawOperator, setThawOperator] = useState("");
  const [thawError, setThawError] = useState("");
  const [thawBusy, setThawBusy] = useState(false);

  const availableBatches = batches.filter((b) => b.completed && kgRemaining(b.id, b.kg) > 0);

  const submitThaw = async (e) => {
    e.preventDefault();
    setThawError("");
    if (!thawBatchId || !thawKg || !thawOperator.trim()) return;
    const batch = batches.find((b) => b.id === thawBatchId);
    const remaining = kgRemaining(batch.id, batch.kg);
    if (Number(thawKg) > remaining) {
      setThawError(`Disponibili solo ${remaining} kg per questo lotto.`);
      return;
    }
    setThawBusy(true);
    await addThaw({
      blast_chill_log_id: thawBatchId,
      kg: Number(thawKg),
      start_time: new Date(thawStart).toISOString(),
      operator: thawOperator,
    });
    setThawKg(""); setThawOperator(""); setThawBatchId("");
    setThawStart(nowLocalInput());
    setThawBusy(false);
  };

  const resolveThaw = async (thaw, outcome) => {
    await updateThaw(thaw.id, { outcome, resolved_at: new Date().toISOString() });
  };

  const nomeProdotto = (lot) =>
    prodottiCatalogo.find((p) => p.id === lot.product_id)?.name || lot.product_name || "Prodotto";
  const lotLabel = (lot) =>
    `${nomeProdotto(lot)} — lotto ${lot.lot_number || "non indicato"} (${lot.supplier_name || "fornitore non indicato"})`;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Abbattimento</h2>
          <p className="sub">Abbattimento rapido dei prodotti cotti e bonifica sanitaria dei prodotti ittici destinati al consumo crudo (Reg. CE 853/2004).</p>
        </div>
      </div>

      <div className="config-subtabs">
        {visibleSubTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={"config-subtab" + (subTab === t.id ? " active" : "")}
            onClick={() => setSubTab(t.id)}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {subTab === "cotti" && <AbbattimentoCotti company={company} />}

      {subTab === "abbattimento" && (
        <>
          <form onSubmit={submitBatch} className="traccia-form">
            <div className="row-form">
              <input type="text" placeholder="Prodotto (es. Salmone)" required value={productName} onChange={(e) => setProductName(e.target.value)} className="note-input" />
              <input type="number" step="0.1" min="0" placeholder="Kg" required value={kg} onChange={(e) => setKg(e.target.value)} className="num" style={{ width: 90 }} />
              <select value={treatment} onChange={(e) => setTreatment(e.target.value)}>
                {TREATMENT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            {lots.length > 0 && (
              <select value={lotId} onChange={(e) => setLotId(e.target.value)} className="full-input">
                <option value="">Lotto collegato (opzionale)</option>
                {lots.map((l) => <option key={l.id} value={l.id}>{lotLabel(l)}</option>)}
              </select>
            )}
            <div className="row-form">
              <label className="field-label">Inizio abbattimento
                <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </label>
              <input type="text" placeholder="Operatore" required value={operator} onChange={(e) => setOperator(e.target.value)} className="note-input" />
              {company?.haccp_manager && (
                <button type="button" className="link-btn" onClick={() => setOperator(company.haccp_manager)}>
                  Usa responsabile HACCP
                </button>
              )}
            </div>
            <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
              <Plus size={16} /> Avvia ciclo di abbattimento
            </button>
          </form>

          {batchesLoading ? (
            <p className="sub">Caricamento…</p>
          ) : batches.length === 0 ? (
            <div className="empty"><p>Nessun ciclo di abbattimento registrato.</p></div>
          ) : (
            <ul className="dish-list">
              {batches.map((b) => {
                const elapsed = hoursElapsed(b.start_time);
                const ready = elapsed >= b.required_hours;
                const remaining = kgRemaining(b.id, b.kg);
                return (
                  <li key={b.id} className="dish-row">
                    <div className="dish-top">
                      <div>
                        <strong>{b.product_name}</strong>
                        <span className="lot-tag">{b.kg} kg</span>
                        {b.completed && <span className="lot-tag">Residui: {remaining} kg</span>}
                      </div>
                      <button className="icon-btn" onClick={() => removeBatch(b.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                    </div>
                    <div className="traccia-meta">
                      <span className="doc-type-tag">{b.target_temp}°C per {b.required_hours}h</span>
                      <span className="doc-type-tag">{b.operator}</span>
                      <span className="log-time">Inizio: {fmtDateTime(b.start_time)}</span>
                    </div>
                    {b.completed ? (
                      <div className="nc-resolved">
                        <CheckCircle2 size={13} color="#2F6F4E" />
                        <span>Abbattimento completato il {fmtDateTime(b.completed_at)}</span>
                      </div>
                    ) : ready ? (
                      <button type="button" className="btn-primary nc-resolve-btn" onClick={() => completeBatch(b)}>
                        <CheckCircle2 size={14} /> Conferma completato
                      </button>
                    ) : (
                      <p className="range-hint" style={{ marginBottom: 0 }}>
                        In corso — mancano ancora {(b.required_hours - elapsed).toFixed(1)} ore prima di poter confermare.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {subTab === "scongelamento" && (
        <>
          <p className="range-hint">
            Una volta scongelato, il prodotto va utilizzato o smaltito entro 24 ore e non può essere ricongelato.
          </p>
          <form onSubmit={submitThaw} className="traccia-form">
            {availableBatches.length === 0 ? (
              <p className="range-hint">Nessun lotto abbattuto disponibile da scongelare. Completa prima un ciclo di abbattimento.</p>
            ) : (
              <select value={thawBatchId} onChange={(e) => setThawBatchId(e.target.value)} className="full-input" required>
                <option value="">Seleziona lotto abbattuto</option>
                {availableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.product_name} — disponibili {kgRemaining(b.id, b.kg)} kg (abbattuto il {fmtDateTime(b.start_time)})
                  </option>
                ))}
              </select>
            )}
            <div className="row-form">
              <input type="number" step="0.1" min="0" placeholder="Kg da scongelare" required value={thawKg} onChange={(e) => setThawKg(e.target.value)} className="num" style={{ width: 120 }} />
              <label className="field-label">Inizio scongelamento
                <input type="datetime-local" value={thawStart} onChange={(e) => setThawStart(e.target.value)} />
              </label>
              <input type="text" placeholder="Operatore" required value={thawOperator} onChange={(e) => setThawOperator(e.target.value)} className="note-input" />
              {company?.haccp_manager && (
                <button type="button" className="link-btn" onClick={() => setThawOperator(company.haccp_manager)}>
                  Usa responsabile HACCP
                </button>
              )}
            </div>
            {thawError && <span className="file-error"><AlertTriangle size={13} /> {thawError}</span>}
            <button type="submit" className="btn-primary" disabled={thawBusy || availableBatches.length === 0} style={{ alignSelf: "flex-start" }}>
              <Plus size={16} /> Avvia scongelamento
            </button>
          </form>

          {thawsLoading ? (
            <p className="sub">Caricamento…</p>
          ) : thaws.length === 0 ? (
            <div className="empty"><p>Nessuno scongelamento registrato.</p></div>
          ) : (
            <ul className="dish-list">
              {thaws.map((t) => {
                const batch = batches.find((b) => b.id === t.blast_chill_log_id);
                const elapsed = hoursElapsed(t.start_time);
                const overdue = !t.outcome && elapsed >= 24;
                return (
                  <li key={t.id} className={"dish-row" + (overdue ? " row-warn" : "")}>
                    <div className="dish-top">
                      <div>
                        <strong>{batch ? batch.product_name : "Prodotto"}</strong>
                        <span className="lot-tag">{t.kg} kg</span>
                      </div>
                      <button className="icon-btn" onClick={() => removeThaw(t.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                    </div>
                    <div className="traccia-meta">
                      <span className="doc-type-tag">{t.operator}</span>
                      <span className="log-time">Inizio: {fmtDateTime(t.start_time)}</span>
                    </div>
                    {t.outcome ? (
                      <div className="nc-resolved">
                        <CheckCircle2 size={13} color="#2F6F4E" />
                        <span>{t.outcome === "venduto" ? "Venduto/utilizzato" : "Smaltito come rifiuto"} il {fmtDateTime(t.resolved_at)}</span>
                      </div>
                    ) : overdue ? (
                      <>
                        <p className="pest-note" style={{ color: "#B3432E", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                          <AlertTriangle size={13} /> Sono passate oltre 24 ore: registra subito l'esito.
                        </p>
                        <div className="row-form" style={{ margin: "0 0 8px" }}>
                          <button className="btn-primary" onClick={() => resolveThaw(t, "venduto")}>Venduto / utilizzato</button>
                          <button className="btn-primary" style={{ background: "#B3432E" }} onClick={() => resolveThaw(t, "smaltito")}>Smaltito come rifiuto</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="range-hint" style={{ marginBottom: 8 }}>
                          Mancano {(24 - elapsed).toFixed(1)} ore al termine della finestra di 24 ore.
                        </p>
                        <div className="row-form" style={{ margin: "0 0 8px" }}>
                          <button className="btn-primary" onClick={() => resolveThaw(t, "venduto")}>Venduto / utilizzato</button>
                          <button className="btn-primary" style={{ background: "#B3432E" }} onClick={() => resolveThaw(t, "smaltito")}>Smaltito come rifiuto</button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
