import { SHEETS_CONFIG, buildSheetRange } from "../config";
import { normalizeProcessNumber, parseClientPhone } from "../domain/phone";
import type { ClientLookupRow } from "../domain/client-resolution";
import { readSheetValues } from "../integrations/google/sheets";

export async function loadClientsLookup(): Promise<Map<string, ClientLookupRow>> {
  const lookup = new Map<string, ClientLookupRow>();
  const { spreadsheetId, sheetNames, defaultColumnsRange } = SHEETS_CONFIG.clients;

  for (const sheetName of sheetNames) {
    const range = buildSheetRange(sheetName, defaultColumnsRange);
    const rows = await readSheetValues(spreadsheetId, range);

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const processNumber = (row[0] || "").trim();
      if (!processNumber) {
        continue;
      }

      lookup.set(normalizeProcessNumber(processNumber), {
        clientName: (row[1] || "").trim() || "Cliente",
        phone: parseClientPhone((row[3] || "").trim()),
      });
    }
  }

  return lookup;
}
