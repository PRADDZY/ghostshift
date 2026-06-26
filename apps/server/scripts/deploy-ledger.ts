import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import CasperSdk from "casper-js-sdk";

import {
  createCasperRpcClient,
  loadCasperPrivateKey,
  resolveCasperConnectionConfig,
  waitForDeployExecution,
  type GhostShiftEnv
} from "../src/domain/ledger.js";

const { AccountIdentifier, Args, Deploy, DeployHeader, ExecutableDeployItem, ModuleBytes } = CasperSdk;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function getExecutionErrorMessage(result: unknown): string | undefined {
  const executionInfoError =
    typeof result === "object" && result !== null
      ? (result as { executionInfo?: { executionResult?: { errorMessage?: string } } }).executionInfo?.executionResult
          ?.errorMessage
      : undefined;

  if (executionInfoError) {
    return executionInfoError;
  }

  const v1Error =
    typeof result === "object" && result !== null
      ? (result as { executionResultsV1?: Array<{ errorMessage?: string }> }).executionResultsV1?.find((entry) =>
          Boolean(entry.errorMessage)
        )?.errorMessage
      : undefined;

  return v1Error;
}

async function main() {
  const env = {
    ...(process.env as GhostShiftEnv),
    GHOSTSHIFT_LEDGER_MODE: "casper"
  } satisfies GhostShiftEnv;

  const config = resolveCasperConnectionConfig(env);
  if (!config) {
    throw new Error(
      "Live Casper config missing. Set GHOSTSHIFT_RPC_URL, GHOSTSHIFT_CHAIN_NAME, and either GHOSTSHIFT_SECRET_KEY_PATH or GHOSTSHIFT_PRIVATE_KEY_PEM."
    );
  }

  const wasmPath = resolve(
    process.env.GHOSTSHIFT_LEDGER_WASM_PATH ??
      join(repoRoot, "contracts", "ghostshift-ledger", "target", "wasm32-unknown-unknown", "release", "ghostshift_ledger.wasm")
  );
  const paymentMotes = process.env.GHOSTSHIFT_LEDGER_INSTALL_PAYMENT_MOTES?.trim() || "80000000000";

  const wasm = new Uint8Array(await readFile(wasmPath));
  const key = await loadCasperPrivateKey(config);
  const session = new ExecutableDeployItem();
  session.moduleBytes = new ModuleBytes(wasm, Args.fromMap({}));

  const payment = ExecutableDeployItem.standardPayment(paymentMotes);
  const header = DeployHeader.default();
  header.account = key.publicKey;
  header.chainName = config.chainName;

  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(key);

  const client = createCasperRpcClient(config.rpcUrl);
  const result = await client.putDeploy(deploy);
  const deployHash = result.deployHash.toHex();

  console.log(`Install deploy submitted: ${deployHash}`);
  await waitForDeployExecution(client, deployHash, 45, 4_000);

  const deployResult = await client.getDeploy(deployHash);
  const executionError = getExecutionErrorMessage(deployResult);
  if (executionError) {
    throw new Error(`Install deploy executed but failed: ${executionError}`);
  }

  const accountInfo = await client.getAccountInfo(null, new AccountIdentifier(undefined, key.publicKey));
  const contractKey = accountInfo.account.namedKeys.find((entry) => entry.name === "ghostshift_ledger_hash");

  if (!contractKey) {
    throw new Error("Contract install executed but ghostshift_ledger_hash was not written to the signer account.");
  }

  console.log(
    JSON.stringify(
      {
        deployHash,
        contractHash: contractKey.key.toString(),
        envLine: `GHOSTSHIFT_LEDGER_CONTRACT_HASH=${contractKey.key.toString()}`
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("GhostShift contract deploy failed:", error);
  process.exit(1);
});
