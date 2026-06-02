export const SHEETS_CONFIG = {
  processes: {
    spreadsheetId: "11ScDXHkfS1eHxWDKG-EXWffrfwTCE2jMuA6GlRm1HIc",
    preferredSheetName: "Processos Abertos JRFS",
    defaultColumnsRange: "A:H",
  },
  clients: {
    spreadsheetId: "1OcKblCidVV3D6XUndbjU1Do3VS2GJPSq9Zh32a-Xyzw",
    sheetNames: ["Federal", "Estadual"] as const,
    defaultColumnsRange: "A:D",
  },
} as const;

export const GOOGLE_CALENDAR_CONFIG = {
  defaultCalendarId: "primary",
} as const;

export const NOTIFICATIONS_CONFIG = {
  defaultWhatsAppNumber: "120363426197862451@g.us",
  clientMessageLookbackDays: 6,
} as const;

export function buildSheetRange(sheetTitle: string, columnsRange: string): string {
  return `'${sheetTitle.replace(/'/g, "''")}'!${columnsRange}`;
}
