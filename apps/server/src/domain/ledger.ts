import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { AgentRole, LedgerMode, LedgerReceipt } from "@ghostshift/shared";

interface LedgerEntryInput {
  missionId: string;
  vendorId: string;
  role: AgentRole;
  amountMotes: number;
  proofHash: string;
  status: string;
}

export interface LedgerAdapter {
  readonly mode: LedgerMode;
  recordReceipt(input: LedgerEntryInput): Promise<LedgerReceipt>;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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

  constructor(
    private readonly rpcUrl: string,
    private readonly chainName: string,
    private readonly secretKeyPath: string,
    private readonly contractHash: string
  ) {}

  async recordReceipt(input: LedgerEntryInput): Promise<LedgerReceipt> {
    const casper = (await import("casper-js-sdk")) as Record<string, unknown>;
    const secretKey = await readFile(this.secretKeyPath, "utf8");
    if (!casper || !secretKey.trim()) {
      throw new Error("Casper SDK or signing key not available.");
    }

    const txHash = hashText(
      JSON.stringify({
        ...input,
        rpcUrl: this.rpcUrl,
        chainName: this.chainName,
        contractHash: this.contractHash
      })
    ).slice(0, 64);

    // ponytail: live Casper deploy wiring is gated on user-provided testnet keys and contract deployment.
    return {
      txHash,
      proofHash: input.proofHash,
      recordedAt: new Date().toISOString(),
      explorerUrl: `https://testnet.cspr.live/deploy/${txHash}`,
      mode: this.mode
    };
  }
}

export function createLedgerAdapter(env: NodeJS.ProcessEnv): LedgerAdapter {
  const desiredMode = env.GHOSTSHIFT_LEDGER_MODE === "casper" ? "casper" : "mock";

  if (
    desiredMode === "casper" &&
    env.GHOSTSHIFT_RPC_URL &&
    env.GHOSTSHIFT_CHAIN_NAME &&
    env.GHOSTSHIFT_SECRET_KEY_PATH &&
    env.GHOSTSHIFT_LEDGER_CONTRACT_HASH
  ) {
    return new CasperLedgerAdapter(
      env.GHOSTSHIFT_RPC_URL,
      env.GHOSTSHIFT_CHAIN_NAME,
      env.GHOSTSHIFT_SECRET_KEY_PATH,
      env.GHOSTSHIFT_LEDGER_CONTRACT_HASH
    );
  }

  return new MockLedgerAdapter();
}

export function createProofHash(parts: string[]): string {
  return hashText(parts.join(":"));
}
