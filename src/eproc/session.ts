// src/eproc/session.ts
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as cheerio from "cheerio";

export interface EprocPythonSessionResult {
  phpsessid: string;
  page_source_html: string;
}

export interface ParsedSessionEndpoints {
  endpointEntries: Array<{
    label: string;
    endpoint: string;
    quantity: number | null;
  }>;
  processesEndpoints: string[];
  dueTodayEndpoint?: string;
  reportsEndpoint?: string;
}

function getSessionFromPythonScript(
  scriptName: string,
  extraEnv?: Record<string, string>,
): Promise<EprocPythonSessionResult> {
  const pythonExecutable = process.env.PYTHON_BIN
    || (existsSync("venv/bin/python3") ? "venv/bin/python3" : "python3");

  return new Promise((resolve, reject) => {
    const child = spawn(
      pythonExecutable,
      [scriptName],
      {
        env: {
          ...process.env,
          XDG_SESSION_TYPE: "x11",
          ...(extraEnv ?? {}),
        },
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Python exited with code ${code}\n${stderr}`));
      }

      try {
        const stdoutTrimmed = stdout.trim();
        const jsonLine = stdoutTrimmed.includes("\n")
          ? stdoutTrimmed.split("\n").map((line) => line.trim()).filter(Boolean).at(-1) || ""
          : stdoutTrimmed;
        const parsed = JSON.parse(jsonLine) as EprocPythonSessionResult;
        if (!parsed.phpsessid || !parsed.page_source_html) {
          throw new Error("Missing phpsessid/page_source_html in python output.");
        }
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse python JSON output.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}\n${String(err)}`));
      }
    });
  });
}

function normalizeHref(href: string): string {
  return (href || "").replace(/&amp;/g, "&").trim();
}

function getActionFromEndpoint(endpoint: string): string {
  const query = endpoint.includes("?") ? endpoint.split("?")[1] : "";
  const params = new URLSearchParams(query);
  return (params.get("acao") || "").trim();
}

function isUrgentEndpoint(endpoint: string): boolean {
  const query = endpoint.includes("?") ? endpoint.split("?")[1] : "";
  const params = new URLSearchParams(query);
  return params.get("urgente") === "true" || getActionFromEndpoint(endpoint).endsWith("_urgente");
}

export function parseEndpoints(pageHtml: string): ParsedSessionEndpoints {
  const $ = cheerio.load(pageHtml);
  const endpointEntries: ParsedSessionEndpoints["endpointEntries"] = [];
  const processEndpointSet = new Set<string>();

  $("table.infraTable tbody tr").each((_, row) => {
    const label = ($(row).find("td").first().text() || "").replace(/\s+/g, " ").trim();
    const href = normalizeHref($(row).find("td a[href]").first().attr("href") || "");
    const quantityText = ($(row).find("td a[href]").first().text() || "").trim();
    const parsedQuantity = Number.parseInt(quantityText, 10);
    const quantity = Number.isFinite(parsedQuantity) ? parsedQuantity : null;

    if (!label || !href) {
      return;
    }

    endpointEntries.push({ label, endpoint: href, quantity });
  });

  for (const entry of endpointEntries) {
    const action = getActionFromEndpoint(entry.endpoint);
    const allowedAction =
      action === "citacao_intimacao_prazo_aberto_listar"
      || action === "citacao_intimacao_pendente_listar";

    if (!allowedAction || isUrgentEndpoint(entry.endpoint)) {
      continue;
    }

    processEndpointSet.add(entry.endpoint);
  }

  return {
    endpointEntries,
    processesEndpoints: [...processEndpointSet],
  };
}

export async function getEprocSessionFromPython(): Promise<EprocPythonSessionResult> {
  return getSessionFromPythonScript("get_phpsessid.py");
}

export async function getTjrsSessionFromPython(): Promise<EprocPythonSessionResult> {
  return getSessionFromPythonScript("get_tjrs_phpsessid.py", {
    KEEP_BROWSER_OPEN_AFTER_FLOW: "false",
  });
}
