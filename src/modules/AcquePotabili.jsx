import React, { useState, useMemo } from "react";
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
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { uploadAttachment, getAttachmentUrl } from "../hooks/useAttachment";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

// Questa sezione registra una cosa sola: l'ispezione e pulizia delle vasche di
// accumulo, con periodicità semestrale. Le analisi di laboratorio stanno in
// Controlli analitici, la manutenzione dei filtri in Acqua filtrata.
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
  if (!path) return <span className="none-label">Nessun allegato</span>;
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
  const companyId = company?.id || company;

  const { items, add, remove, loading } = useTable("water_controls", companyId);
  const {
    items: tanks,
    add: addTank,
    remove: removeTank,
    loading: loadingTanks,
  } = useTable("water_tanks", companyId);

  const responsabile = (company?.haccp_manager || "").trim();
  const [operator, setOperator] = useState("");
  const chiCompila = operator || responsabile;

  // Nuova vasca
  const [tankName, setTankName] = useState("");
  const [tankLocation, setTankLocation] = useState("");
  const [tankLiters, setTankLiters] = useState("");
  const [tankMonths, setTankMonths] = useState(6);
  const [tankBusy, setTankBusy] = useState(false);
  const [tankError, setTankError] = useState("");

  // Nuova ispezione
  const [tankId, setTankId] = useState("");
  const [controlDate, setControlDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [result, setResult] = useState(RESULTS[0]);
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const submit = async (e) => {
    e.preventDefault();
    if (!tankId) {
      setError("Scegli la vasca ispezionata.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let attachment_path = null;
      if (file) attachment_path = await uploadAttachment(company, file);
      const vasca = tanks.find((t) => t.id === tankId);
      await add({
        sampling_point: vasca?.name || "Vasca di accumulo",
        control_type: WATER_TANK_CONTROL_TYPE,
        control_date: controlDate,
        result,
        note: note.trim() || null,
        operator: chiCompila.trim() || null,
        tank_id: tankId,
        attachment_path,
      });
      setNote("");
      setFile(null);
      const input = document.getElementById("vasca-file-input");
      if (input) input.value = "";
    } catch (err) {
      setError("Errore durante il salvataggio: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  // Solo le ispezioni delle vasche: tutto il resto non appartiene a questa sezione.
  const ispezioni = useMemo(
    () =>
      items
        .filter((i) => i.control_type === WATER_TANK_CONTROL_TYPE)
        .sort((a, b) => (a.control_date < b.control_date ? 1 : -1)),
    [items]
  );

  const altriControlli = items.length - ispezioni.length;

  const statoVasche = useMemo(() => {
    return (tanks || []).map((t) => {
      const sue = ispezioni.filter((p) => p.tank_id === t.id);
      const ultima = sue[0]?.control_date || null;
      const mesi = t.cleaning_months || 6;
      const scadenza = ultima ? aggiungiMesi(ultima, mesi) : null;
      return { ...t, ultima, scadenza, giorni: giorniA(scadenza), mesi };
    });
  }, [tanks, ispezioni]);

  const scoperte = statoVasche.filter(
    (v) => v.active !== false && (v.giorni === null || v.giorni < 0)
  ).length;

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>
              <Droplet size={18} /> Vasche e serbatoi di accumulo
            </h2>
            <p className="sub">
              Ispezione e pulizia con periodicità semestrale, per ogni vasca
              presente in azienda (D.Lgs. 18/2023).
            </p>
          </div>
          <div>
            {scoperte > 0 && (
              <div className="pill pill-alert">
                <AlertTriangle size={14} /> {scoperte}{" "}
                {scoperte === 1 ? "vasca da pulire" : "vasche da pulire"}
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
              const mai = v.ultima === null;
              const scaduta = v.giorni !== null && v.giorni < 0;
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
                      {v.scadenza &&
                        ` · prossima entro il ${fmtDate(v.scadenza)}`}
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
                            `Eliminare la vasca "${v.name}"? Le ispezioni già registrate restano.`
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

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Registro delle ispezioni e pulizie</h2>
            <p className="sub">
              Ogni intervento di ispezione e pulizia di una vasca. Da qui riparte
              il conteggio dei sei mesi.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="traccia-form">
          <div className="row-form">
            <select
              value={tankId}
              onChange={(e) => setTankId(e.target.value)}
              required
            >
              <option value="">Vasca ispezionata…</option>
              {statoVasche.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.location ? ` — ${v.location}` : ""}
                </option>
              ))}
            </select>
            <label className="field-label">
              Data intervento
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
          </div>

          {statoVasche.length === 0 && (
            <span className="file-error">
              <AlertTriangle size={14} /> Aggiungi prima la vasca qui sopra.
            </span>
          )}

          <div className="row-form">
            <input
              type="text"
              placeholder="Chi ha eseguito l'intervento"
              value={chiCompila}
              onChange={(e) => setOperator(e.target.value)}
              className="note-input"
            />
            <input
              type="text"
              placeholder="Nota: prodotti usati, anomalie riscontrate (opzionale)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="note-input"
            />
          </div>

          <label className="file-drop" htmlFor="vasca-file-input">
            <Paperclip size={16} />
            <span>
              {file
                ? file.name
                : "Allega rapporto della ditta o foto (opzionale)"}
            </span>
          </label>
          <input
            id="vasca-file-input"
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
            <Plus size={16} />{" "}
            {busy ? "Salvataggio…" : "Registra ispezione e pulizia"}
          </button>
        </form>

        {loading ? (
          <p className="sub">Caricamento…</p>
        ) : ispezioni.length === 0 ? (
          <div className="empty">Nessuna ispezione registrata.</div>
        ) : (
          <div className="dish-list">
            {ispezioni.map((item) => {
              const bad = item.result === "Non conforme";
              const vasca = tanks.find((t) => t.id === item.tank_id);
              return (
                <div className="dish-row" key={item.id}>
                  <div className="dish-main">
                    <strong>{vasca?.name || item.sampling_point}</strong>
                    <div className="sub">
                      {fmtDate(item.control_date)}
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
                      title="Elimina registrazione"
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

        {altriControlli > 0 && (
          <p className="sub" style={{ marginTop: 12 }}>
            In archivio ci sono {altriControlli}{" "}
            {altriControlli === 1
              ? "registrazione di altro tipo"
              : "registrazioni di altro tipo"}{" "}
            (cloro, analisi, filtri): non si perdono, ma non appartengono a
            questa sezione.
          </p>
        )}
      </div>
    </>
  );
}
