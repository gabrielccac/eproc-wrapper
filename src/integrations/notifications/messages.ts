import type {
  ParsedLaudo,
  ParsedPericia,
  ParsedTask,
  Process,
  ProcessEvent,
} from "../../types";
import { getSentencaOutcomeFromLabel } from "../../eproc/sentenca";

export interface ProcessNotificationOptions {
  isNew?: boolean;
}

function formatProcessParts(process: Pick<Process, "partes">): string {
  return process.partes.length > 0
    ? process.partes.map((part) => `${part.parte}: ${part.nome}`).join("\n")
    : "—";
}

export function buildProcessSlackMessage(
  process: Process,
  options: ProcessNotificationOptions = {},
): string {
  const title = options.isNew ? "*Novo processo*" : "*Pendência atualizada em Processo*";

  return [
    title,
    "",
    `\`${process.numero}\``,
    "",
    "*Pendência:*",
    process.eventoPrazo || "—",
    "",
    "*Partes:*",
    formatProcessParts(process),
    "",
    `*Prazo entrega até:* ${process.finalPrazo || "—"}`,
  ].join("\n");
}

export function buildProcessWhatsAppMessage(process: Process): string {
  return [
    "⚠️ *Nova Pendência em Processo*",
    "",
    `🗃️ \`${process.numero}\``,
    "",
    "*Pendência:*",
    process.eventoPrazo || "—",
    "",
    "*Partes:*",
    formatProcessParts(process),
    "",
    `🗓️ Prazo entrega até ${process.finalPrazo || "—"}`,
  ].join("\n");
}

export function buildEventSlackMessage(processNumber: string, event: ProcessEvent): string {
  return `\`${processNumber}\` · *Movimento:* ${event.descricao} · *Responsável:* ${event.usuario} · ${event.dataHora}`;
}

export function buildEventWhatsAppMessage(processNumber: string, event: ProcessEvent): string {
  return [
    "💬 *Nova atualização em Processo*",
    `\`${processNumber}\``,
    "",
    "*Movimento:*",
    event.descricao,
    "",
    "*Responsável:*",
    event.usuario,
    "",
    `🕐 às ${event.dataHora}`,
  ].join("\n");
}

export function buildHighlightEventSlackMessage(
  processNumber: string,
  event: Pick<ProcessEvent, "descricao" | "dataHora">,
): string {
  return [
    "*Evento importante*",
    "",
    `\`${processNumber}\``,
    "",
    `*Quando:* ${event.dataHora || "—"}`,
    `*Descrição:* ${event.descricao || "—"}`,
  ].join("\n");
}

export function buildHighlightEventWhatsAppMessage(
  processNumber: string,
  event: Pick<ProcessEvent, "descricao" | "dataHora">,
): string {
  return [
    "🔔 *Evento importante no processo*",
    `\`${processNumber}\``,
    "",
    `🕐 ${event.dataHora || "—"}`,
    "",
    event.descricao || "—",
  ].join("\n");
}

function formatTaskStateLabel(state: ParsedTask["state"]): string {
  if (state === "open") {
    return "ABERTO";
  }
  if (state === "waitingOpen") {
    return "AGUARDANDO ABERTURA";
  }
  return "FECHADO";
}

function normalizeTaskDescription(
  descricao: string,
  task: ParsedTask,
): string {
  let text = (descricao || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "—";
  }

  // Fix common spacing artifacts from HTML flattening.
  text = text
    .replace(/([A-Za-z0-9])\(/g, "$1 (")
    .replace(/\)\s*([A-Za-z0-9])/g, ") $1");

  // Remove duplicated fields already shown in structured lines above.
  text = text.replace(/\bStatus:\s*[^-–—]+/gi, " ");
  if (task.prazoDias !== null) {
    const prazoRegex = new RegExp(`\\bPrazo:\\s*${task.prazoDias}\\s*dias?\\b`, "gi");
    text = text.replace(prazoRegex, " ");
  }

  text = text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+-\s*$/g, "")
    .trim();

  return text || "—";
}

