export type NotificationMode = "disabled" | "dry-run" | "enabled";
export type CalendarMode = "disabled" | "dry-run" | "enabled";
export type CheckpointMode = "read-only" | "write";

export interface WorkflowModes {
  notifications: NotificationMode;
  calendar: CalendarMode;
  checkpoint: CheckpointMode;
}

export interface WorkflowModePayload {
  notifications?: NotificationMode;
  calendar?: CalendarMode;
  checkpoint?: CheckpointMode;
  sendNotifications?: boolean;
  createCalendarEvents?: boolean;
}

export function normalizeWorkflowModes(payload: WorkflowModePayload): WorkflowModes {
  return {
    notifications:
      payload.notifications ??
      (payload.sendNotifications === true ? "enabled" : "disabled"),
    calendar:
      payload.calendar ??
      (payload.createCalendarEvents === true ? "enabled" : "disabled"),
    checkpoint: payload.checkpoint ?? "write",
  };
}

export function shouldLoadClientsLookup(mode: NotificationMode): boolean {
  return mode === "enabled" || mode === "dry-run";
}
