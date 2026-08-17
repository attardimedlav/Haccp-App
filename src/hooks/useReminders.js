function pad2(n) { return String(n).padStart(2, "0"); }

function formatICSDate(d) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
}

function nextOccurrence(hour, minute, weekday) {
  // weekday: 0=domenica...6=sabato, null = tutti i giorni
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
  if (weekday !== null) {
    while (d.getDay() !== weekday || d <= now) d.setDate(d.getDate() + 1);
  } else if (d <= now) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function buildReminderICS(companyName) {
  const events = [
    { summary: "Controllo temperature e sanificazione", rrule: "FREQ=DAILY", weekday: null },
    { summary: "Controllo settimanale infestanti", rrule: "FREQ=WEEKLY;BYDAY=MO", weekday: 1 },
  ];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Autocontrollo HACCP//IT", "CALSCALE:GREGORIAN"];
  events.forEach((ev, i) => {
    const start = nextOccurrence(8, 0, ev.weekday);
    lines.push(
      "BEGIN:VEVENT",
      `UID:haccp-reminder-${i}-${Date.now()}@autocontrollo`,
      `DTSTAMP:${formatICSDate(new Date())}Z`,
      `DTSTART;TZID=Europe/Rome:${formatICSDate(start)}`,
      "DURATION:PT15M",
      `RRULE:${ev.rrule}`,
      `SUMMARY:${ev.summary}${companyName ? " — " + companyName : ""}`,
      "BEGIN:VALARM", "TRIGGER:-PT0M", "ACTION:DISPLAY", `DESCRIPTION:${ev.summary}`, "END:VALARM",
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadReminderICS(companyName) {
  const ics = buildReminderICS(companyName);
  const dataUri = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  const link = document.createElement("a");
  link.href = dataUri;
  link.download = "promemoria-haccp.ics";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