export function buildTaskEventSlackMessage(
  processNumber: string,
  event: Pick<ProcessEvent, "descricao" | "dataHora">,
  task: ParsedTask,
): string {
  const cleanedDescription = normalizeTaskDescription(event.descricao || "", task);
  return [
    "*Evento de prazo*",
    "",
    `\`${processNumber}\``,
    "",
    `*Status:* ${formatTaskStateLabel(task.state)}`,
    `*Quando:* ${event.dataHora || "—"}`,
    task.inicioPrazo ? `*Início prazo:* ${task.inicioPrazo}` : "",
    task.finalPrazo ? `*Final prazo:* ${task.finalPrazo}` : "",
    task.prazoDias !== null ? `*Prazo:* ${task.prazoDias} dias` : "",
    "",
    cleanedDescription,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildTaskEventWhatsAppMessage(
  processNumber: string,
  event: Pick<ProcessEvent, "descricao" | "dataHora">,
  task: ParsedTask,
): string {
  const cleanedDescription = normalizeTaskDescription(event.descricao || "", task);
  return [
    "📌 *Atualização de prazo no processo*",
    `\`${processNumber}\``,
    "",
    `*Status:* ${formatTaskStateLabel(task.state)}`,
    `*Quando:* ${event.dataHora || "—"}`,
    task.inicioPrazo ? `*Início:* ${task.inicioPrazo}` : "",
    task.finalPrazo ? `*Final:* ${task.finalPrazo}` : "",
    task.prazoDias !== null ? `*Prazo:* ${task.prazoDias} dias` : "",
    "",
    cleanedDescription,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildLaudoSlackMessage(
  processNumber: string,
  laudo: ParsedLaudo,
  clientName = "Cliente",
): string {
  return [
    `Processo ${processNumber} — Laudo Pericial disponível`,
    `Cliente: ${clientName}`,
    `Conclusão: ${laudo.conclusao}`,
    laudo.justificativa ? `Justificativa: ${laudo.justificativa}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildLaudoWhatsAppMessage(
  processNumber: string,
  laudo: ParsedLaudo,
  clientName = "Cliente",
): string {
  const conclusionUpper = laudo.conclusao.toUpperCase();
  const isPositive = conclusionUpper.includes("COM INCAPACIDADE");
  const isNegative = conclusionUpper.includes("SEM INCAPACIDADE");

  if (isPositive) {
    return [
      "✅ *Resultado do laudo: COM INCAPACIDADE (positivo)*",
      "",
      `Olá, Sr.(a) ${clientName}!`,
      "",
      "Queremos te informar que saiu o laudo da perícia médica judicial e o resultado foi favorável, reconhecendo a incapacidade.",
      "",
      "Isso é um ponto muito positivo para o processo 👍",
      "Agora, precisamos aguardar a sentença, que é a decisão final do juiz.",
      "",
      "Assim que houver novidade, entraremos em contato para te explicar os próximos passos.",
      "",
      "Ficamos à disposição para qualquer dúvida.",
      "Becker Advogados",
      "",
      `Processo: \`${processNumber}\``,
    ].join("\n");
  }

  if (isNegative) {
    return [
      "⚠️ *Resultado do laudo: SEM INCAPACIDADE (negativo)*",
      "",
      `Olá, Sr.(a) ${clientName}!`,
      "",
      "Passamos para informar que saiu o laudo da perícia médica judicial, e o perito concluiu pela ausência de incapacidade.",
      "",
      "Mas fique tranquilo(a): esse não é o resultado final do processo.",
      "Nossa equipe já está analisando o laudo e vamos tomar todas as medidas possíveis para reverter esse resultado, como a impugnação do laudo, além de aguardar a sentença do juiz.",
      "",
      "Em breve entraremos em contato para explicar tudo com mais detalhes.",
      "",
      "Qualquer dúvida, estamos à disposição.",
      "Becker Advogados",
      "",
      `Processo: \`${processNumber}\``,
    ].join("\n");
  }

  return [
    "*Resultado do laudo*",
    "",
    `Olá, Sr.(a) ${clientName}!`,
    "",
    "Queremos te informar que saiu o laudo da perícia médica judicial.",
    "",
    `*Conclusão:* ${laudo.conclusao}`,
    "",
    "Assim que houver novidade, entraremos em contato para te explicar os próximos passos.",
    "",
    "Ficamos à disposição para qualquer dúvida.",
    "Becker Advogados",
    "",
    `Processo: \`${processNumber}\``,
  ].join("\n");
}

export function buildPericiaSlackMessage(
  processNumber: string,
  pericia: ParsedPericia,
): string {
  const dataHora = pericia.data && pericia.horario
    ? `${pericia.data} às ${pericia.horario}`
    : pericia.data || pericia.horario || "—";

  return [
    "*Perícia designada*",
    "",
    `\`${processNumber}\``,
    "",
    "*Periciado:*",
    pericia.periciado || "—",
    "",
    "*Data/hora:*",
    dataHora,
    "",
    "*Local:*",
    pericia.local || "—",
    "",
    "*Perito:*",
    pericia.perito || "—",
  ].join("\n");
}

export function buildPericiaWhatsAppMessage(
  processNumber: string,
  pericia: ParsedPericia,
  clientName?: string,
): string {
  const resolvedClientName = clientName?.trim() || pericia.periciado || "Cliente";

  return [
    "*PERÍCIA MARCADA*",
    "",
    `Olá, Sr.(a) ${resolvedClientName}!`,
    "",
    "Gostaríamos de informar que a sua perícia médica judicial foi marcada.",
    "",
    "📅 *Data:*",
    pericia.data || "—",
    "",
    "⏰ *Horário:*",
    pericia.horario || "—",
    "",
    "📍 *Local:*",
    pericia.local || "—",
    "",
    "Mais próximo da data, entraremos em contato para encaminhar todas as orientações necessárias para a realização da perícia.",
    "",
    "Atenciosamente,",
    "Becker Advogados",
    "",
    `Processo: \`${processNumber}\``,
  ].join("\n");
}

export function buildSentencaSlackMessage(
  processNumber: string,
  event: Pick<ProcessEvent, "label" | "dataHora">,
  clientName = "Cliente",
): string {
  const outcome = getSentencaOutcomeFromLabel(event.label);
  const outcomeLabel = outcome === "procedente"
    ? "PROCEDENTE"
    : outcome === "improcedente"
      ? "IMPROCEDENTE"
      : "NÃO IDENTIFICADO";

  return [
    `Processo ${processNumber} — Sentença (${outcomeLabel})`,
    `Cliente: ${clientName}`,
    `Quando: ${event.dataHora || "—"}`,
    `Label: ${event.label || "—"}`,
  ].join("\n");
}

export function buildSentencaWhatsAppMessage(
  eventLabel: string,
  clientName = "Cliente",
): string {
  const outcome = getSentencaOutcomeFromLabel(eventLabel);

  if (outcome === "procedente") {
    return [
      `Olá, Sr.(a) ${clientName}!`,
      "",
      "Temos uma boa notícia! 🎉",
      "O juiz deu ganho de causa ao seu processo, sendo a decisão favorável (total ou parcial).",
      "",
      "Agora, nossa equipe está verificando os próximos passos, como prazo de recurso, implantação do benefício e possíveis valores a receber. Em breve entraremos em contato para explicar tudo direitinho.",
      "",
      "Qualquer dúvida, estamos à disposição.",
      "",
      "Abraço,",
      "Becker Advogados",
    ].join("\n");
  }

  return [
    `Olá, ${clientName}!`,
    "",
    "Queremos te avisar que saiu a sentença do processo, mas ela não foi favorável neste momento.",
    "Fique tranquilo(a), isso não encerra o caso.",
    "",
    "Nossa equipe já está analisando a decisão e vamos recorrer, buscando mudar esse resultado. Em breve entraremos em contato para explicar tudo com calma.",
    "",
    "Qualquer dúvida, é só nos chamar.",
    "",
    "Abraço,",
    "Becker Advogados",
  ].join("\n");
}

export function buildClientsFallbackWhatsAppMessage(
  processNumber: string,
  eventLabel: string,
  clientName?: string | null,
): string {
  return [
    "⚠️ *Cliente sem WhatsApp válido na planilha*",
    "",
    `Processo: \`${processNumber}\``,
    `Evento: ${eventLabel}`,
    `Cliente (referência): ${clientName?.trim() || "não identificado"}`,
    "",
    "A notificação para cliente não foi enviada automaticamente.",
  ].join("\n");
}

export function buildClientsInvalidWhatsAppMessage(
  processNumber: string,
  eventLabel: string,
  clientPhone: string,
  clientName?: string | null,
): string {
  return [
    "⚠️ *Cliente sem WhatsApp válido*",
    "",
    `Processo: \`${processNumber}\``,
    `Evento: ${eventLabel}`,
    `Cliente (referência): ${clientName?.trim() || "não identificado"}`,
    `Telefone informado: ${clientPhone}`,
    "",
    "A validação do número indicou que ele não possui WhatsApp ativo ou não é válido para envio.",
    "A notificação automática ao cliente não foi enviada.",
  ].join("\n");
}

export const notificationMessageBuilders = {
  buildProcessSlackMessage,
  buildProcessWhatsAppMessage,
  buildEventSlackMessage,
  buildEventWhatsAppMessage,
  buildHighlightEventSlackMessage,
  buildHighlightEventWhatsAppMessage,
  buildTaskEventSlackMessage,
  buildTaskEventWhatsAppMessage,
  buildLaudoSlackMessage,
  buildLaudoWhatsAppMessage,
  buildSentencaSlackMessage,
  buildSentencaWhatsAppMessage,
  buildPericiaSlackMessage,
  buildPericiaWhatsAppMessage,
  buildClientsFallbackWhatsAppMessage,
  buildClientsInvalidWhatsAppMessage,
} as const;
