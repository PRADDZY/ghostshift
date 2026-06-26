import { randomUUID } from "node:crypto";

import type {
  DeliveryPayload,
  EvidenceSnapshot,
  Mission,
  MissionEvent,
  MissionInput,
  MissionNegotiationView,
  MissionReport,
  MissionVendorReport,
  MissionView,
  NegotiatedOffer,
  ProcurementLaneReport,
  ProcurementMandate,
  SpendEvent,
  Vendor,
  VendorEvidence,
  VerificationVerdict
} from "@ghostshift/shared";
import {
  defaultLaunchStackMandate,
  isTerminalStatus,
  launchStackLanes,
  launchStackTemplateId
} from "@ghostshift/shared";

import type { LedgerAdapter } from "./ledger.js";
import { MarketResearchService } from "./evidence.js";
import { createProofHash } from "./ledger.js";
import { runNegotiationArena } from "./negotiation.js";
import type { MissionStore } from "./store.js";
import type { VendorMarket } from "./vendors.js";

export class MissionService {
  constructor(
    private readonly store: MissionStore,
    private readonly market: VendorMarket,
    private readonly ledger: LedgerAdapter,
    private readonly research: MarketResearchService
  ) {}

  async createMission(input: MissionInput): Promise<Mission> {
    const now = new Date().toISOString();
    const requiredLanes = this.resolveRequiredLanes(input);
    const mandate = this.resolveMandate(input, requiredLanes);
    const snapshot = input.evidenceSnapshotId
      ? await this.research.getSnapshot(input.evidenceSnapshotId)
      : await this.research.getLatestSnapshot();

    const mission: Mission = {
      id: randomUUID(),
      companyName: input.companyName,
      brief: input.brief,
      preferredCategory: input.preferredCategory,
      stackTemplateId: input.stackTemplateId ?? (requiredLanes.length > 0 ? launchStackTemplateId : undefined),
      requiredLanes,
      evidenceSnapshotId: snapshot.id,
      status: "draft",
      totalBudgetMotes: input.totalBudgetMotes,
      treasuryRemainingMotes: input.totalBudgetMotes,
      categoryCaps: input.categoryCaps,
      mandate,
      ledgerMode: this.ledger.mode,
      recommendedVendorIdsByLane: {},
      approvedVendorIdsByLane: {},
      negotiatedOffersByLane: {},
      blockers: [],
      vendorIdsSeen: [],
      negotiationRounds: [],
      events: [
        this.makeEvent("lead", "company-opened", `${input.companyName} is live with a capped treasury.`, {
          budget: input.totalBudgetMotes,
          lanes: requiredLanes.length > 0 ? requiredLanes.join(",") : input.preferredCategory,
          snapshotId: snapshot.id
        })
      ],
      spends: [],
      verdicts: [],
      receipts: [],
      createdAt: now,
      updatedAt: now
    };
    await this.store.save(mission);
    return mission;
  }

  async getMissionView(missionId: string): Promise<MissionView> {
    const mission = await this.requireMission(missionId);
    const vendors = await this.listMissionVendors(mission);
    return { mission, vendors };
  }

  async getMissionReport(missionId: string): Promise<MissionReport> {
    const mission = await this.requireMission(missionId);
    const vendors = await this.listMissionVendors(mission);
    const snapshot = await this.requireEvidenceSnapshot(mission);
    const evidenceByVendorId = new Map(snapshot.vendors.map((entry) => [entry.vendorId, entry] as const));
    const lanes = this.getLaneKeys(mission).map((lane) => this.makeLaneReport(mission, lane, vendors, evidenceByVendorId));

    return {
      mission,
      lanes,
      spendSummary: {
        totalBudgetMotes: mission.totalBudgetMotes,
        spentMotes: mission.totalBudgetMotes - mission.treasuryRemainingMotes,
        remainingMotes: mission.treasuryRemainingMotes
      },
      receipts: mission.receipts,
      blockers: mission.blockers
    };
  }

  async listCandidateVendors(missionId: string): Promise<Vendor[]> {
    const mission = await this.requireMission(missionId);
    return this.listMissionVendors(mission);
  }

