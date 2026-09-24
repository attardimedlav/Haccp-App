import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, Paperclip, FileText, Download, Truck, Pencil, Check, X, Eye, EyeOff, ShieldCheck, CalendarClock } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";
import { supabase } from "../supabaseClient";

const FUNZIONE_LETTURA = "clever-responder";
const MAX_FILE_BYTES = 8 * 1024 * 1024;

// La dichiarazione del fornitore non ha una scadenza di legge: il termine è la
// regola di buona prassi che l'azienda si dà per riverificare la qualifica.
const VALIDITA = [
  { mesi: 12, label: "12 mesi" },
  { mesi: 24, label: "24 mesi" },
  { mesi: 36, label: "36 mesi" },
];

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

function AttachmentLink({ path }) {
  const [url, setUrl] = useState(null);
  if (!path) return null;
  if (!url) { getAttachmentUrl(path).then(setUrl); return <span className="none-label">Caricamento allegato…</span>; }
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} /><span className="attachment-name">{path.split("/").pop()}</span><Download size={14} />
    </a>
  );
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString("it-IT") : "");

export default function Fornitori() {
  const { company } = useAuth();
  const { items, add, remove, update, loading } = useTable("suppliers", company?.id);

  const [name, setName] = useState("");
  const [vat, setVat] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [goods, setGoods] = useState("");
  const [declType, setDeclType] = useState("");
  const [declDate, setDeclDate] = useState("");
  const [declMonths, setDeclMonths] = useState(12);
  const [moca, setMoca] = useState(false);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leggendo, setLeggendo] = useState(false);
  const [letto, setLetto] = useState(false);
  const [mostraInattivi, setMostraInattivi] = useState(false);

  const [watchId, setWatchId] = useState(null);
  const [watchReason, setWatchReason] = useState("");

  // La dichiarazione è il documento che qualifica il fornitore: si carica e
  // l'app la legge, compilando da sola i dati dell'azienda che la rilascia.
  const onDichiarazione = async (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    setLetto(false);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) { setError("File troppo grande (limite 8 MB)."); e.target.value = ""; return; }
    setFile(f);
    setLeggendo(true);
    try {
      const { data: b64, media_type } = await fileInBase64(f);
      const { data, error: err } = await supabase.functions.invoke(FUNZIONE_LETTURA, {
        body: { file_base64: b64, media_type, tipo: "fornitore" },
      });
      if (err) throw new Error(err.message || "Lettura non riuscita");
      if (data?.errore) throw new Error(data.errore);
      if (data?.denominazione) setName(data.denominazione);
      if (data?.piva) setVat(data.piva);
      if (data?.sede) setAddress(data.sede);
      if (data?.prodotti && !goods) setGoods(data.prodotti);
      if (data?.data_documento) setDeclDate(data.data_documento);
      if (data?.tipo_documento) setDeclType(data.tipo_documento);
      setLetto(!!(data?.denominazione || data?.piva));
      if (!data?.denominazione) setError("Dal documento non è stata letta la denominazione: controlla la foto o scrivila a mano.");
    } catch (e2) {
      setError("Lettura non riuscita: " + e2.message + " — puoi comunque compilare a mano.");
    } finally {
      setLeggendo(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company.id, file);
      await add({
        name, vat, address, contact,
        supplied_goods: goods,
        declaration_type: declType,
        declaration_date: declDate || null,
        declaration_months: declMonths,
        self_control_declaration: !!declDate || !!attachment_path,
        moca_declaration: moca,
        notes,
        attachment_path,
      });
      setName(""); setVat(""); setAddress(""); setContact(""); setGoods("");
      setDeclType(""); setDeclDate(""); setDeclMonths(12); setMoca(false);
      setNotes(""); setFile(null); setLetto(false);
      const input = document.getElementById("fornitore-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il salvataggio: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const apriSorveglianza = (item) => {
    setWatchId(item.id);
    setWatchReason(item.reinforced_watch_reason || "");
  };
  const attivaSorveglianza = async (id) => {
    if (!watchReason.trim()) return;
    await update(id, {
      reinforced_watch: true,
      reinforced_watch_since: new Date().toISOString().slice(0, 10),
      reinforced_watch_reason: watchReason,
    });
    setWatchId(null);
  };
  const chiudiSorveglianza = async (id) => update(id, { reinforced_watch: false });

  const oggi = new Date().toISOString().slice(0, 10);
  const statoDichiarazione = (item) => {
    if (!item.declaration_date && !item.attachment_path) return "mancante";
    if (item.declaration_expiry && item.declaration_expiry < oggi) return "scaduta";
    return "valida";
  };

  const visibili = items.filter((i) => mostraInattivi || i.active !== false);
  const daRinnovare = items.filter((i) => i.active !== false && statoDichiarazione(i) !== "valida").length;
  const sorvegliati = items.filter((i) => i.reinforced_watch).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Fornitori</h2>
          <p className="sub">
            La qualifica del fornitore è la dichiarazione che rilascia lui: caricala e l'app legge da sola
            denominazione, partita IVA, sede e data. All'operatore resta da scrivere cosa gli fornisce.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {daRinnovare > 0 && (
            <div className="pill pill-alert"><AlertTriangle size={14} /> {daRinnovare} senza dichiarazione valida</div>
          )}
          {sorvegliati > 0 && (
            <div className="pill pill-alert"><AlertTriangle size={14} /> {sorvegliati} in sorveglianza</div>
          )}
        </div>
      </div>

      <form onSubmit={submit} className="traccia-form">
        <label className="file-drop" htmlFor="fornitore-file-input">
          <Paperclip size={15} />
          <span>{leggendo ? "Lettura del documento in corso…" : file ? file.name : "Carica o fotografa la dichiarazione del fornitore (PDF o foto)"}</span>
          <input id="fornitore-file-input" type="file" accept=".pdf,image/*" onChange={onDichiarazione} hidden />
        </label>
        {letto && (
          <p className="range-hint"><ShieldCheck size={13} /> Dati letti dal documento: controllali e correggi quello che serve.</p>
        )}

        <div className="row-form">
          <input type="text" placeholder="Denominazione del fornitore" required value={name} onChange={(e) => setName(e.target.value)} className="note-input" />
          <input type="text" placeholder="P.IVA" value={vat} onChange={(e) => setVat(e.target.value)} className="note-input" />
        </div>
        <input type="text" placeholder="Sede" value={address} onChange={(e) => setAddress(e.target.value)} className="full-input" />
        <input type="text" placeholder="Cosa fornisce (es. pane e prodotti da forno)" value={goods} onChange={(e) => setGoods(e.target.value)} className="full-input" />

        <div className="row-form">
          <input type="text" placeholder="Tipo di documento" value={declType} onChange={(e) => setDeclType(e.target.value)} className="note-input" />
          <label className="field-label">Data del documento
            <input type="date" value={declDate} onChange={(e) => setDeclDate(e.target.value)} />
          </label>
          <label className="field-label">Da riverificare entro
            <select value={declMonths} onChange={(e) => setDeclMonths(Number(e.target.value))}>
              {VALIDITA.map((v) => <option key={v.mesi} value={v.mesi}>{v.label}</option>)}
            </select>
          </label>
        </div>
        <p className="range-hint">
          La dichiarazione non ha una scadenza di legge: il termine è la periodicità con cui l'azienda decide di
          riverificare la qualifica del fornitore.
        </p>

        <div className="row-form">
          <input type="text" placeholder="Telefono o email (opzionale)" value={contact} onChange={(e) => setContact(e.target.value)} className="note-input" />
          <input type="text" placeholder="Nota (opzionale)" value={notes} onChange={(e) => setNotes(e.target.value)} className="note-input" />
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={moca} onChange={(e) => setMoca(e.target.checked)} />
          Il documento comprende anche la dichiarazione di conformità MOCA (imballaggi, vaschette, contenitori)
        </label>

        {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
        <button type="submit" className="btn-primary" disabled={busy || leggendo} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> {busy ? "Salvataggio…" : "Aggiungi fornitore"}
        </button>
      </form>

      <button type="button" className="link-btn" onClick={() => setMostraInattivi(!mostraInattivi)}>
        {mostraInattivi ? <><EyeOff size={13} /> Nascondi i fornitori sospesi</> : <><Eye size={13} /> Mostra anche i fornitori sospesi</>}
      </button>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : visibili.length === 0 ? (
        <div className="empty"><p>Nessun fornitore registrato.</p></div>
      ) : (
        <ul className="dish-list">
          {visibili.map((item) => {
            const stato = statoDichiarazione(item);
            const inRegola = stato === "valida" && !item.reinforced_watch;
            return (
              <li key={item.id} className={"dish-row" + (inRegola ? "" : " row-warn")}>
                <div className="dish-top">
                  <div>
                    <Truck size={13} style={{ marginRight: 6, verticalAlign: -2 }} color="#2F6F4E" />
                    <strong>{item.name}</strong>
                    {stato === "valida" && <span className="lot-tag">qualificato</span>}
                    {stato === "mancante" && <span className="lot-tag" style={{ background: "#FBEEEC", color: "#B3432E" }}>dichiarazione mancante</span>}
                    {stato === "scaduta" && <span className="lot-tag" style={{ background: "#FBEEEC", color: "#B3432E" }}>da riverificare</span>}
                    {item.reinforced_watch && <span className="lot-tag" style={{ background: "#FBEEEC", color: "#B3432E" }}>sorveglianza rinforzata</span>}
                    {item.active === false && <span className="lot-tag">sospeso</span>}
                  </div>
                  <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                </div>

                <div className="traccia-meta">
                  {item.supplied_goods && <span className="doc-type-tag">{item.supplied_goods}</span>}
                  {item.vat && <span className="doc-type-tag">P.IVA {item.vat}</span>}
                  {item.contact && <span className="doc-type-tag">{item.contact}</span>}
                  {item.moca_declaration && <span className="doc-type-tag">MOCA ✓</span>}
                  {item.declaration_date && (
                    <span className="doc-type-tag">
                      {item.declaration_type || "Dichiarazione"} del {fmt(item.declaration_date)}
                    </span>
                  )}
                  {item.declaration_expiry && (
                    <span className="doc-type-tag" style={stato === "scaduta" ? { background: "#FBEEEC", color: "#B3432E" } : undefined}>
                      <CalendarClock size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                      da riverificare entro {fmt(item.declaration_expiry)}
                    </span>
                  )}
                </div>
                {item.address && <p className="pest-note">{item.address}</p>}
                {item.notes && <p className="pest-note">{item.notes}</p>}
                <AttachmentLink path={item.attachment_path} />

                {item.reinforced_watch ? (
                  <div className="nc-resolved">
                    <AlertTriangle size={13} color="#B3432E" />
                    <span>
                      Dal {fmt(item.reinforced_watch_since) || "—"}: {item.reinforced_watch_reason}.
                      Misurare la temperatura a ogni consegna finché le forniture non tornano regolari.
                    </span>
                    <button type="button" className="link-btn" onClick={() => chiudiSorveglianza(item.id)}>
                      <Check size={13} /> Chiudi la sorveglianza
                    </button>
                  </div>
                ) : watchId === item.id ? (
                  <div className="nc-edit-block">
                    <input
                      type="text"
                      placeholder="Motivo: cosa è stato rilevato alla consegna"
                      value={watchReason}
                      onChange={(e) => setWatchReason(e.target.value)}
                      className="full-input"
                    />
                    <div className="row-form" style={{ margin: "8px 0" }}>
                      <button className="btn-primary" onClick={() => attivaSorveglianza(item.id)}><Check size={14} /> Attiva</button>
                      <button className="icon-btn" onClick={() => setWatchId(null)} aria-label="Annulla"><X size={14} /></button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="link-btn" onClick={() => apriSorveglianza(item)}>
                    <Pencil size={13} /> Apri sorveglianza rinforzata
                  </button>
                )}

                <button
                  type="button"
                  className="link-btn"
                  onClick={() => update(item.id, { active: item.active === false })}
                >
                  {item.active === false ? "Riattiva il fornitore" : "Sospendi il fornitore"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
