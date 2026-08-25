// Logica condivisa per calcolare lo stato dell'abbonamento di un'azienda.
// Usata sia per il blocco dell'accesso (App.jsx) sia per i badge in "I miei clienti".

export function getSubscriptionStatus(company) {
  if (!company) return null;

  if (company.subscription_status === "sospeso") {
    return { state: "sospeso", label: "Sospeso" };
  }

  if (!company.subscription_end) return null; // non configurato: nessun avviso, nessun blocco

  const end = new Date(company.subscription_end);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
  const dateLabel = end.toLocaleDateString("it-IT");

  if (diffDays < 0 || company.subscription_status === "scaduto") {
    return { state: "scaduto", label: `Scaduto il ${dateLabel}`, diffDays, dateLabel };
  }
  if (diffDays <= 30) {
    return { state: "in_scadenza", label: `Scade il ${dateLabel}`, diffDays, dateLabel };
  }
  return { state: "attivo", label: `Attivo fino al ${dateLabel}`, diffDays, dateLabel };
}

export function isSubscriptionBlocked(company) {
  const info = getSubscriptionStatus(company);
  return info?.state === "sospeso" || info?.state === "scaduto";
}