  async getMissionNegotiationView(missionId: string): Promise<MissionNegotiationView> {
    const mission = await this.requireMission(missionId);
    return {
      missionId: mission.id,
      evidenceSnapshotId: mission.evidenceSnapshotId,
      rounds: mission.negotiationRounds,
      negotiatedOffersByLane: mission.negotiatedOffersByLane
    };
  }

  async previewNegotiation(missionId: string, vendorId: string): Promise<{
    rounds: Mission["negotiationRounds"];
    finalOffer: NegotiatedOffer;
  }> {
    const mission = await this.requireMission(missionId);
    const vendor = await this.market.get(vendorId);
    const evidence = await this.requireVendorEvidence(mission, vendor.id);
    return runNegotiationArena(vendor, evidence, {
      lane: vendor.lane,
      laneCap: this.resolveLaneCap(mission, vendor),
      mandate: mission.mandate
    });
  }

  async buyTrial(missionId: string, vendorId: string, negotiatedOffer?: NegotiatedOffer): Promise<{
    mission: Mission;
    delivery: DeliveryPayload;
    verdict: VerificationVerdict;
  }> {
    const mission = await this.requireMission(missionId);
    if (isTerminalStatus(mission.status)) {
      throw new Error("Mission already closed.");
    }

    const vendor = await this.market.get(vendorId);
    if (!this.isVendorAllowedForMission(mission, vendor)) {
      throw new Error(`Vendor ${vendor.id} is not allowed for this mission.`);
    }

    const delivery = await this.buyTrialService(
      mission,
      negotiatedOffer ? this.applyNegotiatedOffer(vendor, negotiatedOffer) : vendor
    );
    const verdict = this.verifyDelivery(delivery);

    mission.verdicts = mission.verdicts.filter((candidate) => candidate.vendorId !== vendor.id);
    mission.verdicts.push(verdict);
    mission.updatedAt = new Date().toISOString();
    mission.events.push(
      this.makeEvent(
        "verifier",
        verdict.accepted ? "trial-accepted" : "trial-rejected",
        verdict.reason,
        { vendorId: vendor.id, lane: vendor.lane, score: verdict.score }
      )
    );

    await this.store.save(mission);
    return { mission, delivery, verdict };
  }

  async getVendorVerdict(missionId: string, vendorId: string): Promise<VerificationVerdict> {
    const mission = await this.requireMission(missionId);
    const verdict = [...mission.verdicts].reverse().find((candidate) => candidate.vendorId === vendorId);
    if (!verdict) {
      throw new Error("No trial verdict exists for that vendor yet.");
    }
    return verdict;
  }

