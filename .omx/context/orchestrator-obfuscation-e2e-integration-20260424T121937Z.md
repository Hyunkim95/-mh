Task statement

Continue the integration so orchestrator replaces the old obfuscation flow end-to-end across backend and frontend.

Desired outcome

- Route creation, deploy funding, status, and UI flow use orchestrator-backed APIs rather than the legacy obfuscation path.
- Backend and frontend agree on the same orchestration lifecycle.
- Verification covers the touched orchestrator and client/server wiring paths.

Known facts / evidence

- Previous team run completed and shut down cleanly.
- Current leader branch already contains orchestrator exports, docs, tests, and runtime fixes.
- Remaining route/deploy path is still obfuscation-backed:
  - `libs/server/src/routes/services/routes.service.ts` creates `obfuscationService` sessions.
  - `libs/server/src/routers/routes.router.ts` exposes obfuscation session/funding/status APIs.
  - `libs/client/src/hooks/useObfuscationDeploy.ts` and `libs/client/src/components/DeployModal.tsx` drive the client flow through obfuscation endpoints.
- Current local dirty files are part of the active integration:
  - `libs/server/src/orchestrator/orchestrator-keeper.service.ts`
  - `libs/server/src/orchestrator/orchestrator.service.ts`
  - `libs/server/src/orchestrator/schema/orchestrator-steps.schema.ts`
  - `libs/server/src/orchestrator/README.md`
  - `libs/server/src/__tests__/db-schema-exports.test.ts`
  - `libs/server/src/__tests__/solana-idl-index.test.ts`
  - deleted tracked `node_modules` symlink

Constraints

- Use OMX team runtime, not native in-process fanout, for the main parallel lane.
- Do not revert unrelated dirty files.
- Keep leader workspace clean before launching worktree-backed team workers.
- Verification is required before shutdown.

Unknowns / open questions

- Exact backend API shape to expose orchestrator as a drop-in replacement for current deploy UI.
- Whether to migrate the existing obfuscation endpoints in place or add new orchestrator endpoints and then repoint the client.
- Whether any frontend copy/status text should continue using "obfuscation" during the transition.

Likely codebase touchpoints

- `libs/server/src/routes/services/routes.service.ts`
- `libs/server/src/routers/routes.router.ts`
- `libs/server/src/orchestrator/`
- `libs/client/src/hooks/useObfuscationDeploy.ts`
- `libs/client/src/components/DeployModal.tsx`
- `libs/client/src/hooks/useDeploy.ts`
- `libs/client/src/components/history/RouteItem.tsx`
- `libs/server/src/__tests__/`
- `libs/client/src/__tests__/`
