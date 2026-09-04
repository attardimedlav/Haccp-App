import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, X, FileText, Paperclip, Award, GraduationCap, ShieldAlert } from "lucide-react";
import { useTable } from "./hooks/useTable";
import { useAuth } from "./AuthContext";
import { getAttachmentUrl } from "./hooks/useAttachment";

// Ricerca trasversale sui documenti dell'azienda aperta.
//
// Sta in cima a ogni schermata perché il caso d'uso è quello dell'ispezione:
// serve trovare un documento con una parola, senza sapere in quale sezione sia
// stato archiviato. Cerca in una volta sola fra i documenti HACCP, il DVR e i
// suoi allegati, le nomine, gli attestati di sicurezza e i corsi HACCP.
//
// Le tabelle vengono interrogate solo quando si comincia a digitare: il
// componente dei risultati è montato dal genitore soltanto a ricerca avviata,
// così le pagine normali restano leggere.

// Confronto tollerante: minuscole, accenti rimossi, spazi compattati. Serve
// perché i titoli li scrivono i clienti, con accenti e maiuscole a caso.
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtDate(d) {
  if (!d) return "";
  const p = String(d).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : "";
}

// Il bucket degli allegati è privato: il link va firmato al momento del clic.
function ApriAllegato({ path }) {
  const [busy, setBusy] = useState(false);
  if (!path) return null;
  const apri = async (e) => {
    e.stopPropagation();
    setBusy(true);
    const url = await getAttachmentUrl(path);
    setBusy(false);
    if (url) window.open(url, "_blank", "noopener");
  };
  return (
    <button type="button" className="ricerca-allegato" onClick={apri} disabled={busy}>
      <Paperclip size={12} /> {busy ? "Apro…" : "Allegato"}
    </button>
  );
}

