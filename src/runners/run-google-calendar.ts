import "dotenv/config";
import { GOOGLE_CALENDAR_CONFIG } from "../config";
import {
  createAllDayEvent,
  deleteEvent,
  listEventsByDate,
  parseBrazilianDateToIsoDate,
} from "../integrations/google/calendar";

const payload = {
  calendarId: GOOGLE_CALENDAR_CONFIG.defaultCalendarId,
  summary: "Teste - Prazo EPROC",
  description: "Evento de teste para validar integração Google Calendar.",
  sourceDate: "29/04/2026 23:59:59",
  send: true,
};

async function main(): Promise<void> {
  const date = parseBrazilianDateToIsoDate(payload.sourceDate);
  if (!date) {
    throw new Error(`Could not parse sourceDate: "${payload.sourceDate}"`);
  }

  const event = {
    calendarId: payload.calendarId,
    summary: payload.summary,
    description: payload.description,
    date,
  };

  console.log(JSON.stringify({ event, send: payload.send }, null, 2));

  if (!payload.send) {
    return;
  }

  const createdEvent = await createAllDayEvent(
    {
      summary: event.summary,
      description: event.description,
      date: event.date,
    },
    event.calendarId,
  );

  console.log(
    JSON.stringify(
      { step: "created", event: createdEvent },
      null,
      2,
    ),
  );

  const eventsOnDate = await listEventsByDate(event.date, event.calendarId);
  console.log(
    JSON.stringify(
      { step: "listed", date: event.date, count: eventsOnDate.length, events: eventsOnDate },
      null,
      2,
    ),
  );

  await deleteEvent(createdEvent.id, event.calendarId);
  console.log(
    JSON.stringify(
      { step: "deleted", eventId: createdEvent.id },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
});
