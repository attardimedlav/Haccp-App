import React, { useState } from "react";
import { Plus, Trash2, Paperclip, FileText, Download, AlertTriangle, Info, FlaskConical, Check, X } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

// Controlli analitici.
//
// Le analisi di laboratorio previste dal manuale di autocontrollo: acqua di
// rete o di pozzo, tamponi sulle superfici, campioni di alimento. Il manuale
// stabilisce quali e con quale periodicità; qui si dichiara il piano una
// volta sola e poi si registrano i referti man mano che arrivano.
//
// La scadenza non è una regola generale di legge ma quella che l'azienda si
// è data nel proprio manuale: per questo la periodicità si sceglie piano per
// piano invece di essere fissata dall'app.

const MAX_FILE_BYTES = 8 * 1024 * 1024;

const MATRICI = [
  "Acqua di rete",
  "Acqua di pozzo",
  "Acqua trattata / filtrata",
  "Ghiaccio",
  "Tampone superfici",
  "Tampone attrezzature",
  "Alimento / prodotto finito",
  "Olio di frittura",
  "Altro",
];

const PERIODICITA = [3, 6, 12, 24, 36];

const ESITI = ["Conforme", "Non conforme", "In attesa del referto"];

const oggi = function () { return new Date().toISOString().slice(0, 10); };

function fmt(iso) {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}

function aggiungiMesi(iso, mesi) {
  if (!iso || !mesi) return "";
  const d = new Date(iso);
  d.setMonth(d.getMonth() + Number(mesi));
  return d.toISOString().slice(0, 10);
}

// Lo stato di un piano si legge dall'ultimo campionamento fatto: se non ce
// n'è nessuno il piano è scoperto, altrimenti vale la scadenza calcolata
// sulla periodicità dichiarata.
function statoPiano(piano, referti) {
  const suoi = referti
    .filter(function (r) { return r.plan_id === piano.id; })
    .sort(function (a, b) { return (a.sample_date || "") < (b.sample_date || "") ? 1 : -1; });
  const ultimo = suoi[0] || null;
  if (!ultimo) return { cls: "pill-alert", label: "Mai eseguito", ultimo: null, suoi: suoi };
  if (ultimo.result === "Non conforme") {
    return { cls: "pill-alert", label: "Ultimo esito non conforme", ultimo: ultimo, suoi: suoi };
  }
  const prossimo = aggiungiMesi(ultimo.sample_date, piano.frequency_months);
  if (!prossimo) return { cls: "pill-ok", label: "Ultimo prelievo " + fmt(ultimo.sample_date), ultimo: ultimo, suoi: suoi };
  const giorni = Math.ceil((new Date(prossimo) - new Date(oggi())) / 86400000);
  if (giorni < 0) return { cls: "pill-alert", label: "Scaduto il " + fmt(prossimo), ultimo: ultimo, suoi: suoi };
  if (giorni <= 30) return { cls: "pill-warn", label: "Da rifare entro il " + fmt(prossimo), ultimo: ultimo, suoi: suoi };
  return { cls: "pill-ok", label: "In regola fino al " + fmt(prossimo), ultimo: ultimo, suoi: suoi };
}

function AttachmentLink(props) {
  const [url, setUrl] = useState(null);
  React.useEffect(function () {
    if (props.path) getAttachmentUrl(props.path).then(setUrl);
  }, [props.path]);
  if (!props.path) return <span className="none-label">Nessun referto allegato</span>;
  if (!url) return <span className="none-label">Caricamento allegato…</span>;
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} /><span className="attachment-name">Referto di laboratorio</span><Download size={14} />
    </a>
  );
}

