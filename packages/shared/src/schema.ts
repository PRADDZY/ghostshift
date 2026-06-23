export type AgentRole = "lead" | "scout" | "buyer" | "verifier" | "bookkeeper";

export type MissionStatus = "draft" | "running" | "review" | "completed" | "failed";

export type LedgerMode = "mock" | "casper";

export type SpendStatus = "quoted" | "paid" | "delivered" | "approved" | "rejected";

export interface MissionInput {
  companyName: string;
  brief: string;
  preferredCategory: string;
  totalBudgetMotes: number;
  categoryCaps: Record<string, number>;
}

export interface Vendor {
  id: string;
  name: string;
  category: string;
  tagline: string;
  payoutAddress: string;
  trialPriceMotes: number;
  qualityScore: number;
  reliability: number;
  deliveryMode: "fresh" | "stale" | "malformed";
  sampleArtifactUrl: string;
}

export interface PaymentRequirement {
  requirementId: string;
  vendorId: string;
  amountMotes: number;
  payableTo: string;
  memo: string;
  paymentUrl: string;
}

export interface DeliveryPayload {
  deliveryId: string;
  vendorId: string;
  artifactType: string;
  artifactUrl?: string;
  sample: string;
  deliveredAt: string;
  freshnessSeconds: number;
  qualityScore: number;
}

export interface VerificationVerdict {
  vendorId: string;
  deliveryId: string;
  accepted: boolean;
  score: number;
  reason: string;
  checkedAt: string;
}

export interface MissionEvent {
  id: string;
  role: AgentRole;
  action: string;
  message: string;
  createdAt: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface SpendEvent {
  id: string;
  vendorId: string;
  role: AgentRole;
  amountMotes: number;
  category: string;
  status: SpendStatus;
  requirementId: string;
  deliveryId?: string;
  txHash?: string;
  proofHash: string;
  createdAt: string;
}

export interface LedgerReceipt {
  txHash: string;
  proofHash: string;
  recordedAt: string;
  explorerUrl?: string;
  mode: LedgerMode;
}

export interface Mission {
  id: string;
  companyName: string;
  brief: string;
  preferredCategory: string;
  status: MissionStatus;
  totalBudgetMotes: number;
  treasuryRemainingMotes: number;
  categoryCaps: Record<string, number>;
  ledgerMode: LedgerMode;
  approvedVendorId?: string;
  recommendedVendorId?: string;
  vendorIdsSeen: string[];
  events: MissionEvent[];
  spends: SpendEvent[];
  verdicts: VerificationVerdict[];
  receipts: LedgerReceipt[];
  createdAt: string;
  updatedAt: string;
}

export interface MissionView {
  mission: Mission;
  vendors: Vendor[];
}

export function isTerminalStatus(status: MissionStatus): boolean {
  return status === "completed" || status === "failed";
}
