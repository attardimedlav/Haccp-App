import React, { useState, useEffect } from "react";
import { Plus, Trash2, Paperclip, FileText, Download, AlertTriangle, Info, ScanLine, PenLine, Check, X } from "lucide-react";
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
  const { items, remove, reload, loading } = useTable("traceability_records", company?.id);
  const { items: prodotti, reload: reloadProdotti } = useTable("products", company?.id);

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
      const { error } = await supabase.from("traceability_records").insert(daInserire);
      if (error) throw error;
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

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Ricevimento merci e rintracciabilità</h2>
          <p className="sub">Fotografa la bolla o la fattura: fornitore, prodotti, lotti e scadenze vengono letti dal documento.</p>
        </div>
      </div>

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
            <datalist id="catalogo-prodotti">
              {prodotti.map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
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

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun ricevimento registrato.</p></div>
      ) : (
        <ul className="dish-list">
          {items.map((item) => (
            <li key={item.id} className="dish-row">
              <div className="dish-top">
                <div>
                  <strong>{nomeProdotto(item.product_id)}</strong>
                  {item.lot_number
                    ? <span className="lot-tag">Lotto {item.lot_number}</span>
                    : <span className="lot-tag" style={{ color: "#8A5A00", background: "#FFF1D6" }}>Lotto non indicato</span>}
                </div>
                <button className="icon-btn" onClick={() => { if (window.confirm("Eliminare questo ricevimento?")) remove(item.id); }} aria-label="Elimina"><Trash2 size={14} /></button>
              </div>
              <div className="traccia-meta">
                <span className="doc-type-tag">{item.supplier_name}</span>
                {item.quantity != null && <span className="doc-type-tag">{String(item.quantity).replace(".", ",")} {item.unit || ""}</span>}
                <span className="doc-type-tag">Ricevuto il {fmtData(item.received_date)}</span>
                {item.expiry_date && <span className="doc-type-tag">Scade il {fmtData(item.expiry_date)}</span>}
                {item.notes && <span className="log-time">{item.notes}</span>}
              </div>
              <AttachmentLink path={item.attachment_path} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
