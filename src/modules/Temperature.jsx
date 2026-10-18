import React, { useState } from "react";
import { Trash2, AlertTriangle, CheckCircle2, Pencil, Check, X, Refrigerator, Info, PowerOff, CalendarOff } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import { EQUIPMENT_TYPES_STORICI } from "./Attrezzature";
import BarraAttivitaChiusa, { StoricoPeriodi } from "./BarraAttivitaChiusa";
import {
  MOTIVI_SPEGNIMENTO, chiusuraDelGiorno, fuoriServizioDelGiorno,
  descrizionePeriodo,
} from "../utils/chiusure";

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
  const { items: chiusure, add: addChiusura, update: updateChiusura, remove: removeChiusura } =
    useTable("company_closures", company?.id);
  const { items: spegnimenti, add: addSpegnimento, update: updateSpegnimento, remove: removeSpegnimento } =
    useTable("equipment_downtime", company?.id);

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

  // Impianto per cui si sta dichiarando lo spegnimento: { unitId, motivo, nota }
  const [spegnere, setSpegnere] = useState(null);

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
    u.equipment_type ? (EQUIPMENT_TYPES_STORICI.find((t) => t.id === u.equipment_type)?.label || "") : "";

  // Un impianto spento non ha una temperatura da leggere: la vetrina dei
  // gelati d'inverno, il banco caldo nei mesi in cui non si usa. Finche' il
  // periodo e' aperto la riga non chiede niente e non entra nel conteggio,
  // ma resta visibile e dice da quando e perche' e' ferma — e' quello che
  // spiega, mesi dopo, un registro senza letture.
  const fuoriServizio = (u) => fuoriServizioDelGiorno(spegnimenti, u.label);

  const spegni = async (u, motivo, nota) => {
    setBusy(u.id);
    setErrore("");
    try {
      await addSpegnimento({
        unit_id: u.id,
        unit_label: u.label,
        start_date: oggiISO(),
        end_date: null,
        reason: motivo,
        note: (nota || "").trim() || null,
      });
      setSpegnere(null);
    } catch (err) {
      setErrore("Non è stato possibile registrare lo spegnimento: " + err.message);
    } finally {
      setBusy("");
    }
  };

  // Si riaccende oggi, quindi il fuori servizio e' durato fino a ieri —
  // tranne quando era cominciato oggi stesso.
  const riaccendi = async (periodo) => {
    setBusy(periodo.id);
    try {
      const ieri = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const inizio = String(periodo.start_date).slice(0, 10);
      // Spenta e riaccesa in giornata: non c'e' stato nessun giorno di
      // fermo, e il periodo si toglie invece di restare aperto su oggi.
      if (inizio > ieri) await removeSpegnimento(periodo.id);
      else await updateSpegnimento(periodo.id, { end_date: ieri });
    } catch (err) {
      setErrore("Non è stato possibile riaccendere l'impianto: " + err.message);
    } finally {
      setBusy("");
    }
  };

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
      const valore = grezzo === undefined || grezzo === "" ? null : parseFloat(String(grezzo).replace(",", "."));
      const riga = await add({
        unit: u.label,
        value: valore,
        note: nota || "",
        operator: (operator || responsabile).trim(),
        in_range: inRange,
      });

      // Una temperatura fuori range E' una non conformita', e il manuale
      // dichiara al modulo M07 che ogni deviazione finisce nel registro delle
      // non conformita'. Finora restava chiusa dentro questa scheda: in
      // ispezione il registro delle non conformita' diceva "nessuna" mentre il
      // registro delle temperature mostrava una deviazione, e due pezzi dello
      // stesso sistema si contraddicevano.
      //
      // Non si chiede all'OSA di riscriverla: la riga nasce da sola, con
      // dentro quello che ha gia' scritto. Resta APERTA, senza data di
      // risoluzione, perche' un frigorifero fuori range non e' a posto finche'
      // non ci torna dentro: la chiude chi verifica.
      if (riga && inRange === false) {
        const limiti = (u.min_temp != null && u.max_temp != null)
          ? ` (limite ${u.min_temp}°C — ${u.max_temp}°C)` : "";
        const letta = valore != null ? `${String(valore).replace(".", ",")}°C` : "valore non indicato";
        const { error: errNc } = await supabase.from("non_conformities").insert({
          company_id: company.id,
          area: "Frigoriferi",
          description: `Temperatura fuori range su ${u.label}: ${letta}${limiti}.`,
          detected_date: oggiISO(),
          responsible: (operator || responsabile).trim(),
          corrective_action: nota || null,
          source: "temperature",
          source_id: riga.id,
        });
        // Se la riga non si crea, la lettura resta comunque registrata: il
        // registro delle temperature e' il dato primario e non va perso per
        // un errore sul registro collegato.
        if (errNc && !/duplicate|unique/i.test(errNc.message)) {
          setErrore("Lettura registrata, ma la non conformità collegata non è stata creata: " + errNc.message);
        }
      }
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
  const chiusa = chiusuraDelGiorno(chiusure);
  // Il denominatore sono gli impianti da cui oggi ci si aspetta una lettura:
  // gli spenti non sono controlli mancanti.
  const daControllare = units.filter((u) => !fuoriServizio(u));
  const fatteOggi = daControllare.filter((u) => letturaOggi(u)).length;

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
          {chiusa ? (
            <div className="pill pill-warn"><CalendarOff size={14} /> Attività chiusa</div>
          ) : daControllare.length > 0 && (
            <div className={"pill " + (fatteOggi === daControllare.length ? "pill-ok" : "pill-warn")}>
              {fatteOggi === daControllare.length ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              Oggi {fatteOggi} di {daControllare.length}
            </div>
          )}
        </div>
      </div>

      <BarraAttivitaChiusa
        chiusure={chiusure}
        add={addChiusura}
        update={updateChiusura}
        remove={removeChiusura}
        nomeControlli="le temperature"
      />

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
            const spenta = fuoriServizio(u);
            const staSpegnendo = spegnere && spegnere.unitId === u.id;

            return (
              <li key={u.id} className={"dish-row" + (inDeviazione ? " row-warn" : "")}
                  style={spenta ? { opacity: 0.72 } : undefined}>
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

                {spenta ? (
                  <div className="traccia-meta">
                    <span className="pill pill-warn"><PowerOff size={12} /> Spenta</span>
                    <span className="doc-type-tag">{descrizionePeriodo(spenta)}</span>
                    {spenta.note && <span className="doc-type-tag">{spenta.note}</span>}
                    <button type="button" className="btn-primary" disabled={busy === spenta.id}
                      onClick={() => riaccendi(spenta)}>
                      <Check size={15} /> {busy === spenta.id ? "…" : "Riaccesa oggi"}
                    </button>
                  </div>
                ) : staSpegnendo ? (
                  <div className="nc-edit-block">
                    <p className="field-label" style={{ margin: "0 0 8px" }}>
                      Da oggi questo impianto è spento. Perché?
                    </p>
                    <div className="row-form" style={{ margin: "0 0 8px" }}>
                      <select value={spegnere.motivo}
                        onChange={(e) => setSpegnere({ ...spegnere, motivo: e.target.value })}>
                        {MOTIVI_SPEGNIMENTO.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <input
                        type="text" className="note-input" placeholder="Nota (facoltativa)"
                        value={spegnere.nota}
                        onChange={(e) => setSpegnere({ ...spegnere, nota: e.target.value })}
                      />
                    </div>
                    <div className="row-form" style={{ margin: 0 }}>
                      <button type="button" className="btn-primary" disabled={busy === u.id}
                        onClick={() => spegni(u, spegnere.motivo, spegnere.nota)}>
                        <Check size={15} /> {busy === u.id ? "…" : "Registra lo spegnimento"}
                      </button>
                      <button type="button" className="link-btn" onClick={() => setSpegnere(null)}>Annulla</button>
                    </div>
                    <p className="range-hint">
                      Finché resta spento non comparirà fra i controlli da fare, ma la riga resta
                      visibile e dice da quando: è quello che spiega i giorni senza letture. Premi
                      «Riaccesa» il giorno in cui torna in funzione.
                    </p>
                  </div>
                ) : log ? (
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
                    <button
                      type="button" className="link-btn"
                      title="L'impianto è spento: fine stagione, guasto, non utilizzato"
                      onClick={() => { setErrore(""); setSpegnere({ unitId: u.id, motivo: MOTIVI_SPEGNIMENTO[0], nota: "" }); }}
                    >
                      <PowerOff size={14} /> Spenta
                    </button>
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

      <StoricoPeriodi chiusure={chiusure} spegnimenti={spegnimenti} />

      <p className="login-info" style={{ marginTop: 12 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Il valore in gradi è facoltativo quando la temperatura è nel range; diventa obbligatorio,
        insieme all'azione presa, quando è fuori range — è il dato su cui si decide del prodotto.
        Gli impianti si aggiungono in Configurazione → Attrezzature. Un impianto spento — la
        vetrina dei gelati fuori stagione, un frigorifero guasto — si dichiara con «Spenta»: esce
        dai controlli del giorno ma resta nell'elenco, con scritto da quando e perché.
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
