import { NOTIFICATIONS_CONFIG } from "../../config";
import { isBrazilianDateBeforeDaysAgoInBrt } from "../../domain/brt-dates";
import { getClientNameFromPartes, type ClientLookupRow } from "../../domain/client-resolution";
import {
  buildNotificationDeliveryKey,
  createFailedEventResult,
  createSkippedEventResult,
  type ClientMessageRecord,
  type EventHandlingResult,
  type NotificationResult,
} from "../../domain/event-results";
import { isOverduePericiaInBrt } from "../../domain/pericia-dates";
import { normalizeProcessNumber } from "../../domain/phone";
import type { CalendarMode, NotificationMode } from "../../domain/workflow-modes";
import { fetchLaudo, extractLaudoDocumentUrls } from "../../eproc/laudo";
import { parsePericia } from "../../eproc/pericia";
import { getSentencaOutcomeFromLabel } from "../../eproc/sentenca";
import { parseTask } from "../../eproc/tasks";
import type { Process, ProcessEvent } from "../../types";
import { createAllDayEvent, parseBrazilianDateToIsoDate } from "../google/calendar";
import { notificationMessageBuilders as messages } from "./messages";
import { sendSlackMessage } from "./slack";
import { sendWhatsAppMessage, validateWhatsAppNumber } from "./whatsapp";

export type { ClientLookupRow } from "../../domain/client-resolution";
export type { ClientMessageRecord, EventHandlingResult, NotificationResult } from "../../domain/event-results";
export { loadClientsLookup } from "../../repositories/clients-sheet";

