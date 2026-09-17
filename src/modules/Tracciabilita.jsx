import React, { useState, useEffect } from "react";
import { Plus, Trash2, Paperclip, FileText, Download, AlertTriangle, Info, ScanLine, PenLine, Check, X, Pencil, Package, BookOpen, Merge } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

// Ricevimenti merce (tracciabilità in entrata).
//
// Sostituisce la vecchia scheda che scriveva in traceability_logs: il
// 17/09/2026 quella tabella era vuota per tutte le aziende, quindi non c'era
// storico da portare. I dati nuovi vanno in traceability_records, con il
// prodotto agganciato al catalogo (products).
//
// Flusso: l'OSA carica foto o PDF della bolla/fattura, la Edge Function
// "clever-responder" (codice leggi-documento.ts) legge fornitore e righe, l'OSA
// controlla e completa quello che manca, poi si salva. Una fattura ha più
// prodotti: ogni riga diventa un ricevimento con lo stesso allegato.
// La lettura non è obbligatoria: "Inserisci a mano" apre la stessa verifica vuota.

const FUNZIONE_LETTURA = "clever-responder";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const UNITA = ["kg", "g", "litri", "pezzi", "confezioni", "cartoni"];

const oggi = () => new Date().toISOString().slice(0, 10);
const rigaVuota = () => ({ prodotto: "", quantita: "", unita: "kg", lotto: "", scadenza: "" });

function fmtData(iso) {
  if (!iso) return "";
  const [a, m, g] = iso.slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

// Le foto dei telefoni pesano spesso 4-8 MB: il servizio di lettura accetta
// immagini fino a 5 MB. Si riduce il lato lungo a 2000 px in JPEG, che per
// leggere una bolla è più che sufficiente. I PDF passano così come sono.
function fileInBase64(file) {
  return new Promise((resolve, reject) => {
    if (file.type === "application/pdf") {
      const r = new FileReader();
      r.onload = () => resolve({ data: String(r.result).split(",")[1], media_type: "application/pdf" });
      r.onerror = reject;
      r.readAsDataURL(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const lato = 2000;
      const scala = Math.min(1, lato / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scala);
      canvas.height = Math.round(img.height * scala);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], media_type: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Immagine non leggibile")); };
    img.src = url;
  });
}

// Il nome di un prodotto cambia forma da un documento all'altro solo per
// maiuscole e spazi nella maggior parte dei casi: si confronta normalizzato.
const normalizza = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();

function AttachmentLink({ path }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { if (path) getAttachmentUrl(path).then(setUrl); }, [path]);
  if (!path) return <span className="none-label">Nessun documento allegato</span>;
  if (!url) return <span className="none-label">Caricamento allegato…</span>;
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} /><span className="attachment-name">Documento</span><Download size={14} />
    </a>
  );
}

const cella = { font: "inherit", fontSize: 13, padding: "7px 8px", border: "1px solid #D8DED6", borderRadius: 7, background: "#fff", color: "#1B2A22", width: "100%", boxSizing: "border-box" };
const cellaMancante = { ...cella, borderColor: "#E0B25A", background: "#FFF8E8" };

