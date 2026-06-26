# GhostShift Submission Runbook

GhostShift is submission-ready when the repo is public, the Worker is live, and `pnpm submission:check` produces real Casper explorer links.

## Go-Live Checklist

1. Install dependencies and sign into Cloudflare:

```powershell
pnpm install
pnpm --filter @ghostshift/server exec wrangler login
```

2. Build the Casper contract artifact:

```powershell
pnpm casper:build-contract
```

3. Prepare a funded Casper testnet signer. If you want a repo-local keypair first:

```powershell
pnpm casper:keygen
```

Then fund the generated public key on Casper testnet and point the deploy helper at the secret key:

```powershell
$env:GHOSTSHIFT_LEDGER_MODE='casper'
$env:GHOSTSHIFT_RPC_URL='https://node.testnet.casper.network/rpc'
$env:GHOSTSHIFT_CHAIN_NAME='casper-test'
$env:GHOSTSHIFT_SECRET_KEY_PATH='contracts/ghostshift-ledger/keys/secret_key.pem'
pnpm casper:deploy-contract
```

Copy the printed `GHOSTSHIFT_LEDGER_CONTRACT_HASH=...` value.

4. Create the live D1 database and note the IDs:

```powershell
pnpm --filter @ghostshift/server exec wrangler d1 create ghostshift-live
```

5. Update `apps/server/wrangler.jsonc` under `env.live`:

- Replace `GHOSTSHIFT_LEDGER_CONTRACT_HASH`
- Replace `GHOSTSHIFT_PUBLIC_BASE_URL`
- Replace `database_id`
- Replace `preview_database_id`

6. Upload the live Casper signing key to Wrangler secrets:

```powershell
Get-Content contracts/ghostshift-ledger/keys/secret_key.pem -Raw | pnpm --filter @ghostshift/server exec wrangler secret put GHOSTSHIFT_PRIVATE_KEY_PEM --env live
```

7. Apply the remote D1 schema and deploy the live Worker:

```powershell
pnpm cf:d1:migrate:live
pnpm deploy:worker:live
```

8. Run the qualification gate:

```powershell
pnpm submission:check
```

That check only passes when:

- Wrangler auth is live
- the live D1 IDs are real
- the live private key secret exists
- the Casper Wasm contract has been built
- tests and builds pass
- the public Worker reports `ledgerMode=casper`
- a single-lane browser mission completes and returns live explorer URLs

## Paste-Ready Submission Copy

### One-liner

GhostShift is a Casper-native evidence-backed buying desk for agents: it pins a live market snapshot, negotiates the browser, telemetry, auth, and knowledge stack lane by lane under a signed mandate, and dissolves the desk with every spend anchored on Casper.

### What is different

- Most agent demos stop at recommendations; GhostShift turns agent procurement into a signed treasury workflow with approval, spend caps, negotiation rounds, and receipts.
- The desk does not rely on static vendor blurbs: it can refresh a public evidence pack from official vendor pages, then pin that snapshot into the mission.
- The product frames vendor selection as a temporary operating company, which is more legible to judges than another generic agent dashboard.
- Casper is not decorative here: the close-out of the desk and the spend trail are the trust layer, so the prototype can prove that agents stayed inside a mandate.

### Demo proof points

- Open-source repo with Worker API, negotiation war-room UI, MCP server, and Casper contract scaffold
- Live evidence pack refresh plus pinned mission snapshots
- Public Cloudflare Worker endpoint running in `casper` ledger mode
- Live Casper deploy hashes returned from the approval flow
- Structured mission report covering picks, blockers, spend totals, receipts, and negotiation output

## Evidence To Paste Before Submission

- Repo URL: `https://github.com/PRADDZY/ghostshift`
- Live app URL: `https://ghostshift-api-live.dpratik3005.workers.dev`
- Contract hash: `hash-6f770642967df494b3304840279f145d6dc95511dc53dd3e96a0ff0381517989`
- Contract install deploy: `https://testnet.cspr.live/deploy/162fce749a0f84b209b25192ca4cf7f984eef35bb2751e8984950bb683d31c11`
- Explorer URL 1: `https://testnet.cspr.live/deploy/0f27a6d027841aaae28cdda7663efbd0056bbcec53f651d4990ceeae01d2152a`
- Explorer URL 2: `https://testnet.cspr.live/deploy/f4d1a4b588173dcac53c1d9a3c0145d546ed6fe460b684322a85019a4f892ee4`
- Submission check timestamp: `2026-06-26T19:40:54.3729506+05:30`
