import test from "node:test";
import assert from "node:assert/strict";
import {
  isBrazilianDateBeforeTodayInBrt,
  parseBrazilianDateParts,
} from "../../src/domain/brt-dates";

test("parses Brazilian date at the start of an event timestamp", () => {
  assert.deepEqual(parseBrazilianDateParts("16/04/2026 10:30:00"), {
    year: 2026,
    month: 4,
    day: 16,
  });
});

test("compares Brazilian date only against today in BRT", () => {
  const now = new Date("2026-04-16T13:00:00.000Z"); // 10:00 BRT

  assert.equal(isBrazilianDateBeforeTodayInBrt("15/04/2026 23:59:59", now), true);
  assert.equal(isBrazilianDateBeforeTodayInBrt("16/04/2026 00:01:00", now), false);
  assert.equal(isBrazilianDateBeforeTodayInBrt("17/04/2026 00:01:00", now), false);
});
