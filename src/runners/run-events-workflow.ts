import "dotenv/config";
import { runEventsWorkflow, type RunEventsWorkflowPayload } from "../flows/events";
import { getEprocSessionFromPython, parseEndpoints } from "../eproc/session";

// const runnerOptions = {
// notifications: "dry-run",
// calendar: "dry-run",
// checkpoint: "read-only",
// } as const; 

const runnerOptions = {
  eprocBaseUrl: "https://eproc.jfrs.jus.br/eprocV2/",
  notifications: "enabled",
  calendar: "enabled",
  checkpoint: "write",
} as const;

async function main(): Promise<void> {
  const session = await getEprocSessionFromPython();
  const parsedEndpoints = parseEndpoints(session.page_source_html);

  if (!parsedEndpoints.processesEndpoints.length) {
    throw new Error("No valid processes endpoints were parsed from session page HTML.");
  }

  const runEventsWorkflowPayload: RunEventsWorkflowPayload = {
    phpsessid: session.phpsessid,
    processesEndpoints: parsedEndpoints.processesEndpoints,
    ...runnerOptions,
  };

  const result = await runEventsWorkflow(runEventsWorkflowPayload);
  console.log(JSON.stringify({
    session: {
      phpsessid: session.phpsessid,
      parsedProcessesEndpoints: parsedEndpoints.processesEndpoints,
    },
    workflow: result,
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
});