export interface NotifyProcessEventParams {
  process: Process;
  event: ProcessEvent;
  phpsessid: string;
  eprocBaseUrl?: string;
  notifications: NotificationMode;
  calendar: CalendarMode;
  defaultWhatsAppNumber?: string;
  clientsLookup: Map<string, ClientLookupRow>;
  alreadySentNotificationKeys?: Set<string>;
  phoneValidationCache?: Map<string, boolean>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function handledResult(params: {
  processNumber: string;
  event: ProcessEvent;
  notifications?: NotificationResult[];
  clientMessages?: ClientMessageRecord[];
}): EventHandlingResult {
  return {
    eventId: params.event.id,
    eventType: params.event.type,
    processNumber: params.processNumber,
    status: "handled",
    notifications: params.notifications ?? [],
    clientMessages: params.clientMessages ?? [],
  };
}

function skippedResult(processNumber: string, event: ProcessEvent, reason: string): EventHandlingResult {
  return createSkippedEventResult({
    eventId: event.id,
    eventType: event.type,
    processNumber,
    reason,
  });
}

async function recordSlackNotification(params: {
  mode: NotificationMode;
  message: string;
  summary: string;
  alreadySentNotificationKeys: Set<string>;
}): Promise<NotificationResult> {
  const key = buildNotificationDeliveryKey({
    channel: "slack",
    summary: params.summary,
  });
  if (params.alreadySentNotificationKeys.has(key)) {
    return { channel: "slack", status: "skipped", reason: "Already sent in previous attempt", summary: params.summary };
  }

  if (params.mode === "disabled") {
    return { channel: "slack", status: "skipped", reason: "Notifications disabled", summary: params.summary };
  }

  if (params.mode === "dry-run") {
    return { channel: "slack", status: "dry-run", summary: params.summary };
  }

  try {
    await sendSlackMessage(params.message);
    params.alreadySentNotificationKeys.add(key);
    return { channel: "slack", status: "sent", summary: params.summary };
  } catch (error: unknown) {
    return { channel: "slack", status: "failed", reason: errorMessage(error), summary: params.summary };
  }
}

async function recordWhatsAppNotification(params: {
  mode: NotificationMode;
  number: string;
  message: string;
  summary: string;
  alreadySentNotificationKeys: Set<string>;
}): Promise<NotificationResult> {
  const recipient = params.number.trim();
  if (!recipient) {
    return { channel: "whatsapp", status: "skipped", reason: "Missing recipient", summary: params.summary };
  }

  const key = buildNotificationDeliveryKey({
    channel: "whatsapp",
    recipient,
    summary: params.summary,
  });
  if (params.alreadySentNotificationKeys.has(key)) {
    return { channel: "whatsapp", status: "skipped", recipient, reason: "Already sent in previous attempt", summary: params.summary };
  }

  if (params.mode === "disabled") {
    return { channel: "whatsapp", status: "skipped", recipient, reason: "Notifications disabled", summary: params.summary };
  }

  if (params.mode === "dry-run") {
    return { channel: "whatsapp", status: "dry-run", recipient, summary: params.summary };
  }

  try {
    await sendWhatsAppMessage(recipient, params.message);
    params.alreadySentNotificationKeys.add(key);
    return { channel: "whatsapp", status: "sent", recipient, summary: params.summary };
  } catch (error: unknown) {
    return { channel: "whatsapp", status: "failed", recipient, reason: errorMessage(error), summary: params.summary };
  }
}

async function recordCalendarEvent(params: {
  mode: CalendarMode;
  summary: string;
  description: string;
  date: string | null;
  alreadySentNotificationKeys: Set<string>;
}): Promise<NotificationResult> {
  const key = buildNotificationDeliveryKey({
    channel: "calendar",
    summary: params.summary,
  });
  if (params.alreadySentNotificationKeys.has(key)) {
    return { channel: "calendar", status: "skipped", reason: "Already sent in previous attempt", summary: params.summary };
  }

  if (!params.date) {
    return { channel: "calendar", status: "skipped", reason: "Missing valid event date", summary: params.summary };
  }

  if (params.mode === "disabled") {
    return { channel: "calendar", status: "skipped", reason: "Calendar disabled", summary: params.summary };
  }

  if (params.mode === "dry-run") {
    return { channel: "calendar", status: "dry-run", summary: params.summary };
  }

  try {
    await createAllDayEvent({
      summary: params.summary,
      description: params.description,
      date: params.date,
    });
    params.alreadySentNotificationKeys.add(key);
    return { channel: "calendar", status: "sent", summary: params.summary };
  } catch (error: unknown) {
    return { channel: "calendar", status: "failed", reason: errorMessage(error), summary: params.summary };
  }
}

function hasFailedNotification(notifications: NotificationResult[]): NotificationResult | undefined {
  return notifications.find((notification) => notification.status === "failed");
}

function getClientContext(process: Process, clientsLookup: Map<string, ClientLookupRow>) {
  const client = clientsLookup.get(normalizeProcessNumber(process.numero));
  const clientName = client?.clientName || getClientNameFromPartes(process) || undefined;
  const clientPhone = client?.phone || null;
  return { clientName, clientPhone };
}

async function isValidClientWhatsApp(params: {
  mode: NotificationMode;
  clientPhone: string | null;
  cache?: Map<string, boolean>;
}): Promise<boolean> {
  const phone = (params.clientPhone || "").trim();
  if (!phone) {
    return false;
  }

  if (params.mode !== "enabled") {
    return true;
  }

  const cached = params.cache?.get(phone);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const validation = await validateWhatsAppNumber(phone);
    const isValid = validation?.exists ?? true;
    params.cache?.set(phone, isValid);
    return isValid;
  } catch {
    // If validation endpoint fails, preserve previous behavior and attempt delivery.
    return true;
  }
}

async function handleHighlightEvent(params: NotifyProcessEventParams): Promise<EventHandlingResult> {
  // Temporarily disabled: highlight events should not send notifications for now.
  void params.defaultWhatsAppNumber;
  return skippedResult(params.process.numero, params.event, "Highlight notifications are temporarily disabled");
}

