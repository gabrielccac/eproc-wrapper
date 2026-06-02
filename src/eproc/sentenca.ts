import type { ProcessEvent } from "../types";

function normalize(value: string): string {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

export type SentencaOutcome = "procedente" | "improcedente" | null;

export function getSentencaOutcomeFromLabel(label: string): SentencaOutcome {
  const normalized = normalize(label);

  if (normalized.includes("JULGADO IMPROCEDENTE")) {
    return "improcedente";
  }
  if (normalized.includes("JULGADO PROCEDENTE")) {
    return "procedente";
  }

  return null;
}

export function isSentencaEvent(event: Pick<ProcessEvent, "label">): boolean {
  return getSentencaOutcomeFromLabel(event.label) !== null;
}

