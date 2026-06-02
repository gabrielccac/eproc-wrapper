import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Buffer } from "node:buffer";
import * as iconv from "iconv-lite";
import * as cheerio from "cheerio";
import { getTjrsSessionFromPython, parseEndpoints } from "../eproc/session";
import { parseProcessesList } from "../eproc/processes";
import { parseProcessEvents } from "../eproc/events";
import type { Process, ProcessEvent } from "../types";

const TJRS_EPROC_BASE_URL = "https://eproc1g.tjrs.jus.br/eproc/";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const WATCHED_ACTIONS = new Set([
  "citacao_intimacao_prazo_aberto_listar",
  "citacao_intimacao_pendente_listar",
]);

type EndpointFetchResult = {
  endpoint: string;
  absoluteUrl: string;
  status: number;
  htmlPath: string;
  html: string;
};

type EndpointAnalysis = {
  endpoint: string;
  absoluteUrl: string;
  status: number;
  htmlPath: string;
  panelQuantity: number | null;
  tableRowCount: number;
  parsedProcessCount: number;
  parserLikelyCompatible: boolean;
  sampleProcessNumber?: string;
  parseError?: string;
};

type WatchedProcessEventsAnalysis = {
  processNumber: string;
  processUrl: string;
  eventsCount: number;
  firstEventId: string | null;
  lastEventId: string | null;
  eventTypes: Partial<Record<ProcessEvent["type"], number>>;
  pageFiles: string[];
};

type WatchedEndpointEventsAnalysis = {
  endpoint: string;
  endpointHtmlPath: string;
  processesCount: number;
  processNumbers: string[];
  processes: WatchedProcessEventsAnalysis[];
};

function buildAbsoluteTjrsUrl(endpoint: string): string {
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    return endpoint;
  }

  return new URL(endpoint, TJRS_EPROC_BASE_URL).href;
}

function slugFromEndpoint(endpoint: string): string {
  const absoluteUrl = buildAbsoluteTjrsUrl(endpoint);
  const url = new URL(absoluteUrl);
  const action = url.searchParams.get("acao") || "unknown-action";
  const urgent = url.searchParams.get("urgente") === "true" ? "-urgent" : "";
  const today = url.searchParams.get("vence_hoje") ? "-vence-hoje" : "";
  return `${action}${urgent}${today}`.replace(/[^a-zA-Z0-9-_]/g, "_");
}

function getActionFromEndpoint(endpoint: string): string {
  const absoluteUrl = buildAbsoluteTjrsUrl(endpoint);
  const url = new URL(absoluteUrl);
  return (url.searchParams.get("acao") || "").trim();
}

function isUrgentEndpoint(endpoint: string): boolean {
  const absoluteUrl = buildAbsoluteTjrsUrl(endpoint);
  const url = new URL(absoluteUrl);
  const action = (url.searchParams.get("acao") || "").trim();
  return url.searchParams.get("urgente") === "true" || action.endsWith("_urgente");
}

async function fetchEndpointHtml(endpoint: string, phpsessid: string): Promise<EndpointFetchResult> {
  const absoluteUrl = buildAbsoluteTjrsUrl(endpoint);
  const response = await fetch(absoluteUrl, {
    method: "GET",
    headers: {
      Cookie: `PHPSESSID=${phpsessid};`,
    },
  });

  const buffer = await response.arrayBuffer();
  const html = iconv.decode(Buffer.from(buffer), "ISO-8859-1");

  return {
    endpoint,
    absoluteUrl,
    status: response.status,
    htmlPath: "",
    html,
  };
}