export default function Tracciabilita() {
  const { company, session } = useAuth();
  const { items, remove, update, reload, loading } = useTable("traceability_records", company?.id);
  const { items: prodotti, reload: reloadProdotti } = useTable("products", company?.id);

  const [vista, setVista] = useState("arrivi");
  const daValutare = prodotti.filter((p) => !p.allergens_checked_at).length;

  // fase: "carica" | "verifica"
  const [fase, setFase] = useState("carica");
  const [file, setFile] = useState(null);
  const [lettura, setLettura] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState("");
  const [avviso, setAvviso] = useState("");

  const [fornitore, setFornitore] = useState("");
  const [dataRicevimento, setDataRicevimento] = useState(oggi());
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [righe, setRighe] = useState([rigaVuota()]);

  const ricomincia = () => {
    setFase("carica"); setFile(null); setErrore(""); setAvviso("");
    setFornitore(""); setDataRicevimento(oggi()); setNumeroDocumento(""); setRighe([rigaVuota()]);
    const input = document.getElementById("ricevimento-file");
    if (input) input.value = "";
  };

  const scegliFile = (e) => {
    const f = e.target.files?.[0] || null;
    setErrore("");
    if (f && f.size > MAX_FILE_BYTES) { setErrore("File troppo grande (limite 8 MB)."); setFile(null); e.target.value = ""; return; }
    setFile(f);
  };

  const leggiDocumento = async () => {
    if (!file) return;
    setLettura(true); setErrore(""); setAvviso("");
    try {
      const { data: b64, media_type } = await fileInBase64(file);
      const { data, error } = await supabase.functions.invoke(FUNZIONE_LETTURA, {
        body: { file_base64: b64, media_type },
      });
      if (error) throw new Error(error.message || "Lettura non riuscita");
      if (data?.errore) throw new Error(data.errore);

      setFornitore(data?.fornitore || "");
      setNumeroDocumento(data?.numero_documento || "");
      if (data?.data_documento) setDataRicevimento(data.data_documento);
      const lette = (data?.righe || []).map((r) => ({
        prodotto: r.prodotto || "",
        quantita: r.quantita ?? "",
        unita: r.unita || "kg",
        lotto: r.lotto || "",
        scadenza: r.scadenza || "",
      }));
      setRighe(lette.length ? lette : [rigaVuota()]);
      if (!lette.length) setAvviso("Nel documento non sono stati trovati prodotti: inseriscili a mano.");
      else if (lette.some((r) => !r.lotto)) setAvviso("Su alcune righe il lotto non è scritto nel documento: completalo dove serve.");
      setFase("verifica");
    } catch (err) {
      setErrore("Non sono riuscito a leggere il documento (" + err.message + "). Puoi inserire i dati a mano.");
    } finally {
      setLettura(false);
    }
  };

  const aMano = () => { setErrore(""); setAvviso(""); setFase("verifica"); };

  const cambiaRiga = (i, campo, valore) =>
    setRighe((rr) => rr.map((r, k) => (k === i ? { ...r, [campo]: valore } : r)));
  const aggiungiRiga = () => setRighe((rr) => [...rr, rigaVuota()]);
  const togliRiga = (i) => setRighe((rr) => (rr.length === 1 ? [rigaVuota()] : rr.filter((_, k) => k !== i)));

  // Trova il prodotto nel catalogo o lo crea. Gli allergeni si assegnano poi
  // una volta sola dalla scheda del catalogo.
  const prodottoId = async (nome, unita, cache) => {
    const chiave = normalizza(nome);
    if (cache[chiave]) return cache[chiave];
    const esistente = prodotti.find((p) => normalizza(p.name) === chiave);
    if (esistente) { cache[chiave] = esistente.id; return esistente.id; }
    const { data, error } = await supabase
      .from("products")
      .insert([{ company_id: company.id, name: nome.trim().replace(/\s+/g, " "), default_unit: unita || null }])
      .select()
      .single();
    if (error) throw error;
    cache[chiave] = data.id;
    return data.id;
  };

  const salva = async () => {
    const valide = righe.filter((r) => r.prodotto.trim());
    if (!fornitore.trim()) { setErrore("Manca il fornitore."); return; }
    if (!valide.length) { setErrore("Inserisci almeno un prodotto."); return; }
    setSalvataggio(true); setErrore("");
    try {
      const attachment_path = file ? await uploadAttachment(company.id, file) : null;
      const cache = {};
      const note = numeroDocumento.trim() ? `Documento n. ${numeroDocumento.trim()}` : null;
      const daInserire = [];
      for (const r of valide) {
        const product_id = await prodottoId(r.prodotto, r.unita, cache);
        daInserire.push({
          company_id: company.id,
          product_id,
          supplier_name: fornitore.trim().replace(/\s+/g, " "),
          quantity: r.quantita === "" ? null : Number(String(r.quantita).replace(",", ".")),
          unit: r.unita || null,
          lot_number: r.lotto.trim() || null,
          expiry_date: r.scadenza || null,
          received_date: dataRicevimento || oggi(),
          attachment_path,
          notes: note,
          created_by: session?.user?.id || null,
        });
      }
      // Se un prodotto già valutato arriva da un fornitore mai visto prima, gli
      // allergeni tornano "da valutare": l'etichetta di un altro produttore può
      // dichiarare allergeni o tracce diverse. Gli allergeni scelti restano,
      // l'OSA deve solo confermarli guardando la nuova confezione.
      const fornitoreNuovo = normalizza(fornitore);
      const daRicontrollare = [...new Set(daInserire
        .filter((riga) => {
          const p = prodotti.find((x) => x.id === riga.product_id);
          if (!p || !p.allergens_checked_at) return false;
          const visti = fornitoriDi(p.id);
          return visti.size > 0 && !visti.has(fornitoreNuovo);
        })
        .map((riga) => riga.product_id))];

      const { error } = await supabase.from("traceability_records").insert(daInserire);
      if (error) throw error;
      if (daRicontrollare.length) {
        await supabase.from("products").update({ allergens_checked_at: null }).in("id", daRicontrollare).eq("company_id", company.id);
      }
      await reload();
      await reloadProdotti();
      ricomincia();
    } catch (err) {
      setErrore("Errore durante il salvataggio: " + err.message);
    } finally {
      setSalvataggio(false);
    }
  };

  const nomeProdotto = (id) => prodotti.find((p) => p.id === id)?.name || "Prodotto";
  const prodottoDiNome = (nome) => prodotti.find((p) => normalizza(p.name) === normalizza(nome));
  const fornitoriDi = (productId) => new Set(items.filter((a) => a.product_id === productId).map((a) => normalizza(a.supplier_name)));

  // Riquadro sotto il nome del prodotto, sia in verifica sia nell'elenco:
  // dice se il prodotto è già in catalogo e con quali allergeni. Serve perché
  // gli allergeni si vedevano solo dentro il catalogo.
  const StatoAllergeni = ({ prodotto, fornitoreRiga }) => {
    if (!prodotto) return <span className="lot-tag" style={{ marginLeft: 0, color: "#8A5A00", background: "#FFF1D6" }}>Nuovo prodotto — allergeni da valutare</span>;
    const nuovoFornitore = fornitoreRiga && fornitoriDi(prodotto.id).size > 0 && !fornitoriDi(prodotto.id).has(normalizza(fornitoreRiga));
    return (
      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {!prodotto.allergens_checked_at
          ? <span className="lot-tag" style={{ marginLeft: 0, color: "#8A5A00", background: "#FFF1D6" }}>Allergeni da valutare</span>
          : (prodotto.allergens || []).length === 0
            ? <span className="none-label">Nessun allergene</span>
            : (prodotto.allergens || []).map((a) => <span key={a} className="chip chip-static" style={{ fontSize: 11.5, padding: "2px 8px" }}>{a}</span>)}
        {nuovoFornitore && (
          <span className="lot-tag" style={{ marginLeft: 0, color: "#8A5A00", background: "#FFF1D6" }}>Fornitore nuovo: ricontrolla l'etichetta</span>
        )}
      </span>
    );
  };

  // L'elenco si legge per documento: fornitore, numero e data una volta sola,
  // sotto i prodotti. Le righe salvate insieme condividono l'allegato; quelle
  // inserite a mano senza allegato si raggruppano per fornitore, data e numero.
  const documenti = [];
  const perChiave = {};
  for (const item of items) {
    const numero = (item.notes || "").replace(/^Documento n\.\s*/, "");
    const chiave = item.attachment_path || `${item.supplier_name}|${item.received_date}|${numero}`;
    if (!perChiave[chiave]) {
      perChiave[chiave] = { chiave, fornitore: item.supplier_name, numero: numero ? `N. ${numero}` : "", data: item.received_date, allegato: item.attachment_path, righe: [] };
      documenti.push(perChiave[chiave]);
    }
    perChiave[chiave].righe.push(item);
  }
  documenti.forEach((d) => d.righe.sort((x, y) => (x.created_at < y.created_at ? -1 : 1)));

  // Modifica successiva: l'OSA puo' completare un lotto o una scadenza che
  // sulla bolla non c'erano, oppure correggere fornitore, numero e data
  // dell'intero documento. Il documento allegato resta quello originale.
  const [modRiga, setModRiga] = useState(null);
  const [modDoc, setModDoc] = useState(null);

  const salvaRiga = async () => {
    if (!modRiga.prodotto.trim()) { setErrore("Il nome del prodotto non può restare vuoto."); return; }
    setSalvataggio(true); setErrore("");
    try {
      const product_id = await prodottoId(modRiga.prodotto, modRiga.unita, {});
      const ok = await update(modRiga.id, {
        product_id,
        quantity: modRiga.quantita === "" ? null : Number(String(modRiga.quantita).replace(",", ".")),
        unit: modRiga.unita || null,
        lot_number: modRiga.lotto.trim() || null,
        expiry_date: modRiga.scadenza || null,
      });
      if (!ok) throw new Error("salvataggio non riuscito");
      await reloadProdotti();
      setModRiga(null);
    } catch (err) {
      setErrore("Errore durante la modifica: " + err.message);
    } finally {
      setSalvataggio(false);
    }
  };

  const salvaDocumento = async (doc) => {
    if (!modDoc.fornitore.trim()) { setErrore("Il fornitore non può restare vuoto."); return; }
    setSalvataggio(true); setErrore("");
    const { error } = await supabase
      .from("traceability_records")
      .update({
        supplier_name: modDoc.fornitore.trim().replace(/\s+/g, " "),
        notes: modDoc.numero.trim() ? `Documento n. ${modDoc.numero.trim()}` : null,
        received_date: modDoc.data || oggi(),
      })
      .in("id", doc.righe.map((r) => r.id))
      .eq("company_id", company.id);
    setSalvataggio(false);
    if (error) { setErrore("Errore durante la modifica: " + error.message); return; }
    await reload();
    setModDoc(null);
  };

  const eliminaDocumento = async (doc) => {
    if (!window.confirm(`Eliminare tutto il documento di ${doc.fornitore} (${doc.righe.length} prodotti)?`)) return;
    const { error } = await supabase
      .from("traceability_records")
      .delete()
      .in("id", doc.righe.map((r) => r.id))
      .eq("company_id", company.id);
    if (error) { setErrore("Errore durante l'eliminazione: " + error.message); return; }
    await reload();
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Arrivo merci e tracciabilità</h2>
          <p className="sub">Fotografa la bolla o la fattura: fornitore, prodotti, lotti e scadenze vengono letti dal documento.</p>
        </div>
      </div>

      <div className="config-subtabs">
        <button type="button" className={"config-subtab" + (vista === "arrivi" ? " active" : "")} onClick={() => setVista("arrivi")}>
          <Package size={15} /> Arrivi
        </button>
        <button type="button" className={"config-subtab" + (vista === "catalogo" ? " active" : "")} onClick={() => setVista("catalogo")}>
          <BookOpen size={15} /> Catalogo prodotti
          {daValutare > 0 && <span className="lot-tag" style={{ color: "#8A5A00", background: "#FFF1D6" }}>{daValutare}</span>}
        </button>
      </div>

      {vista === "catalogo" && (
        <CatalogoProdotti company={company} prodotti={prodotti} arrivi={items} reloadProdotti={reloadProdotti} reloadArrivi={reload} />
      )}

      {vista === "arrivi" && (<>
      <p className="login-info" style={{ margin: "16px 0" }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Controlla sempre i dati letti prima di salvare. Se sul documento il lotto non c'è, scrivilo a mano copiandolo dalla confezione.
      </p>

      {fase === "carica" && (
        <div className="traccia-form">
          <label className="file-drop" htmlFor="ricevimento-file">
            <Paperclip size={15} /><span>{file ? file.name : "Scatta una foto o scegli il PDF della bolla / fattura"}</span>
            <input id="ricevimento-file" type="file" accept=".pdf,image/*" onChange={scegliFile} hidden />
          </label>
          {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-primary" disabled={!file || lettura} onClick={leggiDocumento}>
              <ScanLine size={16} /> {lettura ? "Lettura in corso…" : "Leggi documento"}
            </button>
            <button type="button" className="btn-primary" style={{ background: "#fff", color: "#2F6F4E", border: "1px solid #2F6F4E" }} disabled={lettura} onClick={aMano}>
              <PenLine size={16} /> Inserisci a mano
            </button>
          </div>
        </div>
      )}

      {fase === "verifica" && (
        <div className="traccia-form">
          {avviso && <span className="file-error" style={{ color: "#8A5A00" }}><AlertTriangle size={13} /> {avviso}</span>}

          <div className="row-form" style={{ margin: 0 }}>
            <input className="note-input" placeholder="Fornitore" value={fornitore} onChange={(e) => setFornitore(e.target.value)} style={!fornitore ? cellaMancante : undefined} />
            <input placeholder="N. documento" value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} style={{ width: 140 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#4C5A52" }}>
              Ricevuto il
              <input type="date" value={dataRicevimento} onChange={(e) => setDataRicevimento(e.target.value)} />
            </label>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 6px", minWidth: 640 }}>
              <thead>
                <tr style={{ fontSize: 12, color: "#6E7C73", textAlign: "left" }}>
                  <th style={{ fontWeight: 500 }}>Prodotto</th>
                  <th style={{ fontWeight: 500, width: 80 }}>Quantità</th>
                  <th style={{ fontWeight: 500, width: 110 }}>Unità</th>
                  <th style={{ fontWeight: 500, width: 150 }}>Lotto</th>
                  <th style={{ fontWeight: 500, width: 140 }}>Scadenza</th>
                  <th style={{ width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r, i) => (
                  <tr key={i}>
                    <td style={{ paddingRight: 6 }}>
                      <input style={r.prodotto ? cella : cellaMancante} list="catalogo-prodotti" placeholder="Nome prodotto" value={r.prodotto} onChange={(e) => cambiaRiga(i, "prodotto", e.target.value)} />
                      {r.prodotto.trim() !== "" && (
                        <div style={{ marginTop: 4, fontSize: 12 }}>
                          <StatoAllergeni prodotto={prodottoDiNome(r.prodotto)} fornitoreRiga={fornitore} />
                        </div>
                      )}
                    </td>
                    <td style={{ paddingRight: 6 }}>
                      <input style={cella} inputMode="decimal" value={r.quantita} onChange={(e) => cambiaRiga(i, "quantita", e.target.value)} />
                    </td>
                    <td style={{ paddingRight: 6 }}>
                      <select style={cella} value={UNITA.includes(r.unita) ? r.unita : "__altro"} onChange={(e) => cambiaRiga(i, "unita", e.target.value === "__altro" ? "" : e.target.value)}>
                        {UNITA.map((u) => <option key={u} value={u}>{u}</option>)}
                        {!UNITA.includes(r.unita) && <option value="__altro">{r.unita || "—"}</option>}
                      </select>
                    </td>
                    <td style={{ paddingRight: 6 }}>
                      <input style={r.lotto ? cella : cellaMancante} placeholder="Non indicato" value={r.lotto} onChange={(e) => cambiaRiga(i, "lotto", e.target.value)} />
                    </td>
                    <td style={{ paddingRight: 6 }}>
                      <input style={cella} type="date" value={r.scadenza} onChange={(e) => cambiaRiga(i, "scadenza", e.target.value)} />
                    </td>
                    <td>
                      <button type="button" className="icon-btn" onClick={() => togliRiga(i)} aria-label="Togli riga"><X size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="icon-btn" onClick={aggiungiRiga} style={{ alignSelf: "flex-start", color: "#2F6F4E", fontSize: 13, gap: 4 }}>
            <Plus size={14} /> Aggiungi riga
          </button>

          {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-primary" disabled={salvataggio} onClick={salva}>
              <Check size={16} /> {salvataggio ? "Salvataggio…" : `Salva ${righe.filter((r) => r.prodotto.trim()).length} prodotti`}
            </button>
            <button type="button" className="btn-primary" style={{ background: "#fff", color: "#6E7C73", border: "1px solid #D8DED6" }} disabled={salvataggio} onClick={ricomincia}>
              Annulla
            </button>
          </div>
        </div>
      )}

      <datalist id="catalogo-prodotti">
        {prodotti.map((p) => <option key={p.id} value={p.name} />)}
      </datalist>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun ricevimento registrato.</p></div>
      ) : (
        <ul className="dish-list">
          {documenti.map((doc) => (
            <li key={doc.chiave} className="dish-row" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #E1E5DF", background: "#F1F4F0" }}>
                {modDoc?.chiave === doc.chiave ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input style={cella} placeholder="Fornitore" value={modDoc.fornitore} onChange={(e) => setModDoc({ ...modDoc, fornitore: e.target.value })} />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input style={{ ...cella, width: 150 }} placeholder="N. documento" value={modDoc.numero} onChange={(e) => setModDoc({ ...modDoc, numero: e.target.value })} />
                      <input style={{ ...cella, width: 160 }} type="date" value={modDoc.data} onChange={(e) => setModDoc({ ...modDoc, data: e.target.value })} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn-primary" disabled={salvataggio} onClick={() => salvaDocumento(doc)}><Check size={15} /> Salva</button>
                      <button type="button" className="btn-primary" style={{ background: "#fff", color: "#6E7C73", border: "1px solid #D8DED6" }} onClick={() => setModDoc(null)}>Annulla</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="dish-top" style={{ marginBottom: 4 }}>
                      <strong style={{ fontSize: 15 }}>{doc.fornitore}</strong>
                      <div style={{ display: "flex", gap: 2 }}>
                        <button className="icon-btn icon-btn-ok" onClick={() => setModDoc({ chiave: doc.chiave, fornitore: doc.fornitore || "", numero: doc.numero.replace(/^N\.\s*/, ""), data: doc.data || oggi() })} aria-label="Modifica documento" title="Modifica fornitore, numero e data"><Pencil size={14} /></button>
                        <button className="icon-btn" onClick={() => eliminaDocumento(doc)} aria-label="Elimina documento" title="Elimina tutto il documento"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 13, alignItems: "center" }}>
                      {doc.numero && <span><strong>{doc.numero}</strong></span>}
                      <span><strong>{fmtData(doc.data)}</strong></span>
                      <span className="sub">{doc.righe.length} {doc.righe.length === 1 ? "prodotto" : "prodotti"}</span>
                      {doc.allegato && <AttachmentLink path={doc.allegato} />}
                    </div>
                  </>
                )}
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: "4px 12px 8px" }}>
                {doc.righe.map((item) => modRiga?.id === item.id ? (
                  <li key={item.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 0", borderBottom: "1px dashed #E1E5DF" }}>
                    <input style={modRiga.prodotto ? cella : cellaMancante} list="catalogo-prodotti" placeholder="Nome prodotto" value={modRiga.prodotto} onChange={(e) => setModRiga({ ...modRiga, prodotto: e.target.value })} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <label className="sub">Quantità<input style={cella} inputMode="decimal" value={modRiga.quantita} onChange={(e) => setModRiga({ ...modRiga, quantita: e.target.value })} /></label>
                      <label className="sub">Unità
                        <select style={cella} value={UNITA.includes(modRiga.unita) ? modRiga.unita : "__altro"} onChange={(e) => setModRiga({ ...modRiga, unita: e.target.value === "__altro" ? "" : e.target.value })}>
                          {UNITA.map((u) => <option key={u} value={u}>{u}</option>)}
                          {!UNITA.includes(modRiga.unita) && <option value="__altro">{modRiga.unita || "—"}</option>}
                        </select>
                      </label>
                      <label className="sub">Lotto<input style={modRiga.lotto ? cella : cellaMancante} placeholder="Non indicato" value={modRiga.lotto} onChange={(e) => setModRiga({ ...modRiga, lotto: e.target.value })} /></label>
                      <label className="sub">Scadenza<input style={cella} type="date" value={modRiga.scadenza} onChange={(e) => setModRiga({ ...modRiga, scadenza: e.target.value })} /></label>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn-primary" disabled={salvataggio} onClick={salvaRiga}><Check size={15} /> Salva</button>
                      <button type="button" className="btn-primary" style={{ background: "#fff", color: "#6E7C73", border: "1px solid #D8DED6" }} onClick={() => setModRiga(null)}>Annulla</button>
                    </div>
                  </li>
                ) : (
                  <li key={item.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 0", borderBottom: "1px dashed #E1E5DF", flexWrap: "wrap", fontSize: 13.5 }}>
                    <span style={{ flex: "1 1 100%", minWidth: 0, fontWeight: 500 }}>{nomeProdotto(item.product_id)}</span>
                    <span style={{ flex: "1 1 100%", minWidth: 0, marginTop: -2, marginBottom: 2 }}>
                      <StatoAllergeni prodotto={prodotti.find((p) => p.id === item.product_id)} />
                    </span>
                    {item.quantity != null && <span className="doc-type-tag">{String(item.quantity).replace(".", ",")} {item.unit || ""}</span>}
                    {item.lot_number
                      ? <span className="lot-tag" style={{ marginLeft: 0 }}>Lotto {item.lot_number}</span>
                      : <span className="lot-tag" style={{ marginLeft: 0, color: "#8A5A00", background: "#FFF1D6" }}>Lotto non indicato</span>}
                    {item.expiry_date && <span className="doc-type-tag">Scade il {fmtData(item.expiry_date)}</span>}
                    <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                      <button className="icon-btn icon-btn-ok" onClick={() => setModRiga({ id: item.id, prodotto: nomeProdotto(item.product_id), quantita: item.quantity == null ? "" : String(item.quantity).replace(".", ","), unita: item.unit || "", lotto: item.lot_number || "", scadenza: item.expiry_date || "" })} aria-label="Modifica prodotto" title="Modifica"><Pencil size={13} /></button>
                      <button className="icon-btn" onClick={() => { if (window.confirm("Eliminare solo questo prodotto dal documento?")) remove(item.id); }} aria-label="Elimina prodotto"><Trash2 size={13} /></button>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      </>)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catalogo prodotti: ogni alimento che entra in azienda, con i suoi allergeni
// assegnati una volta sola. Le voci nascono da sole salvando gli arrivi.
//
// "Nessun allergene" e "non ancora valutato" sono due cose diverse: la prima e'
// una dichiarazione dell'OSA, la seconda un buco. Per questo esiste
// allergens_checked_at, che si scrive quando l'OSA conferma la scheda.
//
// Le etichette degli allergeni sono le stesse di Allergeni.jsx, parola per
// parola: i due registri devono potersi confrontare.
const ALLERGENI = ["Glutine", "Latte", "Uova", "Soia", "Frutta a guscio", "Pesce", "Crostacei", "Sedano", "Senape", "Solfiti", "Arachidi", "Sesamo", "Lupini", "Molluschi"];

function CatalogoProdotti({ company, prodotti, arrivi, reloadProdotti, reloadArrivi }) {
  const [filtro, setFiltro] = useState("");
  const [mod, setMod] = useState(null); // { id, nome, allergeni: [] }
  const [unisci, setUnisci] = useState(null); // { id, verso: "" }
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  const usi = (id) => arrivi.filter((a) => a.product_id === id).length;
  const fornitoriUsati = (id) => new Set(arrivi.filter((a) => a.product_id === id).map((a) => normalizza(a.supplier_name))).size;
  const elenco = [...prodotti]
    .filter((p) => normalizza(p.name).includes(normalizza(filtro)))
    .sort((a, b) => {
      const va = a.allergens_checked_at ? 1 : 0, vb = b.allergens_checked_at ? 1 : 0;
      return va - vb || a.name.localeCompare(b.name, "it");
    });

  const salva = async () => {
    const nome = mod.nome.trim().replace(/\s+/g, " ");
    if (!nome) { setErrore("Il nome non può restare vuoto."); return; }
    const doppio = prodotti.find((p) => p.id !== mod.id && normalizza(p.name) === normalizza(nome));
    if (doppio) { setErrore(`Esiste già "${doppio.name}" nel catalogo: usa "Unisci" per accorparli.`); return; }
    setBusy(true); setErrore("");
    const { error } = await supabase
      .from("products")
      .update({ name: nome, allergens: mod.allergeni, allergens_checked_at: new Date().toISOString() })
      .eq("id", mod.id)
      .eq("company_id", company.id);
    setBusy(false);
    if (error) { setErrore("Errore nel salvataggio: " + error.message); return; }
    await reloadProdotti();
    setMod(null);
  };

  // Due voci per lo stesso alimento (es. "FARINA ... SACCO 25 KG" e "Farina tipo 00"):
  // gli arrivi passano sulla voce scelta e la voce doppia sparisce.
  const eseguiUnione = async (prodotto) => {
    const verso = prodotti.find((p) => p.id === unisci.verso);
    if (!verso) return;
    if (!window.confirm(`Spostare ${usi(prodotto.id)} arrivi da "${prodotto.name}" a "${verso.name}" ed eliminare "${prodotto.name}"?`)) return;
    setBusy(true); setErrore("");
    const { error: e1 } = await supabase
      .from("traceability_records")
      .update({ product_id: verso.id })
      .eq("product_id", prodotto.id)
      .eq("company_id", company.id);
    if (e1) { setBusy(false); setErrore("Errore nello spostamento: " + e1.message); return; }
    const allergeniUniti = [...new Set([...(verso.allergens || []), ...(prodotto.allergens || [])])];
    await supabase.from("products").update({ allergens: allergeniUniti }).eq("id", verso.id).eq("company_id", company.id);
    const { error: e2 } = await supabase.from("products").delete().eq("id", prodotto.id).eq("company_id", company.id);
    setBusy(false);
    if (e2) { setErrore("Arrivi spostati, ma la voce doppia non è stata eliminata: " + e2.message); }
    await reloadProdotti(); await reloadArrivi();
    setUnisci(null);
  };

  const elimina = async (prodotto) => {
    if (!window.confirm(`Eliminare "${prodotto.name}" dal catalogo?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", prodotto.id).eq("company_id", company.id);
    if (error) { setErrore("Errore nell'eliminazione: " + error.message); return; }
    await reloadProdotti();
  };

  return (
    <div style={{ marginTop: 16 }}>
      <p className="login-info" style={{ marginBottom: 12 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Per ogni prodotto indica una volta sola gli allergeni presenti (Reg. UE 1169/2011, All. II), leggendoli dall'etichetta della confezione. In cima trovi quelli ancora da valutare.
      </p>
      <input className="full-input" placeholder="Cerca un prodotto…" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: "100%", boxSizing: "border-box", marginBottom: 10 }} />
      {errore && <span className="file-error" style={{ marginBottom: 8 }}><AlertTriangle size={13} /> {errore}</span>}

      {elenco.length === 0 ? (
        <div className="empty"><p>{prodotti.length === 0 ? "Il catalogo si riempie da solo quando salvi il primo arrivo merci." : "Nessun prodotto con questo nome."}</p></div>
      ) : (
        <ul className="dish-list">
          {elenco.map((p) => (
            <li key={p.id} className="dish-row">
              {mod?.id === p.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input style={cella} value={mod.nome} onChange={(e) => setMod({ ...mod, nome: e.target.value })} />
                  <div className="sub">Allergeni presenti:</div>
                  <div className="chip-grid">
                    {ALLERGENI.map((a) => (
                      <button type="button" key={a} className={"chip" + (mod.allergeni.includes(a) ? " chip-on" : "")}
                        onClick={() => setMod({ ...mod, allergeni: mod.allergeni.includes(a) ? mod.allergeni.filter((x) => x !== a) : [...mod.allergeni, a] })}>
                        {a}
                      </button>
                    ))}
                  </div>
                  {mod.allergeni.length === 0 && <span className="sub">Nessun allergene selezionato: salvando dichiari che il prodotto non ne contiene.</span>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn-primary" disabled={busy} onClick={salva}><Check size={15} /> Salva</button>
                    <button type="button" className="btn-primary" style={{ background: "#fff", color: "#6E7C73", border: "1px solid #D8DED6" }} onClick={() => { setMod(null); setErrore(""); }}>Annulla</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="dish-top" style={{ marginBottom: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      <strong>{p.name}</strong>
                      <span className="sub" style={{ marginLeft: 8 }}>{usi(p.id)} {usi(p.id) === 1 ? "arrivo" : "arrivi"}</span>
                    </div>
                    <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button className="icon-btn icon-btn-ok" title="Modifica nome e allergeni" onClick={() => { setUnisci(null); setErrore(""); setMod({ id: p.id, nome: p.name, allergeni: p.allergens || [] }); }}><Pencil size={14} /></button>
                      {prodotti.length > 1 && <button className="icon-btn icon-btn-ok" title="Unisci a un altro prodotto" onClick={() => { setMod(null); setUnisci({ id: p.id, verso: "" }); }}><Merge size={14} /></button>}
                      {usi(p.id) === 0 && <button className="icon-btn" title="Elimina" onClick={() => elimina(p)}><Trash2 size={14} /></button>}
                    </span>
                  </div>
                  {!p.allergens_checked_at ? (
                    <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span className="lot-tag" style={{ marginLeft: 0, color: "#8A5A00", background: "#FFF1D6" }}>
                        {fornitoriUsati(p.id) > 1 ? "Allergeni da ricontrollare (fornitore cambiato)" : "Allergeni da valutare"}
                      </span>
                      {(p.allergens || []).map((a) => <span key={a} className="chip chip-static" style={{ fontSize: 11.5, padding: "2px 8px" }}>{a}</span>)}
                    </span>
                  ) : (p.allergens || []).length === 0 ? (
                    <span className="none-label">Nessun allergene</span>
                  ) : (
                    <div className="chip-grid">
                      {p.allergens.map((a) => <span key={a} className="chip chip-static">{a}</span>)}
                    </div>
                  )}
                  {unisci?.id === p.id && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                      <select style={{ ...cella, flex: "1 1 200px", width: "auto" }} value={unisci.verso} onChange={(e) => setUnisci({ ...unisci, verso: e.target.value })}>
                        <option value="">Unisci a…</option>
                        {prodotti.filter((x) => x.id !== p.id).sort((a, b) => a.name.localeCompare(b.name, "it")).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      <button type="button" className="btn-primary" disabled={!unisci.verso || busy} onClick={() => eseguiUnione(p)}><Merge size={15} /> Unisci</button>
                      <button type="button" className="btn-primary" style={{ background: "#fff", color: "#6E7C73", border: "1px solid #D8DED6" }} onClick={() => setUnisci(null)}>Annulla</button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
