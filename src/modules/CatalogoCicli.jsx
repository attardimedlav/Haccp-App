import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight, AlertTriangle, Layers } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";

// Il catalogo dei cicli di lavorazione non appartiene a un'azienda: è il
// sapere professionale del consulente, e serve a tutti i clienti. Per questo
// qui non si usa useTable (che filtra per company_id) ma si legge per
// consultant_id, come fanno le policy delle due tabelle.

const SETTORI = [
  { id: "bar_ristorazione", label: "Bar e ristorazione" },
  { id: "pasticceria", label: "Pasticceria" },
  { id: "panificio", label: "Panificio" },
  { id: "pescheria", label: "Pescheria" },
  { id: "macelleria", label: "Macelleria" },
  { id: "altro", label: "Altro" },
];

const CLASSIFICAZIONI = ["Prerequisito", "Punto di controllo", "CCP 1", "CCP 2"];

// Le caselle di Configurazione a cui un ciclo o una riga può essere legato:
// se la casella è spenta, quel pezzo non entra nel manuale dell'azienda.
const FLAG = [
  { id: "", label: "Vale sempre" },
  { id: "has_fryer", label: "Solo con friggitrice" },
  { id: "has_blast_chiller", label: "Solo con abbattitore" },
  { id: "has_ice_machine", label: "Solo con macchina del ghiaccio" },
  { id: "serves_raw_fish", label: "Solo se somministra pesce crudo" },
  { id: "has_water_tank", label: "Solo con vasca di accumulo" },
];

const etichettaFlag = (id) => (FLAG.find((f) => f.id === (id || ""))?.label) || id;

const CAMPI_RIGA = [
  ["phase", "Fase"],
  ["hazard", "Pericolo"],
  ["control_measure", "Misura preventiva / limite"],
  ["monitoring", "Monitoraggio"],
  ["corrective_action", "Azione correttiva"],
];

