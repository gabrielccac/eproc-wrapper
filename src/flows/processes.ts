import { fetchProcesses } from "../eproc/processes";
import type { Process } from "../types";

export interface RunProcessWorkflowPayload {
  phpsessid: string;
  processesEndpoint: string;
}

export interface RunProcessWorkflowResult {
  processes: Process[];
}

export async function runProcessesWorkflow(
  payload: RunProcessWorkflowPayload,
): Promise<RunProcessWorkflowResult> {
  const result = await fetchProcesses(payload.processesEndpoint, payload.phpsessid);
  if (result.sessionExpired) {
    throw new Error("Session expired while fetching processes.");
  }

  return { processes: result.processes };
}
