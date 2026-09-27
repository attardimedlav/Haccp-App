// Codice a barre e banca dati aperta.
//
// Due cose che fanno risparmiare letture a pagamento: riconoscere il prodotto
// dal suo EAN invece che dal nome scritto a mano, e chiedere ingredienti e
// allergeni a Open Food Facts, che è gratuita.
//
// Attenzione al livello di fiducia: Open Food Facts è compilata dagli utenti,
// quindi quello che torna da lì entra SEMPRE come "da verificare". La verifica
// è la foto dell'etichetta vera, che resta la prova da esibire.

export const ALLERGENI = [
  "Glutine", "Latte", "Uova", "Soia", "Frutta a guscio", "Pesce", "Crostacei",
  "Sedano", "Senape", "Solfiti", "Arachidi", "Sesamo", "Lupini", "Molluschi",
];

// Le etichette di Open Food Facts arrivano come "en:milk", "en:gluten"...
const DA_TAG = {
  gluten: "Glutine",
  milk: "Latte",
  eggs: "Uova",
  soybeans: "Soia",
  nuts: "Frutta a guscio",
  fish: "Pesce",
  crustaceans: "Crostacei",
  celery: "Sedano",
  mustard: "Senape",
  "sulphur-dioxide-and-sulphites": "Solfiti",
  peanuts: "Arachidi",
  "sesame-seeds": "Sesamo",
  sesame: "Sesamo",
  lupin: "Lupini",
  molluscs: "Molluschi",
};

const daTag = (tags) =>
  [...new Set((tags || [])
    .map((t) => DA_TAG[String(t).replace(/^[a-z]{2}:/, "")])
    .filter(Boolean))];

// Un EAN valido ha 8 o 13 cifre e l'ultima è di controllo: si ricalcola, così
// una cifra letta male dalla fotocamera non diventa un prodotto sbagliato.
export function eanValido(codice) {
  const c = String(codice || "").replace(/\D/g, "");
  if (c.length !== 8 && c.length !== 13) return false;
  const cifre = c.split("").map(Number);
  const controllo = cifre.pop();
  const somma = cifre
    .reverse()
    .reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (somma % 10)) % 10 === controllo;
}

// Nelle banche dati aperte il campo ingredienti a volte contiene un
// segnaposto invece del testo vero: "Unknown", "n/a", un trattino. Vale come
// vuoto, altrimenti finisce in catalogo un prodotto con scritto "Unknown" al
// posto della lista ingredienti — ed è quello che è successo con la Calvé.
const SEGNAPOSTO = [
  "unknown", "n/a", "na", "none", "null", "-", "--", "sconosciuto",
  "non disponibile", "da completare", "todo", "?", "x",
];

function testoIngredienti(grezzo) {
  const t = String(grezzo || "").trim();
  if (!t) return null;
  if (SEGNAPOSTO.includes(t.toLowerCase().replace(/[.\s]/g, ""))) return null;
  // Una lista ingredienti vera è lunga e ha delle virgole: sotto questa
  // soglia è quasi sempre una parola messa lì per riempire il campo.
  if (t.length < 15 && !t.includes(",")) return null;
  return t;
}

// Interrogazione della banca dati aperta. Torna null se il prodotto non c'è.
export async function cercaSuOpenFoodFacts(ean) {
  const campi = "product_name,product_name_it,brands,quantity,ingredients_text_it,ingredients_text,allergens_tags,traces_tags";
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=${campi}`;
  const risposta = await fetch(url);
  if (!risposta.ok) throw new Error("banca dati non raggiungibile");
  const dati = await risposta.json();
  if (dati?.status !== 1 || !dati?.product) return null;
  const p = dati.product;
  const nome = [p.product_name_it || p.product_name, p.brands, p.quantity]
    .filter(Boolean).join(" ").trim();
  return {
    ean,
    nome: nome || `Prodotto ${ean}`,
    ingredienti: testoIngredienti(p.ingredients_text_it || p.ingredients_text),
    allergeni: daTag(p.allergens_tags),
    tracce: daTag(p.traces_tags),
  };
}

// Lettura del codice con la fotocamera, dove il browser la sa fare.
// Su iPhone l'API non c'è: in quel caso il codice si scrive a mano, ed è per
// questo che il campo di testo resta sempre visibile.
export const fotocameraDisponibile = () =>
  typeof window !== "undefined" && "BarcodeDetector" in window;

export async function leggiCodiceDallaFotocamera(video, { formati } = {}) {
  if (!fotocameraDisponibile()) throw new Error("questo browser non legge i codici a barre");
  const Detector = window.BarcodeDetector;
  const rilevatore = new Detector({ formats: formati || ["ean_13", "ean_8", "upc_a", "upc_e"] });
  const flusso = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  video.srcObject = flusso;
  await video.play();

  const fermati = () => flusso.getTracks().forEach((t) => t.stop());
  const scadenza = Date.now() + 20000;   // vent'secondi, poi si rinuncia
  try {
    while (Date.now() < scadenza) {
      const trovati = await rilevatore.detect(video);
      const buono = trovati.map((t) => t.rawValue).find(eanValido);
      if (buono) return buono;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  } finally {
    fermati();
  }
}