  async runMission(missionId: string): Promise<Mission> {
    const mission = await this.requireMission(missionId);
    if (isTerminalStatus(mission.status)) {
      throw new Error("Mission already closed.");
    }

    const snapshot = await this.requireEvidenceSnapshot(mission);
    const evidenceByVendorId = new Map(snapshot.vendors.map((entry) => [entry.vendorId, entry] as const));
    mission.status = "running";
    mission.updatedAt = new Date().toISOString();
    mission.recommendedVendorIdsByLane = {};
    mission.negotiatedOffersByLane = {};
    mission.negotiationRounds = [];
    mission.blockers = [];

    const vendors = await this.listMissionVendors(mission);
    const negotiatedByVendorId = new Map<string, NegotiatedOffer>();

    for (const lane of this.getLaneKeys(mission)) {
      const laneVendors = this.listLaneCandidates(mission, lane, vendors);

      mission.events.push(
        this.makeEvent("scout", "market-scan", `Scout found ${laneVendors.length} ${lane} vendors.`, {
          lane,
          count: laneVendors.length
        })
      );

      if (laneVendors.length === 0) {
        mission.blockers.push(`No allowed vendor is available for ${lane}.`);
        continue;
      }

      for (const vendor of laneVendors) {
        mission.vendorIdsSeen.push(vendor.id);
        mission.events.push(
          this.makeEvent("scout", "vendor-shortlisted", `${vendor.name} made the ${lane} shortlist.`, {
            lane,
            price: vendor.trialPriceMotes,
            score: vendor.qualityScore
          })
        );

        const evidence = evidenceByVendorId.get(vendor.id);
        if (!evidence) {
          mission.events.push(
            this.makeEvent("scout", "evidence-missing", `No active evidence snapshot exists for ${vendor.name}.`, {
              lane,
              vendorId: vendor.id
            })
          );
          continue;
        }

        const negotiation = runNegotiationArena(vendor, evidence, {
          lane,
          laneCap: this.resolveLaneCap(mission, vendor),
          mandate: mission.mandate
        });
        negotiatedByVendorId.set(vendor.id, negotiation.finalOffer);
        mission.negotiationRounds.push(...negotiation.rounds);
        mission.updatedAt = new Date().toISOString();
        mission.events.push(
          this.makeEvent("buyer", "counter-issued", negotiation.rounds[1]!.message, {
            lane,
            vendorId: vendor.id,
            offer: negotiation.rounds[1]!.offer.trialPriceMotes
          })
        );
        mission.events.push(
          this.makeEvent(
            "verifier",
            negotiation.finalOffer.accepted ? "concession-accepted" : "concession-rejected",
            negotiation.finalOffer.reason,
            {
              lane,
              vendorId: vendor.id,
              offer: negotiation.finalOffer.trialPriceMotes,
              score: negotiation.finalOffer.score
            }
          )
        );

        if (!negotiation.finalOffer.accepted) {
          continue;
        }

        await this.store.save(mission);

        try {
          await this.buyTrial(mission.id, vendor.id, negotiation.finalOffer);
          this.copyMissionState(mission, await this.requireMission(mission.id));
        } catch (error) {
          mission.events.push(
            this.makeEvent("buyer", "trial-failed", error instanceof Error ? error.message : "Trial failed.", {
              lane,
              vendorId: vendor.id
            })
          );
        }
      }

      const accepted = mission.verdicts
        .filter(
          (verdict) =>
            verdict.accepted &&
            laneVendors.some((vendor) => vendor.id === verdict.vendorId) &&
            negotiatedByVendorId.get(verdict.vendorId)?.accepted
        )
        .sort(
          (left, right) =>
            (negotiatedByVendorId.get(right.vendorId)?.score ?? right.score) -
            (negotiatedByVendorId.get(left.vendorId)?.score ?? left.score)
        );

      if (accepted.length === 0) {
        mission.blockers.push(`No ${lane} vendor met the company standards.`);
        continue;
      }

      mission.recommendedVendorIdsByLane[lane] = accepted[0]!.vendorId;
      mission.negotiatedOffersByLane[lane] = negotiatedByVendorId.get(accepted[0]!.vendorId)!;
      mission.events.push(
        this.makeEvent("lead", "lane-recommended", `Lead recommends ${accepted[0]!.vendorId} for ${lane}.`, {
          lane,
          vendorId: accepted[0]!.vendorId,
          score: negotiatedByVendorId.get(accepted[0]!.vendorId)?.score ?? accepted[0]!.score
        })
      );
    }

    if (mission.blockers.length > 0) {
      mission.status = "failed";
      mission.updatedAt = new Date().toISOString();
      mission.events.push(
        this.makeEvent("lead", "mission-failed", mission.blockers.join(" "), {
          blockers: mission.blockers.length
        })
      );
      await this.store.save(mission);
      return mission;
    }

    const lanes = this.getLaneKeys(mission);
    mission.recommendedVendorId = mission.recommendedVendorIdsByLane[lanes[0]!] ?? undefined;
    mission.status = "review";
    mission.updatedAt = new Date().toISOString();
    mission.events.push(
      this.makeEvent(
        "lead",
        "stack-recommended",
        `Lead prepared ${lanes.length} vendor picks for final approval.`,
        { lanes: lanes.length }
      )
    );

    await this.store.save(mission);
    return mission;
  }

