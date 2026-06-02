import { SHEETS_CONFIG, buildSheetRange } from "../config";
import type { EventNotificationDeliveryLedger } from "../domain/event-results";
import type { Process } from "../types";
import {
  appendSheetRows,
  batchUpdateSheetValues,
  getSheetMetadata,
  readSheetValues,
} from "../integrations/google/sheets";

export type SheetProcessRow = {
  rowIndex: number;
  numeroProcesso: string;
  classe: string;
  assunto: string;
  eventoPrazo: string;
  inicioPrazo: string;
  finalPrazo: string;
  ultimoEventoId: number | null;
  eventNotificationLedger: EventNotificationDeliveryLedger;
};

export interface ProcessStateRepositorySnapshot {
  spreadsheetId: string;
  sheetTitle: string;
  rows: SheetProcessRow[];
  processMap: Map<string, SheetProcessRow>;
}

export interface ProcessMetadataUpdate {
  rowIndex: number;
  process: Process;
}

export interface ProcessCheckpointUpdate {
  rowIndex: number;
  checkpoint: number | null;
}

export interface ProcessStateAppend {
  process: Process;
  checkpoint: number | null;
  eventNotificationLedger: EventNotificationDeliveryLedger;
}

export interface ProcessEventNotificationLedgerUpdate {
  rowIndex: number;
  eventNotificationLedger: EventNotificationDeliveryLedger;
}

export function parseSheetProcessRows(values: string[][]): SheetProcessRow[] {
  const rows: SheetProcessRow[] = [];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const numeroProcesso = (row[0] || "").trim();
    if (!numeroProcesso) {
      continue;
    }

    const lastSeenRaw = (row[6] || "").trim();
    const parsedLastSeen = Number.parseInt(lastSeenRaw, 10);
    const eventNotificationLedger = parseEventNotificationLedger((row[7] || "").trim());

    rows.push({
      rowIndex,
      numeroProcesso,
      classe: (row[1] || "").trim(),
      assunto: (row[2] || "").trim(),
      eventoPrazo: (row[3] || "").trim(),
      inicioPrazo: (row[4] || "").trim(),
      finalPrazo: (row[5] || "").trim(),
      ultimoEventoId: Number.isFinite(parsedLastSeen) ? parsedLastSeen : null,
      eventNotificationLedger,
    });
  }

  return rows;
}

function parseEventNotificationLedger(raw: string): EventNotificationDeliveryLedger {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const normalized: EventNotificationDeliveryLedger = {};
    for (const [eventId, keys] of Object.entries(parsed)) {
      if (!eventId || !Array.isArray(keys)) {
        continue;
      }

      const validKeys = keys
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean);

      if (validKeys.length > 0) {
        normalized[eventId] = [...new Set(validKeys)];
      }
    }

    return normalized;
  } catch {
    return {};
  }
}

export function createProcessRowMap(rows: SheetProcessRow[]): Map<string, SheetProcessRow> {
  return new Map(rows.map((row) => [row.numeroProcesso, row]));
}

export async function readProcessStateSnapshot(): Promise<ProcessStateRepositorySnapshot> {
  const { spreadsheetId, preferredSheetName, defaultColumnsRange } = SHEETS_CONFIG.processes;
  const sheetMetadata = await getSheetMetadata(spreadsheetId, preferredSheetName);
  const range = buildSheetRange(sheetMetadata.sheetTitle, defaultColumnsRange);
  const values = await readSheetValues(spreadsheetId, range);
  const rows = parseSheetProcessRows(values);

  return {
    spreadsheetId,
    sheetTitle: sheetMetadata.sheetTitle,
    rows,
    processMap: createProcessRowMap(rows),
  };
}

function buildAppendRow(item: ProcessStateAppend): string[] {
  return [
    item.process.numero,
    item.process.classe,
    item.process.assunto,
    item.process.eventoPrazo,
    item.process.inicioPrazo,
    item.process.finalPrazo,
    item.checkpoint !== null ? String(item.checkpoint) : "",
    JSON.stringify(item.eventNotificationLedger),
  ];
}

export async function writeProcessStateChanges(params: {
  snapshot: Pick<ProcessStateRepositorySnapshot, "spreadsheetId" | "sheetTitle">;
  appends: ProcessStateAppend[];
  metadataUpdates: ProcessMetadataUpdate[];
  checkpointUpdates: ProcessCheckpointUpdate[];
  eventNotificationLedgerUpdates: ProcessEventNotificationLedgerUpdate[];
}): Promise<void> {
  const { snapshot, appends, metadataUpdates, checkpointUpdates, eventNotificationLedgerUpdates } = params;

  await appendSheetRows(
    snapshot.spreadsheetId,
    buildSheetRange(snapshot.sheetTitle, "A:H"),
    appends.map(buildAppendRow),
  );

  const updates = [
    ...metadataUpdates.map((update) => ({
      range: buildSheetRange(
        snapshot.sheetTitle,
        `B${update.rowIndex + 1}:F${update.rowIndex + 1}`,
      ),
      values: [[
        update.process.classe,
        update.process.assunto,
        update.process.eventoPrazo,
        update.process.inicioPrazo,
        update.process.finalPrazo,
      ]],
    })),
    ...checkpointUpdates.map((update) => ({
      range: buildSheetRange(snapshot.sheetTitle, `G${update.rowIndex + 1}`),
      values: [[update.checkpoint !== null ? String(update.checkpoint) : ""]],
    })),
    ...eventNotificationLedgerUpdates.map((update) => ({
      range: buildSheetRange(snapshot.sheetTitle, `H${update.rowIndex + 1}`),
      values: [[JSON.stringify(update.eventNotificationLedger)]],
    })),
  ];

  await batchUpdateSheetValues(snapshot.spreadsheetId, updates);
}