async function handleTaskEvent(params: NotifyProcessEventParams): Promise<EventHandlingResult> {
  const { process, event, notifications: notificationMode, calendar: calendarMode } = params;
  const alreadySentNotificationKeys = params.alreadySentNotificationKeys ?? new Set<string>();
  const parsedTask = parseTask(event);
  if (!parsedTask) {
    return skippedResult(process.numero, event, "Task event could not be parsed");
  }

  const notificationResults: NotificationResult[] = [];
  const shouldNotifyTaskStatus = parsedTask.state === "open" || parsedTask.state === "waitingOpen";
  const defaultWhatsAppNumber = params.defaultWhatsAppNumber ?? NOTIFICATIONS_CONFIG.defaultWhatsAppNumber;
  const taskEventIsOld = isBrazilianDateBeforeDaysAgoInBrt(event.dataHora, 2);
  const taskDateLabel = (event.dataHora || "").trim() || "unknown";

  if (shouldNotifyTaskStatus) {
    if (taskEventIsOld) {
      notificationResults.push({
        channel: "slack",
        status: "skipped",
        reason: `Task event date (${taskDateLabel}) is before allowed window in America/Sao_Paulo`,
        summary: `Task event Slack - ${process.numero}`,
      });
      if (defaultWhatsAppNumber.trim()) {
        notificationResults.push({
          channel: "whatsapp",
          status: "skipped",
          reason: `Task event date (${taskDateLabel}) is before allowed window in America/Sao_Paulo`,
          summary: `Task event WhatsApp - ${process.numero}`,
        });
      }
    } else {
      notificationResults.push(await recordSlackNotification({
        mode: notificationMode,
        message: messages.buildTaskEventSlackMessage(process.numero, event, parsedTask),
        summary: `Task event Slack - ${process.numero}`,
        alreadySentNotificationKeys,
      }));

      if (defaultWhatsAppNumber.trim()) {
        notificationResults.push(await recordWhatsAppNotification({
          mode: notificationMode,
          number: defaultWhatsAppNumber,
          message: messages.buildTaskEventWhatsAppMessage(process.numero, event, parsedTask),
          summary: `Task event WhatsApp - ${process.numero}`,
          alreadySentNotificationKeys,
        }));
      }
    }
  }

  if (parsedTask.state === "open") {
    const inicioPrazoIso = parsedTask.inicioPrazo
      ? parseBrazilianDateToIsoDate(parsedTask.inicioPrazo)
      : null;
    const finalPrazoIso = parsedTask.finalPrazo
      ? parseBrazilianDateToIsoDate(parsedTask.finalPrazo)
      : null;

    if (taskEventIsOld) {
      notificationResults.push({
        channel: "calendar",
        status: "skipped",
        reason: `Task event date (${taskDateLabel}) is before allowed window in America/Sao_Paulo`,
        summary: `Prazo iniciado - ${process.numero}`,
      });
      notificationResults.push({
        channel: "calendar",
        status: "skipped",
        reason: `Task event date (${taskDateLabel}) is before allowed window in America/Sao_Paulo`,
        summary: `Prazo final - ${process.numero}`,
      });
    } else {
      notificationResults.push(await recordCalendarEvent({
        mode: calendarMode,
        summary: `Prazo iniciado - ${process.numero}`,
        description: event.descricao,
        date: inicioPrazoIso,
        alreadySentNotificationKeys,
      }));
      notificationResults.push(await recordCalendarEvent({
        mode: calendarMode,
        summary: `Prazo final - ${process.numero}`,
        description: event.descricao,
        date: finalPrazoIso,
        alreadySentNotificationKeys,
      }));
    }
  }

  const failedNotification = hasFailedNotification(notificationResults);
  if (failedNotification) {
    return createFailedEventResult({
      eventId: event.id,
      eventType: event.type,
      processNumber: process.numero,
      reason: failedNotification.reason || "Task notification failed",
      notifications: notificationResults,
    });
  }

  return handledResult({ processNumber: process.numero, event, notifications: notificationResults });
}

