import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, CheckCircle2, Paperclip, FileText, Download, Pencil, X, Check, Package, Siren, Printer } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const NC_CATEGORIES = ["Cucina", "Sala", "Bagni", "Magazzino", "Attrezzature", "Frigoriferi", "Alimenti", "Allerta sanitaria"];

function AttachmentLink({ path }) {
  const [url, setUrl] = useState(null);
  if (!path) return <span className="none-label">Nessun documento allegato</span>;
  if (!url) { getAttachmentUrl(path).then(setUrl); return <span className="none-label">Caricamento allegato…</span>; }
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} /><span className="attachment-name">{path.split("/").pop()}</span><Download size={14} />
    </a>
  );
}

export default function NonConformita() {
  const { company } = useAuth();
  const { items, add, remove, update, loading } = useTable("non_conformities", company?.id);
  // I lotti vengono dalla tracciabilità nuova: la vecchia tabella è vuota per
  // tutte le aziende, e finché si leggeva quella l'elenco restava vuoto.
  const { items: lots } = useTable("traceability_records", company?.id);
  const { items: prodotti } = useTable("products", company?.id);
  const [area, setArea] = useState(NC_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [detectedDate, setDetectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [responsible, setResponsible] = useState("");
  const [lotId, setLotId] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Ritiro e richiamo: non è una sezione a sé, nasce da una non conformità
  // quando il prodotto è già uscito dall'azienda (art. 19 Reg. CE 178/2002).
  const [recallId, setRecallId] = useState(null);
  const [recall, setRecall] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [editAction, setEditAction] = useState("");
  const [editResolvedDate, setEditResolvedDate] = useState("");

  const showLotField = area === "Allerta sanitaria" || area === "Alimenti";

  const onFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    if (f && f.size > MAX_FILE_BYTES) { setError("File troppo grande (limite 8 MB)."); setFile(null); e.target.value = ""; return; }
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company.id, file);
      await add({ area, description, detected_date: detectedDate, responsible, attachment_path, traceability_record_id: lotId || null });
      setDescription(""); setResponsible(""); setFile(null); setLotId("");
      const input = document.getElementById("nc-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il caricamento: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditAction(item.corrective_action || "");
    setEditResolvedDate(item.resolved_date || new Date().toISOString().slice(0, 10));
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (id) => {
    if (!editAction.trim()) return;
    await update(id, { corrective_action: editAction, resolved_date: editResolvedDate });
    setEditingId(null);
  };

  const apriRitiro = (item) => {
    setRecallId(item.id);
    setRecall({
      recall_kind: item.recall_kind || "ritiro",
      recall_date: item.recall_date || new Date().toISOString().slice(0, 10),
      recall_authority: item.recall_authority || "",
      recall_product: item.recall_product || "",
      recall_supplier: item.recall_supplier || "",
      recall_lot: item.recall_lot || "",
      recall_quantity: item.recall_quantity || "",
      recall_quantity_left: item.recall_quantity_left || "",
      recall_reason: item.recall_reason || item.description || "",
      recall_source: item.recall_source || "",
      recall_measures: item.recall_measures || "",
    });
  };

  const salvaRitiro = async (id) => {
    if (!recall.recall_product || !String(recall.recall_product).trim()) return;
    await update(id, { ...recall, is_recall: true });
    setRecallId(null);
  };

  const campoRitiro = (chiave, valore) => setRecall((r) => ({ ...r, [chiave]: valore }));

  // Stampa del modulo da trasmettere all'Autorità sanitaria: apre una finestra
  // con il solo modulo, così non finisce in stampa tutta la pagina dell'app.
  const stampaRitiro = (item) => {
    const righe = [
      ["Data della comunicazione", item.recall_date ? new Date(item.recall_date).toLocaleDateString("it-IT") : ""],
      ["Tipo", item.recall_kind === "richiamo" ? "Richiamo (il prodotto può aver raggiunto il consumatore)" : "Ritiro"],
      ["Autorità sanitaria destinataria", item.recall_authority || ""],
      ["Denominazione del prodotto", item.recall_product || ""],
      ["Fornitore / produttore", item.recall_supplier || ""],
      ["Lotto e termine di conservazione", item.recall_lot || ""],
      ["Quantità interessata", item.recall_quantity || ""],
      ["Quantità ancora giacente in azienda", item.recall_quantity_left || ""],
      ["Motivo del ritiro", item.recall_reason || ""],
      ["Origine della segnalazione", item.recall_source || ""],
      ["Provvedimenti adottati", item.recall_measures || ""],
    ];
    const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
      <title>Comunicazione di ritiro del prodotto</title>
      <style>
        body { font-family: Calibri, Arial, sans-serif; margin: 32px; color: #1B2A22; font-size: 13px; }
        h1 { font-size: 18px; border-bottom: 2px solid #2F6F4E; padding-bottom: 6px; }
        .sub { font-style: italic; color: #3F5147; font-size: 12px; }
        table { border-collapse: collapse; width: 100%; margin-top: 16px; }
        td { border: 1px solid #BFCBC2; padding: 7px 9px; vertical-align: top; }
        td.k { width: 38%; background: #F1F4F0; font-weight: bold; }
        .firma { margin-top: 36px; font-size: 12px; }
      </style></head><body>
      <h1>Comunicazione di ritiro del prodotto</h1>
      <p class="sub">${(company?.name || "")} — da trasmettere all'Autorità sanitaria competente ai sensi dell'art. 19 del Reg. (CE) n. 178/2002.</p>
      <table>${righe.map((r) => `<tr><td class="k">${r[0]}</td><td>${r[1] || "&nbsp;"}</td></tr>`).join("")}</table>
      <p class="sub" style="margin-top:14px">La merce interessata viene isolata, identificata con la dicitura &ldquo;Merce non conforme — non utilizzare&rdquo; e tenuta a disposizione dell'Autorità di controllo, che ne stabilisce la destinazione.</p>
      <p class="firma">Luogo e data ______________________________<br><br>Il Responsabile del Piano di Autocontrollo ${(company?.haccp_manager || "______________________________")}<br><br>______________________________</p>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const openCount = items.filter((i) => !i.resolved_date).length;
  const nomeProdotto = (lot) =>
    prodotti.find((p) => p.id === lot.product_id)?.name || lot.product_name || "Prodotto";
  const lotLabel = (lot) =>
    `${nomeProdotto(lot)} — lotto ${lot.lot_number || "non indicato"} (${lot.supplier_name || "fornitore non indicato"})`;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Non conformità e azioni correttive</h2>
          <p className="sub">Registra ogni deviazione rilevata e, appena risolta, l'azione correttiva adottata.</p>
        </div>
        {openCount > 0 && <div className="pill pill-alert"><AlertTriangle size={14} /> {openCount} {openCount === 1 ? "aperta" : "aperte"}</div>}
      </div>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form">
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            {NC_CATEGORIES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <label className="field-label">Data rilevazione
            <input type="date" value={detectedDate} onChange={(e) => setDetectedDate(e.target.value)} />
          </label>
          <input type="text" placeholder="Responsabile" value={responsible} onChange={(e) => setResponsible(e.target.value)} className="note-input" />
          {company?.haccp_manager && (
            <button
              type="button"
              className="link-btn"
              onClick={() => setResponsible(company.haccp_manager)}
            >
              Usa responsabile HACCP
            </button>
          )}
        </div>

        {showLotField && (
          lots.length > 0 ? (
            <select value={lotId} onChange={(e) => setLotId(e.target.value)} className="full-input">
              <option value="">Prodotto/lotto coinvolto (opzionale)</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{lotLabel(l)}</option>)}
            </select>
          ) : (
            <p className="range-hint">Nessun lotto ancora presente in Tracciabilità — puoi comunque descrivere il prodotto qui sotto.</p>
          )
        )}

        <input type="text" placeholder="Descrizione della non conformità" required value={description} onChange={(e) => setDescription(e.target.value)} className="full-input" />
        <label className="file-drop" htmlFor="nc-file-input">
          <Paperclip size={15} /><span>{file ? file.name : "Allega foto/documento (opzionale)"}</span>
          <input id="nc-file-input" type="file" accept=".pdf,image/*" onChange={onFileChange} hidden />
        </label>
        {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> {busy ? "Salvataggio…" : "Registra non conformità"}
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessuna non conformità registrata.</p></div>
      ) : (
        <ul className="dish-list">
          {items.map((item) => {
            const resolved = !!item.resolved_date;
            const isEditing = editingId === item.id;
            const linkedLot = item.traceability_record_id ? lots.find((l) => l.id === item.traceability_record_id) : null;
            return (
              <li key={item.id} className={"dish-row" + (!resolved ? " row-warn" : "")}>
                <div className="dish-top">
                  <div>
                    <strong>{item.area}</strong>
                    <span className="lot-tag" style={!resolved ? { background: "#FBEEEC", color: "#B3432E" } : undefined}>
                      {resolved ? "Risolta" : "Aperta"}
                    </span>
                    {item.is_recall && (
                      <span className="lot-tag" style={{ background: "#FBEEEC", color: "#B3432E" }}>
                        {item.recall_kind === "richiamo" ? "richiamo" : "ritiro"}
                      </span>
                    )}
                  </div>
                  <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                </div>
                <div className="traccia-meta">
                  <span className="doc-type-tag">Rilevata {new Date(item.detected_date).toLocaleDateString("it-IT")}</span>
                  {item.responsible && <span className="doc-type-tag">{item.responsible}</span>}
                </div>
                {linkedLot && (
                  <div className="nc-lot-tag">
                    <Package size={13} />
                    <span>{lotLabel(linkedLot)}</span>
                  </div>
                )}
                <p className="pest-note">{item.description}</p>
                <AttachmentLink path={item.attachment_path} />

                {isEditing ? (
                  <div className="nc-edit-block">
                    <textarea placeholder="Azione correttiva adottata" value={editAction} onChange={(e) => setEditAction(e.target.value)} className="full-input nc-textarea" />
                    <div className="row-form" style={{ margin: "8px 0" }}>
                      <label className="field-label">Data risoluzione
                        <input type="date" value={editResolvedDate} onChange={(e) => setEditResolvedDate(e.target.value)} />
                      </label>
                      <button className="btn-primary" onClick={() => saveEdit(item.id)}><Check size={14} /> Salva</button>
                      <button className="icon-btn" onClick={cancelEdit} aria-label="Annulla"><X size={14} /></button>
                    </div>
                  </div>
                ) : resolved ? (
                  <div className="nc-resolved">
                    <CheckCircle2 size={13} color="#2F6F4E" />
                    <span>Risolta il {new Date(item.resolved_date).toLocaleDateString("it-IT")}: {item.corrective_action}</span>
                    <button className="icon-btn" onClick={() => startEdit(item)} aria-label="Modifica"><Pencil size={13} /></button>
                  </div>
                ) : (
                  <button type="button" className="btn-primary nc-resolve-btn" onClick={() => startEdit(item)}>
                    <Pencil size={14} /> Registra azione correttiva
                  </button>
                )}

                {recallId === item.id ? (
                  <div className="nc-edit-block">
                    <p className="sub" style={{ marginBottom: 8 }}>
                      Si compila quando il prodotto è già uscito dall'azienda. Ritiro: il prodotto è ancora nella filiera.
                      Richiamo: può aver raggiunto il consumatore.
                    </p>
                    <div className="row-form">
                      <select value={recall.recall_kind} onChange={(e) => campoRitiro("recall_kind", e.target.value)}>
                        <option value="ritiro">Ritiro</option>
                        <option value="richiamo">Richiamo</option>
                      </select>
                      <label className="field-label">Data comunicazione
                        <input type="date" value={recall.recall_date || ""} onChange={(e) => campoRitiro("recall_date", e.target.value)} />
                      </label>
                      <input type="text" placeholder="Autorità sanitaria destinataria" value={recall.recall_authority || ""} onChange={(e) => campoRitiro("recall_authority", e.target.value)} className="note-input" />
                    </div>
                    <div className="row-form">
                      <input type="text" placeholder="Denominazione del prodotto" value={recall.recall_product || ""} onChange={(e) => campoRitiro("recall_product", e.target.value)} className="note-input" />
                      <input type="text" placeholder="Fornitore / produttore" value={recall.recall_supplier || ""} onChange={(e) => campoRitiro("recall_supplier", e.target.value)} className="note-input" />
                      <input type="text" placeholder="Lotto e scadenza" value={recall.recall_lot || ""} onChange={(e) => campoRitiro("recall_lot", e.target.value)} className="note-input" />
                    </div>
                    <div className="row-form">
                      <input type="text" placeholder="Quantità interessata" value={recall.recall_quantity || ""} onChange={(e) => campoRitiro("recall_quantity", e.target.value)} className="note-input" />
                      <input type="text" placeholder="Quantità ancora in azienda" value={recall.recall_quantity_left || ""} onChange={(e) => campoRitiro("recall_quantity_left", e.target.value)} className="note-input" />
                      <input type="text" placeholder="Origine della segnalazione" value={recall.recall_source || ""} onChange={(e) => campoRitiro("recall_source", e.target.value)} className="note-input" />
                    </div>
                    <input type="text" placeholder="Motivo del ritiro" value={recall.recall_reason || ""} onChange={(e) => campoRitiro("recall_reason", e.target.value)} className="full-input" />
                    <input type="text" placeholder="Provvedimenti adottati" value={recall.recall_measures || ""} onChange={(e) => campoRitiro("recall_measures", e.target.value)} className="full-input" />
                    <div className="row-form" style={{ margin: "8px 0" }}>
                      <button className="btn-primary" onClick={() => salvaRitiro(item.id)}><Check size={14} /> Salva il ritiro</button>
                      <button className="icon-btn" onClick={() => setRecallId(null)} aria-label="Annulla"><X size={14} /></button>
                    </div>
                  </div>
                ) : item.is_recall ? (
                  <div className="traccia-meta" style={{ marginTop: 6 }}>
                    <button type="button" className="link-btn" onClick={() => stampaRitiro(item)}>
                      <Printer size={13} /> Stampa la comunicazione per l'ASP
                    </button>
                    <button type="button" className="link-btn" onClick={() => apriRitiro(item)}>
                      <Pencil size={13} /> Modifica i dati del ritiro
                    </button>
                  </div>
                ) : (
                  <button type="button" className="link-btn" onClick={() => apriRitiro(item)}>
                    <Siren size={13} /> Il prodotto è già uscito: apri ritiro o richiamo
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
