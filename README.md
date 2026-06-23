# GhostShift

GhostShift is a Casper-native pop-up company for agents. You open a temporary company with a capped treasury, let specialist agents scout and buy vendor trials under hard spend rules, and dissolve the company with a permanent ledger trail.

## What it does

- `Lead` opens a mission and defines the treasury.
- `Scout` short-lists vendors from a local 402-style market.
- `Buyer` pays for vendor trials.
- `Verifier` accepts or rejects vendor outputs.
- `Bookkeeper` writes spend receipts and the closing event to the ledger adapter.

The current demo mission is vendor onboarding for infrastructure providers.

## Repo layout

- `apps/server` - HTTP API, mission engine, vendor market, ledger adapter, MCP server
- `apps/web` - single-screen demo UI for judges
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

- `launch_company`
- `list_candidate_vendors`
- `buy_trial_service`
- `verify_trial_delivery`
- `close_company`

## Verification

```powershell
pnpm test
pnpm build
```

## Casper ledger mode

GhostShift is explicit about ledger mode:

- `mock` is the default and generates deterministic receipt hashes for local demo/testing.
- `casper` activates only when RPC, signer key material, and a deployed contract hash are all present.

Set these in `.env` for live-mode experiments:

```text
GHOSTSHIFT_LEDGER_MODE=casper
GHOSTSHIFT_RPC_URL=https://rpc.testnet.casperlabs.io/rpc
GHOSTSHIFT_CHAIN_NAME=casper-test
GHOSTSHIFT_SECRET_KEY_PATH=contracts/ghostshift-ledger/keys/secret_key.pem
GHOSTSHIFT_LEDGER_CONTRACT_HASH=hash-...
GHOSTSHIFT_LEDGER_PAYMENT_MOTES=3000000000
```

Useful helpers:

- `pnpm casper:keygen` writes an ignored Ed25519 keypair to `contracts/ghostshift-ledger/keys/`.
- `pnpm casper:deploy-contract` installs the Wasm contract and prints the resulting `GHOSTSHIFT_LEDGER_CONTRACT_HASH=...` line once the deploy lands.
- `pnpm deploy:worker` publishes the Worker once Wrangler auth and the real D1 database ID are configured.

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

The Windows helper script auto-adds a WinLibs `mingw64/bin` install to `PATH` when it finds one. This workspace was verified with that flow plus the `wasm32-unknown-unknown` target installed for the pinned nightly toolchain.

## Cloudflare deploy checklist

- Update `apps/server/wrangler.jsonc` with the real D1 database IDs.
- Put live private key material into Wrangler secrets instead of files:
  `wrangler secret put GHOSTSHIFT_PRIVATE_KEY_PEM`
- Apply remote D1 migrations with `pnpm cf:d1:migrate`.
- Deploy with `pnpm deploy:worker`.

## Honest status

- Verified here:
  Node demo, web build, MCP entrypoint, Worker boot, local D1 migration, Worker mission lifecycle, Worker deploy dry-run, and Casper Wasm compilation.
- Still manual:
  funding a Casper testnet key, running the real contract install, setting Wrangler auth plus real D1 IDs, and recording a public demo/submission package.
