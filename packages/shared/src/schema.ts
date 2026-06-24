export type AgentRole = "lead" | "scout" | "buyer" | "verifier" | "bookkeeper";

export type MissionStatus = "draft" | "running" | "review" | "completed" | "failed";

export type LedgerMode = "mock" | "casper";

export type SpendStatus = "quoted" | "paid" | "delivered" | "approved" | "rejected";

export interface ProcurementMandate {
  maxTrialSpendMotes: number;
  laneCaps: Record<string, number>;
  requireFinalApproval: boolean;
  allowedVendorsByLane?: Record<string, string[]>;
}

export const launchStackTemplateId = "agent-app-launch";
export const launchStackLanes = ["browser", "telemetry", "auth", "knowledge"] as const;
export type LaunchStackLane = (typeof launchStackLanes)[number];

export const launchStackLaneCaps: Record<LaunchStackLane, number> = {
  browser: 1_700_000_000,
  telemetry: 1_400_000_000,
  auth: 1_600_000_000,
  knowledge: 1_800_000_000
};

export const defaultLaunchStackMandate: ProcurementMandate = {
  maxTrialSpendMotes: 1_800_000_000,
  laneCaps: launchStackLaneCaps,
  requireFinalApproval: true
};

export interface MissionInput {
  companyName: string;
  brief: string;
  preferredCategory: string;
  totalBudgetMotes: number;
  categoryCaps: Record<string, number>;
  stackTemplateId?: string;
  requiredLanes?: string[];
  mandate?: ProcurementMandate;
}

export interface Vendor {
  id: string;
  name: string;
  category: string;
  lane: string;
  tagline: string;
  payoutAddress: string;
  trialPriceMotes: number;
  qualityScore: number;
  reliability: number;
  setupMinutes: number;
  securityGrade: string;
  supportsMcp: boolean;
  supportsX402: boolean;
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
  lane: string;
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
  stackTemplateId?: string;
  requiredLanes: string[];
  status: MissionStatus;
  totalBudgetMotes: number;
  treasuryRemainingMotes: number;
  categoryCaps: Record<string, number>;
  mandate: ProcurementMandate;
  ledgerMode: LedgerMode;
  approvedVendorId?: string;
  recommendedVendorId?: string;
  recommendedVendorIdsByLane: Record<string, string>;
  approvedVendorIdsByLane: Record<string, string>;
  blockers: string[];
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

export interface MissionVendorReport {
  vendorId: string;
  name: string;
  lane: string;
  trialPriceMotes: number;
  securityGrade: string;
  supportsMcp: boolean;
  supportsX402: boolean;
  verdict?: VerificationVerdict;
}

export interface ProcurementLaneReport {
  lane: string;
  recommendedVendorId?: string;
  approvedVendorId?: string;
  blockedReason?: string;
  candidates: MissionVendorReport[];
}

export interface MissionReport {
  mission: Mission;
  lanes: ProcurementLaneReport[];
  spendSummary: {
    totalBudgetMotes: number;
    spentMotes: number;
    remainingMotes: number;
  };
  receipts: LedgerReceipt[];
  blockers: string[];
}

export function isTerminalStatus(status: MissionStatus): boolean {
  return status === "completed" || status === "failed";
}