export default function CatalogoCicli() {
  const { session } = useAuth();
  const consultantId = session?.user?.id || null;

  const [settore, setSettore] = useState(SETTORI[0].id);
  const [cicli, setCicli] = useState([]);
  const [righe, setRighe] = useState({});     // cycle_template_id -> righe
  const [aperto, setAperto] = useState(null); // ciclo espanso
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");

  const [nuovoCiclo, setNuovoCiclo] = useState(null);   // bozza del ciclo nuovo
  const [cicloInModifica, setCicloInModifica] = useState(null);
  const [nuovaRiga, setNuovaRiga] = useState(null);
  const [rigaInModifica, setRigaInModifica] = useState(null);

  const carica = useCallback(async () => {
    if (!consultantId) return;
    setLoading(true);
    setErrore("");
    const { data, error } = await supabase
      .from("cycle_templates")
      .select("*")
      .eq("consultant_id", consultantId)
      .eq("sector", settore)
      .order("sort_order", { ascending: true });
    if (error) { setErrore(error.message); setLoading(false); return; }
    setCicli(data || []);

    const ids = (data || []).map((c) => c.id);
    if (ids.length > 0) {
      const { data: hz } = await supabase
        .from("hazard_templates")
        .select("*")
        .in("cycle_template_id", ids)
        .order("sort_order", { ascending: true });
      const perCiclo = {};
      (hz || []).forEach((r) => {
        (perCiclo[r.cycle_template_id] = perCiclo[r.cycle_template_id] || []).push(r);
      });
      setRighe(perCiclo);
    } else {
      setRighe({});
    }
    setLoading(false);
  }, [consultantId, settore]);

  useEffect(() => { carica(); }, [carica]);

  const prossimoCodice = () => {
    const numeri = cicli.map((c) => parseInt(String(c.code).replace(/\D/g, ""), 10)).filter((n) => !Number.isNaN(n));
    return "C" + String((numeri.length ? Math.max(...numeri) : 0) + 1).padStart(2, "0");
  };

  const bozzaCiclo = () => ({
    code: prossimoCodice(),
    name: "",
    classification: CLASSIFICAZIONI[1],
    intro: "",
    flow: "",
    requires_flag: "",
    sort_order: cicli.length + 1,
  });

  const salvaCiclo = async (bozza, id) => {
    setErrore("");
    const payload = {
      sector: settore,
      code: bozza.code.trim(),
      name: bozza.name.trim(),
      classification: bozza.classification,
      intro: bozza.intro?.trim() || null,
      flow: String(bozza.flow || "").split("\n").map((r) => r.trim()).filter(Boolean),
      requires_flag: bozza.requires_flag || null,
      sort_order: Number(bozza.sort_order) || 0,
    };
    if (!payload.name) { setErrore("Il ciclo deve avere un nome."); return; }
    const res = id
      ? await supabase.from("cycle_templates").update(payload).eq("id", id)
      : await supabase.from("cycle_templates").insert({ ...payload, consultant_id: consultantId });
    if (res.error) { setErrore(res.error.message); return; }
    setNuovoCiclo(null); setCicloInModifica(null);
    carica();
  };

  const eliminaCiclo = async (c) => {
    if (!window.confirm(`Elimino il ciclo "${c.name}" e tutte le sue righe di analisi?`)) return;
    const { error } = await supabase.from("cycle_templates").delete().eq("id", c.id);
    if (error) { setErrore(error.message); return; }
    carica();
  };

  const salvaRiga = async (bozza, cicloId, id) => {
    setErrore("");
    const payload = {
      cycle_template_id: cicloId,
      phase: (bozza.phase || "").trim(),
      hazard: (bozza.hazard || "").trim(),
      control_measure: (bozza.control_measure || "").trim(),
      monitoring: (bozza.monitoring || "").trim(),
      corrective_action: (bozza.corrective_action || "").trim(),
      requires_flag: bozza.requires_flag || null,
      sort_order: Number(bozza.sort_order) || 0,
    };
    if (!payload.phase || !payload.hazard) { setErrore("Fase e pericolo sono obbligatori."); return; }
    const res = id
      ? await supabase.from("hazard_templates").update(payload).eq("id", id)
      : await supabase.from("hazard_templates").insert(payload);
    if (res.error) { setErrore(res.error.message); return; }
    setNuovaRiga(null); setRigaInModifica(null);
    carica();
  };

  const eliminaRiga = async (r) => {
    if (!window.confirm(`Elimino la riga "${r.phase}"?`)) return;
    const { error } = await supabase.from("hazard_templates").delete().eq("id", r.id);
    if (error) { setErrore(error.message); return; }
    carica();
  };

  const campoCiclo = (bozza, setBozza) => (
    <div className="nc-edit-block">
      <div className="row-form">
        <input type="text" placeholder="Codice" value={bozza.code} onChange={(e) => setBozza({ ...bozza, code: e.target.value })} className="note-input" style={{ maxWidth: 110 }} />
        <input type="text" placeholder="Nome del ciclo" value={bozza.name} onChange={(e) => setBozza({ ...bozza, name: e.target.value })} className="note-input" />
        <select value={bozza.classification} onChange={(e) => setBozza({ ...bozza, classification: e.target.value })}>
          {CLASSIFICAZIONI.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="number" placeholder="Ordine" value={bozza.sort_order} onChange={(e) => setBozza({ ...bozza, sort_order: e.target.value })} className="note-input" style={{ maxWidth: 90 }} />
      </div>
      <textarea placeholder="Paragrafo introduttivo (facoltativo)" value={bozza.intro || ""} onChange={(e) => setBozza({ ...bozza, intro: e.target.value })} className="full-input nc-textarea" />
      <textarea placeholder={"Flusso: una fase per riga\nEs.\nArrivo del fornitore\nControllo documento"} value={bozza.flow || ""} onChange={(e) => setBozza({ ...bozza, flow: e.target.value })} className="full-input nc-textarea" />
      <select value={bozza.requires_flag || ""} onChange={(e) => setBozza({ ...bozza, requires_flag: e.target.value })} className="full-input">
        {FLAG.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
    </div>
  );

  const campoRiga = (bozza, setBozza) => (
    <div className="nc-edit-block">
      {CAMPI_RIGA.map(([campo, label]) => (
        <textarea
          key={campo}
          placeholder={label}
          value={bozza[campo] || ""}
          onChange={(e) => setBozza({ ...bozza, [campo]: e.target.value })}
          className="full-input nc-textarea"
        />
      ))}
      <div className="row-form">
        <select value={bozza.requires_flag || ""} onChange={(e) => setBozza({ ...bozza, requires_flag: e.target.value })}>
          {FLAG.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <input type="number" placeholder="Ordine" value={bozza.sort_order} onChange={(e) => setBozza({ ...bozza, sort_order: e.target.value })} className="note-input" style={{ maxWidth: 90 }} />
      </div>
      <p className="range-hint">
        Nel pericolo si usa B, C o F per biologico, chimico o fisico. Per andare a capo dentro una cella
        del manuale si usa la barra verticale |, come nei manuali già scritti.
      </p>
    </div>
  );

  if (!consultantId) return <div className="panel"><p className="sub">Catalogo disponibile solo per il consulente.</p></div>;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Catalogo dei cicli di lavorazione</h2>
          <p className="sub">
            È la base da cui si genera il manuale di autocontrollo: per ogni settore, i cicli con le loro
            fasi, i pericoli, le misure e le azioni correttive. Il catalogo è tuo e vale per tutti i clienti;
            i cicli e le righe legati a un'attrezzatura entrano nel manuale solo se quell'azienda ce l'ha.
          </p>
        </div>
        <div className="pill"><Layers size={14} /> {cicli.length} cicli</div>
      </div>

      <div className="row-form">
        <select value={settore} onChange={(e) => { setSettore(e.target.value); setAperto(null); }} className="full-input">
          {SETTORI.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button type="button" className="btn-primary" onClick={() => setNuovoCiclo(bozzaCiclo())}>
          <Plus size={16} /> Nuovo ciclo
        </button>
      </div>

      {errore && <p className="file-error"><AlertTriangle size={13} /> {errore}</p>}

      {nuovoCiclo && (
        <>
          <h3 className="section-title">Nuovo ciclo</h3>
          {campoCiclo(nuovoCiclo, setNuovoCiclo)}
          <div className="row-form" style={{ marginBottom: 12 }}>
            <button className="btn-primary" onClick={() => salvaCiclo(nuovoCiclo)}><Check size={14} /> Salva il ciclo</button>
            <button type="button" className="link-btn" onClick={() => setNuovoCiclo(null)}>Annulla</button>
          </div>
        </>
      )}

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : cicli.length === 0 ? (
        <div className="empty"><p>Nessun ciclo per questo settore. Il primo si crea con "Nuovo ciclo".</p></div>
      ) : (
        <ul className="dish-list">
          {cicli.map((c) => {
            const espanso = aperto === c.id;
            const lista = righe[c.id] || [];
            const inModifica = cicloInModifica?.id === c.id;
            return (
              <li key={c.id} className="dish-row">
                <div className="dish-top">
                  <div>
                    <button type="button" className="link-btn" onClick={() => setAperto(espanso ? null : c.id)}>
                      {espanso ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <strong>{c.code} — {c.name}</strong>
                    <span className="lot-tag">{c.classification}</span>
                    {c.requires_flag && <span className="lot-tag">{etichettaFlag(c.requires_flag)}</span>}
                    <span className="lot-tag">{lista.length} righe</span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="icon-btn" onClick={() => setCicloInModifica({ ...c, flow: (c.flow || []).join("\n") })} aria-label="Modifica"><Pencil size={14} /></button>
                    <button className="icon-btn" onClick={() => eliminaCiclo(c)} aria-label="Elimina"><Trash2 size={14} /></button>
                  </div>
                </div>

                {inModifica && (
                  <>
                    {campoCiclo(cicloInModifica, setCicloInModifica)}
                    <div className="row-form">
                      <button className="btn-primary" onClick={() => salvaCiclo(cicloInModifica, c.id)}><Check size={14} /> Salva</button>
                      <button type="button" className="link-btn" onClick={() => setCicloInModifica(null)}><X size={13} /> Annulla</button>
                    </div>
                  </>
                )}

                {espanso && !inModifica && (
                  <>
                    {c.intro && <p className="pest-note">{c.intro}</p>}
                    {(c.flow || []).length > 0 && (
                      <p className="traccia-meta" style={{ fontSize: 12.5 }}>Flusso: {(c.flow || []).join("  →  ")}</p>
                    )}

                    {lista.map((r) => (
                      <div key={r.id} className="doc-viewer" style={{ padding: 10 }}>
                        {rigaInModifica?.id === r.id ? (
                          <>
                            {campoRiga(rigaInModifica, setRigaInModifica)}
                            <div className="row-form">
                              <button className="btn-primary" onClick={() => salvaRiga(rigaInModifica, c.id, r.id)}><Check size={14} /> Salva</button>
                              <button type="button" className="link-btn" onClick={() => setRigaInModifica(null)}><X size={13} /> Annulla</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="dish-top">
                              <div><strong>{r.phase}</strong>{r.requires_flag && <span className="lot-tag">{etichettaFlag(r.requires_flag)}</span>}</div>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className="icon-btn" onClick={() => setRigaInModifica(r)} aria-label="Modifica"><Pencil size={13} /></button>
                                <button className="icon-btn" onClick={() => eliminaRiga(r)} aria-label="Elimina"><Trash2 size={13} /></button>
                              </div>
                            </div>
                            <p className="pest-note"><em>Pericolo:</em> {r.hazard}</p>
                            <p className="pest-note"><em>Misura:</em> {r.control_measure}</p>
                            <p className="pest-note"><em>Monitoraggio:</em> {r.monitoring}</p>
                            <p className="pest-note"><em>Azione correttiva:</em> {r.corrective_action}</p>
                          </>
                        )}
                      </div>
                    ))}

                    {nuovaRiga?.cicloId === c.id ? (
                      <>
                        {campoRiga(nuovaRiga, (b) => setNuovaRiga({ ...b, cicloId: c.id }))}
                        <div className="row-form">
                          <button className="btn-primary" onClick={() => salvaRiga(nuovaRiga, c.id)}><Check size={14} /> Aggiungi la riga</button>
                          <button type="button" className="link-btn" onClick={() => setNuovaRiga(null)}><X size={13} /> Annulla</button>
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setNuovaRiga({ cicloId: c.id, requires_flag: "", sort_order: lista.length + 1 })}
                      >
                        <Plus size={13} /> Aggiungi una riga di analisi
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
