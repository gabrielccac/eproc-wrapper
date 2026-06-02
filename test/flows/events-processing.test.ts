import test from "node:test";
import assert from "node:assert/strict";
import { handleProcessEvent } from "../../src/integrations/notifications/router";
import type { Process, ProcessEvent } from "../../src/types";

const processFixture: Process = {
  id: "1",
  numero: "5000000-00.2026.4.04.7100",
  url: "",
  juizo: "",
  partes: [{ parte: "AUTOR", nome: "Cliente Teste", documento: null }],
  classe: "",
  classeCodigo: "",
  competencia: "",
  assunto: "",
  eventoPrazo: "",
  dataEnvioRequisicao: "",
  inicioPrazo: "",
  finalPrazo: "",
};

test("dry-run task events render notification results without sending", async () => {
  const event: ProcessEvent = {
    id: "10",
    dataHora: "31/12/2099 10:00:00",
    label: "Prazo aberto",
    descricao: "Prazo: 10 dias Data inicial da contagem do prazo: 16/04/2026 00:00:00 Data final: 26/04/2026 23:59:59",
    usuario: "Sistema",
    usuarioTipo: "TERCEIRO",
    documentos: [],
    type: "taskEvent",
    taskState: "open",
  };

  const result = await handleProcessEvent({
    process: processFixture,
    event,
    phpsessid: "session",
    notifications: "dry-run",
    calendar: "dry-run",
    defaultWhatsAppNumber: "5551999999999",
    clientsLookup: new Map(),
  });

  assert.equal(result.status, "handled");
  assert.ok(result.notifications.some((item) => item.channel === "slack" && item.status === "dry-run"));
  assert.ok(result.notifications.some((item) => item.channel === "whatsapp" && item.status === "dry-run"));
  assert.ok(result.notifications.some((item) => item.channel === "calendar" && item.status === "dry-run"));
});
