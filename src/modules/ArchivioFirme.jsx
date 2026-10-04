import React, { useEffect, useState } from "react";
import {
  PenLine, Plus, Trash2, CheckCircle2, AlertTriangle, Info, Power, Paperclip,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";
import { fotoInFirma } from "../utils/firmaImmagine";

// Archivio delle firme.
//
// Le firme che l'app appone ai documenti che genera. Due ambiti, perché
// rispondono a due domande diverse:
//
//   consulente — la firma è di chi redige e vale su tutte le aziende: la
//     Dott.ssa Attardi sulle nomine di medico competente e sulle relazioni
//     sanitarie, il docente sui registri dei corsi che tiene lui;
//   azienda    — la firma è del datore di lavoro di quel cliente e vale
//     solo per i suoi documenti.
//
// Una firma non si attiva senza la data dell'autorizzazione: apporre la
// firma di un'altra persona regge solo se quella persona lo ha consentito,
// e il vincolo sta nel database, non nelle buone intenzioni. Le firme dei
// lavoratori non si caricano affatto — su una consegna DPI o una presa
// visione la firma attesta un fatto loro, e precompilarla documenterebbe
// un evento che può non essere avvenuto.

const RUOLI = [
  "Medico competente",
  "Docente",
  "Datore di lavoro",
  "RSPP",
  "Consulente",
];

const oggi = () => new Date().toISOString().slice(0, 10);

export default function ArchivioFirme({ ambito = "consulente" }) {
  const { company } = useAuth();
  const perAzienda = ambito === "azienda";

  const [firme, setFirme] = useState([]);
  const [anteprime, setAnteprime] = useState({});
  const [caricamento, setCaricamento] = useState(true);
  const [apri, setApri] = useState(false);
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);

  const [nome, setNome] = useState("");
  const [ruolo, setRuolo] = useState(perAzienda ? "Datore di lavoro" : RUOLI[0]);
  const [dataConsenso, setDataConsenso] = useState(oggi());
  const [notaConsenso, setNotaConsenso] = useState("");
  const [nuova, setNuova] = useState(null);     // { dataUrl, file }

  const leggi = async () => {
    setCaricamento(true);
    let q = supabase.from("signature_images").select("*").eq("scope", ambito);
    if (perAzienda) q = q.eq("company_id", company?.id);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) setErrore("Lettura non riuscita: " + error.message);
    setFirme(data || []);
    setCaricamento(false);
  };

  useEffect(() => { if (!perAzienda || company?.id) leggi(); }, [ambito, company?.id]); // eslint-disable-line

  // Le anteprime sono link temporanei: il bucket è privato.
  useEffect(() => {
    let vivo = true;
    firme.forEach((f) => {
      if (anteprime[f.id] || !f.file_path) return;
      supabase.storage.from("attachments").createSignedUrl(f.file_path, 3600)
        .then(({ data }) => {
          if (vivo && data?.signedUrl) setAnteprime((p) => ({ ...p, [f.id]: data.signedUrl }));
        });
    });
    return () => { vivo = false; };
  }, [firme]); // eslint-disable-line

  const onFoto = async (e) => {
    const f = e.target.files?.[0] || null;
    setErrore("");
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) { setErrore("Foto troppo grande (limite 12 MB)."); e.target.value = ""; return; }
    setBusy(true);
    try {
      setNuova(await fotoInFirma(f));
    } catch (err) {
      setErrore(err.message || "Non è stato possibile elaborare la foto.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const salva = async (ev) => {
    ev.preventDefault();
    if (!nome.trim()) { setErrore("Scrivi nome e cognome di chi firma."); return; }
    if (!nuova) { setErrore("Carica la foto della firma."); return; }
    if (!dataConsenso) { setErrore("Indica la data dell'autorizzazione."); return; }
    setBusy(true); setErrore("");
    try {
      const { data: utente } = await supabase.auth.getUser();
      const uid = utente?.user?.id;
      const slug = nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const path = `firme/${uid}/${slug}-${Date.now()}.png`;
      const up = await supabase.storage.from("attachments").upload(path, nuova.file);
      if (up.error) throw up.error;

      const riga = {
        scope: ambito,
        company_id: perAzienda ? company.id : null,
        person_name: nome.trim(),
        person_role: ruolo,
        file_path: path,
        consent_date: dataConsenso,
        consent_note: notaConsenso.trim() || null,
        active: true,
      };
      const { error } = await supabase.from("signature_images").insert(riga);
      if (error) throw error;

      setNome(""); setNotaConsenso(""); setNuova(null); setApri(false);
      await leggi();
    } catch (err) {
      setErrore(/duplicate|unique/i.test(err.message || "")
        ? "Esiste già una firma per questa persona: eliminala prima di ricaricarla."
        : "Salvataggio non riuscito: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const commuta = async (f) => {
    const { error } = await supabase.from("signature_images")
      .update({ active: !f.active }).eq("id", f.id);
    if (error) setErrore("Modifica non riuscita: " + error.message);
    else leggi();
  };

  const elimina = async (f) => {
    if (!window.confirm(`Eliminare la firma di ${f.person_name}? I documenti già generati non cambiano.`)) return;
    const { error } = await supabase.from("signature_images").delete().eq("id", f.id);
    if (error) {
      setErrore(/violates foreign key/i.test(error.message)
        ? "Questa firma è già stata apposta a dei documenti e resta in archivio: puoi solo disattivarla."
        : "Eliminazione non riuscita: " + error.message);
      return;
    }
    if (f.file_path) await supabase.storage.from("attachments").remove([f.file_path]);
    leggi();
  };

  return (
    <div className={perAzienda ? "" : "panel"} style={perAzienda ? { marginTop: 16 } : undefined}>
      <div className="panel-head">
        <div>
          {perAzienda
            ? <h3 style={{ margin: "0 0 6px" }}>Firma del datore di lavoro</h3>
            : <h2>Firme</h2>}
          <p className="sub" style={{ margin: 0 }}>
            {perAzienda
              ? "Si applica alle nomine e ai documenti che il datore di lavoro di questa azienda sottoscrive."
              : "Le firme di chi redige i documenti: valgono su tutte le aziende che segui."}
          </p>
        </div>
      </div>

      <p className="login-info" style={{ margin: "12px 0" }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Una firma si attiva solo indicando quando la persona ha autorizzato ad apporla. Le firme dei
        lavoratori non si caricano: su una consegna DPI o una presa visione la firma attesta un fatto
        loro, e quei documenti escono con lo spazio bianco.
      </p>

      {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}

      <button type="button" className="btn-primary" style={{ marginBottom: 12 }}
        onClick={() => { setApri(!apri); setErrore(""); }}>
        <Plus size={16} /> {apri ? "Chiudi" : "Aggiungi una firma"}
      </button>

      {apri && (
        <form onSubmit={salva} className="traccia-form">
          <div className="row-form" style={{ marginTop: 0 }}>
            <input type="text" className="note-input" placeholder="Nome e cognome"
              value={nome} onChange={(e) => setNome(e.target.value)} required />
            <label className="field-label">Qualifica
              <select value={ruolo} onChange={(e) => setRuolo(e.target.value)}>
                {RUOLI.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>

          <div className="row-form">
            <label className="field-label">Autorizzazione resa il
              <input type="date" value={dataConsenso} onChange={(e) => setDataConsenso(e.target.value)} required />
            </label>
            <input type="text" className="note-input" placeholder="Come è stata resa (a voce, per iscritto, via email…)"
              value={notaConsenso} onChange={(e) => setNotaConsenso(e.target.value)} />
          </div>

          <label className="file-drop" htmlFor="firma-archivio-file">
            <PenLine size={15} />
            <span>{busy ? "Elaborazione della firma…" : nuova ? "Cambia la foto" : "Foto della firma su foglio bianco"}</span>
            <input id="firma-archivio-file" type="file" accept="image/*" hidden onChange={onFoto} disabled={busy} />
          </label>

          {nuova && (
            <img src={nuova.dataUrl} alt="Anteprima della firma"
              style={{ height: 62, background: "#FFFFFF", border: "1px solid #D8E0DA", borderRadius: 6, padding: "4px 10px", alignSelf: "flex-start" }} />
          )}

          <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
            <Plus size={16} /> {busy ? "Salvataggio…" : "Metti in archivio"}
          </button>
        </form>
      )}

      {caricamento ? (
        <p className="sub">Caricamento…</p>
      ) : firme.length === 0 ? (
        <div className="empty">
          <p>
            {perAzienda
              ? "Nessuna firma del datore di lavoro per questa azienda."
              : "Nessuna firma in archivio. Si caricano una volta sola e valgono per tutti i clienti."}
          </p>
        </div>
      ) : (
        <ul className="dish-list">
          {firme.map((f) => (
            <li key={f.id} className={"dish-row" + (f.active ? "" : " row-warn")}>
              <div className="dish-top" style={{ marginBottom: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{f.person_name}</strong>
                  {f.person_role && <span className="lot-tag">{f.person_role}</span>}
                </div>
                <div style={{ display: "flex", gap: 2 }}>
                  <button className="icon-btn icon-btn-ok" onClick={() => commuta(f)}
                    title={f.active ? "Disattiva" : "Attiva"} aria-label="Attiva o disattiva">
                    <Power size={14} />
                  </button>
                  <button className="icon-btn" onClick={() => elimina(f)} aria-label="Elimina">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {anteprime[f.id] && (
                <img src={anteprime[f.id]} alt={"Firma di " + f.person_name}
                  style={{ height: 52, background: "#FFFFFF", border: "1px solid #E2E8E4", borderRadius: 6, padding: "3px 8px" }} />
              )}

              <div className="traccia-meta" style={{ marginTop: 6 }}>
                <span className={"pill " + (f.active ? "pill-ok" : "pill-warn")}>
                  {f.active ? <><CheckCircle2 size={12} /> in uso</> : "non in uso"}
                </span>
                {f.consent_date && (
                  <span className="doc-type-tag">
                    autorizzata il {new Date(f.consent_date).toLocaleDateString("it-IT")}
                  </span>
                )}
                {f.consent_note && <span className="doc-type-tag"><Paperclip size={11} /> {f.consent_note}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
