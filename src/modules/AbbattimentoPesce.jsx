import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, CheckCircle2, Snowflake, Timer } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

const TREATMENT_OPTIONS = [
  { id: "-20-24", label: "-20°C per 24 ore", temp: -20, hours: 24 },
  { id: "-35-15", label: "-35°C per 15 ore (abbattitore rapido)", temp: -35, hours: 15 },
  { id: "-15-96", label: "-15°C per 96 ore", temp: -15, hours: 96 },
];

const SUB_TABS = [
  { id: "abbattimento", label: "Abbattimento", icon: Snowflake },
  { id: "scongelamento", label: "Scongelamento", icon: Timer },
];

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
  const [subTab, setSubTab] = useState("abbattimento");
  const { items: batches, add: addBatch, remove: removeBatch, update: updateBatch, loading: batchesLoading } = useTable("blast_chill_logs", company?.id);
  const { items: thaws, add: addThaw, remove: removeThaw, update: updateThaw, loading: thawsLoading } = useTable("thaw_logs", company?.id);
  const { items: lots } = useTable("traceability_logs", company?.id);

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
      traceability_log_id: lotId || null,
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

  const lotLabel = (lot) => `${lot.product_name} — lotto ${lot.lot} (${lot.supplier})`;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Abbattimento pesce crudo</h2>
          <p className="sub">Bonifica sanitaria dei prodotti ittici destinati al consumo crudo (Reg. CE 853/2004) e gestione dello scongelamento.</p>
        </div>
      </div>

      <div className="config-subtabs">
        {SUB_TABS.map((t) => (
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
