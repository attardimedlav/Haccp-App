import React, { useState, useEffect } from "react";
import { FileText, Download, Eye, EyeOff, ExternalLink } from "lucide-react";
import { getAttachmentUrl } from "./hooks/useAttachment";

// Il documento si guarda dentro la pagina: i PDF in un riquadro sfogliabile,
// le foto come immagine. Il link di scarico resta, ma non serve più aprire un
// altro programma per leggere il numero di notifica.
export default function DocumentoInPagina({ path }) {
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
