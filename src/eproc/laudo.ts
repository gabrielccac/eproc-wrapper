import * as cheerio from "cheerio";
import type { ParsedLaudo, ProcessEvent } from "../types";
import { fetchEproc, type EprocRequestContext } from "./http";

function normalizeText(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchLaudoHtml(
  documentUrl: string,
  phpsessid: string,
  context: EprocRequestContext = {},
): Promise<string> {
  const { html: initialHtml } = await fetchEproc(documentUrl, phpsessid, {}, context);
  const $ = cheerio.load(initialHtml);
  const iframeSrc = $("#conteudoIframe").attr("src");

  if (!iframeSrc) {
    throw new Error("Could not find iframe#conteudoIframe in laudo page");
  }

  const { html } = await fetchEproc(iframeSrc.replace(/&amp;/g, "&"), phpsessid, {}, context);
  return html;
}

export function parseLaudo(html: string): ParsedLaudo {
  const $ = cheerio.load(html);
  const fieldset = $("fieldset.infraFieldset").first();

  if (fieldset.length === 0) {
    return { conclusao: "", justificativa: "" };
  }

  let conclusao = "";
  let justificativa = "";

  const boldConclusion = fieldset.find("p b").filter((_, element) => {
    return normalizeText($(element).text()).includes("Conclusão:");
  });

  if (boldConclusion.length > 0) {
    const rawConclusion = normalizeText(boldConclusion.first().text());
    const match = rawConclusion.match(/Conclusão:\s*(.+)/i);
    conclusao = match ? match[1].trim() : rawConclusion.replace(/^Conclusão:\s*/i, "").trim();
  }

  if (!conclusao) {
    const paragraphs = fieldset.find("div p, p");
    for (let i = 0; i < paragraphs.length; i += 1) {
      const text = normalizeText($(paragraphs[i]).text());
      if (!text.includes("Conclusão:")) {
        continue;
      }

      const match = text.match(/Conclusão:\s*(.+)/i);
      conclusao = match ? match[1].trim() : text.replace(/^.*?Conclusão:\s*/i, "").trim();
      break;
    }
  }

  if (!conclusao) {
    const fieldsetText = normalizeText(fieldset.text());
    const match = fieldsetText.match(/Conclusão:\s*([^<\n]+)/i);
    conclusao = match ? match[1].trim() : "";
  }

  const paragraphs = fieldset.find("div p, p");
  for (let i = 0; i < paragraphs.length; i += 1) {
    const text = normalizeText($(paragraphs[i]).text());
    if (!text.includes("Justificativa:")) {
      continue;
    }

    const match = text.match(/Justificativa:\s*(.+)/i);
    justificativa = match
      ? match[1].trim()
      : text.replace(/^[\s-]*Justificativa:\s*/i, "").trim();
    break;
  }

  return {
    conclusao,
    justificativa,
  };
}

export function isLaudoPericialEvent(event: Pick<ProcessEvent, "label" | "descricao" | "documentos">): boolean {
  const rawLabel = (event.label || "").trim().toUpperCase();
  const rawDescription = (event.descricao || "").trim().toUpperCase();
  const hasLaudoLabel =
    rawLabel === "LAUDO PERICIAL" ||
    rawLabel.startsWith("LAUDO PERICIAL") ||
    rawDescription.startsWith("LAUDO PERICIAL");

  const documents = event.documentos || [];
  const hasDocument = documents.length > 0;
  const hasLaudoLikeDocument = documents.some((document) => {
    const nome = (document.nome || "").toUpperCase();
    const id = (document.id || "").toUpperCase();
    return nome.includes("LAUDO") || id.includes("LAUDO");
  });

  return hasLaudoLabel && hasDocument && hasLaudoLikeDocument;
}

export function extractLaudoDocumentUrls(
  event: Pick<ProcessEvent, "documentos">,
): string[] {
  return (event.documentos || [])
    .map((document) => (document.url || "").trim())
    .filter((url) => Boolean(url));
}

export async function fetchLaudo(
  documentUrl: string,
  phpsessid: string,
  context: EprocRequestContext = {},
): Promise<ParsedLaudo> {
  const html = await fetchLaudoHtml(documentUrl, phpsessid, context);
  return parseLaudo(html);
}
