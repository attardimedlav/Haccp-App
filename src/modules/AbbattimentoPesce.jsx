import React, { useState } from "react";
import { Plus, Trash2, AlertTriangle, CheckCircle2, Snowflake, Timer, ThermometerSnowflake, XCircle, Package, Printer } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { stampaEtichetta, dataEtichetta } from "../utils/etichetta";

// I due soli trattamenti previsti dal Reg. (CE) n. 853/2004, Allegato III,
// sezione VIII, capitolo III, lettera D, per il pesce destinato al consumo
// crudo. Il terzo che c'era prima — -15 °C per 96 ore — in quel regolamento
// non esiste: circola nei manuali e l'avevamo raccolto da lì. Lasciarlo
// significava permettere di registrare come conforme un trattamento che non
// soddisfa l'obbligo di legge, e che il manuale della stessa azienda non
// dichiara. I cicli già registrati con quei parametri restano negli archivi
// con i valori che avevano: lo storico non si riscrive.
const TREATMENT_OPTIONS = [
  { id: "-20-24", label: "-20°C per 24 ore", temp: -20, hours: 24 },
  { id: "-35-15", label: "-35°C per 15 ore (abbattitore rapido)", temp: -35, hours: 15 },
];

// Tre processi diversi sotto la stessa scheda, e i nomi devono dirlo: uno e'
// un trattamento sanitario imposto dalla legge, uno e' raffreddamento rapido
// dopo la cottura, uno e' conservazione. Un'etichetta generica come
// "abbattimento" su tutti e tre e' il modo migliore perche' un giorno qualcuno
// registri un semifreddo credendo di aver bonificato del pesce.
const SUB_TABS = [
  { id: "cotti", label: "Raffreddamento rapido (cotti)", icon: ThermometerSnowflake, requires: "has_blast_chiller" },
  { id: "congelamento", label: "Congelamento per conservazione", icon: Package, requires: "has_blast_chiller" },
  { id: "abbattimento", label: "Bonifica del pesce crudo", icon: Snowflake, requires: "serves_raw_fish" },
  { id: "scongelamento", label: "Scongelamento del pesce", icon: Timer, requires: "serves_raw_fish" },
];

// Abbattimento rapido dei prodotti cotti: valori di buona prassi riportati nei
// manuali di autocontrollo, confermati dall'utente il 17/09/2026.
// Il limite critico è la TEMPERATURA al cuore. Il tempo resta scritto nel
// registro e resta un riferimento di buona prassi, ma non fa più scattare la
// non conformità: gli abbattitori lavorano sulla sonda e si fermano quando la
// temperatura è raggiunta, e nessuno cronometra il ciclo. Far dipendere il
// giudizio da due orari scritti a mano produceva non conformità finte, che
// poi vanno trattate come se fossero vere — e un registro pieno di non
// conformità finte è un registro che non si legge più.
const CICLI = {
  positivo: { label: "Positivo — da +70°C a +3°C al cuore", target: 3, minuti: 90 },
  negativo: { label: "Negativo — da +70°C a -18°C al cuore", target: -18, minuti: 240 },
};

function minutiTrascorsi(da, a = Date.now()) {
  return Math.round((new Date(a).getTime() - new Date(da).getTime()) / 60000);
}

