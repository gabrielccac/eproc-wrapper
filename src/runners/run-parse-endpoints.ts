import { readFile } from "node:fs/promises";
import { parseEndpoints } from "../eproc/session";

const payload = {
  htmlPath: "endpoints.html",
};

async function main(): Promise<void> {
  const htmlPath = payload.htmlPath.trim();
  if (!htmlPath) {
    throw new Error('Set "payload.htmlPath" in src/runners/run-parse-endpoints.ts before running.');
  }

  const html = await readFile(htmlPath, "utf8");
  const parsed = parseEndpoints(html);

  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
});
