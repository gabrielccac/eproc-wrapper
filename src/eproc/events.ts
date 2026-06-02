import * as cheerio from "cheerio";
import type {
  ProcessEvent,
  ProcessEventsResult,
  ProcessEventUserType,
  ProcessEventType,
  TaskState,
} from "../types";
import { fetchEproc, SessionExpiredError, type EprocRequestContext } from "./http";
import { isPericiaEvent } from "./pericia";
import { isLaudoPericialEvent } from "./laudo";
import { isSentencaEvent } from "./sentenca";

function cleanText(text: string): string {
  if (!text) return "";

  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractProcessId(processUrl: string): string {
  try {
    const url = new URL(processUrl, "https://eproc.jfrs.jus.br/eprocV2/");
    return url.searchParams.get("num_processo") || "";
  } catch {
    const match = processUrl.match(/num_processo=(\d+)/);
    return match ? match[1] : "";
  }
}

function parseUserType(ariaLabel: string): ProcessEventUserType {
  const normalized = ariaLabel.toUpperCase();

  if (normalized.includes("ADVOGADO")) {
    return "ADVOGADO";
  }

  if (normalized.includes("PROCURADOR")) {
    return "PROCURADOR";
  }

  return "TERCEIRO";
}

function parseTaskState(classes: string): TaskState | undefined {
  if (/\binfraEventoPrazoAberto\b/.test(classes)) {
    return "open";
  }
  if (/\binfraEventoPrazoAguardando\b/.test(classes)) {
    return "waitingOpen";
  }
  if (
    /\binfraEventoPrazoFechado\b/.test(classes) ||
    /\binfraEventoPrazoFechouMovimento\b/.test(classes)
  ) {
    return "closed";
  }

  return undefined;
}

function parseTaskType(classes: string, taskState?: TaskState): ProcessEventType {
  if (taskState) {
    return "taskEvent";
  }
  if (/\binfraEventoImportante\b/.test(classes)) {
    return "highlightEvent";
  }

  return "defaultEvent";
}

export function parseProcessEvents(html: string): ProcessEvent[] {
  const $ = cheerio.load(html);
  const events: ProcessEvent[] = [];

  const rows = $("tr").filter((_, element) => {
    const id = $(element).attr("id") || "";
    const classes = $(element).attr("class") || "";
    return /^trEvento/.test(id) && /infraTr(Clara|Escura)/.test(classes);
  });

  rows.each((_, row) => {
    const $row = $(row);
    const rowClasses = $row.attr("class") || "";
    const taskState = parseTaskState(rowClasses);
    const tds = $row.find("td");

    if (tds.length < 5) {
      return;
    }

    const eventIdCell = $(tds[0]);
    const eventIdSource = eventIdCell.find("span").first();
    const rawEventId = cleanText(
      (eventIdSource.length > 0 ? eventIdSource : eventIdCell)
        .clone()
        .find("script")
        .remove()
        .end()
        .text(),
    ).replace(/&nbsp/g, "");
    const eventId =
      rawEventId.match(/^\d+/)?.[0] ||
      rawEventId.match(/\d+/)?.[0] ||
      rawEventId.split(/\s/)[0] ||
      "";

    const descricaoCell = $(tds[2]);
    const descricaoLabelNode = descricaoCell.find("label.infraEventoDescricao").first();
    const label = descricaoLabelNode.length > 0
      ? cleanText(descricaoLabelNode.text())
      : cleanText(descricaoCell.text());
    const descricaoTail = descricaoLabelNode.length > 0
      ? cleanText(descricaoCell.clone().find("label").remove().end().text())
      : "";
    const descricao = descricaoTail
      ? `${label}${descricaoTail.startsWith("-") ? " " : " - "}${descricaoTail}`
      : label;

    const usuarioCell = $(tds[3]);
    const usuarioLabelNode = usuarioCell.find("label.infraEventoUsuario").first();
    const usuario = usuarioLabelNode.length > 0
      ? cleanText(usuarioLabelNode.text())
      : cleanText(usuarioCell.text());
    const usuarioTipo = usuarioLabelNode.length > 0
      ? parseUserType(usuarioLabelNode.attr("aria-label") || "")
      : "TERCEIRO";

    const documentosCell = $(tds[4]);
    const documentos: ProcessEvent["documentos"] = [];
    if (!cleanText(documentosCell.text()).includes("Evento não gerou documento")) {
      documentosCell.find("a").each((_, anchor) => {
        const $anchor = $(anchor);
        const url = ($anchor.attr("href") || "").replace(/&amp;/g, "&");
        const nome = cleanText($anchor.text());

        if (!url || !nome) {
          return;
        }

        documentos.push({
          url,
          nome,
          tipo: $anchor.attr("data-mimetype") || undefined,
          id: $anchor.attr("data-doc") || undefined,
        });
      });
    }

    let type = parseTaskType(rowClasses, taskState);
    if (isLaudoPericialEvent({ label, descricao, documentos })) {
      type = "laudoEvent";
    } else if (isSentencaEvent({ label })) {
      type = "sentencaEvent";
    } else if (isPericiaEvent({ label, descricao })) {
      type = "periciaEvent";
    }

    events.push({
      id: eventId,
      dataHora: cleanText($(tds[1]).text()),
      label,
      descricao,
      usuario,
      usuarioTipo,
      documentos,
      type,
      taskState,
    });
  });

  return events;
}

async function fetchEvents(
  processUrl: string,
  phpsessid: string,
  page: number,
  context: EprocRequestContext = {},
): Promise<ProcessEvent[]> {
  const { html } = await fetchEproc(processUrl, phpsessid, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `pagina=${page}`,
  }, context);

  return parseProcessEvents(html);
}

export async function fetchProcessEvents(
  processUrl: string,
  phpsessid: string,
  context: EprocRequestContext = {},
): Promise<ProcessEventsResult> {
  const processId = extractProcessId(processUrl);
  try {
    const allEvents: ProcessEvent[] = [];

    let page = 0;
    let hasMorePages = true;

    while (hasMorePages) {
      const events = await fetchEvents(processUrl, phpsessid, page, context);

      allEvents.push(...events);

      if (events.length < 100) {
        hasMorePages = false;
      } else {
        page += 1;
      }
    }

    allEvents.sort((left, right) => {
      const leftId = Number.parseInt(left.id, 10) || 0;
      const rightId = Number.parseInt(right.id, 10) || 0;
      return rightId - leftId;
    });

    return {
      processId,
      eventCount: allEvents.length,
      lastEventAt: allEvents[0]?.dataHora || null,
      events: allEvents,
      sessionExpired: false,
    };
  } catch (error: unknown) {
    if (error instanceof SessionExpiredError) {
      return {
        processId,
        eventCount: null,
        lastEventAt: null,
        events: [],
        sessionExpired: true,
      };
    }

    throw error;
  }
}
