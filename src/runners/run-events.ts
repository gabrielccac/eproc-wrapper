import { fetchProcessEvents } from "../eproc/events";

interface FetchProcessEventsPayload {
  processUrl: string;
  phpsessid: string;
}

const payload: FetchProcessEventsPayload = {
  processUrl: "https://eproc.jfrs.jus.br/eprocV2/controlador.php?acao=processo_selecionar&acao_origem=citacao_intimacao_prazo_aberto_listar&acao_retorno=citacao_intimacao_prazo_aberto_listar&num_processo=50131307420254047104&hash=3a457ed5147a02390bd328661a4b7f14",
  phpsessid: "jnndq82eu9nvo0qu55dvdlo5v4",
};

async function main(): Promise<void> {
  if (!payload.processUrl || !payload.phpsessid) {
    throw new Error('Set "processUrl" and "phpsessid" in src/run-events.ts before running.');
  }

  const result = await fetchProcessEvents(payload.processUrl, payload.phpsessid);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
});