export default function ControlliAnalitici() {
  const { company } = useAuth();
  const companyId = company?.id;
  const { items: piani, add: addPiano, remove: removePiano, update: updatePiano, loading } =
    useTable("analysis_plan", companyId);
  const { items: referti, add: addReferto, remove: removeReferto } =
    useTable("analysis_results", companyId);

  const responsabile = (company?.haccp_manager || "").trim();

  // --- Nuovo piano ---
  const [apriPiano, setApriPiano] = useState(false);
  const [etichetta, setEtichetta] = useState("");
  const [matrice, setMatrice] = useState(MATRICI[0]);
  const [parametri, setParametri] = useState("");
  const [frequenza, setFrequenza] = useState(12);
  const [punto, setPunto] = useState("");
  const [notaPiano, setNotaPiano] = useState("");
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);

  const svuotaPiano = function () {
    setEtichetta(""); setMatrice(MATRICI[0]); setParametri("");
    setFrequenza(12); setPunto(""); setNotaPiano("");
  };

  const salvaPiano = async function (e) {
    e.preventDefault();
    if (!etichetta.trim()) { setErrore("Dai un nome al controllo."); return; }
    setBusy(true); setErrore("");
    try {
      await addPiano({
        label: etichetta.trim(),
        matrix: matrice,
        parameters: parametri.trim() || null,
        frequency_months: Number(frequenza),
        sampling_point: punto.trim() || null,
        note: notaPiano.trim() || null,
      });
      svuotaPiano();
      setApriPiano(false);
    } catch (err) {
      setErrore("Errore durante il salvataggio: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  // --- Nuovo referto ---
  const [refertoPer, setRefertoPer] = useState(null);
  const [dataPrelievo, setDataPrelievo] = useState(oggi());
  const [dataReferto, setDataReferto] = useState("");
  const [numeroReferto, setNumeroReferto] = useState("");
  const [laboratorio, setLaboratorio] = useState("");
  const [esito, setEsito] = useState(ESITI[0]);
  const [valori, setValori] = useState("");
  const [operatore, setOperatore] = useState(responsabile);
  const [notaReferto, setNotaReferto] = useState("");
  const [file, setFile] = useState(null);
  const [erroreReferto, setErroreReferto] = useState("");
  const [busyReferto, setBusyReferto] = useState(false);

  React.useEffect(function () {
    if (responsabile) setOperatore(function (prec) { return prec ? prec : responsabile; });
  }, [responsabile]);

  const apriReferto = function (piano) {
    setRefertoPer(piano.id);
    setDataPrelievo(oggi());
    setDataReferto("");
    setNumeroReferto("");
    // Il laboratorio è quasi sempre lo stesso: si propone quello dell'ultimo
    // referto registrato per questo controllo.
    const precedenti = referti
      .filter(function (r) { return r.plan_id === piano.id && r.laboratory; })
      .sort(function (a, b) { return (a.sample_date || "") < (b.sample_date || "") ? 1 : -1; });
    setLaboratorio(precedenti.length ? precedenti[0].laboratory : "");
    setEsito(ESITI[0]);
    setValori("");
    setOperatore(responsabile);
    setNotaReferto("");
    setFile(null);
    setErroreReferto("");
  };

  const scegliFile = function (e) {
    const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setErroreReferto("");
    if (f && f.size > MAX_FILE_BYTES) {
      setErroreReferto("File troppo grande (limite 8 MB).");
      setFile(null); e.target.value = ""; return;
    }
    setFile(f);
  };

  const salvaReferto = async function (piano) {
    if (!dataPrelievo) { setErroreReferto("Indica la data del prelievo."); return; }
    setBusyReferto(true); setErroreReferto("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(companyId, file);
      await addReferto({
        plan_id: piano.id,
        sample_date: dataPrelievo,
        report_date: dataReferto || null,
        report_number: numeroReferto.trim() || null,
        laboratory: laboratorio.trim() || null,
        result: esito,
        values_note: valori.trim() || null,
        attachment_path: attachment_path,
        operator: (operatore || responsabile).trim() || null,
        note: notaReferto.trim() || null,
      });
      setRefertoPer(null);
      setFile(null);
    } catch (err) {
      setErroreReferto("Errore durante il salvataggio: " + err.message);
    } finally {
      setBusyReferto(false);
    }
  };

  const attivi = piani.filter(function (p) { return p.active !== false; });
  const scoperti = attivi.filter(function (p) {
    const s = statoPiano(p, referti);
    return s.cls === "pill-alert" || s.cls === "pill-warn";
  }).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Controlli analitici</h2>
          <p className="sub">
            Analisi di laboratorio previste dal manuale di autocontrollo, con i referti ricevuti.
          </p>
        </div>
        {scoperti > 0 && (
          <div className="pill pill-alert"><AlertTriangle size={14} /> {scoperti} da eseguire</div>
        )}
      </div>

      <p className="login-info" style={{ margin: "16px 0" }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Le periodicità sono quelle stabilite dal manuale di autocontrollo dell'azienda: imposta qui
        gli stessi intervalli che il manuale dichiara, così le scadenze dei due documenti coincidono.
        Il referto del laboratorio va sempre allegato: è la prova dell'analisi.
      </p>

      <button
        type="button"
        className="btn-primary"
        onClick={function () { setApriPiano(!apriPiano); setErrore(""); }}
        style={{ marginBottom: 16 }}
      >
        <Plus size={16} /> {apriPiano ? "Chiudi" : "Aggiungi un controllo"}
      </button>

      {apriPiano && (
        <form onSubmit={salvaPiano} className="traccia-form">
          <div className="row-form" style={{ marginTop: 0 }}>
            <input
              type="text" className="note-input" placeholder="Nome del controllo (es. Analisi acqua di rete)"
              value={etichetta} onChange={function (e) { setEtichetta(e.target.value); }} required
            />
            <label className="field-label">Matrice
              <select value={matrice} onChange={function (e) { setMatrice(e.target.value); }}>
                {MATRICI.map(function (m) { return <option key={m} value={m}>{m}</option>; })}
              </select>
            </label>
          </div>

          <input
            type="text" className="full-input"
            placeholder="Parametri ricercati (es. carica batterica, coliformi, E. coli)"
            value={parametri} onChange={function (e) { setParametri(e.target.value); }}
          />

          <div className="row-form">
            <input
              type="text" className="note-input" placeholder="Punto di prelievo (es. rubinetto cucina)"
              value={punto} onChange={function (e) { setPunto(e.target.value); }}
            />
            <label className="field-label">Da ripetere ogni
              <select value={frequenza} onChange={function (e) { setFrequenza(Number(e.target.value)); }}>
                {PERIODICITA.map(function (m) { return <option key={m} value={m}>{m} mesi</option>; })}
              </select>
            </label>
          </div>

          <input
            type="text" className="full-input" placeholder="Nota (opzionale)"
            value={notaPiano} onChange={function (e) { setNotaPiano(e.target.value); }}
          />

          {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}
          <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
            <Plus size={16} /> {busy ? "Salvataggio…" : "Registra il controllo"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : attivi.length === 0 ? (
        <div className="empty"><p>Nessun controllo analitico previsto.</p></div>
      ) : (
        <ul className="dish-list">
          {attivi.map(function (piano) {
            const stato = statoPiano(piano, referti);
            const suoi = stato.suoi;

            return (
              <li key={piano.id} className={"dish-row" + (stato.cls === "pill-alert" ? " row-warn" : "")}>
                <div className="dish-top">
                  <div style={{ minWidth: 0 }}>
                    <FlaskConical size={13} style={{ marginRight: 6, verticalAlign: -2 }} color="#2F6F4E" />
                    <strong>{piano.label}</strong>
                    <span className="lot-tag">{piano.matrix}</span>
                  </div>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button
                      className="icon-btn"
                      onClick={function () { updatePiano(piano.id, { active: false }); }}
                      aria-label="Sospendi" title="Sospendi il controllo"
                    >
                      <X size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={function () {
                        if (window.confirm("Eliminare il controllo " + piano.label + "?")) removePiano(piano.id);
                      }}
                      aria-label="Elimina"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="traccia-meta">
                  <span className={"pill " + stato.cls}>{stato.label}</span>
                  <span className="doc-type-tag">Ogni {piano.frequency_months} mesi</span>
                  {piano.sampling_point && <span className="doc-type-tag">{piano.sampling_point}</span>}
                </div>
                {piano.parameters && <p className="pest-note">Parametri: {piano.parameters}</p>}
                {piano.note && <p className="pest-note">{piano.note}</p>}

                <div className="tr-head">
                  <span className="appt-section-label">
                    Referti{suoi.length > 0 ? " (" + suoi.length + ")" : ""}
                  </span>
                  <button
                    type="button" className="link-btn"
                    onClick={function () {
                      if (refertoPer === piano.id) setRefertoPer(null);
                      else apriReferto(piano);
                    }}
                  >
                    {refertoPer === piano.id ? "Annulla" : "+ Registra referto"}
                  </button>
                </div>

                {refertoPer === piano.id && (
                  <div className="nc-edit-block">
                    <div className="row-form" style={{ margin: "0 0 8px" }}>
                      <label className="field-label">Data del prelievo
                        <input type="date" value={dataPrelievo} onChange={function (e) { setDataPrelievo(e.target.value); }} />
                      </label>
                      <label className="field-label">Data del referto
                        <input type="date" value={dataReferto} onChange={function (e) { setDataReferto(e.target.value); }} />
                      </label>
                      <label className="field-label">Esito
                        <select value={esito} onChange={function (e) { setEsito(e.target.value); }}>
                          {ESITI.map(function (t) { return <option key={t} value={t}>{t}</option>; })}
                        </select>
                      </label>
                    </div>

                    <div className="row-form" style={{ margin: "0 0 8px" }}>
                      <input
                        type="text" className="note-input" placeholder="Laboratorio"
                        value={laboratorio} onChange={function (e) { setLaboratorio(e.target.value); }}
                      />
                      <input
                        type="text" className="note-input" placeholder="Numero del referto"
                        value={numeroReferto} onChange={function (e) { setNumeroReferto(e.target.value); }}
                      />
                    </div>

                    <input
                      type="text" className="full-input"
                      placeholder="Valori rilevati (opzionale, es. carica batterica 12 ufc/ml)"
                      value={valori} onChange={function (e) { setValori(e.target.value); }}
                    />

                    <div className="row-form" style={{ margin: "8px 0" }}>
                      <input
                        type="text" className="note-input" placeholder="Chi compila"
                        value={operatore} onChange={function (e) { setOperatore(e.target.value); }}
                      />
                      <input
                        type="text" className="note-input" placeholder="Nota (opzionale)"
                        value={notaReferto} onChange={function (e) { setNotaReferto(e.target.value); }}
                      />
                    </div>

                    {esito === "Non conforme" && (
                      <span className="file-error">
                        <AlertTriangle size={13} /> Esito non conforme: apri una non conformità e registra
                        l'azione correttiva presa, poi ripeti l'analisi.
                      </span>
                    )}

                    <label className="file-drop" htmlFor={"analisi-file-" + piano.id}>
                      <Paperclip size={15} />
                      <span>{file ? file.name : "Allega il referto del laboratorio (PDF o foto)"}</span>
                      <input
                        id={"analisi-file-" + piano.id} type="file" accept=".pdf,image/*"
                        onChange={scegliFile} hidden
                      />
                    </label>

                    {erroreReferto && <span className="file-error"><AlertTriangle size={13} /> {erroreReferto}</span>}
                    <div className="row-form" style={{ margin: "10px 0 0" }}>
                      <button
                        type="button" className="btn-primary" disabled={busyReferto}
                        onClick={function () { salvaReferto(piano); }}
                      >
                        <Check size={15} /> {busyReferto ? "Salvataggio…" : "Salva referto"}
                      </button>
                      <button type="button" className="link-btn" onClick={function () { setRefertoPer(null); }}>
                        Annulla
                      </button>
                    </div>
                  </div>
                )}

                {suoi.length === 0 ? (
                  <p className="none-label" style={{ margin: "4px 0 0" }}>Nessun referto registrato</p>
                ) : (
                  <ul className="tr-list">
                    {suoi.map(function (r) {
                      return (
                        <li key={r.id} className="tr-item">
                          <div className="tr-item-top">
                            <span className="tr-kind">Prelievo del {fmt(r.sample_date)}</span>
                            {r.result && (
                              <span className={"pill " + (r.result === "Non conforme" ? "pill-alert" : r.result === "Conforme" ? "pill-ok" : "pill-warn")}>
                                {r.result}
                              </span>
                            )}
                            {r.report_number && <span className="doc-type-tag">N. {r.report_number}</span>}
                            {r.report_date && <span className="doc-type-tag">referto del {fmt(r.report_date)}</span>}
                            <button
                              className="icon-btn"
                              onClick={function () {
                                if (window.confirm("Eliminare questo referto?")) removeReferto(r.id);
                              }}
                              aria-label="Elimina referto"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          {r.laboratory && <p className="pest-note" style={{ margin: "4px 0 0" }}>Laboratorio: {r.laboratory}</p>}
                          {r.values_note && <p className="pest-note" style={{ margin: "2px 0 0" }}>{r.values_note}</p>}
                          {r.operator && <p className="pest-note" style={{ margin: "2px 0 0" }}>Registrato da {r.operator}</p>}
                          {r.note && <p className="pest-note" style={{ margin: "2px 0 0" }}>{r.note}</p>}
                          <AttachmentLink path={r.attachment_path} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {piani.some(function (p) { return p.active === false; }) && (
        <>
          <h3 className="section-title">Controlli sospesi</h3>
          <ul className="dish-list">
            {piani.filter(function (p) { return p.active === false; }).map(function (p) {
              return (
                <li key={p.id} className="dish-row">
                  <div className="dish-top">
                    <div><strong>{p.label}</strong><span className="lot-tag">sospeso</span></div>
                    <button type="button" className="link-btn" onClick={function () { updatePiano(p.id, { active: true }); }}>
                      Riattiva
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
