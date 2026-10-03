import React, { useState } from "react";
import { Plus, Trash2, Paperclip, FileText, Download, AlertTriangle, Info, Filter, Wrench, Check, X, Pencil } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

// Acqua filtrata.
//
// Sezione separata dalle vasche di accumulo: lì si registra la pulizia di un
// serbatoio che è dell'azienda, qui un apparecchio che l'azienda ha in
// comodato o in contratto dal fornitore. La differenza non è formale: la
// manutenzione dell'impianto filtrante è a carico della ditta che lo
// fornisce, e all'OSA resta l'obbligo di conservarne la prova.
//
// Per questo la scheda chiede sempre chi ha eseguito l'intervento e consente
// di allegare il rapporto: in sede di controllo ufficiale è quel documento a
// dimostrare che la manutenzione è stata fatta da chi doveva farla.

const MAX_FILE_BYTES = 8 * 1024 * 1024;

const TIPI_FILTRO = [
  "Addolcitore",
  "Filtro a carboni attivi",
  "Osmosi inversa",
  "Microfiltrazione",
  "Lampada UV",
  "Gasatore / refrigeratore",
  "Altro",
];

const TIPI_INTERVENTO = [
  "Sostituzione cartucce / filtri",
  "Sanificazione dell'impianto",
  "Rigenerazione resine",
  "Sostituzione lampada UV",
  "Controllo periodico",
  "Riparazione",
  "Altro",
];

const ESITI = ["Regolare", "Con anomalie risolte", "Da rivedere"];

const MESI = [3, 6, 12, 24];

const oggi = () => new Date().toISOString().slice(0, 10);

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

// Stato dell'impianto: scaduto, in scadenza entro 30 giorni, in regola.
// Vale la scadenza scritta sul rapporto se c'è, altrimenti quella calcolata
// dalla periodicità dichiarata nel contratto.
function statoManutenzione(impianto, interventi) {
  const suoi = interventi
    .filter(function (s) { return s.filter_id === impianto.id; })
    .sort(function (a, b) { return (a.service_date || "") < (b.service_date || "") ? 1 : -1; });
  const ultimo = suoi[0] || null;
  if (!ultimo) return { cls: "pill-alert", label: "Nessuna manutenzione registrata", ultimo: null };
  const prossima = ultimo.next_due || aggiungiMesi(ultimo.service_date, impianto.maintenance_months);
  if (!prossima) return { cls: "pill-ok", label: "Ultimo intervento " + fmt(ultimo.service_date), ultimo: ultimo };
  const giorni = Math.ceil((new Date(prossima) - new Date(oggi())) / 86400000);
  if (giorni < 0) return { cls: "pill-alert", label: "Manutenzione scaduta il " + fmt(prossima), ultimo: ultimo };
  if (giorni <= 30) return { cls: "pill-warn", label: "Da rifare entro il " + fmt(prossima), ultimo: ultimo };
  return { cls: "pill-ok", label: "In regola fino al " + fmt(prossima), ultimo: ultimo };
}

function AttachmentLink(props) {
  const [url, setUrl] = useState(null);
  React.useEffect(function () {
    if (props.path) getAttachmentUrl(props.path).then(setUrl);
  }, [props.path]);
  if (!props.path) return <span className="none-label">Nessun rapporto allegato</span>;
  if (!url) return <span className="none-label">Caricamento allegato…</span>;
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={16} /><span className="attachment-name">Rapporto di intervento</span><Download size={14} />
    </a>
  );
}

