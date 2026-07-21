import type { ParsedPericia } from "../types";
import {
  compareDateParts,
  compareDateTimeParts,
  getNowDatePartsInBrt,
  getNowDateTimePartsInBrt,
  parseBrazilianDateParts,
  type DateTimeParts,
} from "./brt-dates";

export function parsePericiaDateInBrt(pericia: ParsedPericia) {
  return parseBrazilianDateParts(pericia.data || "");
}

export function parsePericiaDateTimeInBrt(pericia: ParsedPericia): DateTimeParts | null {
  const date = parsePericiaDateInBrt(pericia);
  const timeMatch = (pericia.horario || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!date || !timeMatch) {
    return null;
  }

  const hour = Number.parseInt(timeMatch[1], 10);
  const minute = Number.parseInt(timeMatch[2], 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { ...date, hour, minute };
}

export {
  compareDateParts,
  compareDateTimeParts,
  getNowDatePartsInBrt,
  getNowDateTimePartsInBrt,
};

export function isOverduePericiaInBrt(
  pericia: ParsedPericia,
  now: Date = new Date(),
): boolean {
  const periciaDate = parsePericiaDateInBrt(pericia);
  if (!periciaDate) {
    return false;
  }

  return compareDateParts(periciaDate, getNowDatePartsInBrt(now)) < 0;
}
