import "dotenv/config";
import type { ParsedLaudo, Process, ProcessEvent } from "../types";
import {
  buildEventSlackMessage,
  buildEventWhatsAppMessage,
  buildLaudoSlackMessage,
  buildLaudoWhatsAppMessage,
  buildProcessSlackMessage,
  buildProcessWhatsAppMessage,
} from "../integrations/notifications/messages";
import { sendSlackMessage } from "../integrations/notifications/slack";
import { sendWhatsAppMessage } from "../integrations/notifications/whatsapp";

declare const process: {
  exit(code?: number): never;
};

const payload = {
  whatsappNumber: "5596981211546",
  sendSlack: true,
  sendWhatsApp: true,
};

const sampleProcess: Process = {
  id: "123",
  numero: "5000000-00.2026.4.04.7100",
  url: "controlador.php?acao=processo_selecionar&num_processo=50000000020264047100",
  juizo: "RSPOANJ03B",
  partes: [
    { parte: "AUTOR", nome: "Maria da Silva", documento: null },
    { parte: "RÉU", nome: "INSS", documento: null },
  ],
  classe: "Procedimento Comum",
  classeCodigo: "1234",
  competencia: "Federal",
  assunto: "Auxílio por incapacidade",
  eventoPrazo: "Intimação para manifestação",
  dataEnvioRequisicao: "04/04/2026 01:23:16",
  inicioPrazo: "08/04/2026 00:00:00",
  finalPrazo: "29/04/2026 23:59:59",
};

const sampleEvent: ProcessEvent = {
  id: "456",
  dataHora: "09/04/2026 15:30:00",
  label: "Laudo pericial juntado",
  descricao: "Laudo pericial juntado aos autos",
  usuario: "Perito Judicial",
  usuarioTipo: "TERCEIRO",
  type: "laudoEvent",
  documentos: [
    {
      id: "999",
      nome: "LAUDO1",
      url: "controlador.php?acao=acessar_documento&id=999",
      tipo: "text/html",
    },
  ],
};

const sampleLaudo: ParsedLaudo = {
  conclusao: "Com incapacidade laborativa",
  justificativa: "Quadro clínico incompatível com o exercício habitual da atividade.",
};

async function main(): Promise<void> {
  if (payload.sendWhatsApp && !payload.whatsappNumber.trim()) {
    throw new Error('Set "payload.whatsappNumber" in src/run-notifications.ts before sending WhatsApp messages.');
  }

  const processSlackMessage = buildProcessSlackMessage(sampleProcess, { isNew: true });
  const processWhatsAppMessage = buildProcessWhatsAppMessage(sampleProcess);
  const eventSlackMessage = buildEventSlackMessage(sampleProcess.numero, sampleEvent);
  const eventWhatsAppMessage = buildEventWhatsAppMessage(sampleProcess.numero, sampleEvent);
  const laudoSlackMessage = buildLaudoSlackMessage(
    sampleProcess.numero,
    sampleLaudo,
    "Maria da Silva",
  );
  const laudoWhatsAppMessage = buildLaudoWhatsAppMessage(
    sampleProcess.numero,
    sampleLaudo,
    "Maria da Silva",
  );

  console.log("=== Process Slack ===");
  console.log(processSlackMessage);
  console.log("\n=== Process WhatsApp ===");
  console.log(processWhatsAppMessage);
  console.log("\n=== Event Slack ===");
  console.log(eventSlackMessage);
  console.log("\n=== Event WhatsApp ===");
  console.log(eventWhatsAppMessage);
  console.log("\n=== Laudo Slack ===");
  console.log(laudoSlackMessage);
  console.log("\n=== Laudo WhatsApp ===");
  console.log(laudoWhatsAppMessage);

  if (payload.sendSlack) {
    await sendSlackMessage(processSlackMessage);
    await sendSlackMessage(eventSlackMessage);
    await sendSlackMessage(laudoSlackMessage);
  }

  if (payload.sendWhatsApp) {
    await sendWhatsAppMessage(payload.whatsappNumber, processWhatsAppMessage);
    await sendWhatsAppMessage(payload.whatsappNumber, eventWhatsAppMessage);
    await sendWhatsAppMessage(payload.whatsappNumber, laudoWhatsAppMessage);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
