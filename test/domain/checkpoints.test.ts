import test from "node:test";
import assert from "node:assert/strict";
import {
  getNewEvents,
  planProcessCheckpoint,
  resolveCheckpointAfterHandling,
} from "../../src/domain/checkpoints";
import type { EventHandlingResult } from "../../src/domain/event-results";
import type { ProcessEvent } from "../../src/types";

function event(id: string): ProcessEvent {
  return {
    id,
    dataHora: "",
    label: "",
    descricao: "",
    usuario: "",
    usuarioTipo: "TERCEIRO",
    documentos: [],
    type: "defaultEvent",
  };
}

function result(id: string, status: EventHandlingResult["status"]): EventHandlingResult {
  return {
    eventId: id,
    eventType: "defaultEvent",
    processNumber: "P1",
    status,
    notifications: [],
    clientMessages: [],
  };
}

test("returns new events in ascending event id order", () => {
  assert.deepEqual(getNewEvents([event("12"), event("10"), event("11")], 10).map((item) => item.id), ["11", "12"]);
});

test("plans null checkpoint as all fetched events new", () => {
  const plan = planProcessCheckpoint({ processNumber: "P1", events: [event("2"), event("1")], checkpointBefore: null });
  assert.equal(plan.latestEventId, 2);
  assert.deepEqual(plan.newEvents.map((item) => item.id), ["1", "2"]);
});

test("does not report checkpoint regression when fetched latest is stale", () => {
  const plan = planProcessCheckpoint({ processNumber: "P1", events: [event("90")], checkpointBefore: 100 });
  const resolution = resolveCheckpointAfterHandling({ checkpointBefore: 100, newEvents: plan.newEvents, handlingResults: [] });
  assert.equal(resolution.checkpointAfter, 100);
  assert.equal(resolution.checkpointBlocked, false);
});

test("blocks checkpoint at first failed event", () => {
  const newEvents = [event("101"), event("102"), event("103")];
  const resolution = resolveCheckpointAfterHandling({
    checkpointBefore: 100,
    newEvents,
    handlingResults: [result("101", "handled"), result("102", "failed")],
  });

  assert.equal(resolution.checkpointAfter, 101);
  assert.equal(resolution.checkpointBlocked, true);
  assert.deepEqual(resolution.failedEventIds, ["102"]);
});