  async approveVendor(missionId: string, requestedVendorId?: string): Promise<Mission> {
    const mission = await this.requireMission(missionId);
    if (mission.status !== "review") {
      throw new Error("Mission is not ready for approval.");
    }

    const lanes = this.getLaneKeys(mission);
    const approvedVendorIds = mission.requiredLanes.length > 0
      ? this.resolveApprovedStackVendors(mission, lanes)
      : this.resolveApprovedSingleVendor(mission, lanes[0]!, requestedVendorId);
    const approvedSet = new Set(Object.values(approvedVendorIds));
    const closeTarget = mission.requiredLanes.length > 0 ? mission.stackTemplateId ?? "launch-stack" : approvedVendorIds[lanes[0]!]!;

    const closeReceipt = await this.ledger.recordReceipt({
      missionId: mission.id,
      vendorId: closeTarget,
      role: "bookkeeper",
      amountMotes: 0,
      proofHash: createProofHash([mission.id, closeTarget, "close"]),
      status: "closed"
    });

    mission.receipts.push(closeReceipt);
    mission.approvedVendorIdsByLane = approvedVendorIds;
    mission.approvedVendorId = approvedVendorIds[lanes[0]!] ?? undefined;
    mission.status = "completed";
    mission.updatedAt = new Date().toISOString();
    mission.events.push(
      this.makeEvent("bookkeeper", "ledger-closed", `Bookkeeper anchored the closing receipt ${closeReceipt.txHash.slice(0, 12)}.`, {
        txHash: closeReceipt.txHash
      })
    );
    mission.events.push(
      this.makeEvent(
        "lead",
        "company-dissolved",
        mission.requiredLanes.length > 0
          ? `${mission.companyName} locked the launch stack and dissolved.`
          : `${mission.companyName} dissolved after approving ${mission.approvedVendorId}.`,
        { approvedVendors: approvedSet.size }
      )
    );

    mission.spends = mission.spends.map((spend) =>
      approvedSet.has(spend.vendorId)
        ? { ...spend, status: "approved" }
        : spend.status === "approved"
          ? spend
          : { ...spend, status: "rejected" }
    );

    await this.store.save(mission);
    return mission;
  }

  private async buyTrialService(mission: Mission, vendor: Vendor): Promise<DeliveryPayload> {
    this.assertBudget(mission, vendor);

    const requirement = await this.market.requestTrial(vendor.id);
    mission.events.push(
      this.makeEvent("buyer", "payment-requested", `${vendor.name} asked for a 402-style trial payment.`, {
        lane: vendor.lane,
        amount: requirement.amountMotes
      })
    );

    const receipt = await this.ledger.recordReceipt({
      missionId: mission.id,
      vendorId: vendor.id,
      role: "buyer",
      amountMotes: requirement.amountMotes,
      proofHash: createProofHash([mission.id, requirement.requirementId, vendor.id]),
      status: "paid"
    });

    const delivery = await this.market.fulfillTrial(vendor.id, receipt.txHash);
    const spendEvent: SpendEvent = {
      id: randomUUID(),
      vendorId: vendor.id,
      role: "buyer",
      amountMotes: requirement.amountMotes,
      category: vendor.category,
      lane: vendor.lane,
      status: "delivered",
      requirementId: requirement.requirementId,
      deliveryId: delivery.deliveryId,
      txHash: receipt.txHash,
      proofHash: receipt.proofHash,
      createdAt: new Date().toISOString()
    };

    mission.treasuryRemainingMotes -= requirement.amountMotes;
    mission.updatedAt = new Date().toISOString();
    mission.receipts.push(receipt);
    mission.spends = mission.spends.filter((spend) => spend.vendorId !== vendor.id);
    mission.spends.push(spendEvent);
    mission.events.push(
      this.makeEvent("bookkeeper", "receipt-anchored", `Receipt ${receipt.txHash.slice(0, 12)} recorded for ${vendor.name}.`, {
        lane: vendor.lane,
        txHash: receipt.txHash
      })
    );

    return delivery;
  }

  private verifyDelivery(delivery: DeliveryPayload): VerificationVerdict {
    const missingArtifact = !delivery.artifactUrl;
    const stale = delivery.freshnessSeconds > 120;
    const accepted = !missingArtifact && !stale && delivery.qualityScore >= 80;

    return {
      vendorId: delivery.vendorId,
      deliveryId: delivery.deliveryId,
      accepted,
      score: delivery.qualityScore,
      reason: missingArtifact
        ? `${delivery.vendorId} was rejected because the artifact URL was missing.`
        : stale
          ? `${delivery.vendorId} was rejected because the payload was stale.`
          : `${delivery.vendorId} passed verification with score ${delivery.qualityScore}.`,
      checkedAt: new Date().toISOString()
    };
  }

