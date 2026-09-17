import React, { useState } from "react";
import { Plus, Trash2, Check, Printer, Info, AlertTriangle, Search, ChevronDown, ChevronRight } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";

// Preparazioni e cartellino (tracciabilità interna).
//
// L'OSA registra un piatto o un dolce preparato in azienda, collega i lotti
// delle materie prime che ha usato (arrivi di "Arrivo merci e tracciabilità")
// e stampa l'etichetta. La preparazione ha un lotto suo, generato
// dall'app: AAAAMMGG-NNN, con NNN progressivo della giornata.
//
// La tracciabilità interna non è un obbligo del Reg. CE 178/2002, che si ferma
// a un passo indietro e uno avanti; serve però a sapere, in caso di allerta su
// un lotto, quali preparazioni lo contenevano, senza buttare tutto. E se il
// prodotto viene preconfezionato per la vendita, l'etichetta è quella che il
// Reg. UE 1169/2011 chiede comunque (ingredienti e allergeni evidenziati).
//
// Le etichette degli allergeni sono le stesse di Allergeni.jsx e del catalogo
// prodotti in Tracciabilita.jsx: devono restare identiche parola per parola.
const ALLERGENI = ["Glutine", "Latte", "Uova", "Soia", "Frutta a guscio", "Pesce", "Crostacei", "Sedano", "Senape", "Solfiti", "Arachidi", "Sesamo", "Lupini", "Molluschi"];

const CONSERVAZIONE = [
  { id: "abbattuto", label: "Abbattuto" },
  { id: "pastorizzato", label: "Pastorizzato" },
  { id: "freezer", label: "Freezer -18/-22°C" },
  { id: "frigo", label: "Frigo 0/+4°C" },
  { id: "ambiente", label: "Temperatura ambiente" },
];
const etichettaConservazione = (id) => CONSERVAZIONE.find((c) => c.id === id)?.label || "";

const oggi = () => new Date().toISOString().slice(0, 10);
const oraAdesso = () => new Date().toTimeString().slice(0, 5);

