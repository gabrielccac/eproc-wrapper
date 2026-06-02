import type { Process } from "../types";

export type ClientLookupRow = {
  clientName: string;
  phone: string | null;
};

export function getClientNameFromPartes(process: Process): string | null {
  const preferredOrder = ["AUTOR", "REQUERENTE", "IMPETRANTE", "RECORRENTE"];
  const normalizedParts = process.partes.map((part) => ({
    parte: (part.parte || "").toUpperCase(),
    nome: (part.nome || "").trim(),
  }));

  for (const preferred of preferredOrder) {
    const found = normalizedParts.find((part) => part.parte === preferred && part.nome);
    if (found?.nome) {
      return found.nome;
    }
  }

  const fallback = normalizedParts.find((part) => part.nome);
  return fallback?.nome || null;
}