export default function AcquaFiltrata() {
  const { company } = useAuth();
  const companyId = company?.id;
  const { items: impianti, add: addImpianto, remove: removeImpianto, update: updateImpianto, loading } =
    useTable("water_filters", companyId);
  const { items: interventi, add: addIntervento, remove: removeIntervento } =
    useTable("water_filter_services", companyId);

  const responsabile = (company?.haccp_manager || "").trim();

  // --- Nuovo impianto ---
  const [apriImpianto, setApriImpianto] = useState(false);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState(TIPI_FILTRO[0]);
  const [posizione, setPosizione] = useState("");
  const [installato, setInstallato] = useState("");
  const [fornitore, setFornitore] = useState("");
  const [contatto, setContatto] = useState("");
  const [contratto, setContratto] = useState("");
  const [periodicita, setPeriodicita] = useState(6);
  const [notaImpianto, setNotaImpianto] = useState("");
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);

  const svuotaImpianto = function () {
    setNome(""); setTipo(TIPI_FILTRO[0]); setPosizione(""); setInstallato("");
    setFornitore(""); setContatto(""); setContratto(""); setPeriodicita(6); setNotaImpianto("");
  };

  const salvaImpianto = async function (e) {
    e.preventDefault();
    if (!nome.trim()) { setErrore("Dai un nome all'impianto."); return; }
    if (!fornitore.trim()) { setErrore("Indica la ditta che fornisce l'impianto: è lei a doverne fare la manutenzione."); return; }
    setBusy(true); setErrore("");
    try {
      await addImpianto({
        name: nome.trim(),
        filter_type: tipo,
        location: posizione.trim() || null,
        installed_on: installato || null,
        supplier_name: fornitore.trim(),
        supplier_contact: contatto.trim() || null,
        contract_ref: contratto.trim() || null,
        maintenance_months: Number(periodicita),
        note: notaImpianto.trim() || null,
      });
      svuotaImpianto();
      setApriImpianto(false);
    } catch (err) {
      setErrore("Errore durante il salvataggio: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  // --- Nuovo intervento su un impianto ---
  const [interventoPer, setInterventoPer] = useState(null);
  const [dataIntervento, setDataIntervento] = useState(oggi());
  const [tipoIntervento, setTipoIntervento] = useState(TIPI_INTERVENTO[0]);
  const [eseguitoDa, setEseguitoDa] = useState("");
  const [esito, setEsito] = useState(ESITI[0]);
  const [prossima, setProssima] = useState("");
  const [operatore, setOperatore] = useState(responsabile);
  const [notaIntervento, setNotaIntervento] = useState("");
  const [file, setFile] = useState(null);
  const [erroreIntervento, setErroreIntervento] = useState("");
  const [busyIntervento, setBusyIntervento] = useState(false);

  React.useEffect(function () {
    if (responsabile) setOperatore(function (prec) { return prec ? prec : responsabile; });
  }, [responsabile]);

  const apriIntervento = function (impianto) {
    setInterventoPer(impianto.id);
    setDataIntervento(oggi());
    setTipoIntervento(TIPI_INTERVENTO[0]);
    setEseguitoDa(impianto.supplier_name || "");
    setEsito(ESITI[0]);
    setProssima(aggiungiMesi(oggi(), impianto.maintenance_months));
    setOperatore(responsabile);
    setNotaIntervento("");
    setFile(null);
    setErroreIntervento("");
  };

  const scegliFile = function (e) {
    const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setErroreIntervento("");
    if (f && f.size > MAX_FILE_BYTES) {
      setErroreIntervento("File troppo grande (limite 8 MB).");
      setFile(null); e.target.value = ""; return;
    }
    setFile(f);
  };

  const salvaIntervento = async function (impianto) {
    if (!dataIntervento) { setErroreIntervento("Indica la data dell'intervento."); return; }
    if (!eseguitoDa.trim()) { setErroreIntervento("Indica chi ha eseguito l'intervento."); return; }
    setBusyIntervento(true); setErroreIntervento("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(companyId, file);
      await addIntervento({
        filter_id: impianto.id,
        service_date: dataIntervento,
        service_type: tipoIntervento,
        performed_by: eseguitoDa.trim(),
        outcome: esito,
        next_due: prossima || null,
        attachment_path: attachment_path,
        operator: (operatore || responsabile).trim() || null,
        note: notaIntervento.trim() || null,
      });
      setInterventoPer(null);
      setFile(null);
    } catch (err) {
      setErroreIntervento("Errore durante il salvataggio: " + err.message);
    } finally {
      setBusyIntervento(false);
    }
  };

  const attivi = impianti.filter(function (i) { return i.active !== false; });
  const scoperti = attivi.filter(function (i) {
    const s = statoManutenzione(i, interventi);
    return s.cls === "pill-alert" || s.cls === "pill-warn";
  }).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Acqua filtrata</h2>
          <p className="sub">
            Impianti di trattamento dell'acqua e manutenzioni eseguite dalla ditta fornitrice.
          </p>
        </div>
        {scoperti > 0 && (
          <div className="pill pill-alert"><AlertTriangle size={14} /> {scoperti} da sistemare</div>
        )}
      </div>

      <p className="login-info" style={{ margin: "16px 0" }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        La manutenzione dell'impianto filtrante è a carico della ditta che lo fornisce, secondo il
        contratto di fornitura o comodato. All'azienda resta l'obbligo di conservare la prova degli
        interventi: registra ogni passaggio del tecnico e allega il rapporto che ti lascia.
      </p>

      <button
        type="button"
        className="btn-primary"
        onClick={function () { setApriImpianto(!apriImpianto); setErrore(""); }}
        style={{ marginBottom: 16 }}
      >
        <Plus size={16} /> {apriImpianto ? "Chiudi" : "Aggiungi un impianto"}
      </button>

      {apriImpianto && (
        <form onSubmit={salvaImpianto} className="traccia-form">
          <div className="row-form" style={{ marginTop: 0 }}>
            <input
              type="text" className="note-input" placeholder="Nome dell'impianto (es. Addolcitore cucina)"
              value={nome} onChange={function (e) { setNome(e.target.value); }} required
            />
            <label className="field-label">Tipo
              <select value={tipo} onChange={function (e) { setTipo(e.target.value); }}>
                {TIPI_FILTRO.map(function (t) { return <option key={t} value={t}>{t}</option>; })}
              </select>
            </label>
          </div>

          <div className="row-form">
            <input
              type="text" className="note-input" placeholder="Dove si trova"
              value={posizione} onChange={function (e) { setPosizione(e.target.value); }}
            />
            <label className="field-label">Installato il
              <input type="date" value={installato} onChange={function (e) { setInstallato(e.target.value); }} />
            </label>
          </div>

          <div className="row-form">
            <input
              type="text" className="note-input" placeholder="Ditta fornitrice (a carico della manutenzione)"
              value={fornitore} onChange={function (e) { setFornitore(e.target.value); }} required
            />
            <input
              type="text" className="note-input" placeholder="Telefono o email della ditta"
              value={contatto} onChange={function (e) { setContatto(e.target.value); }}
            />
          </div>

          <div className="row-form">
            <input
              type="text" className="note-input" placeholder="Riferimento del contratto (opzionale)"
              value={contratto} onChange={function (e) { setContratto(e.target.value); }}
            />
            <label className="field-label">Manutenzione ogni
              <select value={periodicita} onChange={function (e) { setPeriodicita(Number(e.target.value)); }}>
                {MESI.map(function (m) { return <option key={m} value={m}>{m} mesi</option>; })}
              </select>
            </label>
          </div>

          <input
            type="text" className="full-input" placeholder="Nota (opzionale)"
            value={notaImpianto} onChange={function (e) { setNotaImpianto(e.target.value); }}
          />
          <p className="range-hint">
            La periodicità è quella scritta nel contratto di fornitura: serve all'app per avvisarti
            quando il tecnico avrebbe dovuto tornare.
          </p>

          {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}
          <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
            <Plus size={16} /> {busy ? "Salvataggio…" : "Registra l'impianto"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : attivi.length === 0 ? (
        <div className="empty"><p>Nessun impianto di filtrazione registrato.</p></div>
      ) : (
        <ul className="dish-list">
          {attivi.map(function (impianto) {
            const stato = statoManutenzione(impianto, interventi);
            const suoi = interventi
              .filter(function (s) { return s.filter_id === impianto.id; })
              .sort(function (a, b) { return (a.service_date || "") < (b.service_date || "") ? 1 : -1; });

            return (
              <li key={impianto.id} className={"dish-row" + (stato.cls === "pill-alert" ? " row-warn" : "")}>
                <div className="dish-top">
                  <div style={{ minWidth: 0 }}>
                    <Filter size={13} style={{ marginRight: 6, verticalAlign: -2 }} color="#2F6F4E" />
                    <strong>{impianto.name}</strong>
                    <span className="lot-tag">{impianto.filter_type}</span>
                  </div>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button
                      className="icon-btn"
                      onClick={function () { updateImpianto(impianto.id, { active: false }); }}
                      aria-label="Metti fuori servizio" title="Metti fuori servizio"
                    >
                      <X size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={function () {
                        if (window.confirm("Eliminare l'impianto " + impianto.name + " e perdere il collegamento con i suoi interventi?")) {
                          removeImpianto(impianto.id);
                        }
                      }}
                      aria-label="Elimina"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="traccia-meta">
                  <span className={"pill " + stato.cls}>{stato.label}</span>
                  {impianto.location && <span className="doc-type-tag">{impianto.location}</span>}
                  <span className="doc-type-tag">Manutenzione ogni {impianto.maintenance_months} mesi</span>
                  {impianto.installed_on && <span className="doc-type-tag">Installato il {fmt(impianto.installed_on)}</span>}
                </div>

                <p className="pest-note">
                  Manutenzione a carico di <strong>{impianto.supplier_name}</strong>
                  {impianto.supplier_contact ? " (" + impianto.supplier_contact + ")" : ""}
                  {impianto.contract_ref ? " — contratto " + impianto.contract_ref : ""}.
                </p>
                {impianto.note && <p className="pest-note">{impianto.note}</p>}

                <div className="tr-head">
                  <span className="appt-section-label">
                    Interventi registrati{suoi.length > 0 ? " (" + suoi.length + ")" : ""}
                  </span>
                  <button
                    type="button" className="link-btn"
                    onClick={function () {
                      if (interventoPer === impianto.id) setInterventoPer(null);
                      else apriIntervento(impianto);
                    }}
                  >
                    {interventoPer === impianto.id ? "Annulla" : "+ Registra intervento"}
                  </button>
                </div>

                {interventoPer === impianto.id && (
                  <div className="nc-edit-block">
                    <div className="row-form" style={{ margin: "0 0 8px" }}>
                      <label className="field-label">Data
                        <input
                          type="date" value={dataIntervento}
                          onChange={function (e) {
                            setDataIntervento(e.target.value);
                            setProssima(aggiungiMesi(e.target.value, impianto.maintenance_months));
                          }}
                        />
                      </label>
                      <label className="field-label">Tipo di intervento
                        <select value={tipoIntervento} onChange={function (e) { setTipoIntervento(e.target.value); }}>
                          {TIPI_INTERVENTO.map(function (t) { return <option key={t} value={t}>{t}</option>; })}
                        </select>
                      </label>
                      <label className="field-label">Esito
                        <select value={esito} onChange={function (e) { setEsito(e.target.value); }}>
                          {ESITI.map(function (t) { return <option key={t} value={t}>{t}</option>; })}
                        </select>
                      </label>
                    </div>

                    <div className="row-form" style={{ margin: "0 0 8px" }}>
                      <input
                        type="text" className="note-input" placeholder="Eseguito da (tecnico o ditta)"
                        value={eseguitoDa} onChange={function (e) { setEseguitoDa(e.target.value); }}
                      />
                      <label className="field-label">Prossimo intervento
                        <input type="date" value={prossima} onChange={function (e) { setProssima(e.target.value); }} />
                      </label>
                    </div>

                    <div className="row-form" style={{ margin: "0 0 8px" }}>
                      <input
                        type="text" className="note-input" placeholder="Chi compila"
                        value={operatore} onChange={function (e) { setOperatore(e.target.value); }}
                      />
                      <input
                        type="text" className="note-input" placeholder="Nota (opzionale)"
                        value={notaIntervento} onChange={function (e) { setNotaIntervento(e.target.value); }}
                      />
                    </div>

                    <label className="file-drop" htmlFor={"filtro-file-" + impianto.id}>
                      <Paperclip size={15} />
                      <span>{file ? file.name : "Allega il rapporto lasciato dal tecnico (PDF o foto)"}</span>
                      <input
                        id={"filtro-file-" + impianto.id} type="file" accept=".pdf,image/*"
                        onChange={scegliFile} hidden
                      />
                    </label>

                    {erroreIntervento && <span className="file-error"><AlertTriangle size={13} /> {erroreIntervento}</span>}
                    <div className="row-form" style={{ margin: "10px 0 0" }}>
                      <button
                        type="button" className="btn-primary" disabled={busyIntervento}
                        onClick={function () { salvaIntervento(impianto); }}
                      >
                        <Check size={15} /> {busyIntervento ? "Salvataggio…" : "Salva intervento"}
                      </button>
                      <button type="button" className="link-btn" onClick={function () { setInterventoPer(null); }}>
                        Annulla
                      </button>
                    </div>
                  </div>
                )}

                {suoi.length === 0 ? (
                  <p className="none-label" style={{ margin: "4px 0 0" }}>Nessun intervento registrato</p>
                ) : (
                  <ul className="tr-list">
                    {suoi.map(function (s) {
                      return (
                        <li key={s.id} className="tr-item">
                          <div className="tr-item-top">
                            <span className="tr-kind">{s.service_type}</span>
                            <span className="doc-type-tag">del {fmt(s.service_date)}</span>
                            {s.outcome && <span className="doc-type-tag">{s.outcome}</span>}
                            {s.next_due && <span className="doc-type-tag">prossimo {fmt(s.next_due)}</span>}
                            <button
                              className="icon-btn"
                              onClick={function () {
                                if (window.confirm("Eliminare questo intervento?")) removeIntervento(s.id);
                              }}
                              aria-label="Elimina intervento"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <p className="pest-note" style={{ margin: "4px 0 0" }}>
                            <Wrench size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
                            Eseguito da {s.performed_by}
                            {s.operator ? " — registrato da " + s.operator : ""}
                          </p>
                          {s.note && <p className="pest-note" style={{ margin: "2px 0 0" }}>{s.note}</p>}
                          <AttachmentLink path={s.attachment_path} />
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

      {impianti.some(function (i) { return i.active === false; }) && (
        <>
          <h3 className="section-title">Impianti fuori servizio</h3>
          <ul className="dish-list">
            {impianti.filter(function (i) { return i.active === false; }).map(function (i) {
              return (
                <li key={i.id} className="dish-row">
                  <div className="dish-top">
                    <div><strong>{i.name}</strong><span className="lot-tag">fuori servizio</span></div>
                    <button type="button" className="link-btn" onClick={function () { updateImpianto(i.id, { active: true }); }}>
                      Rimetti in servizio
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
