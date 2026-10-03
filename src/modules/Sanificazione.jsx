import React, { useState } from "react";
import { Trash2, CheckCircle2, AlertTriangle, Info, Check } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { statoRiga, etichettaFrequenza, fmtData, SOGLIA_AVVISO_GIORNI } from "../utils/pianoPulizie";

export const SAN_AREAS = ["Cucina", "Sala", "Bagni", "Magazzino", "Attrezzature", "Frigoriferi"];

// Sanificazione.
//
// La scheda è il calendario delle pulizie del manuale, con le stesse righe e
// nello stesso ordine: punto di intervento, frequenza, prodotto, spunta. Le
// righe sono fisse e si vedono sempre, anche quando non c'è nulla da fare —
// è la differenza fra un registro e un elenco di eventi: un registro dice
// anche quello che NON è stato fatto.
//
// Chi compila è il responsabile HACCP, già scritto. All'OSA restano cinque
// spunte per chiudere la giornata.

function fmtOra(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

// Le fasce sono quelle della scheda cartacea: si legge per fascia, non per
// area, perché è così che si lavora — a fine turno si fa il giro delle
// quotidiane, il lunedì quello delle settimanali.
const FASCE = [
  { id: "giorno", titolo: "Ogni giorno, a fine turno", test: (g) => g === 1 },
  { id: "settimana", titolo: "Ogni settimana", test: (g) => g > 1 && g <= 14 },
  { id: "mese", titolo: "Ogni mese", test: (g) => g > 14 && g <= 90 },
  { id: "raro", titolo: "Più volte l'anno", test: (g) => g > 90 },
  { id: "occorre", titolo: "Quando occorre", test: (g) => !g || g <= 0 },
];

const oggiISO = () => new Date().toISOString().slice(0, 10);

export default function Sanificazione() {
  const { company } = useAuth();
  const companyId = company?.id;
  const { items, add, remove, loading } = useTable("sanitization_logs", companyId);
  const { items: sanitizers } = useTable("sanitizers", companyId);
  const { items: piano, loading: pianoLoading } = useTable("cleaning_plan", companyId);

  const responsabile = (company?.haccp_manager || "").trim();
  const [operator, setOperator] = useState(responsabile);
  const [prodotti, setProdotti] = useState({});
  const [busy, setBusy] = useState("");
  const [errore, setErrore] = useState("");
  const [mostraStorico, setMostraStorico] = useState(false);

  React.useEffect(() => {
    if (responsabile) setOperator((prec) => (prec ? prec : responsabile));
  }, [responsabile]);

  // Le righe che valgono per questa azienda: quelle legate a un'attrezzatura
  // compaiono solo se l'interruttore è acceso in Configurazione. Un cliente
  // senza macchina del ghiaccio non deve vedersi una riga che non lo riguarda.
  const righe = piano
    .filter((r) => r.active !== false)
    .filter((r) => !r.requires_flag || company?.[r.requires_flag])
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const fattoOggi = (riga) =>
    items.find((i) =>
      i.area === riga.area &&
      (i.operation || "") === riga.operation &&
      String(i.created_at).slice(0, 10) === oggiISO()
    ) || null;

  const prodottoDi = (riga) => {
    if (prodotti[riga.id] !== undefined) return prodotti[riga.id];
    if (riga.product && sanitizers.some((s) => s.name === riga.product)) return riga.product;
    return sanitizers.length ? sanitizers[0].name : "";
  };

  const spunta = async (riga) => {
    setBusy(riga.id);
    setErrore("");
    try {
      await add({
        area: riga.area,
        operation: riga.operation,
        sanitizer: prodottoDi(riga) || riga.product || null,
        operator: (operator || responsabile).trim(),
      });
    } catch (err) {
      setErrore("Non è stato possibile registrare: " + err.message);
    } finally {
      setBusy("");
    }
  };

  const annulla = async (log) => {
    if (!window.confirm("Togliere la spunta e cancellare questa registrazione?")) return;
    await remove(log.id);
  };

  const inRitardo = righe
    .map((r) => statoRiga(r, items))
    .filter((s) => s.cls === "pill-alert" && Number(s.riga.frequency_days) >= SOGLIA_AVVISO_GIORNI);

  const quoteGiorno = righe.filter((r) => Number(r.frequency_days) === 1);
  const fatteOggi = quoteGiorno.filter((r) => fattoOggi(r)).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Sanificazione</h2>
          <p className="sub">
            Programma di pulizia e sanificazione dell'azienda: spunta ogni intervento eseguito.
          </p>
        </div>
        {quoteGiorno.length > 0 && (
          <div className={"pill " + (fatteOggi === quoteGiorno.length ? "pill-ok" : "pill-warn")}>
            {fatteOggi === quoteGiorno.length ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            Oggi {fatteOggi} di {quoteGiorno.length}
          </div>
        )}
      </div>

      {inRitardo.length > 0 && (
        <div className="nc-edit-block" style={{ marginBottom: 12 }}>
          <p className="field-label" style={{ color: "#B3432E", margin: "0 0 6px" }}>
            <AlertTriangle size={13} /> Da recuperare:
          </p>
          {inRitardo.slice(0, 6).map((s) => (
            <p key={s.riga.id} className="pest-note" style={{ margin: "2px 0" }}>
              • {s.riga.operation} — {s.label.toLowerCase()}
            </p>
          ))}
        </div>
      )}

      <div className="row-form" style={{ marginTop: 0, marginBottom: 12 }}>
        <label className="field-label" style={{ flex: "1 1 260px" }}>
          Chi esegue e registra
          <input
            type="text" className="full-input" value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="Nome di chi compila"
          />
        </label>
      </div>

      {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}

      {pianoLoading || loading ? (
        <p className="sub">Caricamento…</p>
      ) : righe.length === 0 ? (
        <div className="empty">
          <p>
            Il programma di pulizia non è ancora impostato per questa azienda: si compila in
            Configurazione → Piano pulizie, ed è lo stesso che il manuale stampa.
          </p>
        </div>
      ) : (
        FASCE.map((fascia) => {
          const diFascia = righe.filter((r) => fascia.test(Number(r.frequency_days)));
          if (diFascia.length === 0) return null;
          return (
            <div key={fascia.id} style={{ marginBottom: 18 }}>
              <h3 className="section-title" style={{ marginBottom: 6 }}>{fascia.titolo}</h3>
              <ul className="dish-list">
                {diFascia.map((riga) => {
                  const log = fattoOggi(riga);
                  const stato = statoRiga(riga, items);
                  const periodica = Number(riga.frequency_days) >= SOGLIA_AVVISO_GIORNI;
                  const scaduta = periodica && stato.cls === "pill-alert";
                  return (
                    <li key={riga.id} className={"dish-row" + (scaduta ? " row-warn" : "")}>
                      <div className="dish-top" style={{ marginBottom: 6 }}>
                        <div style={{ minWidth: 0 }}>
                          <strong>{riga.operation}</strong>
                          <span className="lot-tag">{riga.area}</span>
                        </div>
                        {log ? (
                          <button
                            type="button" className="icon-btn" aria-label="Annulla la spunta"
                            title="Annulla la spunta" onClick={() => annulla(log)}
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : (
                          <button
                            type="button" className="btn-primary"
                            disabled={busy === riga.id || !(operator || responsabile).trim()}
                            onClick={() => spunta(riga)}
                          >
                            <Check size={15} /> {busy === riga.id ? "…" : "Fatto"}
                          </button>
                        )}
                      </div>

                      <div className="traccia-meta">
                        <span className="doc-type-tag">{etichettaFrequenza(riga.frequency_days)}</span>
                        {log ? (
                          <span className="pill pill-ok">
                            <CheckCircle2 size={12} /> Eseguito oggi da {log.operator}
                          </span>
                        ) : periodica ? (
                          <span className={"pill " + stato.cls}>{stato.label}</span>
                        ) : stato.ultima ? (
                          <span className="doc-type-tag">ultima volta il {fmtData(stato.ultima.created_at)}</span>
                        ) : (
                          <span className="none-label">mai registrata</span>
                        )}
                      </div>

                      {!log && (
                        <div className="row-form" style={{ margin: "6px 0 0" }}>
                          {sanitizers.length > 0 ? (
                            <label className="field-label" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              Prodotto
                              <select
                                value={prodottoDi(riga)}
                                onChange={(e) => setProdotti({ ...prodotti, [riga.id]: e.target.value })}
                              >
                                {sanitizers.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                                <option value="">— nessuno —</option>
                              </select>
                            </label>
                          ) : riga.product ? (
                            <span className="sub">Prodotto previsto: {riga.product}</span>
                          ) : null}
                          {riga.method && <span className="sub">{riga.method}</span>}
                        </div>
                      )}
                      {log && log.sanitizer && (
                        <span className="doc-type-tag">{log.sanitizer}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      )}

      {sanitizers.length === 0 && (
        <p className="range-hint">
          Nessun prodotto di sanificazione registrato: si aggiungono in Configurazione → Sanificanti.
          Il manuale rimanda alle loro schede tecniche, quindi conviene inserirli.
        </p>
      )}

      <button type="button" className="link-btn" onClick={() => setMostraStorico(!mostraStorico)}>
        {mostraStorico ? "Nascondi lo storico" : "Mostra lo storico delle registrazioni"}
      </button>

      {mostraStorico && (
        items.length === 0 ? (
          <div className="empty"><p>Nessun intervento registrato.</p></div>
        ) : (
          <ul className="log-list">
            {items.slice(0, 120).map((item) => (
              <li key={item.id} className="log-row">
                <CheckCircle2 size={15} color="#2F6F4E" />
                <span className="log-main">
                  <strong>{item.operation || item.area}</strong>
                  {item.operation ? " — " + item.area : ""}
                </span>
                {item.sanitizer && <span className="log-unit">{item.sanitizer}</span>}
                <span className="log-note">{item.operator}</span>
                <span className="log-time">{fmtOra(item.created_at)}</span>
                <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )
      )}

      <p className="login-info" style={{ marginTop: 14 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Le righe sono quelle del programma di pulizia scritto nel manuale di autocontrollo: si
        modificano in Configurazione → Piano pulizie e cambiano insieme nei due posti. Le voci legate
        a un'attrezzatura compaiono solo se l'azienda ce l'ha.
      </p>
    </div>
  );
}