function AbbattimentoCotti({ company }) {
  const { items, add, update, remove, loading } = useTable("blast_chill_cycles", company?.id);
  const [prodotto, setProdotto] = useState("");
  const [tipo, setTipo] = useState("positivo");
  const [inizio, setInizio] = useState(nowLocalInput());
  const [tempInizio, setTempInizio] = useState("");
  const [fine, setFine] = useState("");
  const [tempFine, setTempFine] = useState("");
  const [operatore, setOperatore] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [, tick] = useState(0);
  React.useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  // Chiusura dei cicli lasciati aperti dalla versione precedente, che
  // registrava prima l'avvio e poi la fine. Si tiene finché ce ne sono: una
  // riga aperta che non si può più chiudere resterebbe incompleta per sempre.
  const [chiusura, setChiusura] = useState({});

  // Una registrazione sola, come sul foglio di carta: inizio, fine e le due
  // temperature si scrivono insieme, quando il ciclo è finito. Prima bisognava
  // avviare il ciclo, tornare un'ora e mezza dopo e chiuderlo — con l'app
  // aperta e il telefono in mano in mezzo al lavoro. L'esito lo calcola
  // comunque il programma, confrontando temperatura e minuti con i limiti del
  // ciclo scelto: quello non si scrive a mano, altrimenti non sarebbe un
  // controllo ma una dichiarazione.
  const registra = async (e) => {
    e.preventDefault();
    setErrore("");
    if (!prodotto.trim() || !operatore.trim()) return;
    if (!inizio) { setErrore("Manca l'ora di inizio."); return; }
    if (!fine) { setErrore("Manca l'ora di fine."); return; }
    if (tempFine === "") { setErrore("Manca la temperatura al cuore a fine ciclo: è il dato su cui si giudica il ciclo."); return; }
    const inizioData = new Date(inizio);
    const fineData = new Date(fine);
    if (fineData <= inizioData) { setErrore("La fine deve venire dopo l'inizio."); return; }

    const c = CICLI[tipo];
    const temp = Number(String(tempFine).replace(",", "."));
    const minuti = minutiTrascorsi(inizioData, fineData);
    const conforme = temp <= c.target;

    setBusy(true);
    await add({
      product_name: prodotto,
      cycle_type: tipo,
      target_temp: c.target,
      max_minutes: c.minuti,
      start_time: inizioData.toISOString(),
      start_core_temp: tempInizio === "" ? null : Number(String(tempInizio).replace(",", ".")),
      end_time: fineData.toISOString(),
      end_core_temp: temp,
      outcome: conforme ? "conforme" : "non_conforme",
      operator: operatore,
    });
    setProdotto(""); setTempInizio(""); setTempFine(""); setFine("");
    setOperatore(""); setInizio(nowLocalInput());
    setBusy(false);
  };

  const chiudi = async (ciclo) => {
    const dati = chiusura[ciclo.id] || {};
    if (dati.temp === undefined || dati.temp === "") return;
    const fine = dati.fine ? new Date(dati.fine) : new Date();
    const temp = Number(String(dati.temp).replace(",", "."));
    const minuti = minutiTrascorsi(ciclo.start_time, fine);
    const conforme = temp <= Number(ciclo.target_temp);
    await update(ciclo.id, {
      end_time: fine.toISOString(),
      end_core_temp: temp,
      outcome: conforme ? "conforme" : "non_conforme",
    });
    setChiusura((c) => { const n = { ...c }; delete n[ciclo.id]; return n; });
  };

  return (
    <>
      <p className="range-hint">
        Il prodotto appena cotto va portato velocemente a bassa temperatura al cuore, letta sul display dell'abbattitore che riporta la sonda a spillone, per attraversare in fretta la fascia in cui i germi si moltiplicano: +3°C (ciclo positivo) o -18°C (negativo). <strong>Il giudizio si fonda sulla temperatura raggiunta</strong>; la durata viene registrata e, se è lunga, segnalata come cosa da verificare — carico dell'abbattitore e pezzatura — ma non fa da sola una non conformità. Se la temperatura non è stata raggiunta il ciclo è non conforme: valuta il prodotto e registra l'azione in Non conformità. Questo non è né la bonifica del pesce crudo né il congelamento per conservazione: sono schede diverse.
      </p>
      <form onSubmit={registra} className="traccia-form">
        <div className="row-form">
          <input type="text" placeholder="Prodotto (es. Ragù, Crema pasticcera)" required value={prodotto} onChange={(e) => setProdotto(e.target.value)} className="note-input" />
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(CICLI).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
          </select>
        </div>
        <div className="row-form">
          <label className="field-label">Inizio
            <input type="datetime-local" value={inizio} onChange={(e) => setInizio(e.target.value)} required />
          </label>
          <input type="text" inputMode="decimal" placeholder="°C al cuore a inizio" value={tempInizio} onChange={(e) => setTempInizio(e.target.value)} style={{ width: 160 }} />
        </div>
        <div className="row-form">
          <label className="field-label">Fine
            <input type="datetime-local" value={fine} onChange={(e) => setFine(e.target.value)} required />
          </label>
          <input type="text" inputMode="decimal" placeholder="°C al cuore a fine" value={tempFine} onChange={(e) => setTempFine(e.target.value)} style={{ width: 160 }} required />
        </div>
        <div className="row-form">
          <input type="text" placeholder="Operatore" required value={operatore} onChange={(e) => setOperatore(e.target.value)} className="note-input" />
          {company?.haccp_manager && (
            <button type="button" className="link-btn" onClick={() => setOperatore(company.haccp_manager)}>Usa responsabile HACCP</button>
          )}
        </div>
        {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> {busy ? "Registrazione…" : "Registra l'abbattimento"}
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun abbattimento registrato.</p></div>
      ) : (
        <ul className="dish-list">
          {items.map((c) => {
            const chiuso = !!c.outcome;
            const trascorsi = minutiTrascorsi(c.start_time);
            const scaduto = !chiuso && trascorsi > c.max_minutes;
            const nc = c.outcome === "non_conforme";
            // La durata lunga si segnala, non si condanna.
            const lungo = chiuso && minutiTrascorsi(c.start_time, c.end_time) > c.max_minutes;
            return (
              <li key={c.id} className={"dish-row" + (nc || scaduto ? " row-warn" : "")}>
                <div className="dish-top">
                  <div>
                    <strong>{c.product_name}</strong>
                    <span className="lot-tag">{c.cycle_type === "positivo" ? "+3°C al cuore" : "-18°C al cuore"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button className="icon-btn" aria-label="Stampa etichetta" title="Stampa etichetta"
                      onClick={() => stampaEtichetta({
                        titolo: c.product_name,
                        righe: [
                          ["Raffreddato il", dataEtichetta(c.end_time || c.start_time)],
                          ["Ciclo", c.cycle_type === "positivo" ? "+3 °C al cuore" : "-18 °C al cuore"],
                          ["T. finale", c.end_core_temp != null ? `${c.end_core_temp} °C` : ""],
                          ["Operatore", c.operator],
                          "Conservare in frigorifero. Consumare entro il termine indicato in manuale.",
                        ],
                        piede: company?.name || "",
                      })}>
                      <Printer size={14} />
                    </button>
                    <button className="icon-btn" onClick={() => { if (window.confirm("Eliminare questo ciclo?")) remove(c.id); }} aria-label="Elimina"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="traccia-meta">
                  <span className="doc-type-tag">{c.operator}</span>
                  <span className="log-time">Inizio: {fmtDateTime(c.start_time)}{c.start_core_temp != null ? ` · ${c.start_core_temp}°C` : ""}</span>
                </div>
                {chiuso && !nc && lungo && (
                  <p className="range-hint" style={{ margin: "4px 0 0" }}>
                    Durata oltre i {c.max_minutes} minuti di riferimento: controlla il carico dell'abbattitore e la pezzatura. Non è una non conformità.
                  </p>
                )}
                {chiuso ? (
                  <div className="nc-resolved" style={nc ? { color: "#B3432E" } : undefined}>
                    {nc ? <XCircle size={13} color="#B3432E" /> : <CheckCircle2 size={13} color="#2F6F4E" />}
                    <span>
                      {nc
                        ? `NON CONFORME: temperatura al cuore ${c.end_core_temp}°C, limite ${c.target_temp}°C`
                        : `Conforme: ${c.end_core_temp}°C al cuore`}
                      {" "}— {minutiTrascorsi(c.start_time, c.end_time)} minuti (fine {fmtDateTime(c.end_time)})
                    </span>
                  </div>
                ) : (
                  <>
                    <p className={scaduto ? "pest-note" : "range-hint"} style={{ marginBottom: 8, ...(scaduto ? { color: "#B3432E", fontWeight: 500 } : {}) }}>
                      {`Ciclo rimasto aperto da ${trascorsi} minuti. Scrivi la temperatura al cuore e l'ora di fine per completarlo.`}
                    </p>
                    <div className="row-form" style={{ margin: "0 0 4px" }}>
                      <input type="text" inputMode="decimal" placeholder="°C al cuore a fine" value={chiusura[c.id]?.temp ?? ""} onChange={(e) => setChiusura((s) => ({ ...s, [c.id]: { ...s[c.id], temp: e.target.value } }))} style={{ width: 150 }} />
                      <label className="field-label">Fine (vuoto = adesso)
                        <input type="datetime-local" value={chiusura[c.id]?.fine ?? ""} onChange={(e) => setChiusura((s) => ({ ...s, [c.id]: { ...s[c.id], fine: e.target.value } }))} />
                      </label>
                      <button type="button" className="btn-primary" onClick={() => chiudi(c)}>
                        <CheckCircle2 size={14} /> Chiudi ciclo
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function hoursElapsed(startTime) {
  return (Date.now() - new Date(startTime).getTime()) / (1000 * 60 * 60);
}


const oggiISO = () => new Date().toISOString().slice(0, 10);

function fmtGiorno(iso) {
  if (!iso) return "";
  const [a, m, g] = String(iso).slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

function giorniDa(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// Registro di congelamento e scongelamento.
//
// Non e' l'abbattimento: quello e' un ciclo di novanta minuti con un esito,
// questo segue una partita per tutta la vita che passa nel congelatore. La
// domanda a cui risponde e' "da quanto tempo e' la' dentro", che e' quella che
// fa un ispettore aprendo il freezer.
//
// Scegliendo una preparazione il registro si aggancia alla scheda di
// produzione: sulla carta il sacchetto porta un numero che rimanda a un foglio
// in archivio, qui il rimando e' il collegamento stesso, e da una partita
// congelata si risale ai lotti delle materie prime.
function RegistroCongelamento({ company }) {
  const { items, add, update, remove, loading } = useTable("freezing_records", company?.id);
  const { items: preparazioni } = useTable("preparations", company?.id);

  const [preparazioneId, setPreparazioneId] = useState("");
  const [prodotto, setProdotto] = useState("");
  const [lotto, setLotto] = useState("");
  const [dataProduzione, setDataProduzione] = useState("");
  const [dataCongelamento, setDataCongelamento] = useState(oggiISO());
  const [temperatura, setTemperatura] = useState("");
  const [operatore, setOperatore] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [scongelamento, setScongelamento] = useState({});

  // Si propongono le preparazioni destinate al freddo: le altre nel
  // congelatore non ci finiscono, e un elenco lungo di cose che non c'entrano
  // e' un elenco che non si legge.
  const candidate = [...preparazioni]
    .filter((p) => p.storage_method === "freezer" || p.storage_method === "abbattuto")
    .sort((a, b) => (a.production_date < b.production_date ? 1 : -1))
    .slice(0, 60);

  const scegliPreparazione = (id) => {
    setPreparazioneId(id);
    const p = preparazioni.find((x) => x.id === id);
    if (!p) return;
    setProdotto(p.product_name || "");
    setLotto(p.lot_number || "");
    setDataProduzione(p.production_date || "");
    if (p.operator_name) setOperatore(p.operator_name);
  };

  const azzera = () => {
    setPreparazioneId(""); setProdotto(""); setLotto(""); setDataProduzione("");
    setDataCongelamento(oggiISO()); setTemperatura(""); setOperatore(""); setNote(""); setErrore("");
  };

  const salva = async (e) => {
    e.preventDefault();
    if (!prodotto.trim()) { setErrore("Manca il nome del prodotto."); return; }
    if (!dataCongelamento) { setErrore("Manca la data di congelamento."); return; }
    setBusy(true); setErrore("");
    try {
      await add({
        preparation_id: preparazioneId || null,
        product_name: prodotto.trim(),
        lot_number: lotto.trim() || null,
        production_date: dataProduzione || null,
        freezing_date: dataCongelamento,
        blast_temp: temperatura === "" ? null : Number(String(temperatura).replace(",", ".")),
        operator: operatore.trim() || null,
        notes: note.trim() || null,
      });
      azzera();
    } catch (err) {
      setErrore("Salvataggio non riuscito: " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const registraScongelamento = async (riga) => {
    const data = scongelamento[riga.id] || oggiISO();
    await update(riga.id, { thaw_date: data });
    setScongelamento((s) => ({ ...s, [riga.id]: undefined }));
  };

  const nelCongelatore = items.filter((x) => !x.thaw_date);
  const usciti = items.filter((x) => x.thaw_date);
  const ordina = (lista, campo) => [...lista].sort((a, b) => (a[campo] < b[campo] ? 1 : -1));

  const riga = (x) => {
    const giorni = giorniDa(x.freezing_date);
    return (
      <li key={x.id} className="dish-row">
        <div className="dish-top">
          <div style={{ minWidth: 0 }}>
            <strong>{x.product_name}</strong>
            {x.lot_number && <span className="lot-tag">Lotto {x.lot_number}</span>}
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            <button className="icon-btn" aria-label="Stampa etichetta" title="Stampa etichetta"
              onClick={() => stampaEtichetta({
                titolo: x.product_name,
                righe: [
                  ["Lotto", x.lot_number],
                  ["Prodotto il", dataEtichetta(x.production_date)],
                  ["Congelato il", dataEtichetta(x.freezing_date)],
                  ["T. raggiunta", x.blast_temp != null ? `${String(x.blast_temp).replace(".", ",")} °C` : ""],
                  ["Operatore", x.operator],
                  "Prodotto congelato. Scongelare in frigorifero a non più di +4 °C. Non ricongelare.",
                ],
                piede: company?.name || "",
              })}>
              <Printer size={14} />
            </button>
            <button className="icon-btn" onClick={() => remove(x.id)} aria-label="Elimina"><Trash2 size={14} /></button>
          </div>
        </div>
        <div className="traccia-meta">
          {x.production_date && <span className="doc-type-tag">Prodotto il {fmtGiorno(x.production_date)}</span>}
          <span className="doc-type-tag">Congelato il {fmtGiorno(x.freezing_date)}</span>
          {x.blast_temp != null && <span className="doc-type-tag">a {String(x.blast_temp).replace(".", ",")}°C</span>}
          {x.operator && <span className="doc-type-tag">{x.operator}</span>}
          {!x.thaw_date && giorni != null && (
            <span className={"pill " + (giorni > 180 ? "pill-warn" : "pill-ok")}>
              {giorni === 0 ? "congelato oggi" : `da ${giorni} ${giorni === 1 ? "giorno" : "giorni"}`}
            </span>
          )}
        </div>
        {x.notes && <p className="pest-note">{x.notes}</p>}
        {x.thaw_date ? (
          <div className="nc-resolved">
            <CheckCircle2 size={13} color="#2F6F4E" />
            <span>Scongelato il {fmtGiorno(x.thaw_date)}</span>
          </div>
        ) : (
          <div className="row-form" style={{ margin: "6px 0 0" }}>
            <label className="field-label">Data di scongelamento
              <input type="date" value={scongelamento[x.id] || oggiISO()}
                onChange={(e) => setScongelamento((s) => ({ ...s, [x.id]: e.target.value }))} />
            </label>
            <button type="button" className="link-btn" onClick={() => registraScongelamento(x)}>
              <Timer size={14} /> Registra lo scongelamento
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <p className="login-info" style={{ margin: "0 0 14px" }}>
        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Qui si registra il congelamento fatto <strong>per conservare</strong> — gelati, semifreddi,
          tavola calda, preparati — non la bonifica del pesce crudo, che è un trattamento sanitario con
          parametri imposti e ha la sua scheda. Lo scongelamento si fa in frigorifero a non più di
          +4&nbsp;°C, oppure per cottura diretta se il prodotto è già porzionato: mai a temperatura
          ambiente, e non si ricongela.
        </span>
      </p>

      <form className="traccia-form" onSubmit={salva}>
        {candidate.length > 0 && (
          <label className="field-label">Parti da una preparazione (facoltativo)
            <select value={preparazioneId} onChange={(e) => scegliPreparazione(e.target.value)}>
              <option value="">— scrivo a mano —</option>
              {candidate.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product_name} — lotto {p.lot_number} ({fmtGiorno(p.production_date)})
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="row-form" style={{ marginTop: 0 }}>
          <input type="text" className="note-input" placeholder="Prodotto (es. Semifreddo al pistacchio)"
            value={prodotto} onChange={(e) => setProdotto(e.target.value)} required />
          <input type="text" className="note-input" placeholder="Numero identificativo o lotto"
            value={lotto} onChange={(e) => setLotto(e.target.value)} />
        </div>

        <div className="row-form">
          <label className="field-label">Data di produzione
            <input type="date" value={dataProduzione} onChange={(e) => setDataProduzione(e.target.value)} />
          </label>
          <label className="field-label">Data di congelamento
            <input type="date" value={dataCongelamento} onChange={(e) => setDataCongelamento(e.target.value)} required />
          </label>
          <label className="field-label">Temperatura raggiunta (°C)
            <input type="text" inputMode="decimal" placeholder="es. -18"
              value={temperatura} onChange={(e) => setTemperatura(e.target.value)} />
          </label>
        </div>

        <div className="row-form">
          <input type="text" className="note-input" placeholder="Operatore"
            value={operatore} onChange={(e) => setOperatore(e.target.value)} />
          {company?.haccp_manager && (
            <button type="button" className="link-btn" onClick={() => setOperatore(company.haccp_manager)}>
              Usa responsabile HACCP
            </button>
          )}
        </div>

        <input type="text" className="full-input" placeholder="Note (facoltative)"
          value={note} onChange={(e) => setNote(e.target.value)} />

        {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}

        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> {busy ? "Salvataggio…" : "Registra il congelamento"}
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessun congelamento registrato.</p></div>
      ) : (
        <>
          <p className="corso-sezione">Nel congelatore ({nelCongelatore.length})</p>
          {nelCongelatore.length === 0 ? (
            <p className="none-label" style={{ display: "block" }}>Niente in giacenza.</p>
          ) : (
            <ul className="dish-list">{ordina(nelCongelatore, "freezing_date").map(riga)}</ul>
          )}

          {usciti.length > 0 && (
            <>
              <p className="corso-sezione">Scongelati ({usciti.length})</p>
              <ul className="dish-list">{ordina(usciti, "thaw_date").map(riga)}</ul>
            </>
          )}
        </>
      )}
    </>
  );
}

export default function AbbattimentoPesce() {
  const { company } = useAuth();
  const visibleSubTabs = SUB_TABS.filter((t) => company?.[t.requires]);
  const [subTab, setSubTab] = useState(visibleSubTabs[0]?.id || "abbattimento");
  const { items: batches, add: addBatch, remove: removeBatch, update: updateBatch, loading: batchesLoading } = useTable("blast_chill_logs", company?.id);
  const { items: thaws, add: addThaw, remove: removeThaw, update: updateThaw, loading: thawsLoading } = useTable("thaw_logs", company?.id);
  // Stesso motivo della scheda non conformità: i lotti veri stanno in
  // traceability_records.
  const { items: lots } = useTable("traceability_records", company?.id);
  const { items: prodottiCatalogo } = useTable("products", company?.id);

  // --- Form: nuovo ciclo di abbattimento ---
  const [productName, setProductName] = useState("");
  const [lotId, setLotId] = useState("");
  const [kg, setKg] = useState("");
  const [treatment, setTreatment] = useState(TREATMENT_OPTIONS[0].id);
  const [startTime, setStartTime] = useState(nowLocalInput());
  // Nella bonifica la durata NON è un riferimento: è il limite. Il
  // Reg. CE 853/2004 impone 24 ore a -20 °C o 15 ore a -35 °C, e un
  // trattamento più breve non ha ucciso le larve. Per questo l'ora di fine si
  // dichiara, non si deduce da quando l'operatore apre l'app.
  const [endTime, setEndTime] = useState("");
  const [batchError, setBatchError] = useState("");
  const [operator, setOperator] = useState("");
  const [busy, setBusy] = useState(false);

  const submitBatch = async (e) => {
    e.preventDefault();
    setBatchError("");
    if (!productName.trim() || !kg || !operator.trim()) return;
    if (!startTime) { setBatchError("Manca l'ora di inizio del trattamento."); return; }
    if (!endTime) { setBatchError("Manca l'ora di fine: senza durata non si può dire che il trattamento sia stato fatto."); return; }
    const inizio = new Date(startTime);
    const fine = new Date(endTime);
    if (fine <= inizio) { setBatchError("La fine deve venire dopo l'inizio."); return; }

    const t = TREATMENT_OPTIONS.find((o) => o.id === treatment);
    setBusy(true);
    await addBatch({
      product_name: productName,
      traceability_record_id: lotId || null,
      kg: Number(kg),
      target_temp: t.temp,
      required_hours: t.hours,
      start_time: inizio.toISOString(),
      completed: true,
      completed_at: fine.toISOString(),
      operator,
    });
    setProductName(""); setKg(""); setLotId(""); setOperator("");
    setStartTime(nowLocalInput()); setEndTime("");
    setBusy(false);
  };

  const completeBatch = async (batch) => {
    await updateBatch(batch.id, { completed: true, completed_at: new Date().toISOString() });
  };

  const kgRemaining = (batchId, totalKg) => {
    const used = thaws
      .filter((t) => t.blast_chill_log_id === batchId)
      .reduce((sum, t) => sum + Number(t.kg), 0);
    return Math.max(0, Number(totalKg) - used);
  };

  // --- Form: nuovo scongelamento ---
  const [thawBatchId, setThawBatchId] = useState("");
  const [thawKg, setThawKg] = useState("");
  const [thawStart, setThawStart] = useState(nowLocalInput());
  const [thawOperator, setThawOperator] = useState("");
  const [thawError, setThawError] = useState("");
  const [thawBusy, setThawBusy] = useState(false);

  const availableBatches = batches.filter((b) => b.completed && kgRemaining(b.id, b.kg) > 0);

  const submitThaw = async (e) => {
    e.preventDefault();
    setThawError("");
    if (!thawBatchId || !thawKg || !thawOperator.trim()) return;
    const batch = batches.find((b) => b.id === thawBatchId);
    const remaining = kgRemaining(batch.id, batch.kg);
    if (Number(thawKg) > remaining) {
      setThawError(`Disponibili solo ${remaining} kg per questo lotto.`);
      return;
    }
    setThawBusy(true);
    await addThaw({
      blast_chill_log_id: thawBatchId,
      kg: Number(thawKg),
      start_time: new Date(thawStart).toISOString(),
      operator: thawOperator,
    });
    setThawKg(""); setThawOperator(""); setThawBatchId("");
    setThawStart(nowLocalInput());
    setThawBusy(false);
  };

  const resolveThaw = async (thaw, outcome) => {
    await updateThaw(thaw.id, { outcome, resolved_at: new Date().toISOString() });
  };

  const nomeProdotto = (lot) =>
    prodottiCatalogo.find((p) => p.id === lot.product_id)?.name || lot.product_name || "Prodotto";
  const lotLabel = (lot) =>
    `${nomeProdotto(lot)} — lotto ${lot.lot_number || "non indicato"} (${lot.supplier_name || "fornitore non indicato"})`;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Abbattimento</h2>
          <p className="sub">Abbattimento rapido dei prodotti cotti e bonifica sanitaria dei prodotti ittici destinati al consumo crudo (Reg. CE 853/2004).</p>
        </div>
      </div>

      <div className="config-subtabs">
        {visibleSubTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={"config-subtab" + (subTab === t.id ? " active" : "")}
            onClick={() => setSubTab(t.id)}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {subTab === "cotti" && <AbbattimentoCotti company={company} />}
      {subTab === "congelamento" && <RegistroCongelamento company={company} />}

      {subTab === "abbattimento" && (
        <>
          <p className="login-info" style={{ margin: "0 0 14px" }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Questo è un <strong>trattamento sanitario obbligatorio</strong>, non una conservazione:
              il Reg. CE 853/2004 impone il congelamento preventivo del pesce destinato a essere
              consumato crudo, marinato o poco cotto, per inattivare le larve di Anisakis. I parametri
              non si scelgono: −20&nbsp;°C per 24 ore o −35&nbsp;°C per 15 ore in tutte le parti del
              prodotto. Qui, a differenza del raffreddamento dei cotti, <strong>la durata è il
              limite</strong>: vanno dichiarati il trattamento scelto, l'ora di inizio e l'ora di fine,
              e un trattamento più breve del dovuto non ha ucciso le larve. Per congelare allo scopo di
              conservare si usa «Congelamento per conservazione».
            </span>
          </p>
          <form onSubmit={submitBatch} className="traccia-form">
            <div className="row-form">
              <input type="text" placeholder="Prodotto (es. Salmone)" required value={productName} onChange={(e) => setProductName(e.target.value)} className="note-input" />
              <input type="number" step="0.1" min="0" placeholder="Kg" required value={kg} onChange={(e) => setKg(e.target.value)} className="num" style={{ width: 90 }} />
              <select value={treatment} onChange={(e) => setTreatment(e.target.value)}>
                {TREATMENT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            {lots.length > 0 && (
              <select value={lotId} onChange={(e) => setLotId(e.target.value)} className="full-input">
                <option value="">Lotto collegato (opzionale)</option>
                {lots.map((l) => <option key={l.id} value={l.id}>{lotLabel(l)}</option>)}
              </select>
            )}
            <div className="row-form">
              <label className="field-label">Inizio del trattamento
                <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </label>
              <label className="field-label">Fine del trattamento
                <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
              </label>
            </div>
            <div className="row-form">
              <input type="text" placeholder="Operatore" required value={operator} onChange={(e) => setOperator(e.target.value)} className="note-input" />
              {company?.haccp_manager && (
                <button type="button" className="link-btn" onClick={() => setOperator(company.haccp_manager)}>
                  Usa responsabile HACCP
                </button>
              )}
            </div>
            {batchError && <span className="file-error"><AlertTriangle size={13} /> {batchError}</span>}
            <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
              <Plus size={16} /> {busy ? "Registrazione…" : "Registra il trattamento"}
            </button>
          </form>

          {batchesLoading ? (
            <p className="sub">Caricamento…</p>
          ) : batches.length === 0 ? (
            <div className="empty"><p>Nessun ciclo di abbattimento registrato.</p></div>
          ) : (
            <ul className="dish-list">
              {batches.map((b) => {
                const elapsed = hoursElapsed(b.start_time);
                const ready = elapsed >= b.required_hours;
                const remaining = kgRemaining(b.id, b.kg);
                // Ore effettive del trattamento, da quanto è stato dichiarato:
                // è su queste che si giudica, non sull'orologio di chi guarda.
                const oreFatte = b.completed_at
                  ? (new Date(b.completed_at) - new Date(b.start_time)) / 3600000
                  : null;
                const conforme = oreFatte != null && oreFatte >= Number(b.required_hours);
                return (
                  <li key={b.id} className="dish-row">
                    <div className="dish-top">
                      <div>
                        <strong>{b.product_name}</strong>
                        <span className="lot-tag">{b.kg} kg</span>
                        {b.completed && <span className="lot-tag">Residui: {remaining} kg</span>}
                      </div>
                      <div style={{ display: "flex", gap: 2 }}>
                        <button className="icon-btn" aria-label="Stampa etichetta" title="Stampa etichetta"
                          onClick={() => stampaEtichetta({
                            titolo: b.product_name,
                            righe: [
                              ["Bonifica", `${b.target_temp} °C per ${b.required_hours} h`],
                              ["Inizio", dataEtichetta(b.start_time)],
                              ["Fine", dataEtichetta(b.completed_at)],
                              ["Quantità", b.kg != null ? `${b.kg} kg` : ""],
                              ["Operatore", b.operator],
                              "Pesce bonificato ai sensi del Reg. CE 853/2004. Mantenere identificato fino al servizio.",
                            ],
                            piede: company?.name || "",
                          })}>
                          <Printer size={14} />
                        </button>
                        <button className="icon-btn" onClick={() => removeBatch(b.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="traccia-meta">
                      <span className="doc-type-tag">{b.target_temp}°C per {b.required_hours}h</span>
                      {oreFatte != null && <span className="doc-type-tag">durata {oreFatte.toFixed(1)}h</span>}
                      <span className="doc-type-tag">{b.operator}</span>
                      <span className="log-time">Inizio: {fmtDateTime(b.start_time)}</span>
                    </div>
                    {b.completed ? (
                      <div className="nc-resolved" style={conforme ? undefined : { color: "#B3432E" }}>
                        {conforme
                          ? <CheckCircle2 size={13} color="#2F6F4E" />
                          : <XCircle size={13} color="#B3432E" />}
                        <span>
                          {conforme
                            ? `Conforme: ${oreFatte.toFixed(1)} ore a ${b.target_temp}°C (fine ${fmtDateTime(b.completed_at)})`
                            : `NON CONFORME: ${oreFatte == null ? "durata non dichiarata" : oreFatte.toFixed(1) + " ore"}, ne servono ${b.required_hours} a ${b.target_temp}°C. Questa partita non può essere destinata al consumo crudo: si ripete il trattamento per intero, oppure si usa per preparazioni con cottura completa.`}
                        </span>
                      </div>
                    ) : ready ? (
                      <button type="button" className="btn-primary nc-resolve-btn" onClick={() => completeBatch(b)}>
                        <CheckCircle2 size={14} /> Conferma completato
                      </button>
                    ) : (
                      <p className="range-hint" style={{ marginBottom: 0 }}>
                        Trattamento aperto dalla versione precedente: sono trascorse {elapsed.toFixed(1)} ore delle {b.required_hours} richieste.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {subTab === "scongelamento" && (
        <>
          <p className="range-hint">
            Una volta scongelato, il prodotto va utilizzato o smaltito entro 24 ore e non può essere ricongelato.
          </p>
          <form onSubmit={submitThaw} className="traccia-form">
            {availableBatches.length === 0 ? (
              <p className="range-hint">Nessun lotto abbattuto disponibile da scongelare. Completa prima un ciclo di abbattimento.</p>
            ) : (
              <select value={thawBatchId} onChange={(e) => setThawBatchId(e.target.value)} className="full-input" required>
                <option value="">Seleziona lotto abbattuto</option>
                {availableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.product_name} — disponibili {kgRemaining(b.id, b.kg)} kg (abbattuto il {fmtDateTime(b.start_time)})
                  </option>
                ))}
              </select>
            )}
            <div className="row-form">
              <input type="number" step="0.1" min="0" placeholder="Kg da scongelare" required value={thawKg} onChange={(e) => setThawKg(e.target.value)} className="num" style={{ width: 120 }} />
              <label className="field-label">Inizio scongelamento
                <input type="datetime-local" value={thawStart} onChange={(e) => setThawStart(e.target.value)} />
              </label>
              <input type="text" placeholder="Operatore" required value={thawOperator} onChange={(e) => setThawOperator(e.target.value)} className="note-input" />
              {company?.haccp_manager && (
                <button type="button" className="link-btn" onClick={() => setThawOperator(company.haccp_manager)}>
                  Usa responsabile HACCP
                </button>
              )}
            </div>
            {thawError && <span className="file-error"><AlertTriangle size={13} /> {thawError}</span>}
            <button type="submit" className="btn-primary" disabled={thawBusy || availableBatches.length === 0} style={{ alignSelf: "flex-start" }}>
              <Plus size={16} /> Avvia scongelamento
            </button>
          </form>

          {thawsLoading ? (
            <p className="sub">Caricamento…</p>
          ) : thaws.length === 0 ? (
            <div className="empty"><p>Nessuno scongelamento registrato.</p></div>
          ) : (
            <ul className="dish-list">
              {thaws.map((t) => {
                const batch = batches.find((b) => b.id === t.blast_chill_log_id);
                const elapsed = hoursElapsed(t.start_time);
                const overdue = !t.outcome && elapsed >= 24;
                return (
                  <li key={t.id} className={"dish-row" + (overdue ? " row-warn" : "")}>
                    <div className="dish-top">
                      <div>
                        <strong>{batch ? batch.product_name : "Prodotto"}</strong>
                        <span className="lot-tag">{t.kg} kg</span>
                      </div>
                      <button className="icon-btn" onClick={() => removeThaw(t.id)} aria-label="Elimina"><Trash2 size={14} /></button>
                    </div>
                    <div className="traccia-meta">
                      <span className="doc-type-tag">{t.operator}</span>
                      <span className="log-time">Inizio: {fmtDateTime(t.start_time)}</span>
                    </div>
                    {t.outcome ? (
                      <div className="nc-resolved">
                        <CheckCircle2 size={13} color="#2F6F4E" />
                        <span>{t.outcome === "venduto" ? "Venduto/utilizzato" : "Smaltito come rifiuto"} il {fmtDateTime(t.resolved_at)}</span>
                      </div>
                    ) : overdue ? (
                      <>
                        <p className="pest-note" style={{ color: "#B3432E", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                          <AlertTriangle size={13} /> Sono passate oltre 24 ore: registra subito l'esito.
                        </p>
                        <div className="row-form" style={{ margin: "0 0 8px" }}>
                          <button className="btn-primary" onClick={() => resolveThaw(t, "venduto")}>Venduto / utilizzato</button>
                          <button className="btn-primary" style={{ background: "#B3432E" }} onClick={() => resolveThaw(t, "smaltito")}>Smaltito come rifiuto</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="range-hint" style={{ marginBottom: 8 }}>
                          Mancano {(24 - elapsed).toFixed(1)} ore al termine della finestra di 24 ore.
                        </p>
                        <div className="row-form" style={{ margin: "0 0 8px" }}>
                          <button className="btn-primary" onClick={() => resolveThaw(t, "venduto")}>Venduto / utilizzato</button>
                          <button className="btn-primary" style={{ background: "#B3432E" }} onClick={() => resolveThaw(t, "smaltito")}>Smaltito come rifiuto</button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
