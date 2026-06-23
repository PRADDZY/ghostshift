import { createHash } from "node:crypto";

import CasperSdk from "casper-js-sdk";
import type {
  Deploy as CasperDeploy,
  KeyAlgorithm as CasperKeyAlgorithm,
  PrivateKey as CasperPrivateKey,
  RpcClient as CasperRpcClient
} from "casper-js-sdk";

const {
  Args,
  CLValue,
  ContractHash,
  Deploy,
  DeployHeader,
  ExecutableDeployItem,
  HttpHandler,
  KeyAlgorithm,
  PrivateKey,
  RpcClient,
  StoredContractByHash
} = CasperSdk;

import type { AgentRole, LedgerMode, LedgerReceipt } from "@ghostshift/shared";

interface LedgerEntryInput {
  missionId: string;
  vendorId: string;
  role: AgentRole;
  amountMotes: number;
  proofHash: string;
  status: string;
}

export interface GhostShiftEnv {
  DB?: unknown;
  GHOSTSHIFT_MISSIONS_PATH?: string;
  GHOSTSHIFT_LEDGER_MODE?: string;
  GHOSTSHIFT_RPC_URL?: string;
  GHOSTSHIFT_CHAIN_NAME?: string;
  GHOSTSHIFT_SECRET_KEY_PATH?: string;
  GHOSTSHIFT_PRIVATE_KEY_PEM?: string;
  GHOSTSHIFT_PRIVATE_KEY_ALGORITHM?: string;
  GHOSTSHIFT_LEDGER_CONTRACT_HASH?: string;
  GHOSTSHIFT_LEDGER_PAYMENT_MOTES?: string;
  GHOSTSHIFT_LEDGER_EXPLORER_BASE_URL?: string;
}

export interface CasperLedgerConfig {
  readonly rpcUrl: string;
  readonly chainName: string;
  readonly contractHash: string;
  readonly secretKeyPath?: string;
  readonly privateKeyPem?: string;
  readonly privateKeyAlgorithm: "ed25519" | "secp256k1";
  readonly paymentMotes: string;
  readonly explorerBaseUrl: string;
}

