import { createFailedEventResult, type EventHandlingResult } from "../domain/event-results";
import type { CalendarMode, NotificationMode } from "../domain/workflow-modes";
import { handleProcessEvent, type ClientLookupRow } from "../integrations/notifications/router";
import type { Process, ProcessEvent } from "../types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function handleNewProcessEvents(params: {
  process: Process;
  events: ProcessEvent[];
  phpsessid: string;
  eprocBaseUrl?: string;
  notifications: NotificationMode;
  calendar: CalendarMode;
  defaultWhatsAppNumber: string;
  clientsLookup: Map<string, ClientLookupRow>;
  previouslySentNotificationKeysByEventId: Map<string, Set<string>>;
  phoneValidationCache: Map<string, boolean>;
}): Promise<EventHandlingResult[]> {
  const results: EventHandlingResult[] = [];

  for (const event of params.events) {
    try {
      const result = await handleProcessEvent({
        process: params.process,
        event,
        phpsessid: params.phpsessid,
        eprocBaseUrl: params.eprocBaseUrl,
        notifications: params.notifications,
        calendar: params.calendar,
        defaultWhatsAppNumber: params.defaultWhatsAppNumber,
        clientsLookup: params.clientsLookup,
        alreadySentNotificationKeys: params.previouslySentNotificationKeysByEventId.get(event.id) ?? new Set<string>(),
        phoneValidationCache: params.phoneValidationCache,
      });
      results.push(result);

      if (result.status === "failed") {
        break;
      }
    } catch (error: unknown) {
      results.push(createFailedEventResult({
        eventId: event.id,
        eventType: event.type,
        processNumber: params.process.numero,
        reason: errorMessage(error),
      }));
      break;
    }
  }

  return results;
}
