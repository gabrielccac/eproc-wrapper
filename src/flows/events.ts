import { NOTIFICATIONS_CONFIG } from "../config";
import { getLatestEventId, isProcessRowChanged, parseEventId } from "../domain/checkpoints";
import {
  planProcessCheckpoint,
  resolveCheckpointAfterHandling,
} from "../domain/checkpoints";
import { mapWithConcurrency } from "../domain/concurrency";
import {
  buildNotificationDeliveryKey,
  type EventHandlingResult,
  type EventNotificationDeliveryLedger,
} from "../domain/event-results";
import {
  normalizeWorkflowModes,
  shouldLoadClientsLookup,
  type CalendarMode,
  type CheckpointMode,
  type NotificationMode,
} from "../domain/workflow-modes";
import { fetchProcessEvents } from "../eproc/events";
import { fetchProcesses } from "../eproc/processes";
import { loadClientsLookup, type ClientLookupRow } from "../integrations/notifications/router";
import {
  readProcessStateSnapshot,
  writeProcessStateChanges,
  type ProcessCheckpointUpdate,
  type ProcessEventNotificationLedgerUpdate,
  type ProcessMetadataUpdate,
  type ProcessStateAppend,
} from "../repositories/process-state-sheet";
import type { Process, ProcessEventsResult } from "../types";
import { handleNewProcessEvents } from "./events-processing";
import {
  createWorkflowReportState,
  finalizeWorkflowReport,
  trackClientMessages,
  type RunEventsWorkflowEventSummaryItem,
} from "./events-report";

export interface RunEventsWorkflowPayload {
  phpsessid: string;
  eprocBaseUrl?: string;
  processesEndpoints?: string[];
  sendNotifications?: boolean;
  createCalendarEvents?: boolean;
  notifications?: NotificationMode;
  calendar?: CalendarMode;
  checkpoint?: CheckpointMode;
  eventFetchConcurrency?: number;
}

export interface RunEventsWorkflowResult {
  processesChecked: string[];
  eventSummary: RunEventsWorkflowEventSummaryItem[];
  updatedCheckpointProcessNumbers: string[];
  eventHandlingResults: EventHandlingResult[];
  warnings: string[];
  messagedClients: {
    pericia: string[];
    laudo: string[];
    sentenca: string[];
  };
}

type ProcessWithEvents = {
  process: Process;
  fetchedEvents: ProcessEventsResult;
};

function buildSentNotificationKeyMap(
  ledger: EventNotificationDeliveryLedger,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [eventId, keys] of Object.entries(ledger)) {
    if (!eventId || !Array.isArray(keys) || keys.length === 0) {
      continue;
    }
    map.set(eventId, new Set(keys));
  }
  return map;
}

function buildUpdatedEventNotificationLedger(params: {
  existingLedger: EventNotificationDeliveryLedger;
  handlingResults: EventHandlingResult[];
  checkpointAfter: number | null;
}): EventNotificationDeliveryLedger {
  const working = new Map<string, Set<string>>();

  for (const [eventId, keys] of Object.entries(params.existingLedger)) {
    if (!eventId || !Array.isArray(keys) || keys.length === 0) {
      continue;
    }
    working.set(eventId, new Set(keys));
  }

  for (const result of params.handlingResults) {
    for (const notification of result.notifications) {
      if (notification.status !== "sent") {
        continue;
      }

      const key = buildNotificationDeliveryKey(notification);
      const eventSet = working.get(result.eventId) ?? new Set<string>();
      eventSet.add(key);
      working.set(result.eventId, eventSet);
    }
  }

  if (params.checkpointAfter !== null) {
    for (const eventId of [...working.keys()]) {
      const parsedEventId = parseEventId(eventId);
      if (parsedEventId > 0 && parsedEventId <= params.checkpointAfter) {
        working.delete(eventId);
      }
    }
  }

  const entries = [...working.entries()]
    .filter(([, keys]) => keys.size > 0)
    .sort((left, right) => parseEventId(left[0]) - parseEventId(right[0]))
    .slice(-200);

  const next: EventNotificationDeliveryLedger = {};
  for (const [eventId, keys] of entries) {
    next[eventId] = [...keys].sort((left, right) => left.localeCompare(right));
  }
  return next;
}

function serializeLedger(ledger: EventNotificationDeliveryLedger): string {
  const ordered = Object.entries(ledger)
    .sort((left, right) => parseEventId(left[0]) - parseEventId(right[0]))
    .map(([eventId, keys]) => [eventId, [...keys].sort((leftKey, rightKey) => leftKey.localeCompare(rightKey))]);

  return JSON.stringify(Object.fromEntries(ordered));
}

function uniqueProcessesByNumber(processes: Process[]): Process[] {
  return [...new Map(processes.map((process) => [process.numero, process])).values()];
}

async function fetchUniqueProcesses(
  endpoints: string[],
  phpsessid: string,
  eprocBaseUrl?: string,
): Promise<Process[]> {
  const fetchedProcessLists = await Promise.all(
    endpoints.map((endpoint) => fetchProcesses(endpoint, phpsessid, {
      baseRoot: eprocBaseUrl,
    })),
  );

  if (fetchedProcessLists.some((result) => result.sessionExpired)) {
    throw new Error("Session expired while fetching processes for events workflow.");
  }

  return uniqueProcessesByNumber(fetchedProcessLists.flatMap((result) => result.processes));
}

