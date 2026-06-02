import type { ParsedTask, ProcessEvent, TaskState } from "../types";

function normalizeWhitespace(value: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function parseTaskState(event: Pick<ProcessEvent, "taskState">): TaskState | null {
  return event.taskState || null;
}

function parsePrazoDias(text: string): number | null {
  const match = text.match(/Prazo:\s*(\d+)\s*dias?/i);
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

function parseDateByLabel(text: string, label: string): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escapedLabel}:\\s*(\\d{2}\\/\\d{2}\\/\\d{4}\\s+\\d{2}:\\d{2}:\\d{2})`, "i");
  const match = text.match(regex);
  return match ? match[1] : null;
}

export function isTaskEvent(event: Pick<ProcessEvent, "type">): boolean {
  return event.type === "taskEvent";
}

export function parseTask(event: Pick<ProcessEvent, "descricao" | "taskState">): ParsedTask | null {
  const state = parseTaskState(event);
  if (!state) {
    return null;
  }

  const descricao = normalizeWhitespace(event.descricao || "");
  return {
    state,
    prazoDias: parsePrazoDias(descricao),
    inicioPrazo: parseDateByLabel(descricao, "Data inicial da contagem do prazo"),
    finalPrazo: parseDateByLabel(descricao, "Data final"),
  };
}
