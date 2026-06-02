# Progress Snapshot

## Scope
This project tracks eproc process updates, stores state in Google Sheets, and sends notifications (Slack/WhatsApp) plus optional Google Calendar events.

## Current Main Flow
- Entry runner: `src/runners/run-events-workflow.ts`
- Core workflow: `src/flows/events.ts`
- Event routing/notifications: `src/integrations/notifications/router.ts`
- Message templates: `src/integrations/notifications/messages.ts`

## Implemented Behavior (Current)
- Processes are fetched from parsed eproc endpoints and deduplicated by process number.
- Sheet rows are read from `A:G` and used as process state (column `G` = `ultimoEventoId` checkpoint).
- For brand-new rows (`!sheetRow`) and rows with null checkpoint (`ultimoEventoId === null`):
  - All fetched events are treated as new and processed.
  - Checkpoint is set to the latest event id.
- For existing checkpoints:
  - Only events with id greater than checkpoint are processed.
  - Checkpoint is advanced to latest id when needed.
- Missing processes are no longer deleted from the sheet.
  - This preserves checkpoint history and prevents replay when a process disappears and later reappears.

## Notification Rules (Current)
- `highlightEvent` notifications are temporarily disabled (logic kept in code, sends commented out).
- `taskEvent` notifications are sent only for:
  - `open`
  - `waitingOpen`
- `taskEvent` with `closed` does not notify.
- `periciaEvent`:
  - Slack is sent when notifications are enabled.
  - WhatsApp is sent only if pericia date/time is not overdue in BRT (`America/Sao_Paulo`), using parsed `dd/mm/yyyy` + `hh:mm`.
- `laudoEvent`:
  - Slack/WhatsApp sent according to existing routing rules.

## Message Templates
- Client-facing greetings were normalized to a neutral greeting:
  - `Olá, Sr.(a) ...`
  - Replaced fixed `Boa tarde`.

## Workflow Output Additions
`runEventsWorkflow` now returns:
- `processesChecked`
- `eventSummary` (`checkpointBefore`, `checkpointAfter`, `newEventsCount`)
- `updatedCheckpointProcessNumbers`
- `messagedClients`:
  - `pericia: string[]`
  - `laudo: string[]`

The `messagedClients` lists are unique/sorted client names derived from actual WhatsApp sends in pericia/laudo handlers.

## Known Next Step (Planned)
- Add an `active/inactive` status column in Sheets instead of inferring active state only from current fetch.
- Medium-term plan discussed: migrate process state/checkpoints from Sheets to a database.

## Final Version Simplification Proposal

### Why simplify now
- The project works, but we currently have many tiny runner/domain files for a relatively small operational scope.
- The number of entry files (`run-*.ts`) increases maintenance overhead and makes onboarding/debugging slower.
- Some modules are very cohesive and should stay split; others are split mostly by function size, not by boundary.

### Target shape (lean, still testable)
- Keep strong boundaries:
  - `eproc` (HTTP + parsers + session bridge)
  - `workflow` (checkpoint + event orchestration)
  - `adapters` (Google Sheets, Slack, WhatsApp, Calendar)
- Simplify execution surface:
  - Replace many ad-hoc runners with one CLI entrypoint and subcommands.
- Merge micro-modules where coupling is already high:
  - Date helpers (`brt-dates` + `pericia-dates`)
  - Client helpers (`client-resolution` + `phone`)
  - Keep `checkpoints` and `event-results` separate (good domain boundaries today).

### Proposed implementation phases
1. **Runner consolidation (low risk)**
   - Create one `src/cli.ts` with subcommands (`events`, `events:tjrs`, `debug:tjrs`, etc.).
   - Deprecate or remove duplicated `run-*.ts` files.
2. **Domain consolidation (low/medium risk)**
   - Merge tiny utility files that are always imported together.
   - Keep existing behavior and tests unchanged.
3. **Workflow/package cleanup (medium risk)**
   - Move toward folders by feature (`events-workflow`, `session`, `notifications`) instead of many flat files.
   - Add one integration smoke test for the main workflow path.

### Migration rule
- Refactor only structure/imports first (no behavior change), then run typecheck/tests, then optional functional changes.
