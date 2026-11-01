// Tutti i registri di un'azienda per un mese, in un colpo solo.
//
// È il punto d'ingresso unico: lo usa l'app quando si vuole il fascicolo
// del mese, e lo userà la Edge Function che manda il riepilogo mensile per
// email. Un solo elenco di moduli, un solo modo di impaginarli — se fossero
// due, il registro archiviato dal cliente e quello esibito al controllo col
// tempo direbbero cose diverse.
//
// Quali moduli: esattamente quelli allegati al manuale di QUELLA azienda,
// con gli stessi codici, perché li dà `elencoModuli(azienda)`, lo stesso
// che li scrive nel manuale. Se un'azienda ha otto moduli escono otto
// registri; se ne ha sedici, sedici.
//
// Due eccezioni, decise con Leandro:
//   - i CARTELLINI non si mandano: sono un foglio da ritagliare, non un
//     registro di qualcosa che è successo;
//   - il RITIRO si manda solo nei mesi in cui c'è stato un ritiro: non è un
//     registro ma un modulo da compilare se succede, e un modulo di ritiro
//     vuoto archiviato ogni mese non dice niente a nessuno.
// Tutti gli altri si mandano anche quando sono vuoti, con dentro la frase
// che dichiara l'assenza di registrazioni: in archivio una dichiarazione
// vale, un foglio bianco sembra una dimenticanza.

import { elencoModuli } from "./moduliElenco.js";
import { htmlRegistroTemperature, htmlRegistroSanificazione, htmlRegistroInfestanti } from "./registriStampa.js";
import { SPEC, SOLO_SE_USATO, righeDelMese, htmlRegistroElenco } from "./registriElenco.js";
import { nomeMese } from "./registriBase.js";

const senzaAccenti = (t) =>
  String(t || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// I tre registri a calendario hanno ciascuno la propria forma e i propri
// dati: non passano dalle specifiche a colonne.
const CALENDARIO = {
  temperature: (mese, azienda, d) => htmlRegistroTemperature({
    mese, azienda, impianti: d.impianti || [], letture: d.letture || [],
    chiusure: d.chiusure || [], spegnimenti: d.spegnimenti || [],
  }),
  pulizie: (mese, azienda, d) => htmlRegistroSanificazione({
    mese, azienda, piano: d.piano || [], interventi: d.interventi || [],
    chiusure: d.chiusure || [],
  }),
  infestanti: (mese, azienda, d) => htmlRegistroInfestanti({
    mese, azienda, postazioni: d.postazioni || [], giri: d.giri || [], esiti: d.esiti || [],
  }),
};

export function registriDelMese({ azienda, mese, dati = {} }) {
  const fuori = [];

  elencoModuli(azienda || {}).forEach((m) => {
    if (m.chiave === "cartellini") return;

    const nomeFile = `${m.codice}_${senzaAccenti(m.chiave)}_${mese}.html`;

    if (CALENDARIO[m.chiave]) {
      fuori.push({
        chiave: m.chiave, codice: m.codice, titolo: m.titolo, nomeFile,
        righe: null,
        html: CALENDARIO[m.chiave](mese, azienda, dati),
      });
      return;
    }

    if (!SPEC[m.chiave]) return;   // modulo senza registro: si salta, non si inventa

    const righe = righeDelMese(m.chiave, mese, dati);
    if (righe.length === 0 && SOLO_SE_USATO.includes(m.chiave)) return;

    fuori.push({
      chiave: m.chiave, codice: m.codice, titolo: m.titolo, nomeFile,
      righe: righe.length,
      html: htmlRegistroElenco({
        chiave: m.chiave, mese, azienda, codice: m.codice, titolo: m.titolo, righe,
      }),
    });
  });

  return fuori;
}

// Il riepilogo in parole, per il corpo dell'email: dice che cosa c'è
// dentro prima ancora di aprire gli allegati.
export function riepilogoDelMese(registri, azienda, mese) {
  const righe = registri.map((r) => {
    if (r.righe === null) return `- ${r.codice} ${r.titolo}`;
    return `- ${r.codice} ${r.titolo}: ${r.righe === 0 ? "nessuna registrazione" : r.righe === 1 ? "1 registrazione" : r.righe + " registrazioni"}`;
  });
  return [
    `Registri di autocontrollo di ${azienda?.name || ""} — ${nomeMese(mese)}.`,
    "",
    "In allegato i registri del mese, nella stessa forma dei moduli allegati al manuale.",
    "Vanno conservati insieme al manuale: sono il documento che si esibisce in caso di controllo.",
    "",
    ...righe,
    "",
    "Gli allegati delle singole registrazioni — referti, documenti di trasporto, rapporti di intervento —",
    "restano nell'applicativo e si scaricano da lì.",
  ].join("\n");
}
