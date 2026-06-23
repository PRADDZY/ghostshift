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

## Run it

```bash
pnpm install
pnpm dev:server
pnpm dev:web
```

Then open `http://localhost:4173`.

## MCP mode

Run the MCP server over stdio:

```bash
pnpm dev:mcp
```

Available tools:

- `launch_company`
- `list_candidate_vendors`
- `buy_trial_service`
- `verify_trial_delivery`
- `close_company`

## Verification

```bash
pnpm test
pnpm build
```

## Ledger modes

GhostShift is explicit about ledger mode:

- `mock` is the default and generates deterministic receipt hashes for local demo/testing.
- `casper` activates only when all required environment variables are provided.

Set these in `.env` for live-mode experiments:

```bash
GHOSTSHIFT_LEDGER_MODE=casper
GHOSTSHIFT_RPC_URL=https://rpc.testnet.casperlabs.io/rpc
GHOSTSHIFT_CHAIN_NAME=casper-test
GHOSTSHIFT_SECRET_KEY_PATH=...
GHOSTSHIFT_LEDGER_CONTRACT_HASH=...
```

## Contract build

Install the wasm target once:

```bash
rustup target add wasm32-unknown-unknown
```

Build the Casper receipt contract:

```bash
cargo build --manifest-path contracts/ghostshift-ledger/Cargo.toml --release --target wasm32-unknown-unknown
```

On Windows with the `x86_64-pc-windows-msvc` Rust toolchain, this also needs Visual Studio Build Tools or equivalent Windows SDK libraries on the host. The current workspace does not have those linker libraries installed, so contract compilation is the one verified blocker left on this machine.

## Honest status

The local demo and tests run in `mock` ledger mode today. The Casper path is scaffolded and environment-gated, but this repo does not include a funded testnet key or a deployed contract hash, so live testnet settlement still depends on user-supplied credentials and deployment data.
