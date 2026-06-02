import test from "node:test";
import assert from "node:assert/strict";
import { nextIsoDate, parseBrazilianDateToIsoDate } from "../../../src/integrations/google/calendar";

test("parses Brazilian date strings into ISO dates", () => {
  assert.equal(parseBrazilianDateToIsoDate("16/04/2026 10:00:00"), "2026-04-16");
});

test("computes exclusive all-day calendar end date", () => {
  assert.equal(nextIsoDate("2026-04-16"), "2026-04-17");
  assert.equal(nextIsoDate("2026-12-31"), "2027-01-01");
});
