import test from "node:test";
import assert from "node:assert/strict";
import { isOverduePericiaInBrt, parsePericiaDateTimeInBrt } from "../../src/domain/pericia-dates";

test("parses valid pericia date/time parts", () => {
  assert.deepEqual(parsePericiaDateTimeInBrt({
    periciado: "Cliente",
    data: "16/04/2026",
    horario: "09:30",
    local: "Forum",
    perito: "Perito",
  }), {
    year: 2026,
    month: 4,
    day: 16,
    hour: 9,
    minute: 30,
  });
});

test("rejects invalid calendar dates", () => {
  assert.equal(parsePericiaDateTimeInBrt({
    periciado: "Cliente",
    data: "31/02/2026",
    horario: "09:30",
    local: "Forum",
    perito: "Perito",
  }), null);
});

test("detects overdue pericia by date only in America/Sao_Paulo", () => {
  const now = new Date("2026-04-16T13:00:00.000Z"); // 10:00 BRT
  assert.equal(isOverduePericiaInBrt({
    periciado: "Cliente",
    data: "15/04/2026",
    horario: "23:59",
    local: "Forum",
    perito: "Perito",
  }, now), true);
  assert.equal(isOverduePericiaInBrt({
    periciado: "Cliente",
    data: "16/04/2026",
    horario: "00:01",
    local: "Forum",
    perito: "Perito",
  }, now), false);
  assert.equal(isOverduePericiaInBrt({
    periciado: "Cliente",
    data: "16/04/2026",
    horario: "09:00",
    local: "Forum",
    perito: "Perito",
  }, now), false);
  assert.equal(isOverduePericiaInBrt({
    periciado: "Cliente",
    data: "17/04/2026",
    horario: "00:01",
    local: "Forum",
    perito: "Perito",
  }, now), false);
});
