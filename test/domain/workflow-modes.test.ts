import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkflowModes } from "../../src/domain/workflow-modes";

test("normalizes legacy booleans into workflow modes", () => {
  assert.deepEqual(normalizeWorkflowModes({ sendNotifications: true, createCalendarEvents: true }), {
    notifications: "enabled",
    calendar: "enabled",
    checkpoint: "write",
  });

  assert.deepEqual(normalizeWorkflowModes({ sendNotifications: false, createCalendarEvents: false }), {
    notifications: "disabled",
    calendar: "disabled",
    checkpoint: "write",
  });
});

test("explicit workflow modes override legacy booleans", () => {
  assert.deepEqual(
    normalizeWorkflowModes({
      sendNotifications: true,
      createCalendarEvents: true,
      notifications: "dry-run",
      calendar: "disabled",
      checkpoint: "read-only",
    }),
    {
      notifications: "dry-run",
      calendar: "disabled",
      checkpoint: "read-only",
    },
  );
});
