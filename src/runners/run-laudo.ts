import { fetchLaudo } from "../eproc/laudo";

interface FetchLaudoPayload {
  documentUrl: string;
  phpsessid: string;
}

const payload: FetchLaudoPayload = {
  documentUrl: "controlador.php?acao=acessar_documento&doc=711773228146900128386670969054&evento=711773228146900128386671114690&key=da059aa880ed5f49896be85dbad54c7ed26154ca140e0a586b54351c7d825d76&mesmoGrau=S&hash=f7ab5db3cb41193bd90b712d6a18695c",
  phpsessid: "jnndq82eu9nvo0qu55dvdlo5v4",
};

async function main(): Promise<void> {
  if (!payload.documentUrl || !payload.phpsessid) {
    throw new Error('Set "documentUrl" and "phpsessid" in src/run-laudo.ts before running.');
  }

  const result = await fetchLaudo(payload.documentUrl, payload.phpsessid);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
});
