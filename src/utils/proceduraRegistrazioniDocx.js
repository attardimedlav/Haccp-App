// L'allegato stampabile: la stessa procedura, in un foglio da mettere dentro
// il manuale cartaceo. Serve anche alle aziende il cui manuale non l'abbiamo
// scritto noi — è il caso più frequente quando si subentra a un altro
// consulente e il cliente passa alle schede informatiche.

import { par, pacchettoDocx, scaricaDocx } from "../modules/CorsoFormazione";
import { TITOLO_PROCEDURA, testoProceduraRegistrazioni } from "./proceduraRegistrazioni";

const VERDE = "2F6F4E";

const titolo = (t) => par(t, { bold: true, size: 32, align: "center", after: 200, color: VERDE });
const sottotitolo = (t) => par(t, { size: 24, align: "center", after: 60 });
const h = (t) => par(t, { bold: true, size: 24, before: 220, after: 90, color: VERDE });
const testo = (t) => par(t, { size: 24, after: 120, align: "both" });
const punto = (t) => par("•   " + t, { size: 24, after: 80, align: "both" });

export function corpoProceduraRegistrazioni(azienda = {}, opzioni = {}) {
  const b = [];
  const oggi = new Date().toLocaleDateString("it-IT");

  b.push(par("ALLEGATO AL MANUALE DI AUTOCONTROLLO", { size: 20, align: "center", after: 40, color: "6E7C73" }));
  b.push(titolo(TITOLO_PROCEDURA.toUpperCase()));
  if (azienda.name) b.push(sottotitolo(azienda.name));
  if (azienda.sede_operativa) b.push(sottotitolo(azienda.sede_operativa));
  b.push(par(
    [azienda.piva ? "P.IVA " + azienda.piva : "", "Data di adozione: " + oggi].filter(Boolean).join("   ·   "),
    { size: 20, align: "center", after: 260, color: "6E7C73" },
  ));

  testoProceduraRegistrazioni(azienda, opzioni).forEach((bl) => {
    if (bl.t === "h") b.push(h(bl.x));
    else if (bl.t === "b") b.push(punto(bl.x));
    else b.push(testo(bl.x));
  });

  // La firma è una sola: la responsabilità delle registrazioni è dell'OSA.
  b.push(par("", { after: 400 }));
  b.push(par("Il Titolare e Responsabile del Piano di Autocontrollo", { size: 22, after: 40 }));
  b.push(par(azienda.haccp_manager || "", { size: 22, after: 200 }));
  b.push(par("____________________________________", { size: 22, after: 40 }));
  b.push(par("(firma)", { size: 18, color: "6E7C73" }));

  return b;
}

export async function scaricaProceduraRegistrazioni(azienda = {}, opzioni = {}) {
  const files = pacchettoDocx(corpoProceduraRegistrazioni(azienda, opzioni));
  const nome = `Procedura_registrazioni_informatiche_${(azienda.name || "azienda").replace(/[^A-Za-z0-9]+/g, "_")}.docx`;
  await scaricaDocx(files, nome);
}
