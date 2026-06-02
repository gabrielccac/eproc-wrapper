// src/run-session.ts
import { getEprocSessionFromPython } from "../eproc/session";

getEprocSessionFromPython()
  .then((res) => console.log(JSON.stringify({ phpsessid: res.phpsessid, htmlLen: res.page_source_html.length }, null, 2)))
  .catch((err) => console.error(err));
