import "dotenv/config";
import { runEventsWorkflow, type RunEventsWorkflowPayload } from "../flows/events";
import { getTjrsSessionFromPython, parseEndpoints } from "../eproc/session";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const runnerOptions = {
  eprocBaseUrl: "https://eproc1g.tjrs.jus.br/eproc/",
  notifications: "enabled",
  calendar: "enabled",
  checkpoint: "write",
} as const;

async function main(): Promise<void> {
  const session = await getTjrsSessionFromPython();
  const parsedEndpoints = parseEndpoints(session.page_source_html);

  if (!parsedEndpoints.processesEndpoints.length) {
    throw new Error("No valid processes endpoints were parsed from TJRS session page HTML.");
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
