import React, { useEffect, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle, Layers, Info } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";

// I cicli di lavorazione di QUESTA azienda.
//
// Il catalogo è la biblioteca del consulente e non si svuota mai. Qui si
// sceglie quali di quei cicli descrivono davvero il lavoro di questo cliente:
// una pasticceria che non fa tavola calda non deve avere nel manuale un ciclo
// di produzione calda, e non è una cosa che un interruttore possa sapere.
//
// Da quest'ordine nasce la numerazione del manuale. Il numero non è più
// scritto in catalogo — un ciclo che in un'azienda è il terzo, in un'altra è
// il primo — ma si legge dalla posizione: 1, 2, 3, nell'ordine in cui li metti
// qui. Spostare un ciclo rinumera tutto, e il manuale alla prossima revisione
// lo riflette.
//
// Non si cancella niente dal catalogo: togliere un ciclo da un'azienda lo
// toglie da quell'azienda soltanto.

function righeRinumerate(lista) {
  // Dieci in dieci: lascia spazio per infilare un ciclo in mezzo senza
  // riscrivere tutte le righe.
  return lista.map((x, i) => ({ ...x, sort_order: (i + 1) * 10 }));
}

export default function CicliAzienda() {
  const { company } = useAuth();
  const [catalogo, setCatalogo] = useState([]);
  const [scelti, setScelti] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");
  const [daAggiungere, setDaAggiungere] = useState("");
  const [busy, setBusy] = useState(false);

  const settore = company?.haccp_sector || "bar_ristorazione";

  const carica = async () => {
    if (!company?.id) return;
    setCaricamento(true); setErrore("");
    const [cat, mie] = await Promise.all([
      supabase.from("cycle_templates").select("*")
        .eq("sector", settore).eq("active", true).order("sort_order"),
      supabase.from("company_cycles").select("*")
        .eq("company_id", company.id).order("sort_order"),
    ]);
    if (cat.error || mie.error) {
      setErrore((cat.error || mie.error).message);
      setCaricamento(false);
      return;
    }
    setCatalogo(cat.data || []);
    setScelti(mie.data || []);
    setCaricamento(false);
  };

  useEffect(() => { carica(); }, [company?.id, settore]); // eslint-disable-line

  const cicloDi = (id) => catalogo.find((c) => c.id === id);

  // Solo quelli accesi, nell'ordine deciso qui: è l'elenco che finirà nel
  // manuale, numerato dalla posizione.
  const inUso = scelti
    .filter((x) => x.active)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const disponibili = catalogo.filter(
    (c) => !scelti.some((x) => x.cycle_template_id === c.id && x.active));

  const salvaOrdine = async (lista) => {
    const rinumerate = righeRinumerate(lista);
    setScelti((prev) => prev.map((x) => {
      const nuova = rinumerate.find((r) => r.id === x.id);
      return nuova ? { ...x, sort_order: nuova.sort_order } : x;
    }));
    for (const r of rinumerate) {
      const { error } = await supabase.from("company_cycles")
        .update({ sort_order: r.sort_order }).eq("id", r.id);
      if (error) { setErrore("Riordino non riuscito: " + error.message); return; }
    }
  };

  const sposta = (indice, verso) => {
    const nuovo = indice + verso;
    if (nuovo < 0 || nuovo >= inUso.length) return;
    const lista = [...inUso];
    [lista[indice], lista[nuovo]] = [lista[nuovo], lista[indice]];
    salvaOrdine(lista);
  };

  const aggiungi = async () => {
    if (!daAggiungere) return;
    setBusy(true); setErrore("");
    // Se il ciclo era già stato tolto, si riaccende invece di crearne una
    // seconda riga: la coppia azienda-ciclo è unica nel database.
    const esistente = scelti.find((x) => x.cycle_template_id === daAggiungere);
    const posizione = (inUso.length + 1) * 10;
    const res = esistente
      ? await supabase.from("company_cycles")
          .update({ active: true, sort_order: posizione }).eq("id", esistente.id)
      : await supabase.from("company_cycles").insert({
          company_id: company.id,
          cycle_template_id: daAggiungere,
          sort_order: posizione,
          active: true,
        });
    if (res.error) setErrore("Non è stato possibile aggiungerlo: " + res.error.message);
    setDaAggiungere("");
    setBusy(false);
    carica();
  };

  const togli = async (riga) => {
    setErrore("");
    const { error } = await supabase.from("company_cycles")
      .update({ active: false }).eq("id", riga.id);
    if (error) { setErrore("Non è stato possibile toglierlo: " + error.message); return; }
    carica();
  };

  return (
    <div>
      <div className="panel-head">
        <div>
          <h3 style={{ margin: "0 0 6px" }}><Layers size={16} /> Cicli di lavorazione di questa azienda</h3>
          <p className="sub" style={{ margin: 0 }}>
            Quali cicli del catalogo descrivono il lavoro di questo cliente, e in che ordine
            compaiono nel manuale.
          </p>
        </div>
      </div>

      <p className="login-info" style={{ margin: "12px 0" }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        La numerazione nasce da qui: il primo ciclo dell'elenco è il numero 1 del manuale. Togliere
        un ciclo lo toglie da questa azienda soltanto — in catalogo resta, e si può rimettere.
      </p>

      {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}

      {caricamento ? (
        <p className="sub">Caricamento…</p>
      ) : (
        <>
          {disponibili.length > 0 && (
            <div className="row-form" style={{ marginTop: 0 }}>
              <select value={daAggiungere} onChange={(e) => setDaAggiungere(e.target.value)} className="full-input">
                <option value="">Aggiungi un ciclo dal catalogo…</option>
                {disponibili.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.classification ? ` — ${c.classification}` : ""}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-primary" onClick={aggiungi} disabled={busy || !daAggiungere}>
                <Plus size={15} /> Aggiungi
              </button>
            </div>
          )}

          {inUso.length === 0 ? (
            <div className="empty">
              <p>
                Nessun ciclo scelto per questa azienda: il manuale uscirebbe senza diagrammi di
                flusso e senza analisi dei pericoli.
              </p>
            </div>
          ) : (
            <ul className="dish-list" style={{ marginTop: 12 }}>
              {inUso.map((riga, i) => {
                const c = cicloDi(riga.cycle_template_id);
                if (!c) return null;
                const ccp = /^CCP/.test(c.classification || "");
                return (
                  <li key={riga.id} className="dish-row">
                    <div className="dish-top" style={{ marginBottom: 4 }}>
                      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="lot-tag" style={{ marginLeft: 0 }}>{i + 1}</span>
                        <strong>{c.name}</strong>
                      </div>
                      <div style={{ display: "flex", gap: 2 }}>
                        <button className="icon-btn" onClick={() => sposta(i, -1)} disabled={i === 0}
                          aria-label="Sposta su" title="Sposta su"><ChevronUp size={14} /></button>
                        <button className="icon-btn" onClick={() => sposta(i, 1)} disabled={i === inUso.length - 1}
                          aria-label="Sposta giù" title="Sposta giù"><ChevronDown size={14} /></button>
                        <button className="icon-btn" onClick={() => togli(riga)}
                          aria-label="Togli da questa azienda" title="Togli da questa azienda">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="traccia-meta">
                      <span className="doc-type-tag" style={ccp ? { color: "#A83A2C", fontWeight: 600 } : undefined}>
                        {c.classification}
                      </span>
                      {c.requires_flag && <span className="doc-type-tag">acceso da {c.requires_flag}</span>}
                    </div>
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
