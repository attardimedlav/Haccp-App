// Chi è ancora in forza e chi non lo è più.
//
// Un lavoratore che lascia l'azienda non si cancella: i suoi attestati e le
// sue visite mediche restano agli atti, e in un controllo servono a dimostrare
// che finché era in forza era formato e idoneo. Si cancella soltanto il futuro:
// dalla data di cessazione in poi quella persona non deve più produrre avvisi,
// non deve comparire nei conteggi e non deve colorarsi di rosso nel quadro
// della formazione, perché non è più un obbligo di quell'azienda.
//
// Qui dentro c'è tutto quello che serve per distinguere i due gruppi. Sta in un
// file solo per la ragione imparata più volte in questo progetto: un elenco che
// va filtrato si filtra una volta sola, in cima, e da lì in poi si usa quello.
// Quando il filtro è scritto in cinque schede, prima o poi ne resta una vecchia
// e un'azienda si ritrova gli avvisi di uno che se n'è andato due anni fa.

// Stessa normalizzazione usata altrove per accostare un nome a una persona:
// spazi ripuliti, maiuscole ignorate e parole in ordine alfabetico, perché su
// attestati e nomine si trova sia "Bello Giuseppe" sia "Giuseppe Bello".
export function chiaveNome(testo) {
  return String(testo || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export function nomeDi(dipendente) {
  return `${String(dipendente?.first_name || "").trim()} ${String(dipendente?.last_name || "").trim()}`
    .replace(/[ \t]+/g, " ")
    .trim();
}

export const eCessato = (dipendente) => !!dipendente?.ended_at;

export const inForza = (elenco = []) => (elenco || []).filter((e) => !e?.ended_at);

export const cessati = (elenco = []) => (elenco || []).filter((e) => !!e?.ended_at);

// L'insieme dei nomi di chi non è più in forza, da costruire UNA volta e
// passare in giro. Serve perché quasi nulla, in questa app, è legato al
// dipendente da una chiave: visite mediche, nomine e corsi si accostano alla
// persona confrontando il nome scritto sopra. Finché è così, per sapere se un
// documento riguarda un cessato si guarda il nome.
export function nomiCessati(elenco = []) {
  return new Set(cessati(elenco).map((e) => chiaveNome(nomeDi(e))));
}

// Vero se quel nome non è di un cessato. Si usa come filtro sulle righe dei
// documenti: `.filter((v) => nonCessato(v.employee_name, usciti))`.
export const nonCessato = (nome, usciti) => !usciti || !usciti.has(chiaveNome(nome));