  private assertBudget(mission: Mission, vendor: Vendor): void {
    if (mission.status === "completed") {
      throw new Error("Mission already completed.");
    }

    if (mission.treasuryRemainingMotes < vendor.trialPriceMotes) {
      throw new Error("Treasury does not cover this trial.");
    }

    if (vendor.trialPriceMotes > mission.mandate.maxTrialSpendMotes) {
      throw new Error(`Trial spend cap exceeded for ${vendor.name}.`);
    }

    const lane = this.getLaneForVendor(mission, vendor);
    const laneCap = mission.mandate.laneCaps[lane] ?? mission.categoryCaps[vendor.category] ?? mission.totalBudgetMotes;
    const spentInLane = mission.spends
      .filter((spend) => spend.lane === lane)
      .reduce((total, spend) => total + spend.amountMotes, 0);

    if (spentInLane + vendor.trialPriceMotes > laneCap) {
      throw new Error(`Lane cap exceeded for ${lane}.`);
    }
  }

  private async requireMission(missionId: string): Promise<Mission> {
    const mission = await this.store.get(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }
    return mission;
  }

  private async requireEvidenceSnapshot(mission: Mission): Promise<EvidenceSnapshot> {
    if (mission.evidenceSnapshotId) {
      return this.research.getSnapshot(mission.evidenceSnapshotId);
    }

    return this.research.getLatestSnapshot();
  }

  private async requireVendorEvidence(mission: Mission, vendorId: string): Promise<VendorEvidence> {
    return this.research.getVendorEvidence(vendorId, mission.evidenceSnapshotId);
  }

  private resolveRequiredLanes(input: MissionInput): string[] {
    if (input.requiredLanes?.length) {
      return [...input.requiredLanes];
    }

    if (input.stackTemplateId === launchStackTemplateId) {
      return [...launchStackLanes];
    }

    return [];
  }

  private resolveMandate(input: MissionInput, requiredLanes: string[]): ProcurementMandate {
    if (input.mandate) {
      return {
        ...input.mandate,
        laneCaps: { ...input.mandate.laneCaps },
        allowedVendorsByLane: input.mandate.allowedVendorsByLane
          ? Object.fromEntries(
              Object.entries(input.mandate.allowedVendorsByLane).map(([lane, vendors]) => [lane, [...vendors]])
            )
          : undefined
      };
    }

    if (requiredLanes.length > 0) {
      return {
        ...defaultLaunchStackMandate,
        laneCaps: { ...defaultLaunchStackMandate.laneCaps }
      };
    }

    return {
      maxTrialSpendMotes: input.totalBudgetMotes,
      laneCaps: { ...input.categoryCaps },
      requireFinalApproval: true
    };
  }

  private getLaneKeys(mission: Mission): string[] {
    return mission.requiredLanes.length > 0 ? mission.requiredLanes : [mission.preferredCategory];
  }

  private getLaneForVendor(mission: Mission, vendor: Vendor): string {
    return mission.requiredLanes.length > 0 ? vendor.lane : vendor.category;
  }

  private resolveLaneCap(mission: Mission, vendor: Vendor): number {
    const lane = this.getLaneForVendor(mission, vendor);
    return mission.mandate.laneCaps[lane] ?? mission.categoryCaps[vendor.category] ?? mission.totalBudgetMotes;
  }

  private async listMissionVendors(mission: Mission): Promise<Vendor[]> {
    const vendors =
      mission.requiredLanes.length > 0 ? await this.market.list() : await this.market.list(mission.preferredCategory);

    return vendors.filter(
      (vendor) =>
        (mission.requiredLanes.length === 0 || mission.requiredLanes.includes(vendor.lane)) &&
        this.isVendorAllowedForMission(mission, vendor)
    );
  }

  private listLaneCandidates(mission: Mission, lane: string, vendors: Vendor[]): Vendor[] {
    return vendors.filter((vendor) =>
      mission.requiredLanes.length > 0 ? vendor.lane === lane : vendor.category === lane
    );
  }

  private isVendorAllowedForMission(mission: Mission, vendor: Vendor): boolean {
    const allowed = mission.mandate.allowedVendorsByLane?.[vendor.lane];
    return !allowed || allowed.includes(vendor.id);
  }

