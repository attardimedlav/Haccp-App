// Procedura per la tenuta delle registrazioni su supporto informatico.
//
// Il testo è uno solo e vive qui, perché serve in due posti: stampato come
// allegato da mettere nel manuale cartaceo (anche quando il manuale non l'ha
// scritto l'app), e scritto dentro il manuale quando lo genera l'app.
// Un solo testo, nessuna possibilità che le due versioni si contraddicano.

export const TITOLO_PROCEDURA =
  "Procedura per la tenuta delle registrazioni dell'autocontrollo su supporto informatico";

// Ogni voce: { t: "p" | "b" | "h", x: "testo" }
export function testoProceduraRegistrazioni(azienda = {}, opzioni = {}) {
  const nomeApp = opzioni.nomeApplicativo || "Cardine — Autocontrollo HACCP";
  const responsabile = azienda.haccp_manager || "il titolare";
  const blocchi = [];

  blocchi.push({ t: "h", x: "Scopo" });
  blocchi.push({ t: "p", x: `Stabilire come l'impresa alimentare tiene, conserva ed esibisce le registrazioni previste dal proprio manuale di autocontrollo, adottando il supporto informatico in luogo delle schede cartacee.` });

  blocchi.push({ t: "h", x: "Campo di applicazione" });
  blocchi.push({ t: "p", x: "La procedura si applica a tutte le registrazioni previste dal piano di autocontrollo: temperature, sanificazione, monitoraggio degli infestanti, arrivo merci e tracciabilità, fornitori, manutenzioni, non conformità e ogni altro modulo richiamato dal manuale." });

  blocchi.push({ t: "h", x: "Riferimenti" });
  blocchi.push({ t: "b", x: "Reg. (CE) n. 852/2004, art. 5, comma 4, lett. d: l'operatore predispone documenti e registrazioni adeguati alla natura e alle dimensioni dell'impresa, per dimostrare l'applicazione delle misure adottate." });
  blocchi.push({ t: "b", x: "Reg. (CE) n. 852/2004, Allegato I e Comunicazione della Commissione 2016/C 278/01: la forma delle registrazioni non è prescritta; conta che siano disponibili, leggibili e riferibili alle operazioni svolte." });
  blocchi.push({ t: "b", x: "Reg. (CE) n. 178/2002, art. 18: le informazioni sulla rintracciabilità sono messe a disposizione dell'autorità competente su richiesta." });
  blocchi.push({ t: "p", x: "Nessuna norma impone la forma cartacea: il supporto informatico è ammesso purché le registrazioni siano complete, conservate e immediatamente esibibili." });

  blocchi.push({ t: "h", x: "Strumento adottato" });
  blocchi.push({ t: "p", x: `Le registrazioni sono tenute con l'applicativo gestionale ${nomeApp}, accessibile via web da computer, tablet e telefono. L'accesso avviene con credenziali personali rilasciate dal responsabile del piano di autocontrollo; i dati di ciascuna impresa sono separati da quelli delle altre.` });

  blocchi.push({ t: "h", x: "Modalità di registrazione" });
  blocchi.push({ t: "b", x: "La registrazione è effettuata dall'addetto incaricato nel momento in cui il controllo viene eseguito, con la stessa frequenza prevista dal manuale per il modulo cartaceo corrispondente." });
  blocchi.push({ t: "b", x: "Ogni registrazione riporta la data e l'ora di inserimento, generate dal sistema e non modificabili dall'utente, e — dove il modulo lo prevede — il nominativo dell'operatore." });
  blocchi.push({ t: "b", x: "I valori fuori dai limiti previsti sono evidenziati dall'applicativo e danno luogo alla registrazione della non conformità e dell'azione correttiva adottata." });
  blocchi.push({ t: "b", x: "I documenti giustificativi (documenti di trasporto, etichette, schede tecniche, dichiarazioni dei fornitori, referti analitici, attestati di formazione) sono allegati in copia digitale alla registrazione cui si riferiscono." });

  blocchi.push({ t: "h", x: "Conservazione e sicurezza dei dati" });
  blocchi.push({ t: "b", x: "I dati risiedono su server gestiti dal fornitore del servizio, con copie di sicurezza periodiche a cura dello stesso fornitore." });
  blocchi.push({ t: "b", x: "Le registrazioni sono conservate per un periodo non inferiore a dodici mesi e comunque adeguato alla vita commerciale dei prodotti, coerentemente con quanto previsto dal manuale." });
  blocchi.push({ t: "b", x: "L'accesso è riservato al personale autorizzato e al consulente tecnico; le credenziali sono personali e non cedibili." });

  blocchi.push({ t: "h", x: "Esibizione agli organi di controllo" });
  blocchi.push({ t: "p", x: `In occasione di un controllo ufficiale le registrazioni sono mostrate a video e, su richiesta dell'organo di vigilanza, stampate seduta stante. ${responsabile === "il titolare" ? "Il titolare" : responsabile} garantisce la disponibilità di un dispositivo con accesso all'applicativo all'interno dell'esercizio.` });

  blocchi.push({ t: "h", x: "Indisponibilità del sistema" });
  blocchi.push({ t: "p", x: "In caso di guasto, assenza di connessione o altra indisponibilità dell'applicativo, i controlli previsti dal manuale continuano a essere eseguiti e sono annotati sulle schede cartacee allegate al manuale. Le annotazioni sono riportate nell'applicativo appena il servizio torna disponibile; le schede cartacee compilate nel frattempo sono conservate in azienda." });

  blocchi.push({ t: "h", x: "Responsabilità" });
  blocchi.push({ t: "p", x: `${responsabile === "il titolare" ? "Il titolare" : responsabile}, responsabile del piano di autocontrollo, verifica periodicamente la completezza delle registrazioni e provvede alla formazione degli addetti sull'uso dell'applicativo. La responsabilità delle registrazioni resta in capo all'operatore del settore alimentare, quale che sia il supporto impiegato.` });

  return blocchi;
}
