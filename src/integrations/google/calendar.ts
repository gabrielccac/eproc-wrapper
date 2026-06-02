import { google } from "googleapis";
import { GOOGLE_CALENDAR_CONFIG } from "../../config";
import { getGoogleOAuthClient } from "./auth";

export interface CreateAllDayEventParams {
  summary: string;
  description?: string;
  date: string;
}

export interface CalendarEventInfo {
  id: string;
  summary: string;
  startDate: string | null;
  endDate: string | null;
}

export function getCalendarClient() {
  return google.calendar({
    version: "v3",
    auth: getGoogleOAuthClient(),
  });
}

export function parseBrazilianDateToIsoDate(value: string): string | null {
  const match = (value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export async function createAllDayEvent(
  params: CreateAllDayEventParams,
  calendarId = GOOGLE_CALENDAR_CONFIG.defaultCalendarId,
): Promise<CalendarEventInfo> {
  const calendar = getCalendarClient();

  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { date: params.date },
      end: { date: nextIsoDate(params.date) },
    },
  });

  const event = response.data;
  if (!event.id) {
    throw new Error("Google Calendar created an event without id.");
  }

  return {
    id: event.id,
    summary: event.summary || params.summary,
    startDate: event.start?.date || null,
    endDate: event.end?.date || null,
  };
}

export function nextIsoDate(date: string): string {
  const [year, month, day] = date.split("-").map((value) => Number.parseInt(value, 10));
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function listEventsByDate(
  date: string,
  calendarId = GOOGLE_CALENDAR_CONFIG.defaultCalendarId,
): Promise<CalendarEventInfo[]> {
  const calendar = getCalendarClient();
  const response = await calendar.events.list({
    calendarId,
    timeMin: `${date}T00:00:00-03:00`,
    timeMax: `${nextIsoDate(date)}T00:00:00-03:00`,
    singleEvents: true,
    orderBy: "startTime",
    timeZone: "America/Sao_Paulo",
  });

  return (response.data.items || [])
    .filter((event): event is typeof event & { id: string } => Boolean(event.id))
    .map((event) => ({
      id: event.id,
      summary: event.summary || "",
      startDate: event.start?.date || null,
      endDate: event.end?.date || null,
    }));
}

export async function deleteEvent(
  eventId: string,
  calendarId = GOOGLE_CALENDAR_CONFIG.defaultCalendarId,
): Promise<void> {
  const calendar = getCalendarClient();
  await calendar.events.delete({
    calendarId,
    eventId,
  });
}
