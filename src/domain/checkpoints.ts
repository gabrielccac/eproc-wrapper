import type { Process, ProcessEvent } from "../types";
import type { EventHandlingResult } from "./event-results";

export function parseEventId(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
import { isSuccessfulEventHandling } from "./event-results";

export interface ProcessCheckpointPlan {
  processNumber: string;
  checkpointBefore: number | null;
  checkpointAfter: number | null;
  newEvents: ProcessEvent[];
  latestEventId: number;
}

export interface CheckpointResolution {
  checkpointAfter: number | null;
  checkpointBlocked: boolean;
  failedEventIds: string[];
}

export function getLatestEventId(events: ProcessEvent[]): number {
  if (events.length === 0) {
    return 0;
  }
  return parseEventId(events[0].id);
}

export function getNewEvents(events: ProcessEvent[], lastSeenEventId: number): ProcessEvent[] {
  return events
    .filter((event) => parseEventId(event.id) > lastSeenEventId)
    .sort((left, right) => parseEventId(left.id) - parseEventId(right.id));
}

export function isProcessRowChanged(
  process: Process,
  existing: Pick<Process, "classe" | "assunto" | "eventoPrazo" | "inicioPrazo" | "finalPrazo">,
): boolean {
  return (
    process.classe !== existing.classe ||
    process.assunto !== existing.assunto ||
    process.eventoPrazo !== existing.eventoPrazo ||
    process.inicioPrazo !== existing.inicioPrazo ||
    process.finalPrazo !== existing.finalPrazo
  );
}

export function planProcessCheckpoint(params: {
  processNumber: string;
  events: ProcessEvent[];
  checkpointBefore: number | null;
}): ProcessCheckpointPlan {
  const latestEventId = getLatestEventId(params.events);
  const lastSeenEventId = params.checkpointBefore ?? 0;
  const newEvents = latestEventId > 0 ? getNewEvents(params.events, lastSeenEventId) : [];

  return {
    processNumber: params.processNumber,
    checkpointBefore: params.checkpointBefore,
    checkpointAfter: params.checkpointBefore,
    newEvents,
    latestEventId,
  };
}

export function resolveCheckpointAfterHandling(params: {
  checkpointBefore: number | null;
  newEvents: ProcessEvent[];
  handlingResults: EventHandlingResult[];
}): CheckpointResolution {
  let checkpointAfter = params.checkpointBefore;
  const failedEventIds: string[] = [];

  for (const event of params.newEvents) {
    const result = params.handlingResults.find((item) => item.eventId === event.id);
    if (!result || !isSuccessfulEventHandling(result)) {
      failedEventIds.push(event.id);
      break;
    }

    const parsedEventId = parseEventId(event.id);
    if (parsedEventId > 0 && (checkpointAfter === null || parsedEventId > checkpointAfter)) {
      checkpointAfter = parsedEventId;
    }
  }

  return {
    checkpointAfter,
    checkpointBlocked: failedEventIds.length > 0,
    failedEventIds,
  };
}
