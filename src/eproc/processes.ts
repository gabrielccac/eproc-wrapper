import * as cheerio from "cheerio";
import type { Process, ProcessListResult, ProcessPart } from "../types";
import { fetchEproc, SessionExpiredError, type EprocRequestContext } from "./http";

const PROCESS_PART_LABELS = [
  "Autor",
  "Réu",
  "Requerente",
  "Requerido",
  "Impetrante",
  "Impetrado",
  "Recorrente",
  "Recorrido",
];

export function cleanText(text: string): string {
  if (!text) return "";

  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\D)(\d+\s+dias?)$/i, "$1 $2");
}

type ProcessMetadata = {
  numeroProcesso: string;
  processoUrl: string;
  juizo: string;
  partes: ProcessPart[];
};

export function extractProcessMetadata(
  $: cheerio.CheerioAPI,
  td: any,
): ProcessMetadata {
  const $td = $(td);
  const link = $td.find("a").first();
  const numeroProcesso = cleanText(link.text());
  const processoUrl = (link.attr("href") || "").replace(/&amp;/g, "&");

  const textBlock = $td.clone().find("br").replaceWith("\n").end().text();
  const lines = textBlock
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);

  function nextAfterIndex(label: string): { value: string; index: number } {
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].startsWith(label)) continue;

      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j] && lines[j] !== "X") {
          return { value: lines[j], index: j };
        }
      }
    }

    return { value: "", index: -1 };
  }

  function extractJuizo(): string {
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].startsWith("Juízo:")) continue;

      const sameLineValue = lines[i].slice("Juízo:".length).trim();
      if (sameLineValue) {
        return sameLineValue;
      }

      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j] && lines[j] !== "X") {
          return lines[j];
        }
      }
    }

    return "";
  }

  function extractPart(label: string): ProcessPart | null {
    const { value: name, index } = nextAfterIndex(label);
    if (!name) {
      return null;
    }

    let documento: string | null = null;
    if (index >= 0 && index + 1 < lines.length) {
      const documentoLine = lines[index + 1];
      const match = documentoLine.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
      if (match) {
        documento = match[0];
      }
    }

    return {
      parte: label.replace(":", "").toUpperCase(),
      nome: name,
      documento,
    };
  }

  const partes = PROCESS_PART_LABELS.map((label) => extractPart(label)).filter(
    (part): part is ProcessPart => part !== null,
  );

  return {
    numeroProcesso,
    processoUrl,
    juizo: extractJuizo(),
    partes,
  };
}

export function parseProcessesList(html: string): Process[] {
  const $ = cheerio.load(html);
  const processes: Process[] = [];

  const rows = $("tr").filter((_, element) => {
    const classes = $(element).attr("class") || "";
    return /infraTr(Clara|Escura)/.test(classes);
  });

  rows.each((_, row) => {
    const $row = $(row);
    const tds = $row.find("td");

    if (tds.length < 8) {
      return;
    }

    const metadata = extractProcessMetadata($, tds[1]);

    processes.push({
      id: $row.find("input.infraCheckbox").attr("value") || "",
      numero: metadata.numeroProcesso,
      url: metadata.processoUrl,
      juizo: metadata.juizo,
      partes: metadata.partes,
      classe: cleanText($(tds[2]).text()),
      classeCodigo: $row.attr("data-classe") || "",
      competencia: $row.attr("data-competencia") || "",
      assunto: cleanText($(tds[3]).text()),
      eventoPrazo: cleanText($(tds[4]).text()),
      dataEnvioRequisicao: cleanText($(tds[5]).text()),
      inicioPrazo: cleanText($(tds[6]).text()),
      finalPrazo: cleanText($(tds[7]).text()),
    });
  });

  return processes;
}

export async function fetchProcesses(
  endpoint: string,
  phpsessid: string,
  context: EprocRequestContext = {},
): Promise<ProcessListResult> {
  try {
    const { html } = await fetchEproc(endpoint, phpsessid, {}, context);

    return {
      processes: parseProcessesList(html),
      sessionExpired: false,
    };
  } catch (error: unknown) {
    if (error instanceof SessionExpiredError) {
      return {
        processes: [],
        sessionExpired: true,
      };
    }

    throw error;
  }
}
