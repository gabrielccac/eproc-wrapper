import test from "node:test";
import assert from "node:assert/strict";
import { parseClientPhone } from "../../src/domain/phone";

test("adds ninth digit for 10-digit Brazilian local phones", () => {
  assert.equal(parseClientPhone("(51) 3333-4444"), "5551933334444");
});

test("treats 11-digit phones as Brazilian local mobiles even when DDD is 55", () => {
  assert.equal(parseClientPhone("55 99999-9999"), "5555999999999");
});

test("keeps country-prefixed numbers with 12 or more digits", () => {
  assert.equal(parseClientPhone("55 51 99999-9999"), "5551999999999");
});
