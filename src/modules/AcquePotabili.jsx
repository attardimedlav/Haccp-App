import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Trash2,
  AlertTriangle,
  Paperclip,
  FileText,
  Download,
  Droplet,
  CalendarClock,
} from "lucide-react";
import useTable from "../hooks/useTable";
import useAuth from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";
import { supabase } from "../supabaseClient";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

const CONTROL_TYPES = [
  "Cloro residuo",
  "Analisi chimico-microbiologica",
  "Ispezione visiva impianto",
  "Manutenzione filtri/addolcitori",
  "Ispezione e pulizia vasca di accumulo",
  "Altro",
];

export const WATER_TANK_CONTROL_TYPE = "Ispezione e pulizia vasca di accumulo";

const RESULTS = ["Conforme", "Non conforme"];

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Giorni che mancano (positivi) o di ritardo (negativi) rispetto a una scadenza.
function giorniA(dataISO) {
  if (!dataISO) return null;
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const d = new Date(dataISO);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - oggi) / 86400000);
}

function aggiungiMesi(dataISO, mesi) {
  if (!dataISO) return null;
  const d = new Date(dataISO);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + (Number(mesi) || 6));
  return d.toISOString().slice(0, 10);
}

function AttachmentLink({ path }) {
  const [url, setUrl] = useState(null);
  if (!path) return <span className="none-label">Nessun referto allegato</span>;
  if (!url) {
    getAttachmentUrl(path).then(setUrl);
    return <span className="none-label">Caricamento allegato…</span>;
  }
  return (
    <a className="attachment-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={14} />
      <span className="attachment-name">{path.split("/").pop()}</span>
      <Download size={14} />
    </a>
  );
}

