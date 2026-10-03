import React, { useState } from "react";
import { Trash2, AlertTriangle, CheckCircle2, Pencil, Check, X, Refrigerator, Info } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { EQUIPMENT_TYPES } from "./Attrezzature";

// Temperature.
//
// La scheda è l'elenco degli impianti censiti, uno per riga, sempre tutti
// visibili: a ciascuno si dice se oggi è nel range o fuori. Un registro deve
// mostrare anche quello che NON è stato controllato, e con le righe fisse un
// frigorifero saltato si vede subito, perché resta senza spunta.
//
// Il valore in gradi resta facoltativo quando tutto è a posto — è il modo in
// cui si compilano le schede cartacee — ma diventa obbligatorio insieme alla
// nota quando la lettura è fuori range: lì il numero serve davvero, perché è
// la base della non conformità e della decisione sul prodotto.

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

const oggiISO = () => new Date().toISOString().slice(0, 10);

export default function Temperature() {
  const { company } = useAuth();
  const { items, add, remove, update, loading } = useTable("temperature_logs", company?.id);
  const { items: units, loading: unitsLoading } = useTable("temperature_units", company?.id);

  // Chi compila le schede è di norma il responsabile HACCP: il campo si apre
  // già scritto col suo nome e resta modificabile se a controllare è un altro.
  const responsabile = (company?.haccp_manager || "").trim();
  const [operator, setOperator] = useState("");

  // Valori digitati riga per riga, prima di registrare.
  const [gradi, setGradi] = useState({});
  // Impianto per cui si sta compilando una deviazione: { unitId, note }
  const [fuori, setFuori] = useState(null);
  const [busy, setBusy] = useState("");
  const [errore, setErrore] = useState("");
  const [mostraStorico, setMostraStorico] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editInRange, setEditInRange] = useState(true);

  React.useEffect(() => {
    if (responsabile) setOperator((prec) => (prec ? prec : responsabile));
  }, [responsabile]);

  // Righe storiche create prima dell'introduzione del flag: si ricorre al confronto numerico.
  const isInRange = (item) => {
    if (item.in_range !== null && item.in_range !== undefined) return item.in_range;
    const u = units.find((x) => x.label === item.unit);
    if (!u || item.value === null || item.value === undefined) return true;
    return !(item.value < u.min_temp || item.value > u.max_temp);
  };

  const letturaOggi = (u) =>
    items.find((i) => i.unit === u.label && String(i.created_at).slice(0, 10) === oggiISO()) || null;

  const ultimaLettura = (u) =>
    items
      .filter((i) => i.unit === u.label)
      .reduce((best, i) => (!best || i.created_at > best.created_at ? i : best), null);

  const tipoDi = (u) =>
    u.equipment_type ? (EQUIPMENT_TYPES.find((t) => t.id === u.equipment_type)?.label || "") : "";

  const registra = async (u, inRange, nota) => {
    if (!(operator || responsabile).trim()) { setErrore("Indica chi esegue il controllo."); return; }
    const grezzo = gradi[u.id];
    if (inRange === false && !String(nota || "").trim()) {
      setErrore("Quando la temperatura è fuori range la nota è obbligatoria: scrivi cosa hai fatto.");
      return;
    }
    setBusy(u.id);
    setErrore("");
    try {
      await add({
        unit: u.label,
        value: grezzo === undefined || grezzo === "" ? null : parseFloat(String(grezzo).replace(",", ".")),
        note: nota || "",
        operator: (operator || responsabile).trim(),
        in_range: inRange,
      });
      setGradi({ ...gradi, [u.id]: "" });
      setFuori(null);
    } catch (err) {
      setErrore("Non è stato possibile registrare: " + err.message);
    } finally {
      setBusy("");
    }
  };

  const annulla = async (log) => {
    if (!window.confirm("Cancellare la lettura di oggi per questo impianto?")) return;
    await remove(log.id);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditValue(item.value === null || item.value === undefined ? "" : String(item.value));
    setEditNote(item.note || "");
    setEditInRange(isInRange(item));
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (id) => {
    if (!editInRange && !editNote.trim()) return;
    await update(id, {
      value: editValue === "" ? null : parseFloat(editValue),
      note: editNote,
      in_range: editInRange,
    });
    setEditingId(null);
  };

  const deviations = items.filter((i) => !isInRange(i)).length;
  const fatteOggi = units.filter((u) => letturaOggi(u)).length;

  const groupedByUnit = units.map((u) => ({
    unit: u,
    readings: items.filter((i) => i.unit === u.label),
  }));

  if (!unitsLoading && units.length === 0) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Temperature frigoriferi</h2>
            <p className="sub">Non hai ancora configurato nessuna attrezzatura.</p>
          </div>
        </div>
        <div className="empty">
          <p>Vai su Configurazione → Attrezzature e aggiungi i tuoi frigo/freezer prima di registrare una temperatura.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Temperature frigoriferi</h2>
          <p className="sub">Per ogni impianto conferma se la temperatura rientra nel range consentito.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {deviations > 0 && <div className="pill pill-alert"><AlertTriangle size={14} /> {deviations} fuori range</div>}
          {units.length > 0 && (
            <div className={"pill " + (fatteOggi === units.length ? "pill-ok" : "pill-warn")}>
              {fatteOggi === units.length ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              Oggi {fatteOggi} di {units.length}
            </div>
          )}
        </div>
      </div>

      <div className="row-form" style={{ marginTop: 0, marginBottom: 12 }}>
        <label className="field-label" style={{ flex: "1 1 260px" }}>
          Chi esegue il controllo
          <input
            type="text" className="full-input" value={operator}
            onChange={(e) => setOperator(e.target.value)} placeholder="Nome di chi compila"
          />
        </label>
      </div>

      {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}

      {loading || unitsLoading ? (
        <p className="sub">Caricamento…</p>
      ) : (
        <ul className="dish-list">
          {units.map((u) => {
            const log = letturaOggi(u);
            const ultima = ultimaLettura(u);
            const tipo = tipoDi(u);
            const inDeviazione = log && !isInRange(log);
            const staAprendo = fuori && fuori.unitId === u.id;

            return (
              <li key={u.id} className={"dish-row" + (inDeviazione ? " row-warn" : "")}>
                <div className="dish-top" style={{ marginBottom: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <Refrigerator size={13} style={{ marginRight: 6, verticalAlign: -2 }} color="#2F6F4E" />
                    <strong>{u.label}</strong>
                    <span className="lot-tag">{u.min_temp}°C — {u.max_temp}°C</span>
                    {tipo && <span className="doc-type-tag">{tipo}</span>}
                  </div>
                  {log && (
                    <button type="button" className="icon-btn" aria-label="Annulla la lettura di oggi"
                      title="Annulla la lettura di oggi" onClick={() => annulla(log)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {log ? (
                  <div className="traccia-meta">
                    <span className={"pill " + (isInRange(log) ? "pill-ok" : "pill-alert")}>
                      {isInRange(log)
                        ? <><CheckCircle2 size={12} /> Nel range</>
                        : <><AlertTriangle size={12} /> Fuori range</>}
                    </span>
                    {log.value !== null && log.value !== undefined && (
                      <span className="doc-type-tag mono">{Number(log.value).toFixed(1)}°C</span>
                    )}
                    <span className="doc-type-tag">{log.operator}</span>
                    <span className="log-time">{fmtDate(log.created_at)}</span>
                    {log.note && <span className="doc-type-tag">{log.note}</span>}
                  </div>
                ) : staAprendo ? (
                  <div className="nc-edit-block">
                    <p className="field-label" style={{ color: "#B3432E", margin: "0 0 8px" }}>
                      <AlertTriangle size={13} /> Temperatura fuori range: scrivi il valore letto e l'azione presa.
                    </p>
                    <div className="row-form" style={{ margin: "0 0 8px" }}>
                      <input
                        type="number" step="0.1" className="num" placeholder="°C letti"
                        value={gradi[u.id] || ""}
                        onChange={(e) => setGradi({ ...gradi, [u.id]: e.target.value })}
                      />
                      <input
                        type="text" className="note-input"
                        placeholder="Cosa hai fatto (es. prodotto trasferito, tecnico chiamato)"
                        value={fuori.note}
                        onChange={(e) => setFuori({ ...fuori, note: e.target.value })}
                      />
                    </div>
                    <div className="row-form" style={{ margin: 0 }}>
                      <button type="button" className="btn-primary" disabled={busy === u.id}
                        onClick={() => registra(u, false, fuori.note)}>
                        <Check size={15} /> {busy === u.id ? "…" : "Registra la deviazione"}
                      </button>
                      <button type="button" className="link-btn" onClick={() => setFuori(null)}>Annulla</button>
                    </div>
                  </div>
                ) : (
                  <div className="row-form" style={{ margin: 0, alignItems: "center" }}>
                    <button type="button" className="btn-primary" disabled={busy === u.id}
                      onClick={() => registra(u, true, "")}>
                      <CheckCircle2 size={15} /> {busy === u.id ? "…" : "Nel range"}
                    </button>
                    <button
                      type="button" className="btn-primary"
                      style={{ background: "#fff", color: "#B3432E", border: "1px solid #B3432E" }}
                      onClick={() => { setErrore(""); setFuori({ unitId: u.id, note: "" }); }}
                    >
                      <AlertTriangle size={15} /> Fuori range
                    </button>
                    <input
                      type="number" step="0.1" className="num" placeholder="°C"
                      value={gradi[u.id] || ""}
                      onChange={(e) => setGradi({ ...gradi, [u.id]: e.target.value })}
                      title="Valore letto, facoltativo quando è nel range"
                    />
                    {ultima && (
                      <span className="sub">ultima lettura {fmtDate(ultima.created_at)}</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="login-info" style={{ marginTop: 12 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Il valore in gradi è facoltativo quando la temperatura è nel range; diventa obbligatorio,
        insieme all'azione presa, quando è fuori range — è il dato su cui si decide del prodotto.
        Gli impianti si aggiungono in Configurazione → Attrezzature.
      </p>

      <button type="button" className="link-btn" onClick={() => setMostraStorico(!mostraStorico)}>
        {mostraStorico ? "Nascondi lo storico" : "Mostra lo storico delle letture"}
      </button>

      {mostraStorico && (
        items.length === 0 ? (
          <div className="empty"><p>Nessuna lettura registrata.</p></div>
        ) : (
          <ul className="log-list temp-screen-list">
            {items.slice(0, 150).map((item) => {
              const bad = !isInRange(item);
              const isEditing = editingId === item.id;
              if (isEditing) {
                return (
                  <li key={item.id} className="log-row editing">
                    <span className="dot" />
                    <button type="button" className={"chip" + (editInRange ? " chip-on" : "")} onClick={() => setEditInRange(true)}>Nel range</button>
                    <button type="button" className={"chip" + (!editInRange ? " chip-on" : "")} onClick={() => setEditInRange(false)}>Fuori range</button>
                    <input type="number" step="0.1" placeholder="°C" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="num edit-input" />
                    <span className="log-unit">{item.unit}</span>
                    <input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Nota" className="note-input edit-input" />
                    <button className="icon-btn icon-btn-ok" onClick={() => saveEdit(item.id)} aria-label="Salva"><Check size={14} /></button>
                    <button className="icon-btn" onClick={cancelEdit} aria-label="Annulla"><X size={14} /></button>
                  </li>
                );
              }
              return (
                <li key={item.id} className={"log-row" + (bad ? " bad" : "")}>
                  <span className="dot" />
                  <span className="log-main">
                    {bad ? (
                      <strong className="mono" style={{ color: "#B3432E" }}>Fuori range</strong>
                    ) : (
                      <strong className="mono" style={{ color: "#2F6F4E" }}>Nel range</strong>
                    )}
                    <span className="log-unit">{item.unit}</span>
                  </span>
                  {item.value !== null && item.value !== undefined && (
                    <span className="log-note mono">{Number(item.value).toFixed(1)}°C</span>
                  )}
                  {item.operator && <span className="log-note">{item.operator}</span>}
                  {item.note && <span className="log-note">{item.note}</span>}
                  <span className="log-time">{fmtDate(item.created_at)}</span>
                  <button className="icon-btn" onClick={() => startEdit(item)} aria-label="Modifica"><Pencil size={14} /></button>
                  <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                </li>
              );
            })}
          </ul>
        )
      )}

      <div className="print-only">
        {groupedByUnit.map(({ unit, readings }) => (
          <div key={unit.id} className="print-fridge-page">
            <div className="print-fridge-header">
              <Refrigerator size={30} />
              <div>
                <h3 style={{ margin: 0 }}>{unit.label}</h3>
                <p style={{ margin: "2px 0 0", fontSize: 12 }}>
                  Range consentito: {unit.min_temp}°C — {unit.max_temp}°C
                </p>
              </div>
            </div>
            {readings.length === 0 ? (
              <p style={{ fontSize: 12.5 }}>Nessuna lettura registrata per questo impianto.</p>
            ) : (
              <table className="print-fridge-table">
                <thead>
                  <tr>
                    <th>Data e ora</th>
                    <th>Esito</th>
                    <th>°C</th>
                    <th>Operatore</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.created_at)}</td>
                      <td>{isInRange(r) ? "Nel range" : "Fuori range"}</td>
                      <td>{r.value !== null && r.value !== undefined ? Number(r.value).toFixed(1) : "—"}</td>
                      <td>{r.operator || "—"}</td>
                      <td>{r.note || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