async function fetchProcessEventsPageHtml(params: {
  processUrl: string;
  phpsessid: string;
  page: number;
}): Promise<string> {
  const absoluteUrl = buildAbsoluteTjrsUrl(params.processUrl);
  const body = new URLSearchParams({ pagina: String(params.page) }).toString();
  const response = await fetch(absoluteUrl, {
    method: "POST",
    headers: {
      Cookie: `PHPSESSID=${params.phpsessid};`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const buffer = await response.arrayBuffer();
  return iconv.decode(Buffer.from(buffer), "ISO-8859-1");
}

function slugFromProcessNumber(processNumber: string): string {
  return processNumber.replace(/[^0-9A-Za-z.-]/g, "_");
}

function summarizeEventTypes(events: ProcessEvent[]): Partial<Record<ProcessEvent["type"], number>> {
  return events.reduce<Partial<Record<ProcessEvent["type"], number>>>((acc, event) => {
    acc[event.type] = (acc[event.type] ?? 0) + 1;
    return acc;
  }, {});
}

async function analyzeWatchedEndpointProcesses(params: {
  endpoint: string;
  endpointHtmlPath: string;
  endpointHtml: string;
  phpsessid: string;
  runDir: string;
}): Promise<WatchedEndpointEventsAnalysis> {
  const processes = parseProcessesList(params.endpointHtml);
  const processAnalyses: WatchedProcessEventsAnalysis[] = [];

  for (const process of processes) {
    const allEvents: ProcessEvent[] = [];
    const pageFiles: string[] = [];
    let page = 0;
    let hasMorePages = true;

    while (hasMorePages) {
      const html = await fetchProcessEventsPageHtml({
        processUrl: process.url,
        phpsessid: params.phpsessid,
        page,
      });

      const processSlug = slugFromProcessNumber(process.numero || process.id || `process-${processAnalyses.length + 1}`);
      const pageFileName = `events-${processSlug}-page-${String(page).padStart(2, "0")}.html`;
      const pageFilePath = path.join(params.runDir, pageFileName);
      await writeFile(pageFilePath, html, "utf8");
      pageFiles.push(pageFilePath);

      const pageEvents = parseProcessEvents(html);
      allEvents.push(...pageEvents);

      if (pageEvents.length < 100) {
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

    processAnalyses.push({
      processNumber: process.numero,
      processUrl: buildAbsoluteTjrsUrl(process.url),
      eventsCount: allEvents.length,
      firstEventId: allEvents[0]?.id ?? null,
      lastEventId: allEvents[allEvents.length - 1]?.id ?? null,
      eventTypes: summarizeEventTypes(allEvents),
      pageFiles,
    });
  }

  return {
    endpoint: params.endpoint,
    endpointHtmlPath: params.endpointHtmlPath,
    processesCount: processes.length,
    processNumbers: processes.map((process) => process.numero),
    processes: processAnalyses,
  };
}

function analyzeEndpointHtml(params: {
  endpoint: string;
  absoluteUrl: string;
  status: number;
  htmlPath: string;
  html: string;
  panelQuantity: number | null;
}): EndpointAnalysis {
  const $ = cheerio.load(params.html);
  const tableRowCount = $("tr").filter((_, element) => {
    const classes = $(element).attr("class") || "";
    return /infraTr(Clara|Escura)/.test(classes);
  }).length;

  try {
    const parsedProcesses = parseProcessesList(params.html);
    return {
      endpoint: params.endpoint,
      absoluteUrl: params.absoluteUrl,
      status: params.status,
      htmlPath: params.htmlPath,
      panelQuantity: params.panelQuantity,
      tableRowCount,
      parsedProcessCount: parsedProcesses.length,
      parserLikelyCompatible: tableRowCount === 0 || parsedProcesses.length > 0 || params.panelQuantity === 0,
      sampleProcessNumber: parsedProcesses[0]?.numero,
    };
  } catch (error: unknown) {
    return {
      endpoint: params.endpoint,
      absoluteUrl: params.absoluteUrl,
      status: params.status,
      htmlPath: params.htmlPath,
      panelQuantity: params.panelQuantity,
      tableRowCount,
      parsedProcessCount: 0,
      parserLikelyCompatible: false,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const session = await getTjrsSessionFromPython();
  const parsed = parseEndpoints(session.page_source_html);

  const debugRootDir = path.resolve(process.cwd(), "debug-artifacts");
  const runDir = path.join(debugRootDir, `tjrs-${Date.now()}`);
  await mkdir(runDir, { recursive: true });

  const sessionHtmlPath = path.join(runDir, "session-page.html");
  await writeFile(sessionHtmlPath, session.page_source_html, "utf8");

  const endpointEntries = parsed.endpointEntries.filter((entry) => Boolean(entry.endpoint));
  const watchedEndpointCandidatesFromPanel = endpointEntries
    .map((entry) => entry.endpoint)
    .filter((endpoint) => WATCHED_ACTIONS.has(getActionFromEndpoint(endpoint)) && !isUrgentEndpoint(endpoint));
  const watchedEndpointCandidates = watchedEndpointCandidatesFromPanel.length > 0
    ? watchedEndpointCandidatesFromPanel
    : [
      "controlador.php?acao=citacao_intimacao_prazo_aberto_listar",
      "controlador.php?acao=citacao_intimacao_pendente_listar",
    ];

  const uniqueEndpoints = [...new Set([
    ...endpointEntries.map((entry) => entry.endpoint),
    ...watchedEndpointCandidates,
  ])];

  const entryByEndpoint = new Map(endpointEntries.map((entry) => [entry.endpoint, entry]));
  const fetchResults: EndpointFetchResult[] = [];
  for (const endpoint of uniqueEndpoints) {
    const fetched = await fetchEndpointHtml(endpoint, session.phpsessid);
    const fileBase = slugFromEndpoint(endpoint);
    const htmlFileName = `${String(fetchResults.length + 1).padStart(2, "0")}-${fileBase}.html`;
    const htmlPath = path.join(runDir, htmlFileName);
    await writeFile(htmlPath, fetched.html, "utf8");
    fetchResults.push({ ...fetched, htmlPath });
  }

  const analysis = fetchResults.map((item) => {
    const panelQuantity = entryByEndpoint.get(item.endpoint)?.quantity ?? null;
    return analyzeEndpointHtml({
      endpoint: item.endpoint,
      absoluteUrl: item.absoluteUrl,
      status: item.status,
      htmlPath: item.htmlPath,
      html: item.html,
      panelQuantity,
    });
  });

  const watchedEndpointSet = new Set(watchedEndpointCandidates);
  const watchedFetchResults = fetchResults.filter((item) => watchedEndpointSet.has(item.endpoint));
  const watchedEndpoints: WatchedEndpointEventsAnalysis[] = [];
  for (const watchedResult of watchedFetchResults) {
    watchedEndpoints.push(await analyzeWatchedEndpointProcesses({
      endpoint: watchedResult.endpoint,
      endpointHtmlPath: watchedResult.htmlPath,
      endpointHtml: watchedResult.html,
      phpsessid: session.phpsessid,
      runDir,
    }));
  }

  const summary = {
    runDir,
    session: {
      phpsessid: session.phpsessid,
      currentEndpointCountFromPanel: parsed.endpointEntries.length,
      selectedEndpointsByCurrentWorkflow: parsed.processesEndpoints,
      sessionHtmlPath,
    },
    analysis,
    parserCompatibility: {
      totalChecked: analysis.length,
      compatibleCount: analysis.filter((item) => item.parserLikelyCompatible).length,
      incompatibleCount: analysis.filter((item) => !item.parserLikelyCompatible).length,
      possibleMismatches: analysis
        .filter((item) => !item.parserLikelyCompatible)
        .map((item) => ({
          endpoint: item.endpoint,
          absoluteUrl: item.absoluteUrl,
          panelQuantity: item.panelQuantity,
          tableRowCount: item.tableRowCount,
          parsedProcessCount: item.parsedProcessCount,
          parseError: item.parseError,
          htmlPath: item.htmlPath,
        })),
    },
    watchedEndpoints,
  };

  const summaryPath = path.join(runDir, "summary.json");
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