async function fetchEventsForProcesses(params: {
  processes: Process[];
  phpsessid: string;
  eprocBaseUrl?: string;
  concurrency: number;
}): Promise<ProcessWithEvents[]> {
  return mapWithConcurrency(params.processes, params.concurrency, async (process) => {
    const fetchedEvents = await fetchProcessEvents(process.url, params.phpsessid, {
      baseRoot: params.eprocBaseUrl,
    });
    if (fetchedEvents.sessionExpired) {
      throw new Error(`Session expired while fetching events for process ${process.numero}.`);
    }

    return { process, fetchedEvents };
  });
}

export async function runEventsWorkflow(
  payload: RunEventsWorkflowPayload,
): Promise<RunEventsWorkflowResult> {
  const modes = normalizeWorkflowModes(payload);
  const defaultWhatsAppNumber = NOTIFICATIONS_CONFIG.defaultWhatsAppNumber;
  const eventFetchConcurrency = payload.eventFetchConcurrency ?? 3;

  const endpointList = (payload.processesEndpoints && payload.processesEndpoints.length > 0)
    ? payload.processesEndpoints
    : [];
  if (endpointList.length === 0) {
    throw new Error("Set at least one process endpoint.");
  }

  let clientsLookup = new Map<string, ClientLookupRow>();
  if (shouldLoadClientsLookup(modes.notifications)) {
    clientsLookup = await loadClientsLookup();
  }

  const uniqueProcesses = await fetchUniqueProcesses(
    endpointList,
    payload.phpsessid,
    payload.eprocBaseUrl,
  );
  const processEvents = await fetchEventsForProcesses({
    processes: uniqueProcesses,
    phpsessid: payload.phpsessid,
    eprocBaseUrl: payload.eprocBaseUrl,
    concurrency: eventFetchConcurrency,
  });
  const processStateSnapshot = await readProcessStateSnapshot();

  const report = createWorkflowReportState();
  const appends: ProcessStateAppend[] = [];
  const metadataUpdates: ProcessMetadataUpdate[] = [];
  const checkpointUpdates: ProcessCheckpointUpdate[] = [];
  const eventNotificationLedgerUpdates: ProcessEventNotificationLedgerUpdate[] = [];
  const phoneValidationCache = new Map<string, boolean>();

  for (const { process, fetchedEvents } of processEvents) {
    const sheetRow = processStateSnapshot.processMap.get(process.numero);
    const checkpointBefore = sheetRow?.ultimoEventoId ?? null;
    const checkpointPlan = planProcessCheckpoint({
      processNumber: process.numero,
      events: fetchedEvents.events,
      checkpointBefore,
    });

    report.processesChecked.push(process.numero);

    const existingEventNotificationLedger = sheetRow?.eventNotificationLedger ?? {};
    const previouslySentNotificationKeysByEventId = buildSentNotificationKeyMap(
      existingEventNotificationLedger,
    );

    const handlingResults = await handleNewProcessEvents({
      process,
      events: checkpointPlan.newEvents,
      phpsessid: payload.phpsessid,
      eprocBaseUrl: payload.eprocBaseUrl,
      notifications: modes.notifications,
      calendar: modes.calendar,
      defaultWhatsAppNumber,
      clientsLookup,
      previouslySentNotificationKeysByEventId,
      phoneValidationCache,
    });

    for (const result of handlingResults) {
      report.eventHandlingResults.push(result);
      trackClientMessages(report, result.clientMessages);
    }

    const checkpointResolution = resolveCheckpointAfterHandling({
      checkpointBefore,
      newEvents: checkpointPlan.newEvents,
      handlingResults,
    });

    report.eventSummary.push({
      processNumber: process.numero,
      checkpointBefore,
      checkpointAfter: checkpointResolution.checkpointAfter,
      newEventsCount: checkpointPlan.newEvents.length,
      handledEventsCount: handlingResults.filter((result) => result.status !== "failed").length,
      checkpointBlocked: checkpointResolution.checkpointBlocked,
      failedEventIds: checkpointResolution.failedEventIds,
    });

    const updatedEventNotificationLedger = buildUpdatedEventNotificationLedger({
      existingLedger: existingEventNotificationLedger,
      handlingResults,
      checkpointAfter: checkpointResolution.checkpointAfter,
    });

    if (modes.checkpoint === "read-only") {
      continue;
    }

    if (!sheetRow) {
      appends.push({
        process,
        checkpoint: checkpointResolution.checkpointAfter,
        eventNotificationLedger: updatedEventNotificationLedger,
      });
      continue;
    }

    if (isProcessRowChanged(process, sheetRow)) {
      metadataUpdates.push({ rowIndex: sheetRow.rowIndex, process });
    }

    if (
      checkpointResolution.checkpointAfter !== null &&
      checkpointResolution.checkpointAfter !== sheetRow.ultimoEventoId &&
      checkpointResolution.checkpointAfter >= (sheetRow.ultimoEventoId ?? 0)
    ) {
      checkpointUpdates.push({
        rowIndex: sheetRow.rowIndex,
        checkpoint: checkpointResolution.checkpointAfter,
      });
      report.updatedCheckpointProcessNumbers.push(process.numero);
    }

    if (serializeLedger(updatedEventNotificationLedger) !== serializeLedger(existingEventNotificationLedger)) {
      eventNotificationLedgerUpdates.push({
        rowIndex: sheetRow.rowIndex,
        eventNotificationLedger: updatedEventNotificationLedger,
      });
    }
  }

  if (modes.checkpoint === "read-only") {
    report.warnings.push("Checkpoint mode is read-only; no process rows or checkpoints were written.");
  } else {
    await writeProcessStateChanges({
      snapshot: processStateSnapshot,
      appends,
      metadataUpdates,
      checkpointUpdates,
      eventNotificationLedgerUpdates,
    });
  }

  return finalizeWorkflowReport(report);
}

export { getLatestEventId };
