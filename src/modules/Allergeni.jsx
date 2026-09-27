import React, { useState } from "react";
import { Plus, Trash2, Camera, Printer, Package, AlertTriangle } from "lucide-react";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import { uploadAttachment } from "../hooks/useAttachment";

const ALLERGENI = ["Glutine", "Latte", "Uova", "Soia", "Frutta a guscio", "Pesce", "Crostacei", "Sedano", "Senape", "Solfiti", "Arachidi", "Sesamo", "Lupini", "Molluschi"];
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const FUNZIONE_LETTURA = "clever-responder";

const normalizza = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// Stessa conversione delle altre letture: PDF interi, foto a 2000 px.
function fileInBase64(file) {
  return new Promise((resolve, reject) => {
    if (file.type === "application/pdf") {
      const r = new FileReader();
      r.onload = () => resolve({ data: String(r.result).split(",")[1], media_type: "application/pdf" });
      r.onerror = reject;
      r.readAsDataURL(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const lato = 2000;
      const scala = Math.min(1, lato / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scala);
      canvas.height = Math.round(img.height * scala);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], media_type: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Immagine non leggibile")); };
    img.src = url;
  });
}

export default function Allergeni() {
  const { company } = useAuth();
  const { items, add, remove, loading } = useTable("allergen_dishes", company?.id);
  const { items: prodotti, reload: ricaricaProdotti } = useTable("products", company?.id);

  const [dish, setDish] = useState("");
  const [scelti, setScelti] = useState([]);      // id dei prodotti che compongono la voce
  const [manuali, setManuali] = useState([]);    // allergeni aggiunti o tolti a mano
  const [note, setNote] = useState("");
  const [cerca, setCerca] = useState("");
  const [busy, setBusy] = useState(false);
  const [leggendo, setLeggendo] = useState(false);
  const [errore, setErrore] = useState("");
  const [avviso, setAvviso] = useState("");
  const [stampaIngredienti, setStampaIngredienti] = useState(true);

  const prodottiScelti = scelti.map((id) => prodotti.find((p) => p.id === id)).filter(Boolean);

  // Gli allergeni della voce: quelli dei prodotti che la compongono, più
  // quelli aggiunti a mano per ciò che non passa dal catalogo (la farina del
  // fornitore di sempre, l'uovo usato per spennellare).
  const allergeniVoce = [...new Set([
    ...prodottiScelti.flatMap((p) => p.allergens || []),
    ...manuali,
  ])].sort((a, b) => ALLERGENI.indexOf(a) - ALLERGENI.indexOf(b));

  // "Crema di nocciole (zucchero, olio di palma, nocciole 13%, latte...)"
  const ingredientiVoce = prodottiScelti
    .map((p) => (p.ingredients_text ? `${p.name} (${p.ingredients_text})` : p.name))
    .join(" · ");

  const senzaEtichetta = prodottiScelti.filter((p) => !p.allergens_checked_at);

  const commutaProdotto = (id) =>
    setScelti((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const commutaManuale = (a) =>
    setManuali((m) => (m.includes(a) ? m.filter((x) => x !== a) : [...m, a]));

  // Foto dell'etichetta: crea il prodotto nel catalogo con ingredienti e
  // allergeni letti, e lo aggiunge subito alla voce in composizione. È il
  // percorso del barattolo di crema che si usa per farcire.
  const leggiEtichetta = async (e) => {
    const f = e.target.files?.[0] || null;
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) { setErrore("File troppo grande (limite 8 MB)."); return; }
    setLeggendo(true); setErrore(""); setAvviso("");
    try {
      const { data: b64, media_type } = await fileInBase64(f);
      const { data, error } = await supabase.functions.invoke(FUNZIONE_LETTURA, {
        body: { file_base64: b64, media_type, tipo: "etichetta" },
      });
      if (error) throw new Error(error.message || "Lettura non riuscita");
      if (data?.errore) throw new Error(data.errore);

      const nome = (data?.prodotto || "").trim() || "Prodotto da etichetta";
      const letti = (data?.allergeni || []).filter((x) => ALLERGENI.includes(x));
      const tracce = (data?.tracce || []).filter((x) => ALLERGENI.includes(x));
      let foto = null;
      try { foto = await uploadAttachment(company.id, f); } catch { /* la foto è utile, non indispensabile */ }

      const esistente = prodotti.find((p) => normalizza(p.name) === normalizza(nome));
      const campi = {
        name: nome,
        allergens: letti,
        ingredients_text: data?.ingredienti || null,
        allergens_checked_at: new Date().toISOString(),
      };
      if (foto) campi.label_attachment_path = foto;

      let id = esistente?.id;
      if (esistente) {
        await supabase.from("products").update(campi).eq("id", esistente.id).eq("company_id", company.id);
      } else {
        const { data: creato, error: e2 } = await supabase
          .from("products").insert({ ...campi, company_id: company.id }).select().single();
        if (e2) throw new Error(e2.message);
        id = creato.id;
      }
      await ricaricaProdotti();
      setScelti((s) => (s.includes(id) ? s : [...s, id]));
      setAvviso(
        `Letta l'etichetta di «${nome}»${letti.length ? ": " + letti.join(", ") : " — nessun allergene riconosciuto"}` +
        (tracce.length ? `. Tracce dichiarate: ${tracce.join(", ")} (vanno valutate a parte).` : "") +
        " Controlla prima di salvare.",
      );
    } catch (err) {
      setErrore("Etichetta non letta (" + err.message + "): puoi spuntare gli allergeni a mano.");
    } finally {
      setLeggendo(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!dish.trim()) return;
    setBusy(true);
    await add({
      dish: dish.trim(),
      allergens: allergeniVoce,
      product_ids: scelti,
      ingredients_text: ingredientiVoce || null,
      note: note.trim() || null,
    });
    setDish(""); setScelti([]); setManuali([]); setNote(""); setAvviso(""); setCerca("");
    setBusy(false);
  };

  const elencoProdotti = [...prodotti]
    .filter((p) => normalizza(p.name).includes(normalizza(cerca)))
    .sort((a, b) => a.name.localeCompare(b.name, "it"))
    .slice(0, cerca ? 30 : 12);

  return (
    <div className="panel">
      <div className="panel-head allergeni-panel-head">
        <div>
          <h2>Menu con evidenza degli allergeni</h2>
          <p className="sub">
            L'informazione che l'art. 44 del Reg. UE 1169/2011 impone di dare per iscritto sugli alimenti
            non preimballati. Ogni voce si compone dai prodotti del catalogo: allergeni e ingredienti
            arrivano dalle etichette lette, così la dichiarazione ha una prova alle spalle.
          </p>
        </div>
        <button type="button" className="link-btn no-print" onClick={() => window.print()}>
          <Printer size={14} /> Stampa il menu
        </button>
      </div>

      <form onSubmit={submit} className="traccia-form no-print">
        <input
          type="text" placeholder="Voce di menu (es. Cornetto alla crema di nocciole)" required
          value={dish} onChange={(e) => setDish(e.target.value)} className="note-input" style={{ maxWidth: 420 }}
        />

        <div className="row-form" style={{ margin: 0 }}>
          <input
            type="text" placeholder="Cerca un prodotto del catalogo…"
            value={cerca} onChange={(e) => setCerca(e.target.value)} className="note-input"
          />
          <label className="file-drop" htmlFor="allergeni-etichetta" style={{ maxWidth: 320 }}>
            <Camera size={15} />
            <span>{leggendo ? "Lettura dell'etichetta…" : "Fotografa l'etichetta di un prodotto"}</span>
            <input id="allergeni-etichetta" type="file" accept="image/*,.pdf" capture="environment" onChange={leggiEtichetta} hidden disabled={leggendo} />
          </label>
        </div>

        {elencoProdotti.length > 0 && (
          <div className="chip-grid">
            {elencoProdotti.map((p) => (
              <button
                type="button" key={p.id}
                className={"chip" + (scelti.includes(p.id) ? " chip-on" : "")}
                onClick={() => commutaProdotto(p.id)}
                title={p.ingredients_text || "Etichetta non ancora letta"}
              >
                <Package size={12} /> {p.name}
              </button>
            ))}
          </div>
        )}

        <p className="sub" style={{ margin: 0 }}>Allergeni della voce — quelli dei prodotti scelti, più quelli che aggiungi a mano:</p>
        <div className="chip-grid">
          {ALLERGENI.map((a) => {
            const daProdotto = prodottiScelti.some((p) => (p.allergens || []).includes(a));
            const acceso = allergeniVoce.includes(a);
            return (
              <button
                type="button" key={a}
                className={"chip" + (acceso ? " chip-on" : "")}
                onClick={() => commutaManuale(a)}
                title={daProdotto ? "Letto dall'etichetta di un prodotto" : "Aggiunto a mano"}
              >
                {a}{daProdotto ? " ·" : ""}
              </button>
            );
          })}
        </div>

        {ingredientiVoce && <p className="sub" style={{ margin: 0 }}>Ingredienti: {ingredientiVoce}</p>}
        {senzaEtichetta.length > 0 && (
          <span className="file-error">
            <AlertTriangle size={13} /> Etichetta non ancora letta per: {senzaEtichetta.map((p) => p.name).join(", ")}.
            Gli allergeni di quei prodotti non sono verificati.
          </span>
        )}
        {avviso && <span className="file-ok">{avviso}</span>}
        {errore && <span className="file-error"><AlertTriangle size={13} /> {errore}</span>}

        <input type="text" placeholder="Nota per il cliente (facoltativa)" value={note} onChange={(e) => setNote(e.target.value)} className="full-input" />
        <button type="submit" className="btn-primary" disabled={busy || leggendo} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} /> Aggiungi al menu
        </button>
      </form>

      {loading ? (
        <p className="sub">Caricamento…</p>
      ) : items.length === 0 ? (
        <div className="empty"><p>Nessuna voce registrata: finché il menu è vuoto, l'azienda non ha l'informazione scritta da mettere a disposizione del cliente.</p></div>
      ) : (
        <ul className="dish-list allergeni-screen-list no-print">
          {items.map((item) => (
            <li key={item.id} className="dish-row">
              <div className="dish-top">
                <strong>{item.dish}</strong>
                <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Elimina"><Trash2 size={14} /></button>
              </div>
              {item.allergens && item.allergens.length > 0 ? (
                <div className="chip-grid">
                  {item.allergens.map((a) => <span key={a} className="chip chip-static">{a}</span>)}
                </div>
              ) : <span className="none-label">Nessun allergene dichiarato</span>}
              {item.ingredients_text && <p className="pest-note">{item.ingredients_text}</p>}
              {item.note && <p className="pest-note">{item.note}</p>}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <label className="check-row no-print" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={stampaIngredienti} onChange={(e) => setStampaIngredienti(e.target.checked)} />
          <span>
            Stampa anche gli ingredienti sotto ogni voce. Per gli alimenti non preimballati la legge
            chiede solo gli allergeni; gli ingredienti sono un'informazione in più, obbligatoria se il
            prodotto viene preincartato per la vendita diretta.
          </span>
        </label>
      )}

      {items.length > 0 && (
        <div className="print-only">
          <div className="print-allergen-header">
            <h1>Menu con evidenza degli allergeni</h1>
            {company?.name && <p className="print-allergen-company">{company.name}</p>}
            <p className="print-allergen-legal">
              Informazione resa ai sensi dell'art. 44 del Regolamento (UE) n. 1169/2011 e del D.Lgs. n. 231/2017.
              Per ogni preparazione sono indicate le sostanze che provocano allergie o intolleranze, elencate
              nell'Allegato II del medesimo Regolamento. Per ulteriori informazioni rivolgersi al personale.
            </p>
          </div>
          <div className="print-allergen-grid">
            {items.map((item) => (
              <div key={item.id} className="print-allergen-card">
                <h3>{item.dish}</h3>
                {item.allergens && item.allergens.length > 0 ? (
                  <div className="print-allergen-badges">
                    {item.allergens.map((a) => (
                      <span key={a} className="print-allergen-badge">{a}</span>
                    ))}
                  </div>
                ) : (
                  <span className="print-allergen-none">Nessun allergene dichiarato</span>
                )}
                {stampaIngredienti && item.ingredients_text && (
                  <p className="print-allergen-ingredients">{item.ingredients_text}</p>
                )}
                {item.note && <p className="print-allergen-ingredients">{item.note}</p>}
              </div>
            ))}
          </div>
          <p className="print-allergen-legal">
            Le informazioni derivano dalle etichette e dalle schede tecniche dei prodotti impiegati, conservate
            in azienda. In caso di cambio di fornitore o di ricetta l'elenco viene aggiornato.
          </p>
        </div>
      )}
    </div>
  );
}