function fmtData(iso) {
  if (!iso) return "";
  const [a, m, g] = iso.slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

function sommaGiorni(dataIso, giorni) {
  if (!dataIso || giorni === "" || isNaN(Number(giorni))) return "";
  const d = new Date(dataIso);
  d.setDate(d.getDate() + Number(giorni));
  return d.toISOString().slice(0, 10);
}

const cella = { font: "inherit", fontSize: 13.5, padding: "9px 10px", border: "1px solid #D8DED6", borderRadius: 8, background: "#fff", color: "#1B2A22", width: "100%", boxSizing: "border-box" };

// L'etichetta si apre in una finestra a parte e parte la stampa: così esce
// solo il cartellino, non la pagina dell'app. Da telefono la stessa finestra
// permette di salvarla come PDF o mandarla alla stampante.
function stampaEtichetta(p, righeIngredienti) {
  const tracce = (p.may_contain_traces || []).length
    ? `<div class="sez"><span class="et">PUÒ CONTENERE TRACCE DI</span><div class="alle">${p.may_contain_traces.join(" · ").toUpperCase()}</div></div>`
    : "";
  const allergeni = (p.allergens || []).length
    ? `<div class="sez"><span class="et">ALLERGENI</span><div class="alle">${p.allergens.join(" · ").toUpperCase()}</div></div>`
    : `<div class="sez"><span class="et">ALLERGENI</span><div class="nessuno">Nessun allergene dichiarato</div></div>`;
  const ingredienti = p.ingredients_text
    ? `<div class="sez"><span class="et">INGREDIENTI</span><div class="ing">${p.ingredients_text}</div></div>`
    : "";
  const formati = (p.formats || []).length
    ? `<div class="sez"><span class="et">FORMATI</span><div class="ing">${p.formats.map((f) => [f.nome, f.peso].filter(Boolean).join(" ")).join(" · ")}</div></div>`
    : "";
  const lotti = righeIngredienti.length
    ? `<div class="lotti"><span class="et">Materie prime tracciate (non obbligatorie in etichetta)</span><div>${righeIngredienti.join(" · ")}</div></div>`
    : "";

  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${p.product_name}</title><style>
    @page { margin: 10mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; padding: 6mm; }
    h1 { font-size: 30px; margin: 0 0 2px; }
    .et { font-size: 10px; letter-spacing: 1.2px; color: #333; display: block; }
    .scad { font-size: 46px; font-weight: bold; line-height: 1; margin-top: 2px; }
    .cons { font-size: 17px; margin-top: 2px; }
    hr { border: none; border-top: 2px solid #000; margin: 10px 0; }
    .riga { font-size: 16px; margin-bottom: 8px; }
    .riga b { font-size: 18px; }
    .sez { margin-bottom: 10px; }
    .ing { font-size: 15px; }
    .alle { font-size: 22px; font-weight: bold; letter-spacing: 0.5px; }
    .nessuno { font-size: 15px; }
    .lotti { margin-top: 14px; padding-top: 8px; border-top: 1px dashed #666; font-size: 11px; color: #333; }
  </style></head><body>
    <h1>${p.product_name}</h1>
    <span class="et">SCADENZA</span>
    <div class="scad">${fmtData(p.expiry_date) || "—"}</div>
    <div class="cons">${etichettaConservazione(p.storage_method)}</div>
    <hr>
    <div class="riga"><span class="et" style="display:inline">PROD.</span> <b>${fmtData(p.production_date)}${p.production_time ? " " + p.production_time.slice(0, 5) : ""}</b>
      &nbsp;&nbsp; <span class="et" style="display:inline">LOTTO</span> <b>${p.lot_number}</b></div>
    ${ingredienti}${formati}${allergeni}${tracce}${lotti}
  </body></html>`;

  const w = window.open("", "_blank", "width=480,height=700");
  if (!w) { window.alert("Il browser ha bloccato la finestra dell'etichetta: consenti le finestre pop-up per stampare."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export default function Preparazioni() {
  const { company, session } = useAuth();
  const { items: preparazioni, add, remove, reload, loading } = useTable("preparations", company?.id);
  const { items: collegamenti, reload: reloadCollegamenti } = useTable("preparation_ingredients", company?.id);
  const { items: arrivi } = useTable("traceability_records", company?.id);
  const { items: prodotti } = useTable("products", company?.id);

  const [apertoForm, setApertoForm] = useState(false);
  const [nome, setNome] = useState("");
  const [data, setData] = useState(oggi());
  const [ora, setOra] = useState(oraAdesso());
  const [conservazione, setConservazione] = useState("frigo");
  const [giorni, setGiorni] = useState("");
  const [ingredienti, setIngredienti] = useState("");
  const [formati, setFormati] = useState([]);
  const [lottiScelti, setLottiScelti] = useState([]);
  const [allergeni, setAllergeni] = useState([]);
  const [tracce, setTracce] = useState([]);
  const [note, setNote] = useState("");
  const [cercaLotto, setCercaLotto] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [apertaScheda, setApertaScheda] = useState(null);

  const nomeProdotto = (id) => prodotti.find((p) => p.id === id)?.name || "Prodotto";
  const arrivoLabel = (a) => `${nomeProdotto(a.product_id)} — ${a.lot_number ? "lotto " + a.lot_number : "senza lotto"} (${a.supplier_name}, ${fmtData(a.received_date)})`;

  const scadenza = sommaGiorni(data, giorni);

  // Il lotto della preparazione: data + progressivo della giornata.
  const lottoProposto = (() => {
    const prefisso = (data || oggi()).replaceAll("-", "");
    const delGiorno = preparazioni.filter((p) => p.production_date === data).length;
    return `${prefisso}-${String(delGiorno + 1).padStart(3, "0")}`;
  })();

  // Gli arrivi più recenti in cima: sono quelli che l'OSA ha in mano.
  const arriviOrdinati = [...arrivi].sort((a, b) => (a.received_date < b.received_date ? 1 : -1));
  const arriviFiltrati = arriviOrdinati.filter((a) => {
    const t = (cercaLotto || "").trim().toLowerCase();
    if (!t) return true;
    return `${nomeProdotto(a.product_id)} ${a.lot_number || ""} ${a.supplier_name}`.toLowerCase().includes(t);
  });

  // Spuntando un lotto, gli allergeni del suo prodotto entrano nella lista
  // proposta. Restano modificabili: l'app propone, l'OSA decide.
  const cambiaLotto = (arrivo) => {
    const giaScelto = lottiScelti.includes(arrivo.id);
    setLottiScelti(giaScelto ? lottiScelti.filter((x) => x !== arrivo.id) : [...lottiScelti, arrivo.id]);
    if (!giaScelto) {
      const prodotto = prodotti.find((p) => p.id === arrivo.product_id);
      if (prodotto) setAllergeni((a) => [...new Set([...a, ...(prodotto.allergens || [])])]);
    }
  };

  const daValutare = lottiScelti
    .map((id) => arrivi.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => prodotti.find((p) => p.id === a.product_id))
    .filter((p) => p && !p.allergens_checked_at);

  const azzera = () => {
    setNome(""); setData(oggi()); setOra(oraAdesso()); setConservazione("frigo"); setGiorni("");
    setIngredienti(""); setFormati([]); setLottiScelti([]); setAllergeni([]); setTracce([]); setNote("");
    setCercaLotto(""); setErrore(""); setApertoForm(false);
  };

  const salva = async () => {
    if (!nome.trim()) { setErrore("Manca il nome della preparazione."); return; }
    setBusy(true); setErrore("");
    try {
      const riga = await add({
        product_name: nome,
        production_date: data || oggi(),
        production_time: ora || null,
        lot_number: lottoProposto,
        shelf_life_days: giorni === "" ? null : Number(giorni),
        expiry_date: scadenza || null,
        storage_method: conservazione,
        ingredients_text: ingredienti || null,
        formats: formati.filter((f) => f.nome || f.peso).length ? formati.filter((f) => f.nome || f.peso) : null,
        allergens: allergeni,
        may_contain_traces: tracce,
        notes: note || null,
        created_by: session?.user?.id || null,
      });
      if (!riga) throw new Error("salvataggio non riuscito");
      if (lottiScelti.length) {
        const { error } = await supabase.from("preparation_ingredients").insert(
          lottiScelti.map((idArrivo) => ({ company_id: company.id, preparation_id: riga.id, traceability_record_id: idArrivo }))
        );
        if (error) throw error;
        await reloadCollegamenti();
      }
      await reload();
      azzera();
    } catch (err) {
      setErrore("Errore durante il salvataggio: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const elimina = async (p) => {
    if (!window.confirm(`Eliminare la preparazione "${p.product_name}" del ${fmtData(p.production_date)}?`)) return;
    await remove(p.id); // i collegamenti spariscono da soli (on delete cascade)
    await reloadCollegamenti();
  };

  const lottiDi = (preparazione) => collegamenti
    .filter((c) => c.preparation_id === preparazione.id)
    .map((c) => arrivi.find((a) => a.id === c.traceability_record_id))
    .filter(Boolean);

  const chip = (lista, valore, set) => (
    <button type="button" key={valore} className={"chip" + (lista.includes(valore) ? " chip-on" : "")}
      onClick={() => set(lista.includes(valore) ? lista.filter((x) => x !== valore) : [...lista, valore])}>
      {valore}
    </button>
  );

  const ordinate = [...preparazioni].sort((a, b) => (a.production_date < b.production_date ? 1 : -1));

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Preparazioni ed etichette</h2>
          <p className="sub">Registra un piatto preparato in azienda, collega i lotti delle materie prime usate e stampa il cartellino.</p>
        </div>
        {!apertoForm && (
          <button type="button" className="btn-primary" onClick={() => { setApertoForm(true); setData(oggi()); setOra(oraAdesso()); }}>
            <Plus size={16} /> Nuova preparazione
          </button>
        )}
      </div>

      {apertoForm && (
        <div className="traccia-form">
          <input style={cella} list="piatti-usati" placeholder="Nome della preparazione (es. Tiramisù)" value={nome} onChange={(e) => setNome(e.target.value)} />
          <datalist id="piatti-usati">
            {[...new Set(preparazioni.map((p) => p.product_name))].map((n) => <option key={n} value={n} />)}
          </datalist>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label className="field-label">Data di produzione<input style={{ ...cella, width: 160 }} type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
            <label className="field-label">Ora<input style={{ ...cella, width: 110 }} type="time" value={ora} onChange={(e) => setOra(e.target.value)} /></label>
            <label className="field-label">Lotto (generato)<input style={{ ...cella, width: 150, background: "#F1F4F0" }} value={lottoProposto} readOnly /></label>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="field-label">Conservazione
              <select style={{ ...cella, width: 200 }} value={conservazione} onChange={(e) => setConservazione(e.target.value)}>
                {CONSERVAZIONE.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="field-label">Scadenza (giorni)<input style={{ ...cella, width: 110 }} inputMode="numeric" value={giorni} onChange={(e) => setGiorni(e.target.value)} /></label>
            <span className="sub" style={{ paddingBottom: 10 }}>{scadenza ? `Scade il ${fmtData(scadenza)}` : "Scadenza non calcolata"}</span>
          </div>

          <label className="field-label">Ingredienti (in ordine di peso, come vanno in etichetta)
            <textarea style={{ ...cella, minHeight: 70 }} placeholder="Es. Latte, uova, mascarpone, zucchero, caffè…" value={ingredienti} onChange={(e) => setIngredienti(e.target.value)} />
          </label>

          <div>
            <div className="sub" style={{ marginBottom: 6 }}>Formati e pezzi (facoltativo)</div>
            {formati.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input style={cella} placeholder="Formato (es. Monoporzione)" value={f.nome} onChange={(e) => setFormati(formati.map((x, k) => k === i ? { ...x, nome: e.target.value } : x))} />
                <input style={{ ...cella, width: 130 }} placeholder="Peso/pezzi" value={f.peso} onChange={(e) => setFormati(formati.map((x, k) => k === i ? { ...x, peso: e.target.value } : x))} />
                <button type="button" className="icon-btn" onClick={() => setFormati(formati.filter((_, k) => k !== i))}><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" className="icon-btn" style={{ color: "#2F6F4E", fontSize: 13, gap: 4 }} onClick={() => setFormati([...formati, { nome: "", peso: "" }])}>
              <Plus size={14} /> Aggiungi formato
            </button>
          </div>

          <div>
            <div className="sub" style={{ marginBottom: 6 }}>Materie prime tracciate — spunta i lotti che hai usato</div>
            {arrivi.length === 0 ? (
              <p className="range-hint">Nessun arrivo merci registrato: puoi comunque salvare la preparazione e collegare i lotti più avanti.</p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Search size={14} color="#6E7C73" />
                  <input style={cella} placeholder="Cerca prodotto, lotto o fornitore…" value={cercaLotto} onChange={(e) => setCercaLotto(e.target.value)} />
                </div>
                <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #E1E5DF", borderRadius: 8, padding: 8, background: "#fff" }}>
                  {arriviFiltrati.slice(0, 80).map((a) => (
                    <label key={a.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 2px", fontSize: 13 }}>
                      <input type="checkbox" checked={lottiScelti.includes(a.id)} onChange={() => cambiaLotto(a)} style={{ marginTop: 3 }} />
                      <span>{arrivoLabel(a)}</span>
                    </label>
                  ))}
                  {arriviFiltrati.length === 0 && <span className="none-label">Nessun arrivo trovato.</span>}
                </div>
              </>
            )}
          </div>

          <div>
            <div className="sub" style={{ marginBottom: 6 }}>Allergeni presenti (proposti dai lotti collegati, correggibili)</div>
            <div className="chip-grid">{ALLERGENI.map((a) => chip(allergeni, a, setAllergeni))}</div>
          </div>

          <div>
            <div className="sub" style={{ marginBottom: 6 }}>Può contenere tracce di… (contaminazione crociata in laboratorio)</div>
            <div className="chip-grid">{ALLERGENI.map((a) => chip(tracce, a, setTracce))}</div>
          </div>

          {daValutare.length > 0 && (
            <span className="file-error" style={{ color: "#8A5A00" }}>
              <AlertTriangle size={13} /> Allergeni non ancora valutati per: {[...new Set(daValutare.map((p) => p.name))].join(", ")}. Controllali nel Catalogo prodotti.
            </span>
          )}

          <input style={cella} placeholder="Note (facoltative)" value={note} onChange={(e) => setNote(e.target.value)} />

          {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-primary" disabled={busy} onClick={salva}><Check size={16} /> {busy ? "Salvataggio…" : "Salva preparazione"}</button>
            <button type="button" className="btn-primary" style={{ background: "#fff", color: "#6E7C73", border: "1px solid #D8DED6" }} onClick={azzera}>Annulla</button>
          </div>
        </div>
      )}

      {!apertoForm && (
        <p className="login-info" style={{ margin: "16px 0" }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          L'etichetta riporta scadenza, conservazione, lotto del prodotto finito, ingredienti e allergeni. I lotti delle materie prime restano registrati qui: servono in caso di allerta, non vanno stampati.
        </p>
      )}

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : ordinate.length === 0 ? (
        <div className="empty"><p>Nessuna preparazione registrata.</p></div>
      ) : (
        <ul className="dish-list">
          {ordinate.map((p) => {
            const lotti = lottiDi(p);
            const aperta = apertaScheda === p.id;
            return (
              <li key={p.id} className="dish-row">
                <div className="dish-top">
                  <div style={{ minWidth: 0 }}>
                    <strong>{p.product_name}</strong>
                    <span className="lot-tag">Lotto {p.lot_number}</span>
                  </div>
                  <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <button className="icon-btn icon-btn-ok" title="Stampa etichetta" onClick={() => stampaEtichetta(p, lotti.map((a) => `${nomeProdotto(a.product_id)} ${a.lot_number || "senza lotto"}`))}><Printer size={15} /></button>
                    <button className="icon-btn" title="Elimina" onClick={() => elimina(p)}><Trash2 size={14} /></button>
                  </span>
                </div>
                <div className="traccia-meta">
                  <span className="doc-type-tag">Prodotto il {fmtData(p.production_date)}{p.production_time ? ` alle ${p.production_time.slice(0, 5)}` : ""}</span>
                  {p.expiry_date && <span className="doc-type-tag">Scade il {fmtData(p.expiry_date)}</span>}
                  <span className="doc-type-tag">{etichettaConservazione(p.storage_method)}</span>
                </div>
                {(p.allergens || []).length > 0 ? (
                  <div className="chip-grid">{p.allergens.map((a) => <span key={a} className="chip chip-static">{a}</span>)}</div>
                ) : (
                  <span className="none-label">Nessun allergene dichiarato</span>
                )}
                <button type="button" className="icon-btn" style={{ color: "#2F6F4E", fontSize: 13, gap: 4, marginTop: 6 }} onClick={() => setApertaScheda(aperta ? null : p.id)}>
                  {aperta ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {lotti.length} {lotti.length === 1 ? "lotto collegato" : "lotti collegati"}
                </button>
                {aperta && (
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {p.ingredients_text && <div style={{ marginBottom: 6 }}><span className="sub">Ingredienti: </span>{p.ingredients_text}</div>}
                    {(p.may_contain_traces || []).length > 0 && <div style={{ marginBottom: 6 }}><span className="sub">Tracce di: </span>{p.may_contain_traces.join(", ")}</div>}
                    {lotti.length === 0 ? (
                      <span className="none-label">Nessuna materia prima collegata.</span>
                    ) : (
                      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {lotti.map((a) => <li key={a.id} style={{ padding: "3px 0" }}>{arrivoLabel(a)}</li>)}
                      </ul>
                    )}
                    {p.notes && <div style={{ marginTop: 6 }}><span className="sub">Note: </span>{p.notes}</div>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
