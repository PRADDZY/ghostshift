import assert from "node:assert/strict";
import test from "node:test";

import { createLedgerAdapter } from "./ledger.js";

test("ledger stays in mock mode when live config is incomplete", () => {
  const adapter = createLedgerAdapter({
    GHOSTSHIFT_LEDGER_MODE: "casper",
    GHOSTSHIFT_RPC_URL: "https://rpc.testnet.casperlabs.io/rpc",
    GHOSTSHIFT_CHAIN_NAME: "casper-test",
    GHOSTSHIFT_LEDGER_CONTRACT_HASH: "hash-abc123"
  });

  assert.equal(adapter.mode, "mock");
});

test("ledger switches to casper mode when inline key material is present", () => {
  const adapter = createLedgerAdapter({
    GHOSTSHIFT_LEDGER_MODE: "casper",
    GHOSTSHIFT_RPC_URL: "https://rpc.testnet.casperlabs.io/rpc",
    GHOSTSHIFT_CHAIN_NAME: "casper-test",
    GHOSTSHIFT_LEDGER_CONTRACT_HASH: "hash-abc123",
    GHOSTSHIFT_PRIVATE_KEY_PEM: "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----"
  });

  assert.equal(adapter.mode, "casper");
});
