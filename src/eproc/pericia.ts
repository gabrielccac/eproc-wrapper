import type { ParsedPericia, ProcessEvent } from "../types";

export function isPericiaEvent(event: Pick<ProcessEvent, "label" | "descricao">): boolean {
  const normalizedText = `${event.label || ""} ${event.descricao || ""}`
    .replace(/í/g, "i")
    .toLowerCase();

  return normalizedText.includes("pericia designada");
}

export function parsePericia(text: string): ParsedPericia {
  const empty: ParsedPericia = {
    periciado: "",
    data: "",
    horario: "",
    local: "",
    perito: "",
  };

  const raw = (text || "").replace(/\s+/g, " ").trim();
  if (!raw) {
    return empty;
  }

  const periciadoMatch = raw.match(/Periciado:\s*(.+?)(?=\s+Data:|\s*$)/i);
  const dataHorarioMatch = raw.match(/Data:\s*(\d{2}\/\d{2}\/\d{4})\s*às\s*(\d{1,2}:\d{2})/i);
  const localMatch = raw.match(/Local:\s*(.+?)(?=\s+Perito:|\s*$)/is);
  const peritoMatch = raw.match(/Perito:\s*(.+)$/i);

  let data = "";
  let horario = "";
  if (dataHorarioMatch) {
    data = dataHorarioMatch[1].trim();
    horario = dataHorarioMatch[2].trim();
  } else {
    const dataFallback = raw.match(/Data:\s*(.+?)\./i);
    if (dataFallback) {
      const segment = dataFallback[1].trim();
      const idx = segment.indexOf(" às ");
      if (idx >= 0) {
        data = segment.slice(0, idx).trim();
        horario = segment.slice(idx + 4).trim();
      } else {
        data = segment;
      }
    }
  }

  return {
    periciado: periciadoMatch ? periciadoMatch[1].trim() : "",
    data,
    horario,
    local: localMatch ? localMatch[1].replace(/\s+/g, " ").trim() : "",
    perito: peritoMatch ? peritoMatch[1].trim() : "",
  };
}
