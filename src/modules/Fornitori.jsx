import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, Paperclip, FileText, Download, Truck, Pencil, Check, X, Eye, EyeOff } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

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

export default function Fornitori() {
  const { company } = useAuth();
  const { items, add, remove, update, loading } = useTable("suppliers", company?.id);
  const [name, setName] = useState("");
  const [vat, setVat] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [goods, setGoods] = useState("");
  const [certifications, setCertifications] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [moca, setMoca] = useState(false);
  const [selfControl, setSelfControl] = useState(false);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mostraInattivi, setMostraInattivi] = useState(false);

  // sorveglianza rinforzata: si apre e si chiude dalla riga del fornitore
  const [watchId, setWatchId] = useState(null);
  const [watchReason, setWatchReason] = useState("");

  const onFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    if (f && f.size > MAX_FILE_BYTES) { setError("File troppo grande (limite 8 MB)."); setFile(null); e.target.value = ""; return; }
    setFile(f);
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
        certifications,
        delivery_mode: deliveryMode,
        moca_declaration: moca,
        self_control_declaration: selfControl,
        notes,
        attachment_path,
      });
      setName(""); setVat(""); setAddress(""); setContact(""); setGoods("");
      setCertifications(""); setDeliveryMode(""); setMoca(false); setSelfControl(false);
      setNotes(""); setFile(null);
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

  const chiudiSorveglianza = async (id) => {
    await update(id, { reinforced_watch: false });
  };

  const visibili = items.filter((i) => mostraInattivi || i.active !== false);
  const sorvegliati = items.filter((i) => i.reinforced_watch).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Fornitori</h2>
          <p className="sub">
            Elenco dei fornitori qualificati, con quello che forniscono e le dichiarazioni acquisite.
            Da qui si apre e si chiude la sorveglianza rinforzata sulla catena del freddo.
          </p>
        </div>
        {sorvegliati > 0 && (
          <div className="pill pill-alert">
            <AlertTriangle size={14} /> {sorvegliati} in sorveglianza rinforzata
          </div>
        )}
      </div>

      <form onSubmit={submit} className="traccia-form">
        <div className="row-form">
          <input type="text" placeholder="Denominazione del fornitore" required value={name} onChange={(e) => setName(e.target.value)} className="note-input" />
          <input type="text" placeholder="P.IVA (opzionale)" value={vat} onChange={(e) => setVat(e.target.value)} className="note-input" />
        </div>
        <input type="text" placeholder="Sede" value={address} onChange={(e) => setAddress(e.target.value)} className="full-input" />
        <div className="row-form">
          <input type="text" placeholder="Telefono o email" value={contact} onChange={(e) => setContact(e.target.value)} className="note-input" />
          <input type="text" placeholder="Modalità e frequenza di consegna" value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value)} className="note-input" />
        </div>
        <input type="text" placeholder="Prodotto o servizio fornito" value={goods} onChange={(e) => setGoods(e.target.value)} className="full-input" />
        <input type="text" placeholder="Certificazioni dichiarate (opzionale)" value={certifications} onChange={(e) => setCertifications(e.target.value)} className="full-input" />
        <label className="checkbox-row">
          <input type="checkbox" checked={selfControl} onChange={(e) => setSelfControl(e.target.checked)} />
          Ha consegnato la dichiarazione di applicazione del sistema di autocontrollo
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={moca} onChange={(e) => setMoca(e.target.checked)} />
          Ha consegnato la dichiarazione di conformità MOCA (per imballaggi, vaschette, contenitori)
        </label>
        <input type="text" placeholder="Nota (opzionale)" value={notes} onChange={(e) => setNotes(e.target.value)} className="full-input" />
        <label className="file-drop" htmlFor="fornitore-file-input">
          <Paperclip size={15} /><span>{file ? file.name : "Allega dichiarazioni o schede del fornitore (opzionale)"}</span>
          <input id="fornitore-file-input" type="file" accept=".pdf,image/*" onChange={onFileChange} hidden />
        </label>
        {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
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
          {visibili.map((item) => (
            <li key={item.id} className={"dish-row" + (item.reinforced_watch ? " row-warn" : "")}>
              <div className="dish-top">
                <div>
                  <Truck size={13} style={{ marginRight: 6, verticalAlign: -2 }} color="#2F6F4E" />
                  <strong>{item.name}</strong>
                  {item.reinforced_watch && (
                    <span className="lot-tag" style={{ background: "#FBEEEC", color: "#B3432E" }}>sorveglianza rinforzata</span>
                  )}
                  {item.active === false && <span className="lot-tag">sospeso</span>}
                </div>
                <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
              </div>
              <div className="traccia-meta">
                {item.supplied_goods && <span className="doc-type-tag">{item.supplied_goods}</span>}
                {item.vat && <span className="doc-type-tag">P.IVA {item.vat}</span>}
                {item.contact && <span className="doc-type-tag">{item.contact}</span>}
                {item.delivery_mode && <span className="doc-type-tag">{item.delivery_mode}</span>}
                {item.self_control_declaration && <span className="doc-type-tag">autocontrollo ✓</span>}
                {item.moca_declaration && <span className="doc-type-tag">MOCA ✓</span>}
              </div>
              {item.address && <p className="pest-note">{item.address}</p>}
              {item.notes && <p className="pest-note">{item.notes}</p>}
              <AttachmentLink path={item.attachment_path} />

              {item.reinforced_watch ? (
                <div className="nc-resolved">
                  <AlertTriangle size={13} color="#B3432E" />
                  <span>
                    Dal {item.reinforced_watch_since ? new Date(item.reinforced_watch_since).toLocaleDateString("it-IT") : "—"}:
                    {" "}{item.reinforced_watch_reason}. Misurare la temperatura a ogni consegna finché le forniture non tornano regolari.
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
          ))}
        </ul>
      )}
    </div>
  );
}