function Risultati({ query, goTo, openWorkSafety, onClose }) {
  const { company } = useAuth();
  const { items: haccpDocs } = useTable("haccp_documents", company?.id);
  const { items: dvrDocs } = useTable("dvr_documents", company?.id);
  const { items: nomine } = useTable("work_safety_appointments", company?.id);
  const { items: attestati } = useTable("work_safety_trainings", company?.id);
  const { items: corsiHaccp } = useTable("training_records", company?.id);

  const q = norm(query);

  const gruppi = useMemo(() => {
    if (q.length < 2) return [];
    const contiene = (...campi) => campi.some((c) => norm(c).includes(q));
    const nomePerNomina = new Map(nomine.map((n) => [n.id, n]));

    const out = [];

    const docs = haccpDocs
      .filter((d) => contiene(d.title, d.document_type, d.note))
      .map((d) => ({
        key: "hd-" + d.id,
        titolo: d.title || "(senza titolo)",
        sotto: [d.document_type, d.review_date ? "revisione del " + fmtDate(d.review_date) : ""].filter(Boolean).join(" · "),
        path: d.attachment_path,
        vai: () => goTo("documenti"),
      }));
    if (docs.length) out.push({ id: "documenti", label: "Documenti HACCP", icon: FileText, righe: docs });

    const dvr = dvrDocs
      .filter((d) => contiene(d.title, d.note))
      .map((d) => ({
        key: "dv-" + d.id,
        titolo: d.title || "(senza titolo)",
        sotto: [d.kind === "dvr" ? "DVR" : "Allegato al DVR", d.doc_date ? "del " + fmtDate(d.doc_date) : ""].filter(Boolean).join(" · "),
        path: d.attachment_path,
        vai: () => openWorkSafety(d.kind === "dvr" ? "dvr" : "allegati"),
      }));
    if (dvr.length) out.push({ id: "dvr", label: "DVR e allegati", icon: ShieldAlert, righe: dvr });

    const nom = nomine
      .filter((n) => contiene(n.person_name, n.role, n.note))
      .map((n) => ({
        key: "no-" + n.id,
        titolo: n.person_name || "(senza nome)",
        sotto: [n.role, n.nomina_issue_date ? "nomina del " + fmtDate(n.nomina_issue_date) : ""].filter(Boolean).join(" · "),
        path: n.nomina_attachment_path,
        vai: () => openWorkSafety("nomine"),
      }));
    if (nom.length) out.push({ id: "nomine", label: "Nomine", icon: Award, righe: nom });

    const att = attestati
      .filter((t) => {
        const n = nomePerNomina.get(t.appointment_id);
        return contiene(t.course_kind, t.note, n?.person_name, n?.role);
      })
      .map((t) => {
        const n = nomePerNomina.get(t.appointment_id);
        return {
          key: "at-" + t.id,
          titolo: [n?.person_name, n?.role].filter(Boolean).join(" — ") || "(attestato)",
          sotto: [t.course_kind, t.issue_date ? "del " + fmtDate(t.issue_date) : "", t.expiry_date ? "scade il " + fmtDate(t.expiry_date) : ""].filter(Boolean).join(" · "),
          path: t.attachment_path,
          vai: () => openWorkSafety("nomine"),
        };
      });
    if (att.length) out.push({ id: "attestati", label: "Attestati di formazione", icon: Award, righe: att });

    const chc = corsiHaccp
      .filter((c) => contiene(c.employee_name, c.course))
      .map((c) => ({
        key: "ch-" + c.id,
        titolo: c.employee_name || "(senza nome)",
        sotto: [c.course, c.issue_date ? "del " + fmtDate(c.issue_date) : "", c.expiry ? "scade il " + fmtDate(c.expiry) : ""].filter(Boolean).join(" · "),
        path: c.attachment_path,
        vai: () => goTo("formazione"),
      }));
    if (chc.length) out.push({ id: "corsihaccp", label: "Formazione HACCP", icon: GraduationCap, righe: chc });

    return out;
  }, [q, haccpDocs, dvrDocs, nomine, attestati, corsiHaccp, goTo, openWorkSafety]);

  const totale = gruppi.reduce((n, g) => n + g.righe.length, 0);

  if (q.length < 2) return null;

  return (
    <div className="ricerca-risultati">
      {totale === 0 ? (
        <p className="ricerca-vuoto">Nessun documento trovato per «{query}».</p>
      ) : (
        <>
          <p className="ricerca-conteggio">{totale} {totale === 1 ? "risultato" : "risultati"}</p>
          {gruppi.map((g) => (
            <div key={g.id} className="ricerca-gruppo">
              <h4 className="ricerca-gruppo-titolo"><g.icon size={13} /> {g.label}</h4>
              <ul className="ricerca-lista">
                {g.righe.map((r) => (
                  <li key={r.key} className="ricerca-riga">
                    <button
                      type="button"
                      className="ricerca-vai"
                      onClick={() => { r.vai(); onClose(); }}
                    >
                      <span className="ricerca-titolo">{r.titolo}</span>
                      {r.sotto && <span className="ricerca-sotto">{r.sotto}</span>}
                    </button>
                    <ApriAllegato path={r.path} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function RicercaDocumenti({ goTo, openWorkSafety }) {
  const [query, setQuery] = useState("");
  const box = useRef(null);

  // Chiude i risultati cliccando fuori o con Esc, come ci si aspetta da una
  // barra di ricerca.
  useEffect(() => {
    if (!query) return undefined;
    const fuori = (e) => { if (box.current && !box.current.contains(e.target)) setQuery(""); };
    const esc = (e) => { if (e.key === "Escape") setQuery(""); };
    document.addEventListener("mousedown", fuori);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuori);
      document.removeEventListener("keydown", esc);
    };
  }, [query]);

  return (
    <div className="ricerca" ref={box}>
      <div className="ricerca-campo">
        <Search size={15} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca un documento: titolo, nome, tipo di corso…"
          aria-label="Cerca fra i documenti dell'azienda"
        />
        {query && (
          <button type="button" className="ricerca-pulisci" onClick={() => setQuery("")} aria-label="Pulisci la ricerca">
            <X size={14} />
          </button>
        )}
      </div>
      {query.trim().length >= 2 && (
        <Risultati
          query={query.trim()}
          goTo={goTo}
          openWorkSafety={openWorkSafety}
          onClose={() => setQuery("")}
        />
      )}
    </div>
  );
}
