import "dotenv/config";
import type { ParsedPericia } from "../types";
import {
  buildPericiaWhatsAppMessage,
  buildSentencaWhatsAppMessage,
} from "../integrations/notifications/messages";
import { sendWhatsAppMessage } from "../integrations/notifications/whatsapp";

declare const process: {
  exit(code?: number): never;
};

const TEST_NUMBER = "5596981211546";
const SENTENCA_LABEL = "Sentença procedente";
const CLIENT_NAME = "Cliente Teste";
const PROCESS_NUMBER = "5000000-00.2026.4.04.7100";
const PERICIA_FIXTURE: ParsedPericia = {
  periciado: CLIENT_NAME,
  data: "30/04/2026",
  horario: "14:30",
  local: "Av. Borges de Medeiros, 1000 - Porto Alegre/RS",
  perito: "Dr. Fulano",
};

async function main(): Promise<void> {
  const sentencaMessage = buildSentencaWhatsAppMessage(SENTENCA_LABEL, CLIENT_NAME);
  const periciaMessage = buildPericiaWhatsAppMessage(PROCESS_NUMBER, PERICIA_FIXTURE, CLIENT_NAME);

  await sendWhatsAppMessage(TEST_NUMBER, sentencaMessage);
  await sendWhatsAppMessage(TEST_NUMBER, periciaMessage);

  console.log(`WhatsApp template test messages sent to ${TEST_NUMBER}.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
