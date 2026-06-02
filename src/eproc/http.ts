import { Buffer } from "node:buffer";
import * as iconv from "iconv-lite";

const BASE_ROOT = "https://eproc.jfrs.jus.br/eprocV2/";
const REQUEST_TIMEOUT_MS = 30000;

export interface EprocRequestContext {
  baseRoot?: string;
}

export interface EprocHtmlResponse {
  html: string;
}

interface EprocRequestOptions {
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
}

export class SessionExpiredError extends Error {
  constructor(message = "EPROC session expired") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export function buildUrl(endpoint: string, context: EprocRequestContext = {}): string {
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    return endpoint;
  }

  return new URL(endpoint, context.baseRoot || BASE_ROOT).href;
}

export function isSessionExpired(html: string): boolean {
  return Boolean(html && html.includes("txaInfraMsg") && html.includes("sessão foi encerrada"));
}

export async function fetchEproc(
  endpoint: string,
  phpsessid: string,
  options: EprocRequestOptions = {},
  context: EprocRequestContext = {},
): Promise<EprocHtmlResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const { method = "GET", body, headers = {} } = options;
    const response = await fetch(buildUrl(endpoint, context), {
      method,
      headers: {
        Cookie: `PHPSESSID=${phpsessid};`,
        ...headers,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const html = iconv.decode(Buffer.from(buffer), "ISO-8859-1");

    if (isSessionExpired(html)) {
      throw new SessionExpiredError();
    }

    return { html };
  } finally {
    clearTimeout(timeoutId);
  }
}
