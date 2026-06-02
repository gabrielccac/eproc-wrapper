import { google } from "googleapis";
import { getGoogleOAuthClient } from "./auth";

export interface SheetMetadata {
  sheetTitle: string;
  sheetId: number;
}

export function getSheetsClient() {
  return google.sheets({
    version: "v4",
    auth: getGoogleOAuthClient(),
  });
}

export async function getSheetMetadata(
  spreadsheetId: string,
  preferredName: string,
): Promise<SheetMetadata> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(title,sheetId)",
  });

  const availableSheets = (response.data.sheets || []).map((sheet) => ({
    sheetTitle: sheet.properties?.title || "",
    sheetId: sheet.properties?.sheetId ?? -1,
  }));

  const exactMatch = availableSheets.find(
    (sheet) => sheet.sheetTitle.trim() === preferredName.trim(),
  );
  const selectedSheet = exactMatch ?? availableSheets[0];

  if (!selectedSheet || selectedSheet.sheetId < 0) {
    throw new Error(`No sheets found in spreadsheet ${spreadsheetId}`);
  }

  return selectedSheet;
}

export async function readSheetValues(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return (response.data.values || []).map((row) => row.map((cell) => String(cell ?? "")));
}

export async function appendSheetRows(
  spreadsheetId: string,
  range: string,
  rows: string[][],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: {
      values: rows,
    },
  });
}

export async function batchUpdateSheetValues(
  spreadsheetId: string,
  updates: Array<{ range: string; values: string[][] }>,
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates,
    },
  });
}

export async function deleteSheetRows(
  spreadsheetId: string,
  sheetId: number,
  rowIndexes: number[],
): Promise<void> {
  if (rowIndexes.length === 0) {
    return;
  }

  const sheets = getSheetsClient();
  const descendingIndexes = [...rowIndexes].sort((left, right) => right - left);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: descendingIndexes.map((rowIndex) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS" as const,
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      })),
    },
  });
}
