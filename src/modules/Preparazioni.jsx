import React, { useState } from "react";
import { Plus, Trash2, Check, Printer, Info, AlertTriangle, Search, ChevronDown, ChevronRight, BookOpen, Pencil, X } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import { stampaHtml } from "../utils/etichetta";

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

// L'etichetta si manda in stampa da sola: esce solo il cartellino, non la
// pagina dell'app. Da telefono la stessa finestra di stampa permette di
// salvarla come PDF o di mandarla alla stampante.
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

  // Si stampa da un iframe nascosto e non da una finestra nuova: window.open
  // lo bloccano i browser quando la stampa non parte da un click diretto, e
  // su iPhone lasciava aperta una scheda vuota da chiudere a mano. Il
  // meccanismo sta in utils/etichetta.js, lo stesso usato dalle etichette
  // dell'abbattimento e del congelamento.
  stampaHtml(html);
}

// Il catalogo delle ricette.
//
// Le stesse cose si rifanno ogni settimana, e riscrivere ogni volta a mano
// ingredienti, allergeni e giorni di scadenza significa prima o poi scriverli
// in due modi diversi: lo stesso dolce con due elenchi di allergeni e' un
// errore che si scopre in ispezione, non prima.
//
// Quello che la ricetta NON porta e' deliberato: quantita', operatore e lotti
// usati cambiano a ogni lavorazione, e nessuno puo' saperli al posto di chi ha
// impastato. I prodotti collegati servono a filtrare l'elenco dei lotti, mai a
// spuntarli.
function CatalogoRicette({ companyId, prodotti, ricette, prodottiRicetta, onCambiato }) {
  const [aperto, setAperto] = useState(false);
  const [modifica, setModifica] = useState(null);   // id in modifica, o "nuova"
  const [nome, setNome] = useState("");
  const [ingredienti, setIngredienti] = useState("");
  const [allergeni, setAllergeni] = useState([]);
  const [tracce, setTracce] = useState([]);
  const [conservazione, setConservazione] = useState("frigo");
  const [giorni, setGiorni] = useState("");
  const [scelti, setScelti] = useState([]);
  const [cerca, setCerca] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  const prodottiDi = (idRicetta) => prodottiRicetta
    .filter((x) => x.recipe_id === idRicetta)
    .map((x) => prodotti.find((p) => p.id === x.product_id))
    .filter(Boolean);

  const chiudi = () => {
    setModifica(null); setNome(""); setIngredienti(""); setAllergeni([]); setTracce([]);
    setConservazione("frigo"); setGiorni(""); setScelti([]); setCerca(""); setErrore("");
  };

  const apriNuova = () => {
    chiudi(); setModifica("nuova");
  };

  const apriModifica = (r) => {
    setModifica(r.id);
    setNome(r.name || "");
    setIngredienti(r.ingredients_text || "");
    setAllergeni(r.allergens || []);
    setTracce(r.may_contain_traces || []);
    setConservazione(r.storage_method || "frigo");
    setGiorni(r.shelf_life_days == null ? "" : String(r.shelf_life_days));
    setScelti(prodottiDi(r.id).map((p) => p.id));
    setCerca(""); setErrore("");
  };

  const salva = async () => {
    if (!nome.trim()) { setErrore("Manca il nome della ricetta."); return; }
    setBusy(true); setErrore("");
    try {
      const dati = {
        company_id: companyId,
        name: nome.trim(),
        ingredients_text: ingredienti.trim() || null,
        allergens: allergeni,
        may_contain_traces: tracce,
        storage_method: conservazione,
        shelf_life_days: giorni === "" ? null : Number(giorni),
      };
      let idRicetta = modifica;
      if (modifica === "nuova") {
        const { data, error } = await supabase.from("preparation_recipes").insert(dati).select().single();
        if (error) throw error;
        idRicetta = data.id;
      } else {
        const { error } = await supabase.from("preparation_recipes").update(dati).eq("id", modifica);
        if (error) throw error;
        // I prodotti si riscrivono da capo: e' un elenco corto e sostituirlo
        // intero evita di ragionare su cosa e' stato tolto e cosa aggiunto.
        const via = await supabase.from("recipe_products").delete().eq("recipe_id", modifica);
        if (via.error) throw via.error;
      }
      if (scelti.length) {
        const { error } = await supabase.from("recipe_products").insert(
          scelti.map((idProdotto) => ({ company_id: companyId, recipe_id: idRicetta, product_id: idProdotto }))
        );
        if (error) throw error;
      }
      await onCambiato();
      chiudi();
    } catch (err) {
      setErrore(/duplicate|unique/i.test(err.message || "")
        ? "Esiste gia' una ricetta con questo nome."
        : "Salvataggio non riuscito: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const elimina = async (r) => {
    setErrore("");
    const { error } = await supabase.from("preparation_recipes").delete().eq("id", r.id);
    if (error) { setErrore("Eliminazione non riuscita: " + error.message); return; }
    await onCambiato();
  };

  const chip = (lista, valore, set) => (
    <button type="button" key={valore} className={"chip" + (lista.includes(valore) ? " chip-on" : "")}
      onClick={() => set(lista.includes(valore) ? lista.filter((x) => x !== valore) : [...lista, valore])}>
      {valore}
    </button>
  );

  const prodottiFiltrati = prodotti.filter((p) =>
    !cerca.trim() || (p.name || "").toLowerCase().includes(cerca.trim().toLowerCase()));

  return (
    <div style={{ marginTop: 18, borderTop: "1px solid #E1E5DF", paddingTop: 14 }}>
      <button type="button" className="icon-btn" style={{ color: "#2F6F4E", fontSize: 14, gap: 6 }}
        onClick={() => setAperto(!aperto)}>
        {aperto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <BookOpen size={15} /> Ricette ({ricette.length})
      </button>

      {aperto && (
        <div style={{ marginTop: 10 }}>
          <p className="sub" style={{ margin: "0 0 10px" }}>
            Le cose che si rifanno uguali: ingredienti, allergeni, conservazione e giorni di
            scadenza scritti una volta sola. Quantità, operatore e lotti restano da indicare a ogni
            lavorazione, perché cambiano ogni volta.
          </p>

          {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}

          {modifica === null ? (
            <button type="button" className="btn-primary" onClick={apriNuova}>
              <Plus size={15} /> Nuova ricetta
            </button>
          ) : (
            <div className="traccia-form">
              <input style={cella} placeholder="Nome della ricetta (es. Besciamella base)"
                value={nome} onChange={(e) => setNome(e.target.value)} />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label className="field-label">Conservazione
                  <select style={{ ...cella, width: 200 }} value={conservazione} onChange={(e) => setConservazione(e.target.value)}>
                    {CONSERVAZIONE.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <label className="field-label">Scadenza (giorni)
                  <input style={{ ...cella, width: 110 }} inputMode="numeric"
                    value={giorni} onChange={(e) => setGiorni(e.target.value)} />
                </label>
              </div>

              <label className="field-label">Ingredienti (in ordine di peso, come vanno in etichetta)
                <textarea style={{ ...cella, minHeight: 64 }} value={ingredienti}
                  onChange={(e) => setIngredienti(e.target.value)} />
              </label>

              <div>
                <div className="sub" style={{ marginBottom: 6 }}>Allergeni presenti</div>
                <div className="chip-grid">{ALLERGENI.map((a) => chip(allergeni, a, setAllergeni))}</div>
              </div>

              <div>
                <div className="sub" style={{ marginBottom: 6 }}>Può contenere tracce di…</div>
                <div className="chip-grid">{ALLERGENI.map((a) => chip(tracce, a, setTracce))}</div>
              </div>

              <div>
                <div className="sub" style={{ marginBottom: 6 }}>
                  Materie prime della ricetta — servono a filtrare i lotti al momento della
                  lavorazione, non vengono spuntate da sole
                </div>
                {prodotti.length === 0 ? (
                  <p className="range-hint">Nessun prodotto nel catalogo: si riempie da Arrivo merci.</p>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <Search size={14} color="#6E7C73" />
                      <input style={cella} placeholder="Cerca un prodotto…" value={cerca}
                        onChange={(e) => setCerca(e.target.value)} />
                    </div>
                    <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #E1E5DF", borderRadius: 8, padding: 8, background: "#fff" }}>
                      {prodottiFiltrati.slice(0, 80).map((p) => (
                        <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 2px", fontSize: 13 }}>
                          <input type="checkbox" checked={scelti.includes(p.id)} style={{ marginTop: 3 }}
                            onChange={() => setScelti(scelti.includes(p.id)
                              ? scelti.filter((x) => x !== p.id)
                              : [...scelti, p.id])} />
                          <span>{p.name}</span>
                        </label>
                      ))}
                      {prodottiFiltrati.length === 0 && <span className="none-label">Nessun prodotto trovato.</span>}
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn-primary" disabled={busy} onClick={salva}>
                  <Check size={15} /> {busy ? "Salvataggio…" : "Salva la ricetta"}
                </button>
                <button type="button" className="icon-btn" style={{ color: "#6E7C73", fontSize: 13, gap: 4 }} onClick={chiudi}>
                  <X size={14} /> Annulla
                </button>
              </div>
            </div>
          )}

          {ricette.length === 0 ? (
            <p className="none-label" style={{ display: "block", marginTop: 10 }}>Nessuna ricetta in catalogo.</p>
          ) : (
            <ul className="dish-list" style={{ marginTop: 10 }}>
              {ricette.map((r) => (
                <li key={r.id} className="dish-row">
                  <div className="dish-top" style={{ marginBottom: 4 }}>
                    <strong>{r.name}</strong>
                    <span style={{ display: "flex", gap: 2 }}>
                      <button className="icon-btn" title="Modifica" onClick={() => apriModifica(r)}><Pencil size={14} /></button>
                      <button className="icon-btn" title="Elimina" onClick={() => elimina(r)}><Trash2 size={14} /></button>
                    </span>
                  </div>
                  <div className="traccia-meta">
                    <span className="doc-type-tag">{etichettaConservazione(r.storage_method) || "conservazione non indicata"}</span>
                    {r.shelf_life_days != null && <span className="doc-type-tag">{r.shelf_life_days} giorni</span>}
                    {prodottiDi(r.id).length > 0 && (
                      <span className="doc-type-tag">{prodottiDi(r.id).length} materie prime</span>
                    )}
                  </div>
                  {(r.allergens || []).length > 0 && (
                    <div className="chip-grid">{r.allergens.map((a) => <span key={a} className="chip chip-static">{a}</span>)}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function Preparazioni() {
  const { company, session } = useAuth();
  const { items: preparazioni, add, remove, reload, loading } = useTable("preparations", company?.id);
  const { items: collegamenti, reload: reloadCollegamenti } = useTable("preparation_ingredients", company?.id);
  const { items: arrivi } = useTable("traceability_records", company?.id);
  const { items: prodotti } = useTable("products", company?.id);
  const { items: ricette, reload: reloadRicette } = useTable("preparation_recipes", company?.id);
  const { items: prodottiRicetta, reload: reloadProdottiRicetta } = useTable("recipe_products", company?.id);

  const [apertoForm, setApertoForm] = useState(false);
  const [nome, setNome] = useState("");
  const [data, setData] = useState(oggi());
  const [ora, setOra] = useState(oraAdesso());
  const [conservazione, setConservazione] = useState("frigo");
  const [giorni, setGiorni] = useState("");
  const [ingredienti, setIngredienti] = useState("");
  const [formati, setFormati] = useState([]);
  const [lottiScelti, setLottiScelti] = useState([]);
  // I semilavorati: altre preparazioni gia' registrate che entrano in questa.
  // E' il pezzo che tiene insieme la catena — besciamella dentro l'arancino —
  // e senza il quale dal prodotto finito si risale alle materie prime solo a
  // memoria.
  const [semilavorati, setSemilavorati] = useState([]);
  const [quantitaKg, setQuantitaKg] = useState("");
  const [pezzi, setPezzi] = useState("");
  const [operatore, setOperatore] = useState("");
  // La ricetta da cui si parte: riempie il modulo e restringe l'elenco dei
  // lotti alle sue materie prime. Resta registrata sulla preparazione, cosi'
  // dopo si sa quante volte una ricetta e' stata lavorata.
  const [ricettaId, setRicettaId] = useState("");
  const [tuttiILotti, setTuttiILotti] = useState(false);
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

  // Sta QUI, sopra arriviFiltrati, e non accanto ad applicaRicetta: il filtro\n  // lo legge mentre la pagina si disegna, e una costante usata prima di essere\n  // dichiarata non e' un dettaglio di stile — e' la pagina bianca.\n  // I prodotti della ricetta scelta: restringono l'elenco dei lotti a quelli
  // che c'entrano, senza nascondere la possibilita' di vedere tutto — in
  // laboratorio capita di sostituire un ingrediente, e un elenco che nasconde
  // quello che e' stato usato davvero fa scrivere il falso.
  const prodottiDellaRicetta = ricettaId
    ? prodottiRicetta.filter((x) => x.recipe_id === ricettaId).map((x) => x.product_id)
    : [];

  // Gli arrivi più recenti in cima: sono quelli che l'OSA ha in mano.
  const arriviOrdinati = [...arrivi].sort((a, b) => (a.received_date < b.received_date ? 1 : -1));

  // Quali lotti hanno senso oggi.
  //
  // Un registro degli arrivi cresce per anni; l'elenco da cui si spuntano i
  // lotti usati deve contenere quello che c'è in casa adesso. Tre esclusioni,
  // in ordine di certezza: dichiarato esaurito (lo sa l'OSA), scaduto (lo dice
  // la data), superato da arrivi più recenti dello stesso prodotto (lo
  // suggerisce il buon senso: comprato lo zucchero lotto 03, il 01 è finito).
  //
  // L'ultima è una supposizione, non un fatto, e per questo non nasconde
  // niente per sempre: restano la ricerca per numero di lotto e "mostra tutti
  // i lotti". Se in laboratorio tengono aperti tre lotti di farina insieme,
  // IN_USO_PER_PRODOTTO è il numero da alzare.
  const IN_USO_PER_PRODOTTO = 2;
  const recentiPerProdotto = (() => {
    const visti = {};
    const dentro = new Set();
    arriviOrdinati.forEach((a) => {
      const k = a.product_id || "senza-prodotto";
      visti[k] = (visti[k] || 0) + 1;
      if (visti[k] <= IN_USO_PER_PRODOTTO) dentro.add(a.id);
    });
    return dentro;
  })();

  const lottoInUso = (a) => {
    if (a.exhausted_at) return false;
    if (a.expiry_date && a.expiry_date < oggi()) return false;
    return recentiPerProdotto.has(a.id);
  };

  const nascosti = arriviOrdinati.filter((a) => !lottoInUso(a)).length;
  const arriviFiltrati = arriviOrdinati.filter((a) => {
    // Un lotto gia' spuntato resta sempre visibile: nasconderlo lo lascerebbe
    // collegato senza che si veda, ed e' il modo piu' rapido per scrivere in un
    // registro una materia prima che nessuno ha piu' davanti agli occhi.
    const scelto = lottiScelti.includes(a.id);
    if (!tuttiILotti && !scelto && !lottoInUso(a)) return false;
    if (prodottiDellaRicetta.length && !tuttiILotti && !scelto
        && !prodottiDellaRicetta.includes(a.product_id)) return false;
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

  // Gli ingredienti composti (Nutella, maionese, preparati) vanno dichiarati con
  // i loro ingredienti fra parentesi: se sul prodotto è stata letta l'etichetta,
  // la dicitura si compone da sola e poi si corregge a mano.
  const componibili = lottiScelti
    .map((id) => arrivi.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => prodotti.find((p) => p.id === a.product_id))
    .filter(Boolean)
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);

  const componiIngredienti = () => {
    const pezzi = componibili.map((p) => p.ingredients_text ? `${p.name} (${p.ingredients_text})` : p.name);
    setIngredienti(pezzi.join(", "));
  };

  const daValutare = lottiScelti
    .map((id) => arrivi.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => prodotti.find((p) => p.id === a.product_id))
    .filter((p) => p && !p.allergens_checked_at);

  // Scegliere una ricetta riempie i campi che non cambiano. Non tocca
  // quantita', operatore e lotti: quelli li sa solo chi ha lavorato.
  const applicaRicetta = (id) => {
    setRicettaId(id);
    setTuttiILotti(false);
    const r = ricette.find((x) => x.id === id);
    if (!r) return;
    setNome(r.name || "");
    setIngredienti(r.ingredients_text || "");
    setAllergeni(r.allergens || []);
    setTracce(r.may_contain_traces || []);
    if (r.storage_method) setConservazione(r.storage_method);
    setGiorni(r.shelf_life_days == null ? "" : String(r.shelf_life_days));
  };

  const azzera = () => {
    setNome(""); setData(oggi()); setOra(oraAdesso()); setConservazione("frigo"); setGiorni("");
    setIngredienti(""); setFormati([]); setLottiScelti([]); setSemilavorati([]); setAllergeni([]); setTracce([]); setNote("");
    setQuantitaKg(""); setPezzi(""); setOperatore(""); setRicettaId(""); setTuttiILotti(false);
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
        quantity_kg: quantitaKg === "" ? null : Number(String(quantitaKg).replace(",", ".")),
        quantity_pieces: pezzi === "" ? null : Number(pezzi),
        operator_name: operatore.trim() || null,
        recipe_id: ricettaId || null,
        created_by: session?.user?.id || null,
      });
      if (!riga) throw new Error("salvataggio non riuscito");
      // Una riga per ogni origine: l'arrivo merci porta traceability_record_id,
      // il semilavorato porta source_preparation_id. Mai tutti e due, e il
      // vincolo sta nel database.
      const righeOrigine = [
        ...lottiScelti.map((idArrivo) => ({
          company_id: company.id, preparation_id: riga.id,
          traceability_record_id: idArrivo, source_preparation_id: null,
        })),
        ...semilavorati.map((idPrep) => ({
          company_id: company.id, preparation_id: riga.id,
          traceability_record_id: null, source_preparation_id: idPrep,
        })),
      ];
      if (righeOrigine.length) {
        const { error } = await supabase.from("preparation_ingredients").insert(righeOrigine);
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
    const dove = dentroA(p);
    if (dove.length) {
      setErrore(
        `"${p.product_name}" lotto ${p.lot_number} e' usata come semilavorato in: ` +
        dove.map((x) => `${x.product_name} lotto ${x.lot_number}`).join(", ") +
        ". Cancellarla spezzerebbe la catena: togli prima quelle preparazioni, o lasciala dov'e'.");
      return;
    }
    if (!window.confirm(`Eliminare la preparazione "${p.product_name}" del ${fmtData(p.production_date)}?`)) return;
    await remove(p.id); // i collegamenti spariscono da soli (on delete cascade)
    await reloadCollegamenti();
  };

  const lottiDi = (preparazione) => collegamenti
    .filter((c) => c.preparation_id === preparazione.id && c.traceability_record_id)
    .map((c) => arrivi.find((a) => a.id === c.traceability_record_id))
    .filter(Boolean);

  const semilavoratiDi = (preparazione) => collegamenti
    .filter((c) => c.preparation_id === preparazione.id && c.source_preparation_id)
    .map((c) => preparazioni.find((p) => p.id === c.source_preparation_id))
    .filter(Boolean);

  // Dove finisce questa preparazione: serve prima di cancellarla, e serve a
  // chi deve risalire la catena nell'altro verso durante un'allerta.
  const dentroA = (preparazione) => collegamenti
    .filter((c) => c.source_preparation_id === preparazione.id)
    .map((c) => preparazioni.find((p) => p.id === c.preparation_id))
    .filter(Boolean);

  const prepLabel = (p) => `${p.product_name} — lotto ${p.lot_number} (${fmtData(p.production_date)})`;

  // Si propongono come semilavorati solo le preparazioni ancora in vita: una
  // besciamella scaduta la settimana scorsa dentro l'impasto di oggi e' quasi
  // sempre un errore di battitura, non una lavorazione.
  const semilavorabili = [...preparazioni]
    .filter((p) => !p.expiry_date || p.expiry_date >= oggi())
    .sort((a, b) => (a.production_date < b.production_date ? 1 : -1));

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
          <button type="button" className="btn-primary" onClick={() => { setErrore(""); setApertoForm(true); setData(oggi()); setOra(oraAdesso()); }}>
            <Plus size={16} /> Nuova preparazione
          </button>
        )}
      </div>

      {apertoForm && (
        <div className="traccia-form">
          {ricette.length > 0 && (
            <label className="field-label">Parti da una ricetta (facoltativo)
              <select style={cella} value={ricettaId} onChange={(e) => applicaRicetta(e.target.value)}>
                <option value="">— nessuna ricetta —</option>
                {ricette.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          )}

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

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label className="field-label">Quantità prodotta (kg)
              <input style={{ ...cella, width: 130 }} inputMode="decimal" placeholder="es. 4,5"
                value={quantitaKg} onChange={(e) => setQuantitaKg(e.target.value)} />
            </label>
            <label className="field-label">Numero pezzi
              <input style={{ ...cella, width: 120 }} inputMode="numeric" placeholder="es. 60"
                value={pezzi} onChange={(e) => setPezzi(e.target.value)} />
            </label>
            <label className="field-label">Operatore
              <input style={{ ...cella, width: 200 }} list="operatori-usati" placeholder="Chi ha lavorato"
                value={operatore} onChange={(e) => setOperatore(e.target.value)} />
            </label>
            <datalist id="operatori-usati">
              {[...new Set(preparazioni.map((p) => p.operator_name).filter(Boolean))].map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>

          <label className="field-label">Ingredienti (in ordine di peso, come vanno in etichetta)
            <textarea style={{ ...cella, minHeight: 70 }} placeholder="Es. Latte, uova, mascarpone, zucchero, caffè…" value={ingredienti} onChange={(e) => setIngredienti(e.target.value)} />
          </label>
          {componibili.length > 0 && (
            <div>
              <button type="button" className="icon-btn" style={{ color: "#2F6F4E", fontSize: 13, gap: 4 }} onClick={componiIngredienti}>
                <Plus size={14} /> Componi dai prodotti collegati ({componibili.length})
              </button>
              <div className="sub">
                Scrive i prodotti collegati e, per quelli composti, i loro ingredienti fra parentesi — come chiede il Reg. UE 1169/2011. Poi riordina e correggi a mano.
              </div>
            </div>
          )}

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
            <div className="sub" style={{ marginBottom: 6 }}>
              Materie prime tracciate — spunta i lotti che hai usato
              {!tuttiILotti && (prodottiDellaRicetta.length > 0 || nascosti > 0) && (
                <>
                  {" · "}
                  <button type="button" className="icon-btn" style={{ color: "#2F6F4E", fontSize: 13 }}
                    onClick={() => setTuttiILotti(true)}>
                    mostra tutti i lotti{nascosti > 0 ? ` (${nascosti} nascosti)` : ""}
                  </button>
                </>
              )}
              {tuttiILotti && (
                <>
                  {" · "}
                  <button type="button" className="icon-btn" style={{ color: "#2F6F4E", fontSize: 13 }}
                    onClick={() => setTuttiILotti(false)}>
                    mostra solo quelli in uso
                  </button>
                </>
              )}
            </div>
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
            <div className="sub" style={{ marginBottom: 6 }}>
              Semilavorati usati — altre preparazioni che entrano in questa
            </div>
            {semilavorabili.length === 0 ? (
              <p className="range-hint">
                Nessuna preparazione in corso di validità da usare come semilavorato.
              </p>
            ) : (
              <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #E1E5DF", borderRadius: 8, padding: 8, background: "#fff" }}>
                {semilavorabili.slice(0, 60).map((p) => (
                  <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 2px", fontSize: 13 }}>
                    <input type="checkbox" checked={semilavorati.includes(p.id)} style={{ marginTop: 3 }}
                      onChange={() => setSemilavorati(semilavorati.includes(p.id)
                        ? semilavorati.filter((x) => x !== p.id)
                        : [...semilavorati, p.id])} />
                    <span>{prepLabel(p)}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="sub" style={{ marginTop: 4 }}>
              Collegando un semilavorato, la catena resta intera: dall'arancino si arriva alla
              besciamella e da lì ai lotti di farina e latte con cui è stata fatta.
            </div>
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

      {/* L'avviso sta QUI, fuori dal modulo, e non accanto al pulsante di
          salvataggio: il rifiuto di cancellare una preparazione usata come
          semilavorato arriva a modulo chiuso, e un messaggio scritto dentro
          una parte di pagina che in quel momento non esiste e' un pulsante
          che non fa niente. */}
      {!apertoForm && errore && (
        <span className="file-error" style={{ margin: "12px 0" }}>
          <AlertTriangle size={13} /> {errore}
        </span>
      )}

      {!apertoForm && (
        <p className="login-info" style={{ margin: "16px 0" }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          L'etichetta riporta scadenza, conservazione, lotto del prodotto finito, ingredienti e allergeni. I lotti delle materie prime restano registrati qui: servono in caso di allerta, non vanno stampati.
        </p>
      )}

      <CatalogoRicette
        companyId={company?.id}
        prodotti={prodotti}
        ricette={ricette}
        prodottiRicetta={prodottiRicetta}
        onCambiato={async () => { await reloadRicette(); await reloadProdottiRicetta(); }}
      />

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : ordinate.length === 0 ? (
        <div className="empty"><p>Nessuna preparazione registrata.</p></div>
      ) : (
        <ul className="dish-list">
          {ordinate.map((p) => {
            const lotti = lottiDi(p);
            const semi = semilavoratiDi(p);
            const usataIn = dentroA(p);
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
                  {(p.quantity_kg != null || p.quantity_pieces != null) && (
                    <span className="doc-type-tag">
                      {[p.quantity_kg != null ? `${p.quantity_kg} kg` : null,
                        p.quantity_pieces != null ? `${p.quantity_pieces} pezzi` : null]
                        .filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {p.operator_name && <span className="doc-type-tag">{p.operator_name}</span>}
                </div>
                {(p.allergens || []).length > 0 ? (
                  <div className="chip-grid">{p.allergens.map((a) => <span key={a} className="chip chip-static">{a}</span>)}</div>
                ) : (
                  <span className="none-label">Nessun allergene dichiarato</span>
                )}
                <button type="button" className="icon-btn" style={{ color: "#2F6F4E", fontSize: 13, gap: 4, marginTop: 6 }} onClick={() => setApertaScheda(aperta ? null : p.id)}>
                  {aperta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{" "}
                  {lotti.length} {lotti.length === 1 ? "lotto collegato" : "lotti collegati"}
                  {semi.length > 0 && ` · ${semi.length} ${semi.length === 1 ? "semilavorato" : "semilavorati"}`}
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
                    {semi.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <span className="sub">Semilavorati usati: </span>
                        <ul style={{ listStyle: "none", margin: "2px 0 0", padding: 0 }}>
                          {semi.map((x) => <li key={x.id} style={{ padding: "3px 0" }}>{prepLabel(x)}</li>)}
                        </ul>
                      </div>
                    )}
                    {usataIn.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <span className="sub">Entrata in: </span>
                        {usataIn.map((x) => `${x.product_name} lotto ${x.lot_number}`).join(", ")}
                      </div>
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
