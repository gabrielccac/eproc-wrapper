import "dotenv/config";
import {
  runProcessesWorkflow,
  type RunProcessWorkflowPayload,
} from "../flows/processes";

const runProcessWorkflowPayload: RunProcessWorkflowPayload = {
  phpsessid: "",
  processesEndpoint: "",
};

async function main(): Promise<void> {
  if (!runProcessWorkflowPayload.phpsessid || !runProcessWorkflowPayload.processesEndpoint) {
    throw new Error(
      'Set "phpsessid" and "processesEndpoint" in src/run-processes-workflow.ts before running.',
    );
  }

  const result = await runProcessesWorkflow(runProcessWorkflowPayload);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
});
