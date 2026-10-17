import React, { useMemo, useState } from "react";
import { Plus, Trash2, Info, AlertTriangle, Search, Truck } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";

// Cessioni ad altre imprese: il passo avanti.
//
// L'art. 18 del Reg. (CE) 178/2002 chiede "un passo indietro e un passo
// avanti". Il passo indietro l'app lo copriva bene — Arrivo merci tiene
// fornitore, prodotto, lotto, data e documento — mentre il passo avanti non
// esisteva: non c'era nessun posto dove scrivere a chi il prodotto era stato
// ceduto.
//
// Per un bar o un ristorante non manca niente, perche' l'obbligo riguarda le
// cessioni ad altre IMPRESE e non le vendite al consumatore finale: chi vende
// al banco lo ha gia' assolto per definizione, e infatti questa scheda si
// accende solo dove serve. Per un panificio che consegna a bar e ristoranti,
// per una pasticceria che fornisce altri locali o per un grossista, questo e'
// invece il cuore dell'adempimento.
//
// La riga porta SEMPRE il nome del prodotto e il lotto scritti per esteso,
// anche quando e' collegata a una preparazione o a un arrivo: il collegamento
// serve a navigare, il testo serve a restare leggibile fra due anni, quando
// chi legge non ha piu' sotto mano niente del resto.

const oggi = () => new Date().toISOString().slice(0, 10);

