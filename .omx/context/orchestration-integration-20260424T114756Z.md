Task statement

Finish off the integration of orchestration using OMX team mode with 3 Codex workers.

Desired outcome

- Get the in-progress `libs/server` orchestration integration to a coherent, verified state.
- Resolve remaining implementation gaps across orchestrator services, DB schema/migrations, IDL/service integration, and tests.
- Produce concrete verification evidence before shutdown.

Known facts / evidence

- Branch: `hyun-work`
- Existing uncommitted orchestration work is present under `libs/server/src/orchestrator/`.
- Untracked migrations exist:
  - `libs/server/src/db/migrations/0018_add_orchestrator_sessions.sql`
  - `libs/server/src/db/migrations/0019_add_orchestrator_steps.sql`
  - `libs/server/src/db/migrations/0020_add_token_transfer_support.sql`
- Related touched files include:
  - `libs/server/src/db/schema.ts`
  - `libs/server/src/solana/services/contract.service.ts`
  - `libs/server/src/solana/idl/orchestrator.json`
  - `libs/server/src/solana/idl/orchestrator.ts`
- Existing adjacent implementation:
  - `libs/server/src/multisig/multisig-orchestration.service.ts`
  - `docs/superpowers/specs/2026-04-21-multisig-keeper-infrastructure-design.md`

Constraints

- Do not revert unrelated dirty files.
- Use OMX `team` runtime, not in-process native subagent fanout, for the main coordinated execution.
- Keep diffs small and reviewable.
- Verification is required before claiming completion.

Unknowns / open questions

- Which exact orchestration integration pieces are still incomplete or failing.
- Whether DB migrations, schema exports, runtime wiring, and tests are all aligned.
- Whether tmux/team runtime state already exists and should be resumed versus a fresh launch.

Likely codebase touchpoints

- `libs/server/src/orchestrator/`
- `libs/server/src/db/`
- `libs/server/src/solana/services/`
- `libs/server/src/solana/idl/`
- `libs/server/src/__tests__/`
- `docs/superpowers/specs/2026-04-21-multisig-keeper-infrastructure-design.md`
