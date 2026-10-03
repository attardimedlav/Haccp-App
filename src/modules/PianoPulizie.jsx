import React, { useState } from "react";
import { Plus, Trash2, Check, X, Pencil, AlertTriangle, Info, SprayCan } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { SAN_AREAS } from "./Sanificazione";
import { FREQUENZE, etichettaFrequenza, statoPiano, fmtData } from "../utils/pianoPulizie";

// Piano di pulizia e sanificazione.
//
// Qui si decide che cosa si pulisce, ogni quanto, con quale prodotto e a
// cura di chi. Quello che si scrive in questa pagina è la stessa cosa che
// il manuale stampa e che la Panoramica controlla: cambiando una frequenza
// qui cambiano insieme il documento e le scadenze, e non possono più
// raccontare due storie diverse.

export default function PianoPulizie() {
  const { company } = useAuth();
  const companyId = company?.id;
  const { items: piano, add, remove, update, loading } = useTable("cleaning_plan", companyId);
  const { items: registrazioni } = useTable("sanitization_logs", companyId);
  const { items: sanificanti } = useTable("sanitizers", companyId);

  const [apri, setApri] = useState(false);
  const [area, setArea] = useState(SAN_AREAS[0]);
  const [operazione, setOperazione] = useState("");
  const [giorni, setGiorni] = useState(1);
  const [prodotto, setProdotto] = useState("");
  const [responsabile, setResponsabile] = useState("");
  const [metodo, setMetodo] = useState("");
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);

  const [mod, setMod] = useState(null);

  const stati = statoPiano(piano, registrazioni);
  const scoperte = stati.filter(function (s) { return s.cls === "pill-alert"; }).length;

  const svuota = function () {
    setArea(SAN_AREAS[0]); setOperazione(""); setGiorni(1);
    setProdotto(""); setResponsabile(""); setMetodo("");
  };

  const salva = async function (e) {
    e.preventDefault();
    if (!operazione.trim()) { setErrore("Scrivi che cosa si pulisce."); return; }
    setBusy(true); setErrore("");
    try {
      const ultimo = piano.reduce(function (m, r) { return Math.max(m, r.sort_order || 0); }, 0);
      await add({
        area: area,
        operation: operazione.trim(),
        frequency_days: Number(giorni),
        product: prodotto.trim() || null,
        responsible: responsabile.trim() || null,
        method: metodo.trim() || null,
        sort_order: ultimo + 10,
      });
      svuota();
      setApri(false);
    } catch (err) {
      setErrore("Errore durante il salvataggio: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const salvaModifica = async function () {
    if (!mod.operation.trim()) { setErrore("L'operazione non può restare vuota."); return; }
    setBusy(true); setErrore("");
    try {
      await update(mod.id, {
        area: mod.area,
        operation: mod.operation.trim(),
        frequency_days: Number(mod.frequency_days),
        product: (mod.product || "").trim() || null,
        responsible: (mod.responsible || "").trim() || null,
        method: (mod.method || "").trim() || null,
      });
      setMod(null);
    } catch (err) {
      setErrore("Errore durante la modifica: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  // Le righe si leggono per area, nell'ordine della scheda Sanificazione.
  const perArea = SAN_AREAS.map(function (a) {
    return { area: a, righe: stati.filter(function (s) { return s.riga.area === a; }) };
  }).filter(function (g) { return g.righe.length > 0; });

  const altre = stati.filter(function (s) { return SAN_AREAS.indexOf(s.riga.area) < 0; });
  if (altre.length) perArea.push({ area: "Altre aree", righe: altre });

  return (
    <div style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h3 style={{ margin: "0 0 6px" }}>Piano di pulizia e sanificazione</h3>
          <p className="sub" style={{ margin: 0 }}>
            Che cosa si pulisce, ogni quanto e con quale prodotto.
          </p>
        </div>
        {scoperte > 0 && (
          <div className="pill pill-alert"><AlertTriangle size={14} /> {scoperte} in ritardo</div>
        )}
      </div>

      <p className="login-info" style={{ margin: "12px 0" }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Quello che scrivi qui è ciò che il manuale di autocontrollo stampa e ciò che la Panoramica
        controlla: se cambi una frequenza, cambiano insieme il documento e gli avvisi. Le operazioni
        compaiono nella scheda Sanificazione, dove l'operatore sceglie quella che ha eseguito.
      </p>

      <button
        type="button" className="btn-primary"
        onClick={function () { setApri(!apri); setErrore(""); }}
        style={{ marginBottom: 12 }}
      >
        <Plus size={16} /> {apri ? "Chiudi" : "Aggiungi una voce"}
      </button>

      {apri && (
        <form onSubmit={salva} className="traccia-form">
          <div className="row-form" style={{ marginTop: 0 }}>
            <label className="field-label">Area
              <select value={area} onChange={function (e) { setArea(e.target.value); }}>
                {SAN_AREAS.map(function (a) { return <option key={a} value={a}>{a}</option>; })}
              </select>
            </label>
            <label className="field-label">Frequenza
              <select value={giorni} onChange={function (e) { setGiorni(Number(e.target.value)); }}>
                {FREQUENZE.map(function (f) { return <option key={f.giorni} value={f.giorni}>{f.label}</option>; })}
              </select>
            </label>
          </div>
          <input
            type="text" className="full-input"
            placeholder="Che cosa si pulisce (es. Pulizia della cappa aspirante e dei filtri)"
            value={operazione} onChange={function (e) { setOperazione(e.target.value); }} required
          />
          <div className="row-form">
            <input
              type="text" className="note-input" list="piano-prodotti"
              placeholder="Prodotto impiegato (opzionale)"
              value={prodotto} onChange={function (e) { setProdotto(e.target.value); }}
            />
            <datalist id="piano-prodotti">
              {sanificanti.map(function (s) { return <option key={s.id} value={s.name} />; })}
            </datalist>
            <input
              type="text" className="note-input" placeholder="A cura di (opzionale)"
              value={responsabile} onChange={function (e) { setResponsabile(e.target.value); }}
            />
          </div>
          <input
            type="text" className="full-input" placeholder="Modalità (opzionale: diluizione, tempo di contatto, risciacquo)"
            value={metodo} onChange={function (e) { setMetodo(e.target.value); }}
          />
          {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}
          <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
            <Plus size={16} /> {busy ? "Salvataggio…" : "Aggiungi al piano"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : stati.length === 0 ? (
        <div className="empty"><p>Il piano è vuoto: aggiungi la prima voce.</p></div>
      ) : (
        perArea.map(function (gruppo) {
          return (
            <div key={gruppo.area} style={{ marginBottom: 18 }}>
              <div className="sub" style={{ margin: "10px 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
                <SprayCan size={14} color="#2F6F4E" /> {gruppo.area}
              </div>
              <ul className="dish-list">
                {gruppo.righe.map(function (s) {
                  const r = s.riga;
                  if (mod && mod.id === r.id) {
                    return (
                      <li key={r.id} className="dish-row">
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div className="row-form" style={{ margin: 0 }}>
                            <label className="field-label">Area
                              <select value={mod.area} onChange={function (e) { setMod({ ...mod, area: e.target.value }); }}>
                                {SAN_AREAS.map(function (a) { return <option key={a} value={a}>{a}</option>; })}
                              </select>
                            </label>
                            <label className="field-label">Frequenza
                              <select
                                value={mod.frequency_days}
                                onChange={function (e) { setMod({ ...mod, frequency_days: Number(e.target.value) }); }}
                              >
                                {FREQUENZE.map(function (f) { return <option key={f.giorni} value={f.giorni}>{f.label}</option>; })}
                              </select>
                            </label>
                          </div>
                          <input
                            type="text" className="full-input" value={mod.operation}
                            onChange={function (e) { setMod({ ...mod, operation: e.target.value }); }}
                          />
                          <div className="row-form" style={{ margin: 0 }}>
                            <input
                              type="text" className="note-input" placeholder="Prodotto"
                              value={mod.product || ""}
                              onChange={function (e) { setMod({ ...mod, product: e.target.value }); }}
                            />
                            <input
                              type="text" className="note-input" placeholder="A cura di"
                              value={mod.responsible || ""}
                              onChange={function (e) { setMod({ ...mod, responsible: e.target.value }); }}
                            />
                          </div>
                          <input
                            type="text" className="full-input" placeholder="Modalità"
                            value={mod.method || ""}
                            onChange={function (e) { setMod({ ...mod, method: e.target.value }); }}
                          />
                          <div className="row-form" style={{ margin: 0 }}>
                            <button type="button" className="btn-primary" disabled={busy} onClick={salvaModifica}>
                              <Check size={15} /> Salva
                            </button>
                            <button type="button" className="link-btn" onClick={function () { setMod(null); }}>Annulla</button>
                          </div>
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li key={r.id} className={"dish-row" + (s.cls === "pill-alert" ? " row-warn" : "")}>
                      <div className="dish-top">
                        <div style={{ minWidth: 0 }}>
                          <strong>{r.operation}</strong>
                          <span className="lot-tag">{etichettaFrequenza(r.frequency_days)}</span>
                        </div>
                        <div style={{ display: "flex", gap: 2 }}>
                          <button
                            className="icon-btn icon-btn-ok" aria-label="Modifica"
                            onClick={function () { setMod({ ...r }); setErrore(""); }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="icon-btn" aria-label="Togli dal piano"
                            onClick={function () {
                              if (window.confirm("Togliere dal piano: " + r.operation + "?")) remove(r.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="traccia-meta">
                        <span className={"pill " + s.cls}>{s.label}</span>
                        {s.ultima && <span className="doc-type-tag">ultima il {fmtData(s.ultima.created_at)}</span>}
                        {r.product && <span className="doc-type-tag">{r.product}</span>}
                        {r.responsible && <span className="doc-type-tag">{r.responsible}</span>}
                      </div>
                      {r.method && <p className="pest-note">{r.method}</p>}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      )}

      {errore && !apri && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}
    </div>
  );
}
