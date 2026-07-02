# GhostShift

GhostShift is a Casper-native evidence-and-negotiation buying desk for agents. You open a temporary company with a capped treasury, pin a market evidence snapshot, let specialist agents source the browser, telemetry, auth, and knowledge stack under a signed mandate, and dissolve the desk with a permanent ledger trail.

## Live surface

- Frontend: `https://ghostshift.pages.dev`
- Worker API: `https://ghostshift-api-live.dpratik3005.workers.dev`

## What it does

- `Lead` opens a mission, defines the treasury plus mandate, and pins the evidence snapshot.
- `Scout` refreshes public vendor evidence and short-lists vendors lane-by-lane for the launch stack.
- `Buyer` negotiates down to mandate-safe trial terms, then pays for trial runs inside the signed caps.
- `Verifier` accepts or rejects vendor outputs.
- `Bookkeeper` writes spend receipts and the closing event to the ledger adapter.

The current demo mission is a launch-day sourcing run across browser automation, telemetry, auth, and knowledge vendors with a visible negotiation arena and source citations.

## Repo layout

- `apps/server` - HTTP API, mission engine, vendor market, ledger adapter, MCP server
- `apps/web` - public evidence-and-negotiation desk
- `packages/shared` - shared mission, vendor, spend, and receipt types
- `contracts/ghostshift-ledger` - minimal Casper receipt contract scaffold

## Local Node demo

```powershell
pnpm install
pnpm dev:server
pnpm dev:web
```

Then open `http://localhost:4173`.

## Cloudflare Worker demo

1. Copy `apps/server/.dev.vars.example` to `apps/server/.dev.vars` if you want local Worker secrets or non-default values.
2. Apply the local D1 schema:

```powershell
pnpm cf:d1:migrate:local
```

3. Start the Worker API:

```powershell
pnpm dev:worker
```

4. In a second shell, point the web app at the Worker instead of the Node server:

```powershell
$env:VITE_API_BASE_URL='http://127.0.0.1:8787'
pnpm dev:web
```

The Worker path has been verified locally with D1-backed mission create, run, approve, and receipt writes.

## MCP mode

Run the MCP server over stdio:

```powershell
pnpm dev:mcp
```

Available tools:

- `refresh_market_evidence`
- `inspect_vendor_evidence`
- `launch_company`
- `run_negotiation_round`
- `list_candidate_vendors`
- `buy_trial_service`
- `verify_trial_delivery`
- `close_company`
- `source_launch_stack`

## Verification

```powershell
pnpm test
pnpm build
pnpm submission:check
```

## Casper ledger mode

GhostShift is explicit about ledger mode:

- `mock` is the default and generates deterministic receipt hashes for local demo/testing.
- `casper` activates only when RPC, signer key material, and a deployed contract hash are all present.

Set these in `.env` for live-mode experiments:

```text
GHOSTSHIFT_LEDGER_MODE=casper
GHOSTSHIFT_RPC_URL=https://node.testnet.casper.network/rpc
GHOSTSHIFT_CHAIN_NAME=casper-test
GHOSTSHIFT_SECRET_KEY_PATH=contracts/ghostshift-ledger/keys/secret_key.pem
GHOSTSHIFT_LEDGER_CONTRACT_HASH=hash-...
GHOSTSHIFT_LEDGER_PAYMENT_MOTES=3000000000
```

Useful helpers:

- `pnpm casper:keygen` writes an ignored Ed25519 keypair to `contracts/ghostshift-ledger/keys/`.
- `pnpm casper:deploy-contract` installs the Wasm contract and prints the resulting `GHOSTSHIFT_LEDGER_CONTRACT_HASH=...` line once the deploy lands.
- `pnpm cf:d1:migrate:live` applies the remote D1 schema for the `live` Worker environment.
- `pnpm deploy:worker:live` publishes the `live` Worker once Wrangler auth, the private key secret, and real D1 IDs are configured.
- `pnpm submission:check` proves the public Worker is live in Casper mode and can complete a single-lane mission with real explorer links.

## Launch stack flow

- The default template is `agent-app-launch`.
- The desk sources four required lanes: `browser`, `telemetry`, `auth`, and `knowledge`.
- Every mission pins an `evidenceSnapshotId` so the desk can prove which market facts it used.
- The sourcing run records `negotiationRounds` and per-lane negotiated offers before trial payment.
- Agents can trial vendors and spend within the mandate, but final stack approval still pauses for an explicit sign-off.
- `GET /api/missions/:id/report` returns a structured stack report with per-lane recommendations, blockers, spend totals, and receipts.
- `GET /api/evidence/latest`, `POST /api/evidence/refresh`, and `GET /api/missions/:id/negotiation` expose the evidence pack and negotiation arena directly.

## Contract build

The contract now builds on this Windows host. The repo is pinned to the same newer Casper contract stack that compiled successfully here:

- `casper-contract = 5.1.1`
- `casper-types = 6.0.1`
- `nightly-2024-07-31-x86_64-pc-windows-gnu`

Install the wasm target for that toolchain once:

```powershell
rustup target add wasm32-unknown-unknown --toolchain nightly-2024-07-31-x86_64-pc-windows-gnu
```

Build it with:

```powershell
pnpm casper:build-contract
```
