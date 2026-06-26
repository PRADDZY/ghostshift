import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import CasperSdk from "casper-js-sdk";

import { createLedgerAdapter, loadCasperPrivateKey } from "./ledger.js";

const { KeyAlgorithm, PrivateKey } = CasperSdk;

test("ledger stays in mock mode when live config is incomplete", () => {
  const adapter = createLedgerAdapter({
    GHOSTSHIFT_LEDGER_MODE: "casper",
    GHOSTSHIFT_RPC_URL: "https://node.testnet.casper.network/rpc",
    GHOSTSHIFT_CHAIN_NAME: "casper-test",
    GHOSTSHIFT_LEDGER_CONTRACT_HASH: "hash-abc123"
  });

  assert.equal(adapter.mode, "mock");
});

test("ledger switches to casper mode when inline key material is present", () => {
  const adapter = createLedgerAdapter({
    GHOSTSHIFT_LEDGER_MODE: "casper",
    GHOSTSHIFT_RPC_URL: "https://node.testnet.casper.network/rpc",
    GHOSTSHIFT_CHAIN_NAME: "casper-test",
    GHOSTSHIFT_LEDGER_CONTRACT_HASH: "hash-abc123",
    GHOSTSHIFT_PRIVATE_KEY_PEM: "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----"
  });

  assert.equal(adapter.mode, "casper");
});

test("loadCasperPrivateKey falls back to INIT_CWD for repo-root relative key paths", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "ghostshift-key-"));
  const keyDir = join(tempRoot, "contracts", "ghostshift-ledger", "keys");
  const privateKey = PrivateKey.generate(KeyAlgorithm.ED25519);
  const secretKeyPath = join(keyDir, "secret_key.pem");
  const originalInitCwd = process.env.INIT_CWD;

  await mkdir(keyDir, { recursive: true });
  await writeFile(secretKeyPath, privateKey.toPem(), "utf8");
  process.env.INIT_CWD = tempRoot;

  try {
    const loaded = await loadCasperPrivateKey({
      rpcUrl: "https://node.testnet.casper.network/rpc",
      chainName: "casper-test",
      secretKeyPath: "contracts/ghostshift-ledger/keys/secret_key.pem",
      privateKeyAlgorithm: "ed25519",
      explorerBaseUrl: "https://testnet.cspr.live/deploy"
    });

    assert.equal(loaded.publicKey.toHex(), privateKey.publicKey.toHex());
  } finally {
    if (originalInitCwd === undefined) {
      delete process.env.INIT_CWD;
    } else {
      process.env.INIT_CWD = originalInitCwd;
    }
  }
});
