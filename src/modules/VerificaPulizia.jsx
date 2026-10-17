import React, { useMemo, useState } from "react";
import { Plus, Trash2, Info, AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";

// Verifica rapida della pulizia — il verbale del test sui residui proteici.
//
// Prima si compilava a mano, due volte l'anno per ogni cliente, ricopiando
// ogni volta anagrafica, punti di campionamento e dati del kit. Qui nasce
// precompilato, si riempie sul posto dal telefono e resta nell'app: l'OSA lo
// trova senza che nessuno stampi niente, e l'esito finisce da solo nei
// controlli analitici, dove fa scattare la scadenza della verifica dopo.
//
// Il test misura i RESIDUI PROTEICI, non i microrganismi: dice se la pulizia
// ha funzionato, e per questo si esegue dopo detersione e risciacquo e PRIMA
// della disinfezione. Non sostituisce il tampone di laboratorio, lo precede.

const PUNTI_PREDEFINITI = [
  { point_label: "Tagliere", material: "Polietilene" },
  { point_label: "Piano di lavoro", material: "Acciaio inox" },
  { point_label: "Affettatrice (lama e piatto)", material: "Acciaio inox" },
  { point_label: "Ripiano interno del frigorifero", material: "Acciaio inox" },
  { point_label: "Maniglia del frigorifero", material: "Acciaio inox" },
];

const COLORI = ["Verde", "Giallo", "Viola"];
// Il colore e' una scala: verde pulito, giallo residuo, viola residuo
// abbondante. L'esito si propone da solo e resta correggibile, perche' su una
// superficie appena sanificata un giallo chiaro puo' valere piu' di un viola
// su una maniglia.
const ESITO_DA_COLORE = { Verde: "Conforme", Giallo: "Attenzione", Viola: "Non conforme" };

const MOTIVI = [
  "Verifica programmata",
  "Ripetizione dopo esito non conforme",
  "Dopo modifica di procedure o attrezzature",
  "Dopo reclamo",
  "Altro",
];

const ETICHETTA_PIANO = "Verifica rapida della pulizia (test sui residui proteici)";

const oggi = () => new Date().toISOString().slice(0, 10);
const adesso = () => new Date().toTimeString().slice(0, 5);

function fmtData(iso) {
  if (!iso) return "";
  const [a, m, g] = String(iso).slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

export default function VerificaPulizia() {
  const { company, consultantCompanies } = useAuth();
  const isConsultant = (consultantCompanies || []).length > 0;

  const { items: verbali, add, remove, loading } = useTable("surface_checks", company?.id);
  const { items: punti } = useTable("surface_check_points", company?.id);
  const { items: piani } = useTable("analysis_plan", company?.id);

  const [aperto, setAperto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  const [data, setData] = useState(oggi());
  const [oraInizio, setOraInizio] = useState(adesso());
  const [oraFine, setOraFine] = useState("");
  const [presente, setPresente] = useState("");
  const [qualifica, setQualifica] = useState("");
  const [lotto, setLotto] = useState("");
  const [scadenza, setScadenza] = useState("");
  const [motivo, setMotivo] = useState(MOTIVI[0]);
  const [oraPulizia, setOraPulizia] = useState("");
  const [detergente, setDetergente] = useState("");
  const [note, setNote] = useState("");
  const [righe, setRighe] = useState(
    PUNTI_PREDEFINITI.map((p) => ({ ...p, sample_time: "", color: "", outcome: "", action_taken: "" }))
  );

  const consulente = company?.consultant_name || "";

  const cambiaRiga = (i, campo, valore) => {
    setRighe((prec) => prec.map((r, j) => {
      if (j !== i) return r;
      const nuova = { ...r, [campo]: valore };
      // Scegliendo il colore l'esito si propone; resta modificabile.
      if (campo === "color") nuova.outcome = ESITO_DA_COLORE[valore] || "";
      return nuova;
    }));
  };

  const aggiungiRiga = () =>
    setRighe((prec) => [...prec, { point_label: "", material: "", sample_time: "", color: "", outcome: "", action_taken: "" }]);

  const togliRiga = (i) => setRighe((prec) => prec.filter((_, j) => j !== i));

  const esitoComplessivo = (elenco) => {
    if (elenco.some((r) => r.outcome === "Non conforme")) return "Non conforme";
    if (elenco.some((r) => r.outcome === "Attenzione")) return "Conforme con riserva";
    return "Conforme";
  };

  const azzera = () => {
    setData(oggi()); setOraInizio(adesso()); setOraFine(""); setPresente(""); setQualifica("");
    setLotto(""); setScadenza(""); setMotivo(MOTIVI[0]); setOraPulizia(""); setDetergente(""); setNote("");
    setRighe(PUNTI_PREDEFINITI.map((p) => ({ ...p, sample_time: "", color: "", outcome: "", action_taken: "" })));
  };

  const salva = async (e) => {
    e.preventDefault();
    setErrore("");
    const compilate = righe.filter((r) => r.point_label.trim() && r.color);
    if (compilate.length === 0) {
      setErrore("Serve almeno un punto con il colore letto.");
      return;
    }
    setBusy(true);
    const esito = esitoComplessivo(compilate);
    const verbale = await add({
      check_date: data,
      time_start: oraInizio || null,
      time_end: oraFine || null,
      inspector: consulente || null,
      present_name: presente.trim() || null,
      present_role: qualifica.trim() || null,
      kit_lot: lotto.trim() || null,
      kit_expiry: scadenza || null,
      reason: motivo,
      last_cleaning_time: oraPulizia || null,
      detergent: detergente.trim() || null,
      outcome: esito,
      notes: note.trim() || null,
    });
    if (!verbale) { setBusy(false); setErrore("Non è stato possibile salvare il verbale."); return; }

    const { error: errPunti } = await supabase.from("surface_check_points").insert(
      compilate.map((r, i) => ({
        company_id: company.id,
        check_id: verbale.id,
        sort_order: i + 1,
        point_label: r.point_label.trim(),
        material: r.material.trim() || null,
        sample_time: r.sample_time || null,
        color: r.color,
        outcome: r.outcome || ESITO_DA_COLORE[r.color] || null,
        action_taken: r.action_taken.trim() || null,
      }))
    );
    if (errPunti) { setBusy(false); setErrore("Verbale salvato, ma i punti no: " + errPunti.message); return; }

    // L'esito entra da solo nei controlli analitici, sulla riga di piano che
    // gli corrisponde: e' li' che si calcola la scadenza della verifica
    // successiva, e scriverlo due volte a mano significherebbe scriverlo in
    // due modi diversi.
    const piano = piani.find((p) => p.label === ETICHETTA_PIANO);
    if (piano) {
      const riassunto = compilate
        .map((r) => `${r.point_label}: ${r.color}${r.outcome ? " — " + r.outcome : ""}`)
        .join("; ");
      await supabase.from("analysis_results").insert({
        company_id: company.id,
        plan_id: piano.id,
        sample_date: data,
        result: esito === "Non conforme" ? "Non conforme" : "Conforme",
        values_note: riassunto,
        operator: consulente || null,
        note: `Verifica rapida sui residui proteici — ${compilate.length} punti. ${note.trim()}`.trim(),
      });
    }

    setBusy(false);
    setAperto(false);
    azzera();
  };

  const puntiDi = (id) => punti
    .filter((p) => p.check_id === id)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const ordinati = useMemo(
    () => [...verbali].sort((a, b) => (a.check_date < b.check_date ? 1 : -1)),
    [verbali]
  );

  const pillEsito = (e) =>
    e === "Non conforme" ? { color: "#B3432E" } : e === "Conforme con riserva" ? { color: "#8A7320" } : undefined;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2><ClipboardCheck size={18} /> Verifica rapida della pulizia</h2>
          <p className="sub">Test sui residui proteici delle superfici, con verbale.</p>
        </div>
        {isConsultant && !aperto && (
          <button type="button" className="btn-primary" onClick={() => setAperto(true)}>
            <Plus size={16} /> Nuovo verbale
          </button>
        )}
      </div>

      <p className="login-info" style={{ margin: "16px 0" }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Il test misura i <strong>residui proteici</strong>, non i microrganismi: dice se la pulizia
          ha funzionato. Si esegue <strong>dopo detersione e risciacquo e prima della
          disinfezione</strong>, perché è la pulizia che si sta verificando. Non sostituisce il
          tampone di laboratorio, lo precede — e l'esito finisce da solo nei Controlli analitici.
        </span>
      </p>

      {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}

      {aperto && isConsultant && (
        <form onSubmit={salva} style={{ marginBottom: 18 }}>
          <div className="row-form" style={{ margin: "0 0 8px" }}>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            <input type="time" value={oraInizio} onChange={(e) => setOraInizio(e.target.value)} aria-label="Ora di inizio" />
            <input type="time" value={oraFine} onChange={(e) => setOraFine(e.target.value)} aria-label="Ora di fine" />
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVI.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="row-form" style={{ margin: "0 0 8px" }}>
            <input type="text" placeholder="Presente al campionamento" value={presente}
              onChange={(e) => setPresente(e.target.value)} className="note-input" />
            <input type="text" placeholder="In qualità di" value={qualifica}
              onChange={(e) => setQualifica(e.target.value)} className="note-input" />
          </div>

          <div className="row-form" style={{ margin: "0 0 8px" }}>
            <input type="text" placeholder="Lotto del kit" value={lotto}
              onChange={(e) => setLotto(e.target.value)} className="note-input" />
            <label className="field-label" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              scadenza
              <input type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} />
            </label>
            <input type="time" value={oraPulizia} onChange={(e) => setOraPulizia(e.target.value)}
              aria-label="Ora dell'ultima pulizia" />
            <input type="text" placeholder="Detergente usato" value={detergente}
              onChange={(e) => setDetergente(e.target.value)} className="note-input" />
          </div>

          <ul className="dish-list" style={{ margin: "12px 0" }}>
            {righe.map((r, i) => (
              <li key={i} className="dish-row">
                <div className="row-form" style={{ margin: 0 }}>
                  <input type="text" placeholder="Punto di campionamento" value={r.point_label}
                    onChange={(e) => cambiaRiga(i, "point_label", e.target.value)} className="note-input" />
                  <input type="text" placeholder="Materiale" value={r.material}
                    onChange={(e) => cambiaRiga(i, "material", e.target.value)} className="note-input" />
                  <input type="time" value={r.sample_time}
                    onChange={(e) => cambiaRiga(i, "sample_time", e.target.value)} aria-label="Ora del prelievo" />
                  <select value={r.color} onChange={(e) => cambiaRiga(i, "color", e.target.value)}>
                    <option value="">Colore a 10 min…</option>
                    {COLORI.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={r.outcome} onChange={(e) => cambiaRiga(i, "outcome", e.target.value)}>
                    <option value="">Esito…</option>
                    <option value="Conforme">Conforme</option>
                    <option value="Attenzione">Attenzione</option>
                    <option value="Non conforme">Non conforme</option>
                  </select>
                  <button type="button" className="icon-btn" onClick={() => togliRiga(i)} aria-label="Togli il punto">
                    <Trash2 size={14} />
                  </button>
                </div>
                {(r.outcome === "Non conforme" || r.outcome === "Attenzione") && (
                  <div className="row-form" style={{ margin: "6px 0 0" }}>
                    <input type="text" placeholder="Azione presa (ripulito, riesaminata la procedura…)"
                      value={r.action_taken} onChange={(e) => cambiaRiga(i, "action_taken", e.target.value)}
                      className="note-input" />
                  </div>
                )}
              </li>
            ))}
          </ul>

          <button type="button" className="link-btn" onClick={aggiungiRiga}>+ Aggiungi un punto</button>

          <div className="row-form" style={{ margin: "10px 0 8px" }}>
            <input type="text" placeholder="Note del verbale" value={note}
              onChange={(e) => setNote(e.target.value)} className="note-input" />
          </div>

          <div className="row-form" style={{ margin: 0 }}>
            <button type="submit" className="btn-primary" disabled={busy}>
              <Plus size={16} /> Salva il verbale
            </button>
            <button type="button" className="link-btn" onClick={() => { setAperto(false); azzera(); }}>
              Annulla
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : ordinati.length === 0 ? (
        <div className="empty">
          <p>Nessuna verifica registrata. La prima la esegue il consulente durante la visita.</p>
        </div>
      ) : (
        <ul className="dish-list">
          {ordinati.map((v) => {
            const suoi = puntiDi(v.id);
            const nc = v.outcome === "Non conforme";
            return (
              <li key={v.id} className={"dish-row" + (nc ? " row-warn" : "")}>
                <div className="dish-top">
                  <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    {nc ? <AlertTriangle size={16} color="#B3432E" /> : <CheckCircle2 size={16} color="#2F6F4E" />}
                    <strong>Verifica del {fmtData(v.check_date)}</strong>
                    <span className="doc-type-tag" style={pillEsito(v.outcome)}>{v.outcome}</span>
                  </div>
                  {isConsultant && (
                    <button className="icon-btn" aria-label="Elimina"
                      onClick={() => { if (window.confirm("Eliminare questo verbale?")) remove(v.id); }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="traccia-meta">
                  {v.inspector && <span className="doc-type-tag">{v.inspector}</span>}
                  <span className="doc-type-tag">{v.reason}</span>
                  {v.kit_lot && <span className="doc-type-tag">lotto kit {v.kit_lot}</span>}
                  {v.detergent && <span className="doc-type-tag">{v.detergent}</span>}
                  {v.present_name && <span className="doc-type-tag">presente: {v.present_name}</span>}
                </div>
                {suoi.length > 0 && (
                  <ul className="log-list" style={{ marginTop: 6 }}>
                    {suoi.map((p) => (
                      <li key={p.id} className="log-row">
                        <span className="log-main">{p.point_label}</span>
                        {p.material && <span className="log-unit">{p.material}</span>}
                        <span className="doc-type-tag">{p.color}</span>
                        <span className="doc-type-tag" style={pillEsito(p.outcome)}>{p.outcome}</span>
                        {p.action_taken && <span className="log-note">{p.action_taken}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {v.notes && <p className="pest-note">{v.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
