export interface ProcessPart {
  parte: string;
  nome: string;
  documento: string | null;
}

export interface Process {
  id: string;
  numero: string;
  url: string;
  juizo: string;
  partes: ProcessPart[];
  classe: string;
  classeCodigo: string;
  competencia: string;
  assunto: string;
  eventoPrazo: string;
  dataEnvioRequisicao: string;
  inicioPrazo: string;
  finalPrazo: string;
}

export interface ProcessListResult {
  processes: Process[];
  sessionExpired: boolean;
}

export type ProcessEventUserType = "ADVOGADO" | "PROCURADOR" | "TERCEIRO";
export type ProcessEventType =
  | "defaultEvent"
  | "highlightEvent"
  | "taskEvent"
  | "periciaEvent"
  | "laudoEvent"
  | "sentencaEvent";
export type TaskState = "open" | "waitingOpen" | "closed";

export interface ProcessEventDocument {
  url: string;
  nome: string;
  tipo?: string;
  id?: string;
}

export interface ProcessEvent {
  id: string;
  dataHora: string;
  label: string;
  descricao: string;
  usuario: string;
  usuarioTipo: ProcessEventUserType;
  documentos: ProcessEventDocument[];
  type: ProcessEventType;
  taskState?: TaskState;
}

export interface ProcessEventsResult {
  processId: string;
  eventCount: number | null;
  lastEventAt: string | null;
  events: ProcessEvent[];
  sessionExpired: boolean;
}

export interface ParsedLaudo {
  conclusao: string;
  justificativa: string;
}

export interface ParsedPericia {
  periciado: string;
  data: string;
  horario: string;
  local: string;
  perito: string;
}

export interface ParsedTask {
  state: TaskState;
  prazoDias: number | null;
  inicioPrazo: string | null;
  finalPrazo: string | null;
}

export interface ProcessesSheetRow {
  numeroProcesso: string;
  classe: string;
  assunto: string;
  eventoPrazo: string;
  inicioPrazo: string;
  finalPrazo: string;
  ultimoEventoId: number | null;
}

export interface ClientsSheetRow {
  numeroProcesso: string;
  autor: string;
  reu: string;
  telefoneCliente: string;
}