export default function AcquePotabili() {
  const { company } = useAuth();
  const companyId = typeof company === "string" ? company : company?.id;

  const { items, add, remove, loading } = useTable("water_controls", company);
  const {
    items: tanks,
    add: addTank,
    remove: removeTank,
    loading: loadingTanks,
  } = useTable("water_tanks", company);

  // Chi compila: proposto il responsabile HACCP dell'azienda, resta modificabile.
  const [responsabile, setResponsabile] = useState("");
  const [operator, setOperator] = useState("");

  useEffect(() => {
    let vivo = true;
    if (!companyId) return undefined;
    supabase
      .from("companies")
      .select("haccp_manager")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return;
        const nome = (data?.haccp_manager || "").trim();
        setResponsabile(nome);
        setOperator((prec) => (prec ? prec : nome));
      });
    return () => {
      vivo = false;
    };
  }, [companyId]);

  const [samplingPoint, setSamplingPoint] = useState("");
  const [controlType, setControlType] = useState(CONTROL_TYPES[0]);
  const [controlDate, setControlDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [result, setResult] = useState(RESULTS[0]);
  const [value, setValue] = useState("");
  const [lab, setLab] = useState("");
  const [note, setNote] = useState("");
  const [tankId, setTankId] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Nuova vasca
  const [tankName, setTankName] = useState("");
  const [tankLocation, setTankLocation] = useState("");
  const [tankLiters, setTankLiters] = useState("");
  const [tankMonths, setTankMonths] = useState(6);
  const [tankBusy, setTankBusy] = useState(false);
  const [tankError, setTankError] = useState("");

  const isTankControl = controlType === WATER_TANK_CONTROL_TYPE;

  const onFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    if (f && f.size > MAX_FILE_BYTES) {
      setError("File troppo grande (limite 8 MB).");
      setFile(null);
      e.target.value = "";
      return;
    }
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!samplingPoint.trim()) return;
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company, file);
      await add({
        sampling_point: samplingPoint,
        control_type: controlType,
        control_date: controlDate,
        result,
        value,
        lab,
        note,
        operator: operator.trim() || responsabile || null,
        tank_id: isTankControl && tankId ? tankId : null,
        attachment_path,
      });
      setSamplingPoint("");
      setValue("");
      setLab("");
      setNote("");
      setFile(null);
      const input = document.getElementById("acqua-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il caricamento: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitTank = async (e) => {
    e.preventDefault();
    if (!tankName.trim()) return;
    setTankBusy(true);
    setTankError("");
    try {
      await addTank({
        name: tankName.trim(),
        location: tankLocation.trim() || null,
        capacity_liters: tankLiters ? Number(tankLiters) : null,
        cleaning_months: Number(tankMonths) || 6,
        active: true,
      });
      setTankName("");
      setTankLocation("");
      setTankLiters("");
      setTankMonths(6);
    } catch (err) {
      setTankError("Errore: " + err.message);
    } finally {
      setTankBusy(false);
    }
  };

  // Per ogni vasca: ultimo controllo di pulizia e scadenza.
  const statoVasche = useMemo(() => {
    const puliture = items.filter(
      (i) => i.control_type === WATER_TANK_CONTROL_TYPE
    );
    return (tanks || []).map((t) => {
      const sue = puliture
        .filter((p) => p.tank_id === t.id)
        .sort((a, b) => (a.control_date < b.control_date ? 1 : -1));
      const ultima = sue[0]?.control_date || null;
      const mesi = t.cleaning_months || 6;
      const scadenza = ultima ? aggiungiMesi(ultima, mesi) : null;
      const giorni = giorniA(scadenza);
      return { ...t, ultima, scadenza, giorni, mesi };
    });
  }, [tanks, items]);

  const vascheScoperte = statoVasche.filter(
    (v) => v.active !== false && (v.giorni === null || v.giorni < 0)
  ).length;

  const nonConformi = items.filter((i) => i.result === "Non conforme").length;

  return (
    <>
      {/* ------------------------- VASCHE DI ACCUMULO ------------------------- */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>
              <Droplet size={18} /> Vasche e serbatoi di accumulo
            </h2>
            <p className="sub">
              Ogni vasca va ispezionata e pulita a intervalli regolari: la
              periodicità predefinita è di sei mesi (D.Lgs. 18/2023).
            </p>
          </div>
          <div>
            {vascheScoperte > 0 && (
              <div className="pill pill-alert">
                <AlertTriangle size={14} />
                {vascheScoperte}{" "}
                {vascheScoperte === 1 ? "vasca da pulire" : "vasche da pulire"}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={submitTank} className="traccia-form">
          <div className="row-form">
            <input
              type="text"
              placeholder="Nome della vasca (es. Serbatoio esterno)"
              required
              value={tankName}
              onChange={(e) => setTankName(e.target.value)}
              className="note-input"
            />
            <input
              type="text"
              placeholder="Ubicazione (opzionale)"
              value={tankLocation}
              onChange={(e) => setTankLocation(e.target.value)}
              className="note-input"
            />
          </div>
          <div className="row-form">
            <input
              type="number"
              min="0"
              placeholder="Capacità in litri (opzionale)"
              value={tankLiters}
              onChange={(e) => setTankLiters(e.target.value)}
              className="note-input"
            />
            <label className="field-label">
              Pulizia ogni (mesi)
              <input
                type="number"
                min="1"
                max="24"
                value={tankMonths}
                onChange={(e) => setTankMonths(e.target.value)}
              />
            </label>
          </div>
          {tankError && (
            <span className="file-error">
              <AlertTriangle size={14} /> {tankError}
            </span>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={tankBusy}
            style={{ alignSelf: "flex-start" }}
          >
            <Plus size={16} /> {tankBusy ? "Salvataggio…" : "Aggiungi vasca"}
          </button>
        </form>

        {loadingTanks ? (
          <p className="sub">Caricamento…</p>
        ) : statoVasche.length === 0 ? (
          <div className="empty">
            Nessuna vasca censita. Se l'azienda ha un serbatoio di accumulo,
            aggiungilo qui: il controllo semestrale si calcola su ciascuna vasca.
          </div>
        ) : (
          <div className="dish-list">
            {statoVasche.map((v) => {
              const scaduta = v.giorni !== null && v.giorni < 0;
              const mai = v.ultima === null;
              return (
                <div className="dish-row" key={v.id}>
                  <div className="dish-main">
                    <strong>{v.name}</strong>
                    {v.location && <span className="sub"> · {v.location}</span>}
                    {v.capacity_liters && (
                      <span className="sub"> · {v.capacity_liters} litri</span>
                    )}
                    <div className="sub">
                      <CalendarClock size={13} /> Pulizia ogni {v.mesi} mesi
                      {mai
                        ? " · nessuna pulizia registrata"
                        : ` · ultima il ${fmtDate(v.ultima)}`}
                      {v.scadenza && ` · prossima entro il ${fmtDate(v.scadenza)}`}
                    </div>
                  </div>
                  <div className="dish-side">
                    {mai ? (
                      <span className="pill pill-alert">
                        <AlertTriangle size={13} /> Mai pulita
                      </span>
                    ) : scaduta ? (
                      <span className="pill pill-alert">
                        <AlertTriangle size={13} /> In ritardo di{" "}
                        {Math.abs(v.giorni)} giorni
                      </span>
                    ) : (
                      <span className="pill">Fra {v.giorni} giorni</span>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      title="Elimina vasca"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Eliminare la vasca "${v.name}"? I controlli già registrati restano.`
                          )
                        )
                          removeTank(v.id);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------- CONTROLLI SULL'ACQUA ------------------------ */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Acque potabili interne</h2>
            <p className="sub">
              Autocontrollo della qualità dell'acqua distribuita internamente
              (D.Lgs. 18/2023).
            </p>
          </div>
          <div>
            {nonConformi > 0 && (
              <div className="pill pill-alert">
                <AlertTriangle size={14} /> {nonConformi}{" "}
                {nonConformi === 1 ? "non conforme" : "non conformi"}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={submit} className="traccia-form">
          <div className="row-form">
            <input
              type="text"
              placeholder="Punto di prelievo (es. Rubinetto cucina)"
              required
              value={samplingPoint}
              onChange={(e) => setSamplingPoint(e.target.value)}
              className="note-input"
            />
            <select
              value={controlType}
              onChange={(e) => setControlType(e.target.value)}
            >
              {CONTROL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {isTankControl && (
            <div className="row-form">
              <select
                value={tankId}
                onChange={(e) => setTankId(e.target.value)}
                required
              >
                <option value="">Scegli la vasca controllata…</option>
                {statoVasche.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.location ? ` — ${v.location}` : ""}
                  </option>
                ))}
              </select>
              {statoVasche.length === 0 && (
                <span className="file-error">
                  <AlertTriangle size={14} /> Aggiungi prima la vasca qui sopra.
                </span>
              )}
            </div>
          )}

          <div className="row-form">
            <label className="field-label">
              Data controllo
              <input
                type="date"
                value={controlDate}
                onChange={(e) => setControlDate(e.target.value)}
              />
            </label>
            <select value={result} onChange={(e) => setResult(e.target.value)}>
              {RESULTS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Valore rilevato (opzionale)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="note-input"
            />
          </div>

          <div className="row-form">
            <input
              type="text"
              placeholder="Chi ha eseguito il controllo"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className="note-input"
            />
            <input
              type="text"
              placeholder="Laboratorio / ente incaricato (opzionale)"
              value={lab}
              onChange={(e) => setLab(e.target.value)}
              className="note-input"
            />
          </div>

          <input
            type="text"
            placeholder="Nota (opzionale)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="full-input"
          />

          <label className="file-drop" htmlFor="acqua-file-input">
            <Paperclip size={16} />
            <span>{file ? file.name : "Allega referto analisi (opzionale)"}</span>
          </label>
          <input
            id="acqua-file-input"
            type="file"
            accept=".pdf,image/*"
            onChange={onFileChange}
            hidden
          />
          {error && (
            <span className="file-error">
              <AlertTriangle size={14} /> {error}
            </span>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={busy}
            style={{ alignSelf: "flex-start" }}
          >
            <Plus size={16} /> {busy ? "Salvataggio…" : "Registra controllo"}
          </button>
        </form>

        {loading ? (
          <p className="sub">Caricamento…</p>
        ) : items.length === 0 ? (
          <div className="empty">Nessun controllo registrato.</div>
        ) : (
          <div className="dish-list">
            {items.map((item) => {
              const bad = item.result === "Non conforme";
              const vasca = tanks.find((t) => t.id === item.tank_id);
              return (
                <div className="dish-row" key={item.id}>
                  <div className="dish-main">
                    <strong>{item.sampling_point}</strong>
                    <span className="sub"> · {item.control_type}</span>
                    {vasca && <span className="sub"> · {vasca.name}</span>}
                    <div className="sub">
                      {fmtDate(item.control_date)}
                      {item.value ? ` · ${item.value}` : ""}
                      {item.lab ? ` · ${item.lab}` : ""}
                      {item.operator ? ` · ${item.operator}` : ""}
                    </div>
                    {item.note && <div className="sub">{item.note}</div>}
                    <AttachmentLink path={item.attachment_path} />
                  </div>
                  <div className="dish-side">
                    <span className={bad ? "pill pill-alert" : "pill"}>
                      {bad && <AlertTriangle size={13} />} {item.result}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Elimina controllo"
                      onClick={() => remove(item.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
