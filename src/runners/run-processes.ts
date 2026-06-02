import { fetchProcesses } from "../eproc/processes";

interface FetchProcessesPayload {
  endpoint: string;
  phpsessid: string;
}

const payload: FetchProcessesPayload = {
  endpoint: "https://eproc.jfrs.jus.br/eprocV2/controlador.php?acao=citacao_intimacao_pendente_listar&hash=4fe2f3701ef52c9a556056388665afa2",
  phpsessid: "jnndq82eu9nvo0qu55dvdlo5v4",
};

async function main(): Promise<void> {
  if (!payload.endpoint || !payload.phpsessid) {
    throw new Error('Set "endpoint" and "phpsessid" in src/run-processes.ts before running.');
  }

  const result = await fetchProcesses(payload.endpoint, payload.phpsessid);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
});
