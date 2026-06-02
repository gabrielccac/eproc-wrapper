import "dotenv/config";
import { SHEETS_CONFIG, buildSheetRange } from "../config";
import {
  getSheetMetadata,
  readSheetValues,
} from "../integrations/google/sheets";

type SheetTarget = "processes" | "clients";
type ClientsSheetName = (typeof SHEETS_CONFIG.clients.sheetNames)[number];

const targets: Record<
  SheetTarget,
  { spreadsheetId: string; preferredSheetName: string; defaultColumnsRange: string }
> = {
  processes: {
    spreadsheetId: SHEETS_CONFIG.processes.spreadsheetId,
    preferredSheetName: SHEETS_CONFIG.processes.preferredSheetName,
    defaultColumnsRange: SHEETS_CONFIG.processes.defaultColumnsRange,
  },
  clients: {
    spreadsheetId: SHEETS_CONFIG.clients.spreadsheetId,
    preferredSheetName: SHEETS_CONFIG.clients.sheetNames[0],
    defaultColumnsRange: SHEETS_CONFIG.clients.defaultColumnsRange,
  },
};

const payload = {
  target: "clients" as SheetTarget,
  clientsSheetName: "Federal" as ClientsSheetName,
  range: "",
};

async function main(): Promise<void> {
  const targetConfig = { ...targets[payload.target] };
  if (payload.target === "clients") {
    targetConfig.preferredSheetName = payload.clientsSheetName;
  }

  const metadata = await getSheetMetadata(
    targetConfig.spreadsheetId,
    targetConfig.preferredSheetName,
  );
  const defaultRange = buildSheetRange(
    metadata.sheetTitle,
    targetConfig.defaultColumnsRange,
  );
  const range = payload.range.trim() || defaultRange;
  const values = await readSheetValues(targetConfig.spreadsheetId, range);

  console.log(
    JSON.stringify({ target: payload.target, metadata, range, values }, null, 2),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
});