  private resolveApprovedSingleVendor(
    mission: Mission,
    lane: string,
    requestedVendorId?: string
  ): Record<string, string> {
    const vendorId = requestedVendorId ?? mission.recommendedVendorId ?? mission.recommendedVendorIdsByLane[lane];
    if (!vendorId) {
      throw new Error("No vendor is ready for approval.");
    }

    const verdict = mission.verdicts.find((candidate) => candidate.vendorId === vendorId && candidate.accepted);
    if (!verdict) {
      throw new Error("Selected vendor does not have an approved trial.");
    }

    return { [lane]: vendorId };
  }

  private resolveApprovedStackVendors(mission: Mission, lanes: string[]): Record<string, string> {
    const entries = lanes.map((lane) => [lane, mission.recommendedVendorIdsByLane[lane]] as const);
    if (entries.some(([, vendorId]) => !vendorId)) {
      throw new Error("Not every required lane has a recommended vendor.");
    }

    return Object.fromEntries(entries) as Record<string, string>;
  }

  private makeLaneReport(
    mission: Mission,
    lane: string,
    vendors: Vendor[],
    evidenceByVendorId: ReadonlyMap<string, VendorEvidence>
  ): ProcurementLaneReport {
    const candidates = this.listLaneCandidates(mission, lane, vendors).map((vendor) =>
      this.makeVendorReport(mission, vendor, evidenceByVendorId.get(vendor.id))
    );

    return {
      lane,
      recommendedVendorId: mission.recommendedVendorIdsByLane[lane],
      approvedVendorId: mission.approvedVendorIdsByLane[lane],
      blockedReason: mission.blockers.find((entry) => entry.includes(` ${lane} `) || entry.endsWith(` ${lane}.`)),
      candidates
    };
  }

  private makeVendorReport(mission: Mission, vendor: Vendor, evidence?: VendorEvidence): MissionVendorReport {
    return {
      vendorId: vendor.id,
      name: vendor.name,
      lane: vendor.lane,
      trialPriceMotes: vendor.trialPriceMotes,
      securityGrade: vendor.securityGrade,
      supportsMcp: vendor.supportsMcp,
      supportsX402: vendor.supportsX402,
      evidence,
      negotiatedOffer: this.getLatestNegotiatedOffer(mission, vendor.id),
      verdict: this.getLatestVerdict(mission, vendor.id)
    };
  }

  private getLatestVerdict(mission: Mission, vendorId: string): VerificationVerdict | undefined {
    return [...mission.verdicts].reverse().find((candidate) => candidate.vendorId === vendorId);
  }

  private getLatestNegotiatedOffer(mission: Mission, vendorId: string): NegotiatedOffer | undefined {
    return [...mission.negotiationRounds].reverse().find((candidate) => candidate.vendorId === vendorId)?.offer;
  }

  private applyNegotiatedOffer(vendor: Vendor, offer: NegotiatedOffer): Vendor {
    return {
      ...vendor,
      trialPriceMotes: offer.trialPriceMotes,
      setupMinutes: offer.setupMinutes,
      securityGrade: offer.securityGrade,
      supportsMcp: offer.supportsMcp,
      supportsX402: offer.supportsX402
    };
  }

  private copyMissionState(target: Mission, source: Mission): void {
    target.treasuryRemainingMotes = source.treasuryRemainingMotes;
    target.updatedAt = source.updatedAt;
    target.spends = source.spends;
    target.verdicts = source.verdicts;
    target.receipts = source.receipts;
    target.events = source.events;
    target.negotiationRounds = source.negotiationRounds;
    target.negotiatedOffersByLane = source.negotiatedOffersByLane;
    target.blockers = source.blockers.length > 0 ? source.blockers : target.blockers;
    target.recommendedVendorIdsByLane = {
      ...target.recommendedVendorIdsByLane,
      ...source.recommendedVendorIdsByLane
    };
  }

  private makeEvent(
    role: MissionEvent["role"],
    action: string,
    message: string,
    details: MissionEvent["details"]
  ): MissionEvent {
    return {
      id: randomUUID(),
      role,
      action,
      message,
      createdAt: new Date().toISOString(),
      details: details ?? undefined
    };
  }
}