function fmtData(iso) {
  if (!iso) return "";
  const [a, m, g] = String(iso).slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

export default function Cessioni() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("shipments", company?.id);
  const { items: preparazioni } = useTable("preparations", company?.id);
  const { items: arrivi } = useTable("traceability_records", company?.id);
  const { items: prodotti } = useTable("products", company?.id);

  const responsabile = (company?.haccp_manager || "").trim();

  const [data, setData] = useState(oggi());
  const [cliente, setCliente] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [origine, setOrigine] = useState("");          // "prep:<id>" | "arr:<id>" | ""
  const [prodotto, setProdotto] = useState("");
  const [lotto, setLotto] = useState("");
  const [quantita, setQuantita] = useState("");
  const [documento, setDocumento] = useState("");
  const [operatore, setOperatore] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [cerca, setCerca] = useState("");

  React.useEffect(() => {
    if (responsabile) setOperatore((prec) => (prec ? prec : responsabile));
  }, [responsabile]);

  const nomeProdotto = (id) => prodotti.find((p) => p.id === id)?.name || "Prodotto";

  // Le origini possibili: le preparazioni del laboratorio e, per chi rivende
  // senza trasformare, gli arrivi. Si mostrano solo le piu' recenti: a una
  // consegna interessa quello che c'e' adesso, non lo storico.
  const origini = useMemo(() => {
    const p = [...preparazioni]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 60)
      .map((x) => ({
        id: `prep:${x.id}`,
        label: `${x.product_name} — lotto ${x.lot_number || "—"} (preparato il ${fmtData(x.production_date || x.created_at)})`,
        prodotto: x.product_name,
        lotto: x.lot_number || "",
      }));
    const a = [...arrivi]
      .filter((x) => !x.exhausted_at)
      .sort((x, y) => (x.received_date < y.received_date ? 1 : -1))
      .slice(0, 60)
      .map((x) => ({
        id: `arr:${x.id}`,
        label: `${nomeProdotto(x.product_id)} — lotto ${x.lot_number || "senza lotto"} (${x.supplier_name || "fornitore"}, ${fmtData(x.received_date)})`,
        prodotto: nomeProdotto(x.product_id),
        lotto: x.lot_number || "",
      }));
    return [...p, ...a];
  }, [preparazioni, arrivi, prodotti]); // eslint-disable-line

  // Scegliendo l'origine, prodotto e lotto si compilano da soli: restano
  // modificabili, perche' a volte si cede una parte con una denominazione
  // commerciale diversa da quella di produzione.
  const scegliOrigine = (valore) => {
    setOrigine(valore);
    const o = origini.find((x) => x.id === valore);
    if (o) { setProdotto(o.prodotto); setLotto(o.lotto); }
  };

  const azzera = () => {
    setCliente(""); setIndirizzo(""); setOrigine(""); setProdotto(""); setLotto("");
    setQuantita(""); setDocumento(""); setNote(""); setData(oggi());
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrore("");
    if (!cliente.trim() || !prodotto.trim()) {
      setErrore("Servono almeno il destinatario e il prodotto.");
      return;
    }
    setBusy(true);
    const riga = {
      shipment_date: data,
      customer_name: cliente.trim(),
      customer_address: indirizzo.trim() || null,
      product_name: prodotto.trim(),
      lot_number: lotto.trim() || null,
      quantity: quantita.trim() || null,
      document_ref: documento.trim() || null,
      operator: (operatore || responsabile).trim() || null,
      notes: note.trim() || null,
      preparation_id: origine.startsWith("prep:") ? origine.slice(5) : null,
      traceability_record_id: origine.startsWith("arr:") ? origine.slice(4) : null,
    };
    const esito = await add(riga);
    setBusy(false);
    if (!esito) { setErrore("Non è stato possibile registrare la cessione."); return; }
    azzera();
  };

  const filtrate = useMemo(() => {
    const t = cerca.trim().toLowerCase();
    const ordinate = [...items].sort((a, b) =>
      (a.shipment_date < b.shipment_date ? 1 : a.shipment_date > b.shipment_date ? -1 : 0));
    if (!t) return ordinate;
    return ordinate.filter((x) =>
      `${x.customer_name} ${x.product_name} ${x.lot_number || ""} ${x.document_ref || ""}`
        .toLowerCase().includes(t));
  }, [items, cerca]);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2><Truck size={18} /> Cessioni ad altre imprese</h2>
          <p className="sub">A chi è uscito il prodotto, quando e con quale lotto.</p>
        </div>
      </div>

      <p className="login-info" style={{ margin: "16px 0" }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Qui si registra solo quello che viene ceduto ad <strong>altre imprese</strong> — bar,
          ristoranti, negozi, mense, grossisti. Le vendite al consumatore finale non si registrano:
          l'art. 18 del Reg. CE 178/2002 chiede il passo avanti verso le imprese, non verso il
          cliente al banco. Se un fornitore richiama un lotto, è da qui che si risale a chi avvisare.
        </span>
      </p>

      {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}

      <form onSubmit={submit}>
        <div className="row-form" style={{ margin: "0 0 8px" }}>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <input type="text" placeholder="Destinatario (ragione sociale)" required
            value={cliente} onChange={(e) => setCliente(e.target.value)} className="note-input" />
          <input type="text" placeholder="Indirizzo o comune (facoltativo)"
            value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} className="note-input" />
        </div>

        <div className="row-form" style={{ margin: "0 0 8px" }}>
          <select value={origine} onChange={(e) => scegliOrigine(e.target.value)} className="full-input">
            <option value="">Da quale lotto esce… (facoltativo)</option>
            {origini.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>

        <div className="row-form" style={{ margin: "0 0 8px" }}>
          <input type="text" placeholder="Prodotto" required
            value={prodotto} onChange={(e) => setProdotto(e.target.value)} className="note-input" />
          <input type="text" placeholder="Lotto"
            value={lotto} onChange={(e) => setLotto(e.target.value)} className="note-input" />
          <input type="text" placeholder="Quantità (es. 20 kg, 15 pezzi)"
            value={quantita} onChange={(e) => setQuantita(e.target.value)} className="note-input" />
        </div>

        <div className="row-form" style={{ margin: "0 0 8px" }}>
          <input type="text" placeholder="Documento (DDT, fattura, scontrino)"
            value={documento} onChange={(e) => setDocumento(e.target.value)} className="note-input" />
          <input type="text" placeholder="Operatore"
            value={operatore} onChange={(e) => setOperatore(e.target.value)} className="note-input" />
          {responsabile && (
            <button type="button" className="link-btn" onClick={() => setOperatore(responsabile)}>
              Usa responsabile HACCP
            </button>
          )}
        </div>

        <div className="row-form" style={{ margin: "0 0 8px" }}>
          <input type="text" placeholder="Note (facoltative)"
            value={note} onChange={(e) => setNote(e.target.value)} className="note-input" />
        </div>

        <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> Registra la cessione
        </button>
      </form>

      <div className="row-form" style={{ margin: "18px 0 8px" }}>
        <span className="sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Search size={14} /> Cerca
        </span>
        <input type="text" placeholder="Destinatario, prodotto, lotto o documento"
          value={cerca} onChange={(e) => setCerca(e.target.value)} className="note-input" />
      </div>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : filtrate.length === 0 ? (
        <div className="empty">
          <p>{items.length === 0
            ? "Nessuna cessione registrata."
            : "Nessuna cessione corrisponde alla ricerca."}</p>
        </div>
      ) : (
        <ul className="log-list">
          {filtrate.map((x) => (
            <li key={x.id} className="log-row">
              <div style={{ minWidth: 0 }}>
                <span className="log-main"><strong>{x.customer_name}</strong></span>
                <div className="traccia-meta">
                  <span className="doc-type-tag">{x.product_name}</span>
                  {x.lot_number && <span className="lot-tag">Lotto {x.lot_number}</span>}
                  {x.quantity && <span className="doc-type-tag">{x.quantity}</span>}
                  {x.document_ref && <span className="doc-type-tag">{x.document_ref}</span>}
                  <span className="log-time">{fmtData(x.shipment_date)}</span>
                  {x.operator && <span className="doc-type-tag">{x.operator}</span>}
                </div>
                {x.notes && <p className="pest-note">{x.notes}</p>}
              </div>
              <button className="icon-btn" aria-label="Elimina"
                onClick={() => { if (window.confirm("Eliminare questa cessione?")) remove(x.id); }}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
