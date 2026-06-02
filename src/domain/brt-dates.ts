export type DateParts = {
  year: number;
  month: number;
  day: number;
};

export type DateTimeParts = DateParts & {
  hour: number;
  minute: number;
};

function addDaysToDateParts(parts: DateParts, days: number): DateParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function parseBrazilianDateParts(value: string): DateParts | null {
  const dateMatch = (value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!dateMatch) {
    return null;
  }

  const day = Number.parseInt(dateMatch[1], 10);
  const month = Number.parseInt(dateMatch[2], 10);
  const year = Number.parseInt(dateMatch[3], 10);

  if (month < 1 || month > 12) {
    return null;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function getNowDatePartsInBrt(now: Date = new Date()): DateParts {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const values = { year: 0, month: 0, day: 0 };

  for (const part of parts) {
    if (part.type === "year") values.year = Number.parseInt(part.value, 10);
    if (part.type === "month") values.month = Number.parseInt(part.value, 10);
    if (part.type === "day") values.day = Number.parseInt(part.value, 10);
  }

  return values;
}

export function getNowDateTimePartsInBrt(now: Date = new Date()): DateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const values = { year: 0, month: 0, day: 0, hour: 0, minute: 0 };

  for (const part of parts) {
    if (part.type === "year") values.year = Number.parseInt(part.value, 10);
    if (part.type === "month") values.month = Number.parseInt(part.value, 10);
    if (part.type === "day") values.day = Number.parseInt(part.value, 10);
    if (part.type === "hour") values.hour = Number.parseInt(part.value, 10);
    if (part.type === "minute") values.minute = Number.parseInt(part.value, 10);
  }

  return values;
}

export function compareDateParts(left: DateParts, right: DateParts): number {
  const leftTuple = [left.year, left.month, left.day];
  const rightTuple = [right.year, right.month, right.day];

  for (let index = 0; index < leftTuple.length; index += 1) {
    if (leftTuple[index] < rightTuple[index]) return -1;
    if (leftTuple[index] > rightTuple[index]) return 1;
  }

  return 0;
}

export function compareDateTimeParts(left: DateTimeParts, right: DateTimeParts): number {
  const dateCompare = compareDateParts(left, right);
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const leftTuple = [left.hour, left.minute];
  const rightTuple = [right.hour, right.minute];

  for (let index = 0; index < leftTuple.length; index += 1) {
    if (leftTuple[index] < rightTuple[index]) return -1;
    if (leftTuple[index] > rightTuple[index]) return 1;
  }

  return 0;
}

export function isBrazilianDateBeforeTodayInBrt(value: string, now: Date = new Date()): boolean {
  const date = parseBrazilianDateParts(value);
  if (!date) {
    return false;
  }

  return compareDateParts(date, getNowDatePartsInBrt(now)) < 0;
}

export function isBrazilianDateBeforeDaysAgoInBrt(
  value: string,
  daysAgo: number,
  now: Date = new Date(),
): boolean {
  const date = parseBrazilianDateParts(value);
  if (!date) {
    return false;
  }

  const today = getNowDatePartsInBrt(now);
  const threshold = addDaysToDateParts(today, -Math.max(0, daysAgo));
  return compareDateParts(date, threshold) < 0;
}
