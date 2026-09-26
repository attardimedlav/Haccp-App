import React, { useEffect, useRef, useState } from "react";
import { PenLine, Check, X, AlertTriangle, RotateCcw } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";
import { firmaDocumento } from "../utils/firmaPdf";

// Pannello di firma di un documento già allegato.
//
// Si firma col dito o col mouse; l'app scarica il PDF, gli aggiunge in coda il
// foglio delle firme, ricarica il file firmato e lo registra in
// `document_signatures` con l'impronta del documento originale.
//
// Ogni nuova firma riparte dall'ULTIMA versione firmata, così le firme si
// sommano su un unico documento: è il caso del DVR, che ne vuole quattro.
export default function FirmaDocumento({
  percorso,            // path dell'allegato nello storage
  titolo,              // come si chiama il documento
  tabella,             // es. "dvr_documents"
  rigaId,              // id della riga a cui appartiene l'allegato
  nomiSuggeriti = [],  // elenco del personale, per non riscrivere il nome
  onFirmato,           // (nuovoPercorso) => salva il path sulla riga di origine
  onChiudi,
}) {
  const { company, session } = useAuth();
  const tela = useRef(null);
  const disegnando = useRef(false);
  const [vuota, setVuota] = useState(true);
  const [nome, setNome] = useState("");
  const [ruolo, setRuolo] = useState("");
  const [errore, setErrore] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [firmePrecedenti, setFirmePrecedenti] = useState([]);

  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    const scala = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * scala;
    c.height = c.offsetHeight * scala;
    const ctx = c.getContext("2d");
    ctx.scale(scala, scala);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#14203C";
  }, []);

  useEffect(() => {
    if (!rigaId) return;
    supabase
      .from("document_signatures")
      .select("*")
      .eq("source_table", tabella)
      .eq("source_id", rigaId)
      .order("signed_at")
      .then(({ data }) => setFirmePrecedenti(data || []));
  }, [tabella, rigaId]);

  const punto = (e) => {
    const r = tela.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const giu = (e) => {
    e.preventDefault();
    disegnando.current = true;
    const ctx = tela.current.getContext("2d");
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const muovi = (e) => {
    if (!disegnando.current) return;
    e.preventDefault();
    const ctx = tela.current.getContext("2d");
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setVuota(false);
  };
  const su = () => { disegnando.current = false; };

  const pulisci = () => {
    const c = tela.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setVuota(true);
  };

  const firma = async () => {
    if (vuota) { setErrore("Disegna la firma prima di confermare."); return; }
    if (!nome.trim()) { setErrore("Scrivi il nome di chi sta firmando."); return; }
    setErrore("");
    setInCorso(true);
    try {
      const url = await getAttachmentUrl(percorso);
      if (!url) throw new Error("allegato non raggiungibile");
      const risposta = await fetch(url);
      const pdfBytes = new Uint8Array(await risposta.arrayBuffer());
      if (String.fromCharCode(...pdfBytes.slice(0, 4)) !== "%PDF") {
        throw new Error("il documento allegato non è un PDF: si possono firmare solo i PDF");
      }

      const firmaPng = tela.current.toDataURL("image/png");
      const adesso = new Date().toISOString();
      // Le firme già raccolte sono già stampate sul file che sto firmando:
      // qui si aggiunge solo la nuova.
      const { bytes, improntaOriginale, improntaFirmato } = await firmaDocumento(
        pdfBytes,
        [{ nome: nome.trim(), ruolo: ruolo.trim(), firmaPng, firmatoIl: adesso }],
        { azienda: company?.name || "", documento: titolo || "" },
      );

      const base = (titolo || "documento").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 50);
      const file = new File([bytes], `${base}_firmato.pdf`, { type: "application/pdf" });
      const nuovoPercorso = await uploadAttachment(company.id, file);

      await supabase.from("document_signatures").insert({
        company_id: company.id,
        source_table: tabella,
        source_id: rigaId,
        signer_name: nome.trim(),
        signer_role: ruolo.trim() || null,
        signed_at: adesso,
        signed_by: session?.user?.id || null,
        file_path: nuovoPercorso,
        sha256_source: improntaOriginale,
        sha256_signed: improntaFirmato,
        user_agent: navigator.userAgent.slice(0, 300),
      });

      if (onFirmato) await onFirmato(nuovoPercorso);
      if (onChiudi) onChiudi();
    } catch (e) {
      setErrore("Firma non riuscita: " + e.message);
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div className="firma-box">
      <div className="panel-head" style={{ marginBottom: 6 }}>
        <div>
          <h3 style={{ margin: 0 }}><PenLine size={16} /> Firma di «{titolo}»</h3>
          <p className="sub" style={{ margin: "4px 0 0" }}>
            La firma si aggiunge in coda al documento, su un foglio delle firme, insieme a data, ora
            e impronta del file. È una firma elettronica semplice: non equivale all'autografa e non
            dà data certa.
          </p>
        </div>
        {onChiudi && <button type="button" className="icon-btn" onClick={onChiudi} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      {firmePrecedenti.length > 0 && (
        <ul className="log-list" style={{ marginBottom: 8 }}>
          {firmePrecedenti.map((f) => (
            <li key={f.id} className="log-row">
              <Check size={14} color="#2F6F4E" />
              <span className="log-main"><strong>{f.signer_name}</strong>{f.signer_role ? ` — ${f.signer_role}` : ""}</span>
              <span className="log-time">{new Date(f.signed_at).toLocaleString("it-IT")}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="row-form">
        <input
          type="text" placeholder="Nome di chi firma" list="firma-nomi"
          value={nome} onChange={(e) => setNome(e.target.value)} className="note-input"
        />
        <datalist id="firma-nomi">
          {nomiSuggeriti.filter(Boolean).map((n) => <option key={n} value={n} />)}
        </datalist>
        <input
          type="text" placeholder="In qualità di (datore di lavoro, RSPP, RLS, medico competente…)"
          value={ruolo} onChange={(e) => setRuolo(e.target.value)} className="note-input"
        />
      </div>

      <canvas
        ref={tela}
        className="firma-tela"
        onMouseDown={giu} onMouseMove={muovi} onMouseUp={su} onMouseLeave={su}
        onTouchStart={giu} onTouchMove={muovi} onTouchEnd={su}
      />
      <p className="sub" style={{ margin: "2px 0 8px" }}>Firma qui sopra, col dito o col mouse.</p>

      {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}
      <div className="row-form" style={{ margin: "4px 0 0" }}>
        <button type="button" className="btn-primary" disabled={inCorso} onClick={firma}>
          <Check size={16} /> {inCorso ? "Firma in corso…" : "Firma il documento"}
        </button>
        <button type="button" className="link-btn" onClick={pulisci}><RotateCcw size={14} /> Rifai la firma</button>
      </div>
    </div>
  );
}