async function handlePericiaEvent(params: NotifyProcessEventParams): Promise<EventHandlingResult> {
  const { process, event, notifications: notificationMode, calendar: calendarMode, clientsLookup } = params;
  const alreadySentNotificationKeys = params.alreadySentNotificationKeys ?? new Set<string>();
  const parsedPericia = parsePericia(event.descricao || event.label || "");
  const { clientName, clientPhone } = getClientContext(process, clientsLookup);
  const resolvedClientName = clientName?.trim() || parsedPericia.periciado || "Cliente";
  const defaultWhatsAppNumber = params.defaultWhatsAppNumber ?? NOTIFICATIONS_CONFIG.defaultWhatsAppNumber;
  const notificationResults: NotificationResult[] = [];
  const clientMessages: ClientMessageRecord[] = [];

  notificationResults.push(await recordSlackNotification({
    mode: notificationMode,
    message: messages.buildPericiaSlackMessage(process.numero, parsedPericia),
    summary: `Pericia Slack - ${process.numero}`,
    alreadySentNotificationKeys,
  }));

  const periciaIsOverdue = isOverduePericiaInBrt(
    parsedPericia,
    new Date(),
    NOTIFICATIONS_CONFIG.clientMessageLookbackDays,
  );
  const clientPhoneIsValid = await isValidClientWhatsApp({
    mode: notificationMode,
    clientPhone,
    cache: params.phoneValidationCache,
  });
  if (periciaIsOverdue) {
    const periciaDateLabel = parsedPericia.data?.trim() || "unknown";
    notificationResults.push({
      channel: "whatsapp",
      status: "skipped",
      reason: `Pericia date (${periciaDateLabel}) is before allowed window in America/Sao_Paulo`,
      summary: `Pericia WhatsApp - ${process.numero}`,
    });
  } else if (clientPhone && clientPhoneIsValid) {
    const result = await recordWhatsAppNotification({
      mode: notificationMode,
      number: clientPhone,
      message: messages.buildPericiaWhatsAppMessage(process.numero, parsedPericia, clientName),
      summary: `Pericia WhatsApp - ${process.numero}`,
      alreadySentNotificationKeys,
    });
    notificationResults.push(result);
    if (result.status === "sent") {
      clientMessages.push({ eventType: "pericia", processNumber: process.numero, clientName: resolvedClientName });
    }
  } else if (clientPhone && !clientPhoneIsValid && defaultWhatsAppNumber.trim()) {
    notificationResults.push({
      channel: "whatsapp",
      status: "skipped",
      recipient: clientPhone,
      reason: "Client number has no valid WhatsApp account",
      summary: `Pericia WhatsApp - ${process.numero}`,
    });
    notificationResults.push(await recordWhatsAppNotification({
      mode: notificationMode,
      number: defaultWhatsAppNumber,
      message: messages.buildClientsInvalidWhatsAppMessage(
        process.numero,
        "Perícia Designada",
        clientPhone,
        clientName,
      ),
      summary: `Pericia invalid WhatsApp fallback - ${process.numero}`,
      alreadySentNotificationKeys,
    }));
  } else if (defaultWhatsAppNumber.trim()) {
    const result = await recordWhatsAppNotification({
      mode: notificationMode,
      number: defaultWhatsAppNumber,
      message: messages.buildClientsFallbackWhatsAppMessage(process.numero, "Perícia Designada", clientName),
      summary: `Pericia fallback WhatsApp - ${process.numero}`,
      alreadySentNotificationKeys,
    });
    notificationResults.push(result);
    if (result.status === "sent") {
      clientMessages.push({ eventType: "pericia", processNumber: process.numero, clientName: resolvedClientName });
    }
  }

  const periciaDateIso = parsedPericia.data ? parseBrazilianDateToIsoDate(parsedPericia.data) : null;
  notificationResults.push(await recordCalendarEvent({
    mode: calendarMode,
    summary: `Perícia - ${process.numero}`,
    description: event.descricao,
    date: periciaDateIso,
    alreadySentNotificationKeys,
  }));

  const failedNotification = hasFailedNotification(notificationResults);
  if (failedNotification) {
    return createFailedEventResult({
      eventId: event.id,
      eventType: event.type,
      processNumber: process.numero,
      reason: failedNotification.reason || "Pericia notification failed",
      notifications: notificationResults,
      clientMessages,
    });
  }

  return handledResult({ processNumber: process.numero, event, notifications: notificationResults, clientMessages });
}

