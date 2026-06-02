import type { ClientMessageRecord, EventHandlingResult } from "../domain/event-results";

export interface RunEventsWorkflowEventSummaryItem {
  processNumber: string;
  checkpointBefore: number | null;
  checkpointAfter: number | null;
  newEventsCount: number;
  handledEventsCount: number;
  checkpointBlocked: boolean;
  failedEventIds: string[];
}

export interface RunEventsWorkflowReportState {
  processesChecked: string[];
  eventSummary: RunEventsWorkflowEventSummaryItem[];
  updatedCheckpointProcessNumbers: string[];
  eventHandlingResults: EventHandlingResult[];
  warnings: string[];
  periciaClientsMessaged: Set<string>;
  laudoClientsMessaged: Set<string>;
  sentencaClientsMessaged: Set<string>;
}

export function createWorkflowReportState(): RunEventsWorkflowReportState {
  return {
    processesChecked: [],
    eventSummary: [],
    updatedCheckpointProcessNumbers: [],
    eventHandlingResults: [],
    warnings: [],
    periciaClientsMessaged: new Set<string>(),
    laudoClientsMessaged: new Set<string>(),
    sentencaClientsMessaged: new Set<string>(),
  };
}

export function trackClientMessages(
  report: RunEventsWorkflowReportState,
  messages: ClientMessageRecord[],
): void {
  for (const message of messages) {
    const clientName = message.clientName.trim();
    if (!clientName) {
      continue;
    }

    if (message.eventType === "pericia") {
      report.periciaClientsMessaged.add(clientName);
    } else if (message.eventType === "laudo") {
      report.laudoClientsMessaged.add(clientName);
    } else if (message.eventType === "sentenca") {
      report.sentencaClientsMessaged.add(clientName);
    }
  }
}

export function finalizeWorkflowReport(report: RunEventsWorkflowReportState) {
  return {
    processesChecked: report.processesChecked,
    eventSummary: report.eventSummary,
    updatedCheckpointProcessNumbers: report.updatedCheckpointProcessNumbers,
    eventHandlingResults: report.eventHandlingResults,
    warnings: report.warnings,
    messagedClients: {
      pericia: [...report.periciaClientsMessaged].sort((left, right) => left.localeCompare(right)),
      laudo: [...report.laudoClientsMessaged].sort((left, right) => left.localeCompare(right)),
      sentenca: [...report.sentencaClientsMessaged].sort((left, right) => left.localeCompare(right)),
    },
  };
}
