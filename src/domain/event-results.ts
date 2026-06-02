import type { ProcessEventType } from "../types";

export type ClientMessageEventType = "pericia" | "laudo" | "sentenca";

export interface ClientMessageRecord {
  eventType: ClientMessageEventType;
  processNumber: string;
  clientName: string;
}

export type EventHandlingStatus = "handled" | "skipped" | "failed";
export type NotificationChannel = "slack" | "whatsapp" | "calendar";
export type NotificationStatus = "sent" | "dry-run" | "skipped" | "failed";

export interface NotificationResult {
  channel: NotificationChannel;
  status: NotificationStatus;
  recipient?: string;
  reason?: string;
  summary?: string;
}

export type EventNotificationDeliveryLedger = Record<string, string[]>;

export interface EventHandlingResult {
  eventId: string;
  eventType: ProcessEventType;
  processNumber: string;
  status: EventHandlingStatus;
  notifications: NotificationResult[];
  clientMessages: ClientMessageRecord[];
  errorReason?: string;
}

export function createSkippedEventResult(params: {
  eventId: string;
  eventType: ProcessEventType;
  processNumber: string;
  reason: string;
}): EventHandlingResult {
  return {
    eventId: params.eventId,
    eventType: params.eventType,
    processNumber: params.processNumber,
    status: "skipped",
    notifications: [],
    clientMessages: [],
    errorReason: params.reason,
  };
}

export function createFailedEventResult(params: {
  eventId: string;
  eventType: ProcessEventType;
  processNumber: string;
  reason: string;
  notifications?: NotificationResult[];
  clientMessages?: ClientMessageRecord[];
}): EventHandlingResult {
  return {
    eventId: params.eventId,
    eventType: params.eventType,
    processNumber: params.processNumber,
    status: "failed",
    notifications: params.notifications ?? [],
    clientMessages: params.clientMessages ?? [],
    errorReason: params.reason,
  };
}

export function isSuccessfulEventHandling(result: EventHandlingResult): boolean {
  return result.status === "handled" || result.status === "skipped";
}

export function buildNotificationDeliveryKey(notification: Pick<NotificationResult, "channel" | "recipient" | "summary">): string {
  return JSON.stringify([
    notification.channel,
    notification.recipient || "",
    notification.summary || "",
  ]);
}