async function handleLaudoEvent(params: NotifyProcessEventParams): Promise<EventHandlingResult> {
  const { process, event, phpsessid, notifications: notificationMode, clientsLookup } = params;
  const alreadySentNotificationKeys = params.alreadySentNotificationKeys ?? new Set<string>();
  if (notificationMode === "disabled") {
    return skippedResult(process.numero, event, "Laudo notifications disabled");
  }

  const { clientName, clientPhone } = getClientContext(process, clientsLookup);
  const clientPhoneIsValid = await isValidClientWhatsApp({
    mode: notificationMode,
    clientPhone,
    cache: params.phoneValidationCache,
  });
  const resolvedClientName = clientName?.trim() || "Cliente";
  const defaultWhatsAppNumber = params.defaultWhatsAppNumber ?? NOTIFICATIONS_CONFIG.defaultWhatsAppNumber;
  const documentUrls = extractLaudoDocumentUrls(event);

  if (documentUrls.length === 0) {
    return skippedResult(process.numero, event, "Laudo event has no document URLs");
  }

  const clientMessages: ClientMessageRecord[] = [];

  for (const documentUrl of documentUrls) {
    let parsedLaudo;
    try {
      parsedLaudo = await fetchLaudo(documentUrl, phpsessid, {
        baseRoot: params.eprocBaseUrl,
      });
    } catch (error: unknown) {
      return createFailedEventResult({
        eventId: event.id,
        eventType: event.type,
        processNumber: process.numero,
        reason: `Failed to fetch/parse laudo document: ${errorMessage(error)}`,
      });
    }

    if (!parsedLaudo.conclusao) {
      continue;
    }

    const notificationResults: NotificationResult[] = [];
    notificationResults.push(await recordSlackNotification({
      mode: notificationMode,
      message: messages.buildLaudoSlackMessage(process.numero, parsedLaudo, clientName),
      summary: `Laudo Slack - ${process.numero}`,
      alreadySentNotificationKeys,
    }));

    const laudoEventIsOld = isBrazilianDateBeforeDaysAgoInBrt(
      event.dataHora,
      NOTIFICATIONS_CONFIG.clientMessageLookbackDays,
    );
    if (laudoEventIsOld) {
      const laudoDateLabel = (event.dataHora || "").trim() || "unknown";
      notificationResults.push({
        channel: "whatsapp",
        status: "skipped",
        reason: `Laudo event date (${laudoDateLabel}) is before allowed window in America/Sao_Paulo`,
        summary: `Laudo WhatsApp - ${process.numero}`,
      });
    } else if (clientPhone && clientPhoneIsValid) {
      const result = await recordWhatsAppNotification({
        mode: notificationMode,
        number: clientPhone,
        message: messages.buildLaudoWhatsAppMessage(process.numero, parsedLaudo, clientName),
        summary: `Laudo WhatsApp - ${process.numero}`,
        alreadySentNotificationKeys,
      });
      notificationResults.push(result);
      if (result.status === "sent") {
        clientMessages.push({ eventType: "laudo", processNumber: process.numero, clientName: resolvedClientName });
      }
    } else if (clientPhone && !clientPhoneIsValid && defaultWhatsAppNumber.trim()) {
      notificationResults.push({
        channel: "whatsapp",
        status: "skipped",
        recipient: clientPhone,
        reason: "Client number has no valid WhatsApp account",
        summary: `Laudo WhatsApp - ${process.numero}`,
      });
      notificationResults.push(await recordWhatsAppNotification({
        mode: notificationMode,
        number: defaultWhatsAppNumber,
        message: messages.buildClientsInvalidWhatsAppMessage(
          process.numero,
          "Laudo Pericial",
          clientPhone,
          clientName,
        ),
        summary: `Laudo invalid WhatsApp fallback - ${process.numero}`,
        alreadySentNotificationKeys,
      }));
    } else if (defaultWhatsAppNumber.trim()) {
      const result = await recordWhatsAppNotification({
        mode: notificationMode,
        number: defaultWhatsAppNumber,
        message: messages.buildClientsFallbackWhatsAppMessage(process.numero, "Laudo Pericial", clientName),
        summary: `Laudo fallback WhatsApp - ${process.numero}`,
        alreadySentNotificationKeys,
      });
      notificationResults.push(result);
      if (result.status === "sent") {
        clientMessages.push({ eventType: "laudo", processNumber: process.numero, clientName: resolvedClientName });
      }
    }

    const failedNotification = hasFailedNotification(notificationResults);
    if (failedNotification) {
      return createFailedEventResult({
        eventId: event.id,
        eventType: event.type,
        processNumber: process.numero,
        reason: failedNotification.reason || "Laudo notification failed",
        notifications: notificationResults,
        clientMessages,
      });
    }

    return handledResult({ processNumber: process.numero, event, notifications: notificationResults, clientMessages });
  }

  return skippedResult(process.numero, event, "No laudo conclusion parsed from available documents");
}