export interface LedgerAdapter {
  readonly mode: LedgerMode;
  recordReceipt(input: LedgerEntryInput): Promise<LedgerReceipt>;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normaliseContractHash(value: string): string {
  return value.startsWith("hash-") ? value : `hash-${value}`;
}

function resolveExplorerBaseUrl(chainName: string, env: GhostShiftEnv): string {
  if (env.GHOSTSHIFT_LEDGER_EXPLORER_BASE_URL?.trim()) {
    return env.GHOSTSHIFT_LEDGER_EXPLORER_BASE_URL.trim();
  }

  return chainName === "casper-test"
    ? "https://testnet.cspr.live/deploy"
    : "https://cspr.live/deploy";
}

function resolvePrivateKeyAlgorithm(value: string | undefined): CasperLedgerConfig["privateKeyAlgorithm"] {
  return value?.toLowerCase() === "secp256k1" ? "secp256k1" : "ed25519";
}

function asKeyAlgorithm(value: CasperLedgerConfig["privateKeyAlgorithm"]): CasperKeyAlgorithm {
  return value === "secp256k1" ? KeyAlgorithm.SECP256K1 : KeyAlgorithm.ED25519;
}

async function readPrivateKeyPem(config: CasperLedgerConfig): Promise<string> {
  if (config.privateKeyPem?.trim()) {
    return config.privateKeyPem.trim();
  }

  if (!config.secretKeyPath?.trim()) {
    throw new Error("Casper signing key not configured.");
  }

  const { readFile } = await import("node:fs/promises");
  return readFile(config.secretKeyPath, "utf8");
}

export async function loadCasperPrivateKey(config: CasperLedgerConfig): Promise<CasperPrivateKey> {
  return PrivateKey.fromPem(await readPrivateKeyPem(config), asKeyAlgorithm(config.privateKeyAlgorithm));
}

export function resolveCasperLedgerConfig(env: GhostShiftEnv): CasperLedgerConfig | undefined {
  if (env.GHOSTSHIFT_LEDGER_MODE !== "casper") {
    return undefined;
  }

  const hasKey = Boolean(env.GHOSTSHIFT_PRIVATE_KEY_PEM?.trim() || env.GHOSTSHIFT_SECRET_KEY_PATH?.trim());
  if (!env.GHOSTSHIFT_RPC_URL || !env.GHOSTSHIFT_CHAIN_NAME || !env.GHOSTSHIFT_LEDGER_CONTRACT_HASH || !hasKey) {
    return undefined;
  }

  return {
    rpcUrl: env.GHOSTSHIFT_RPC_URL,
    chainName: env.GHOSTSHIFT_CHAIN_NAME,
    contractHash: normaliseContractHash(env.GHOSTSHIFT_LEDGER_CONTRACT_HASH),
    secretKeyPath: env.GHOSTSHIFT_SECRET_KEY_PATH,
    privateKeyPem: env.GHOSTSHIFT_PRIVATE_KEY_PEM,
    privateKeyAlgorithm: resolvePrivateKeyAlgorithm(env.GHOSTSHIFT_PRIVATE_KEY_ALGORITHM),
    paymentMotes: env.GHOSTSHIFT_LEDGER_PAYMENT_MOTES?.trim() || "3000000000",
    explorerBaseUrl: resolveExplorerBaseUrl(env.GHOSTSHIFT_CHAIN_NAME, env)
  };
}

export function createCasperRpcClient(rpcUrl: string): CasperRpcClient {
  return new RpcClient(new HttpHandler(rpcUrl));
}

function makeReceiptDeploy(
  config: CasperLedgerConfig,
  key: CasperPrivateKey,
  input: LedgerEntryInput
): CasperDeploy {
  const session = new ExecutableDeployItem();
  session.storedContractByHash = new StoredContractByHash(
    ContractHash.newContract(config.contractHash),
    "record_receipt",
    Args.fromMap({
      mission_id: CLValue.newCLString(input.missionId),
      vendor_id: CLValue.newCLString(input.vendorId),
      role: CLValue.newCLString(input.role),
      amount_motes: CLValue.newCLUint64(input.amountMotes),
      proof_hash: CLValue.newCLString(input.proofHash),
      status: CLValue.newCLString(input.status)
    })
  );

  const payment = ExecutableDeployItem.standardPayment(config.paymentMotes);
  const header = DeployHeader.default();
  header.account = key.publicKey;
  header.chainName = config.chainName;

  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(key);
  return deploy;
}

export async function submitReceiptDeploy(
  config: CasperLedgerConfig,
  input: LedgerEntryInput
): Promise<{ txHash: string; explorerUrl: string }> {
  const key = await loadCasperPrivateKey(config);
  const deploy = makeReceiptDeploy(config, key, input);
  const result = await createCasperRpcClient(config.rpcUrl).putDeploy(deploy);
  const txHash = result.deployHash.toHex();

  return {
    txHash,
    explorerUrl: `${config.explorerBaseUrl.replace(/\/$/, "")}/${txHash}`
  };
}

export async function waitForDeployExecution(
  client: CasperRpcClient,
  deployHash: string,
  attempts = 30,
  delayMs = 4_000
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await client.getDeploy(deployHash);
      if (result.executionInfo || (result.executionResultsV1?.length ?? 0) > 0) {
        return;
      }
    } catch {
      // ponytail: the network can lag right after submission, so we poll instead of adding a full event layer.
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Timed out waiting for deploy ${deployHash} to execute.`);
}

class MockLedgerAdapter implements LedgerAdapter {
  readonly mode = "mock" as const;

  async recordReceipt(input: LedgerEntryInput): Promise<LedgerReceipt> {
    const txHash = hashText(JSON.stringify(input)).slice(0, 64);
    return {
      txHash,
      proofHash: input.proofHash,
      recordedAt: new Date().toISOString(),
      explorerUrl: undefined,
      mode: this.mode
    };
  }
}

class CasperLedgerAdapter implements LedgerAdapter {
  readonly mode = "casper" as const;

  constructor(private readonly config: CasperLedgerConfig) {}

  async recordReceipt(input: LedgerEntryInput): Promise<LedgerReceipt> {
    const receipt = await submitReceiptDeploy(this.config, input);
    return {
      txHash: receipt.txHash,
      proofHash: input.proofHash,
      recordedAt: new Date().toISOString(),
      explorerUrl: receipt.explorerUrl,
      mode: this.mode
    };
  }
}

export function createLedgerAdapter(env: GhostShiftEnv): LedgerAdapter {
  const config = resolveCasperLedgerConfig(env);
  return config ? new CasperLedgerAdapter(config) : new MockLedgerAdapter();
}

export function createProofHash(parts: string[]): string {
  return hashText(parts.join(":"));
}
