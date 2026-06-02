import "dotenv/config";
import { getEprocSessionFromPython, parseEndpoints } from "../eproc/session";
import { runJulgadoEventsDiscovery } from "../flows/julgado-events-discovery";

async function main(): Promise<void> {
  const session = await getEprocSessionFromPython();
  const parsedEndpoints = parseEndpoints(session.page_source_html);

  if (!parsedEndpoints.processesEndpoints.length) {
    throw new Error("No valid processes endpoints were parsed from session page HTML.");
  }

  const result = await runJulgadoEventsDiscovery({
    phpsessid: session.phpsessid,
    processesEndpoints: parsedEndpoints.processesEndpoints,
    eventFetchConcurrency: 3,
  });

  console.log(JSON.stringify({
    session: {
      parsedProcessesEndpoints: parsedEndpoints.processesEndpoints,
    },
    discovery: result,
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
