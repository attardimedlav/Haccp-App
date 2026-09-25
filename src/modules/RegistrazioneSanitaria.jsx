import React, { useState, useEffect } from "react";
import { Plus, Trash2, Paperclip, FileText, Download, AlertTriangle, ShieldCheck, Eye, EyeOff, ExternalLink } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";
import { supabase } from "../supabaseClient";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const FUNZIONE_LETTURA = "clever-responder";

// Stessa conversione usata per bolle ed etichette: i PDF passano interi, le
// foto si rimpiccioliscono a 2000 px prima di partire.
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

// Il documento si guarda dentro la pagina: i PDF in un riquadro sfogliabile,
// le foto come immagine. Il link di scarico resta, ma non serve più aprire un
// altro programma per leggere il numero di notifica.
function DocumentoInPagina({ path }) {
  const [url, setUrl] = useState(null);
  const [aperto, setAperto] = useState(true);

  useEffect(() => { let vivo = true; if (path) getAttachmentUrl(path).then((u) => { if (vivo) setUrl(u); }); return () => { vivo = false; }; }, [path]);

  if (!path) return <span className="none-label">Nessun documento allegato</span>;
  const nome = path.split("/").pop();
  const isPdf = /\.pdf$/i.test(nome);

  return (
    <div className="doc-viewer">
      <div className="doc-viewer-head">
        <FileText size={14} />
        <span className="attachment-name">{nome}</span>
        <button type="button" className="link-btn" onClick={() => setAperto(!aperto)}>
          {aperto ? <><EyeOff size={13} /> Nascondi</> : <><Eye size={13} /> Mostra</>}
        </button>
        {url && (
          <a className="link-btn" href={url} target="_blank" rel="noreferrer">
            <ExternalLink size={13} /> Apri a schermo intero
          </a>
        )}
        {url && (
          <a className="link-btn" href={url} download={nome}>
            <Download size={13} /> Scarica
          </a>
        )}
      </div>
      {aperto && (
        !url ? (
          <p className="sub">Caricamento del documento…</p>
        ) : isPdf ? (
          <iframe title={nome} src={url + "#view=FitH"} className="doc-frame" />
        ) : (
          <img alt={nome} src={url} className="doc-image" />
        )
      )}
    </div>
  );
}

export default function RegistrazioneSanitaria() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("health_registrations", company?.id);
  const [businessName, setBusinessName] = useState("");
  const [vat, setVat] = useState("");
  const [address, setAddress] = useState("");
  const [asl, setAsl] = useState("");
  const [notificationNumber, setNotificationNumber] = useState("");
  const [notificationDate, setNotificationDate] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leggendo, setLeggendo] = useState(false);
  const [letto, setLetto] = useState(false);

  // Il documento della registrazione contiene già tutto quello che serve:
  // si carica, l'app lo legge e compila la scheda. All'utente resta il
  // controllo di quello che è stato letto.
  const onFileChange = async (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    setLetto(false);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) { setError("File troppo grande (limite 8 MB)."); setFile(null); e.target.value = ""; return; }
    setFile(f);
    setLeggendo(true);
    try {
      const { data: b64, media_type } = await fileInBase64(f);
      const { data, error: err } = await supabase.functions.invoke(FUNZIONE_LETTURA, {
        body: { file_base64: b64, media_type, tipo: "registrazione" },
      });
      if (err) throw new Error(err.message || "Lettura non riuscita");
      if (data?.errore) throw new Error(data.errore);
      if (data?.ragione_sociale) setBusinessName(data.ragione_sociale);
      if (data?.piva) setVat(data.piva);
      if (data?.indirizzo) setAddress(data.indirizzo);
      if (data?.asl) setAsl(data.asl);
      if (data?.numero_notifica) setNotificationNumber(data.numero_notifica);
      if (data?.data_notifica) setNotificationDate(data.data_notifica);
      setLetto(!!(data?.ragione_sociale || data?.numero_notifica));
      if (!data?.numero_notifica) setError("Dal documento non è stato letto il numero di notifica: controllalo e scrivilo a mano.");
    } catch (e2) {
      setError("Lettura non riuscita: " + e2.message + " — puoi comunque compilare a mano.");
    } finally {
      setLeggendo(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!businessName.trim() || !notificationNumber.trim()) return;
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company.id, file);
      await add({
        business_name: businessName, vat, address, asl,
        notification_number: notificationNumber,
        notification_date: notificationDate || null,
        attachment_path,
      });
      setBusinessName(""); setVat(""); setAddress(""); setAsl(""); setNotificationNumber(""); setNotificationDate(""); setFile(null); setLetto(false);
      const input = document.getElementById("registrazione-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il caricamento: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Registrazione sanitaria</h2>
          <p className="sub">Anagrafica dell'attività e riferimenti della notifica/SCIA presso l'ASL competente.</p>
        </div>
      </div>

      <form onSubmit={submit} className="traccia-form">
        <label className="file-drop" htmlFor="registrazione-file-input">
          <Paperclip size={15} />
          <span>{leggendo ? "Lettura del documento in corso…" : file ? file.name : "Carica o fotografa la notifica/SCIA: i dati si compilano da soli"}</span>
          <input id="registrazione-file-input" type="file" accept=".pdf,image/*" onChange={onFileChange} hidden />
        </label>
        {letto && <p className="range-hint"><ShieldCheck size={13} /> Dati letti dal documento: controllali e correggi quello che serve.</p>}
        <div className="row-form">
          <input type="text" placeholder="Ragione sociale" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="note-input" />
          <input type="text" placeholder="Partita IVA" value={vat} onChange={(e) => setVat(e.target.value)} />
        </div>
        <input type="text" placeholder="Indirizzo sede attività" value={address} onChange={(e) => setAddress(e.target.value)} className="full-input" />
        <div className="row-form">
          <input type="text" placeholder="ASL competente" value={asl} onChange={(e) => setAsl(e.target.value)} className="note-input" />
          <input type="text" placeholder="Numero notifica / SCIA" required value={notificationNumber} onChange={(e) => setNotificationNumber(e.target.value)} className="note-input" />
          <label className="field-label">Data notifica
            <input type="date" value={notificationDate} onChange={(e) => setNotificationDate(e.target.value)} />
          </label>
        </div>
        {error && <span className="file-error"><AlertTriangle size={13} /> {error}</span>}
        <button type="submit" className="btn-primary" disabled={busy || leggendo} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> {busy ? "Salvataggio…" : "Registra"}
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessuna registrazione sanitaria presente.</p></div>
      ) : (
        <ul className="dish-list">
          {items.map((item) => (
            <li key={item.id} className="dish-row">
              <div className="dish-top">
                <div><strong>{item.business_name}</strong>{item.vat && <span className="lot-tag">P.IVA {item.vat}</span>}</div>
                <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
              </div>
              <div className="traccia-meta">
                {item.asl && <span className="doc-type-tag">{item.asl}</span>}
                <span className="doc-type-tag">Notifica {item.notification_number}</span>
                {item.notification_date && <span className="doc-type-tag">{new Date(item.notification_date).toLocaleDateString("it-IT")}</span>}
              </div>
              {item.address && <p className="pest-note">{item.address}</p>}
              <DocumentoInPagina path={item.attachment_path} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
