# Contributing

## Local setup

```powershell
pnpm install
```

Optional live-contract setup is documented in [SUBMISSION.md](./SUBMISSION.md).

## Checks before opening a PR

```powershell
pnpm test
pnpm build
pnpm casper:build-contract
```

## Contribution rules

- Keep changes scoped and explain the user-facing effect in the PR.
- Do not commit secrets, funded keys, or `.dev.vars` files.
- If you touch the Casper contract or ledger flow, include the exact verification command you ran.
