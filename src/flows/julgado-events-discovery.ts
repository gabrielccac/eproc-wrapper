import { mapWithConcurrency } from "../domain/concurrency";
import { fetchProcessEvents } from "../eproc/events";
import { fetchProcesses } from "../eproc/processes";
import type { Process, ProcessEvent } from "../types";

export interface RunJulgadoEventsDiscoveryPayload {
  phpsessid: string;
  processesEndpoints: string[];
  eventFetchConcurrency?: number;
}

export interface JulgadoEventDiscoveryItem {
  processNumber: string;
  processUrl: string;
  classe: string;
  assunto: string;
  event: Pick<ProcessEvent, "id" | "dataHora" | "label" | "descricao" | "usuario" | "usuarioTipo" | "type" | "taskState" | "documentos">;
}

export interface RunJulgadoEventsDiscoveryResult {
  processesChecked: string[];
  matchedEvents: JulgadoEventDiscoveryItem[];
}

function normalizeForSearch(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isJulgadoCandidate(event: ProcessEvent): boolean {
  const searchableText = normalizeForSearch(`${event.label} ${event.descricao}`);
  return searchableText.includes("julgado");
}

function uniqueProcessesByNumber(processes: Process[]): Process[] {
  return [...new Map(processes.map((process) => [process.numero, process])).values()];
}

async function fetchUniqueProcesses(
  endpoints: string[],
  phpsessid: string,
): Promise<Process[]> {
  const fetchedProcessLists = await Promise.all(
    endpoints.map((endpoint) => fetchProcesses(endpoint, phpsessid)),
  );

  if (fetchedProcessLists.some((result) => result.sessionExpired)) {
    throw new Error("Session expired while fetching processes for julgado discovery workflow.");
  }

  return uniqueProcessesByNumber(fetchedProcessLists.flatMap((result) => result.processes));
}

export async function runJulgadoEventsDiscovery(
  payload: RunJulgadoEventsDiscoveryPayload,
): Promise<RunJulgadoEventsDiscoveryResult> {
  if (!payload.processesEndpoints.length) {
    throw new Error("Set at least one process endpoint.");
  }

  const processes = await fetchUniqueProcesses(payload.processesEndpoints, payload.phpsessid);
  const processesChecked: string[] = [];
  const matchedEvents: JulgadoEventDiscoveryItem[] = [];

  await mapWithConcurrency(
    processes,
    payload.eventFetchConcurrency ?? 3,
    async (process) => {
      const fetchedEvents = await fetchProcessEvents(process.url, payload.phpsessid);
      if (fetchedEvents.sessionExpired) {
        throw new Error(`Session expired while fetching events for process ${process.numero}.`);
      }

      processesChecked.push(process.numero);

      for (const event of fetchedEvents.events) {
        if (!isJulgadoCandidate(event)) {
          continue;
        }

        matchedEvents.push({
          processNumber: process.numero,
          processUrl: process.url,
          classe: process.classe,
          assunto: process.assunto,
          event: {
            id: event.id,
            dataHora: event.dataHora,
            label: event.label,
            descricao: event.descricao,
            usuario: event.usuario,
            usuarioTipo: event.usuarioTipo,
            type: event.type,
            taskState: event.taskState,
            documentos: event.documentos,
          },
        });
      }
    },
  );

  matchedEvents.sort((left, right) => {
    const processCompare = left.processNumber.localeCompare(right.processNumber);
    if (processCompare !== 0) {
      return processCompare;
    }
    return Number.parseInt(right.event.id, 10) - Number.parseInt(left.event.id, 10);
  });

  return {
    processesChecked: processesChecked.sort((left, right) => left.localeCompare(right)),
    matchedEvents,
  };
}