async function handleSentencaEvent(params: NotifyProcessEventParams): Promise<EventHandlingResult> {
  const { process, event, notifications: notificationMode, clientsLookup } = params;
  const alreadySentNotificationKeys = params.alreadySentNotificationKeys ?? new Set<string>();
  if (notificationMode === "disabled") {
    return skippedResult(process.numero, event, "Sentenca notifications disabled");
  }

  const outcome = getSentencaOutcomeFromLabel(event.label || "");
  if (!outcome) {
    return skippedResult(process.numero, event, "Sentenca outcome could not be determined from label");
  }

  const { clientName, clientPhone } = getClientContext(process, clientsLookup);
  const clientPhoneIsValid = await isValidClientWhatsApp({
    mode: notificationMode,
    clientPhone,
    cache: params.phoneValidationCache,
  });
  const resolvedClientName = clientName?.trim() || "Cliente";
  const defaultWhatsAppNumber = params.defaultWhatsAppNumber ?? NOTIFICATIONS_CONFIG.defaultWhatsAppNumber;

  const notificationResults: NotificationResult[] = [];
  const clientMessages: ClientMessageRecord[] = [];

  notificationResults.push(await recordSlackNotification({
    mode: notificationMode,
    message: messages.buildSentencaSlackMessage(process.numero, event, clientName),
    summary: `Sentenca Slack - ${process.numero}`,
    alreadySentNotificationKeys,
  }));

  const sentencaEventIsOld = isBrazilianDateBeforeDaysAgoInBrt(
    event.dataHora,
    NOTIFICATIONS_CONFIG.clientMessageLookbackDays,
  );
  if (sentencaEventIsOld) {
    const sentencaDateLabel = (event.dataHora || "").trim() || "unknown";
    notificationResults.push({
      channel: "whatsapp",
      status: "skipped",
      reason: `Sentenca event date (${sentencaDateLabel}) is before allowed window in America/Sao_Paulo`,
      summary: `Sentenca WhatsApp - ${process.numero}`,
    });
  } else if (clientPhone && clientPhoneIsValid) {
    const result = await recordWhatsAppNotification({
      mode: notificationMode,
      number: clientPhone,
      message: messages.buildSentencaWhatsAppMessage(event.label, resolvedClientName),
      summary: `Sentenca WhatsApp - ${process.numero}`,
      alreadySentNotificationKeys,
    });
    notificationResults.push(result);
    if (result.status === "sent") {
      clientMessages.push({ eventType: "sentenca", processNumber: process.numero, clientName: resolvedClientName });
    }
  } else if (clientPhone && !clientPhoneIsValid && defaultWhatsAppNumber.trim()) {
    notificationResults.push({
      channel: "whatsapp",
      status: "skipped",
      recipient: clientPhone,
      reason: "Client number has no valid WhatsApp account",
      summary: `Sentenca WhatsApp - ${process.numero}`,
    });
    notificationResults.push(await recordWhatsAppNotification({
      mode: notificationMode,
      number: defaultWhatsAppNumber,
      message: messages.buildClientsInvalidWhatsAppMessage(
        process.numero,
        "Sentença",
        clientPhone,
        clientName,
      ),
      summary: `Sentenca invalid WhatsApp fallback - ${process.numero}`,
      alreadySentNotificationKeys,
    }));
  } else if (defaultWhatsAppNumber.trim()) {
    const result = await recordWhatsAppNotification({
      mode: notificationMode,
      number: defaultWhatsAppNumber,
      message: messages.buildClientsFallbackWhatsAppMessage(process.numero, "Sentença", clientName),
      summary: `Sentenca fallback WhatsApp - ${process.numero}`,
      alreadySentNotificationKeys,
    });
    notificationResults.push(result);
    if (result.status === "sent") {
      clientMessages.push({ eventType: "sentenca", processNumber: process.numero, clientName: resolvedClientName });
    }
  }

  const failedNotification = hasFailedNotification(notificationResults);
  if (failedNotification) {
    return createFailedEventResult({
      eventId: event.id,
      eventType: event.type,
      processNumber: process.numero,
      reason: failedNotification.reason || "Sentenca notification failed",
      notifications: notificationResults,
      clientMessages,
    });
  }

  return handledResult({ processNumber: process.numero, event, notifications: notificationResults, clientMessages });
}

export async function handleProcessEvent(
  params: NotifyProcessEventParams,
): Promise<EventHandlingResult> {
  if (params.event.type === "highlightEvent") {
    return handleHighlightEvent(params);
  }

  if (params.event.type === "taskEvent") {
    return handleTaskEvent(params);
  }

  if (params.event.type === "periciaEvent") {
    return handlePericiaEvent(params);
  }

  if (params.event.type === "laudoEvent") {
    return handleLaudoEvent(params);
  }

  if (params.event.type === "sentencaEvent") {
    return handleSentencaEvent(params);
  }

  return skippedResult(params.process.numero, params.event, "Default event has no side effects");
}
