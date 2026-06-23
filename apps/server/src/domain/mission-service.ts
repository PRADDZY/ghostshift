import { randomUUID } from "node:crypto";

import type {
  DeliveryPayload,
  Mission,
  MissionEvent,
  MissionInput,
  MissionView,
  SpendEvent,
  Vendor,
  VerificationVerdict
} from "@ghostshift/shared";
import { isTerminalStatus } from "@ghostshift/shared";

import type { LedgerAdapter } from "./ledger.js";
import { createProofHash } from "./ledger.js";
import type { MissionStore } from "./store.js";
import type { VendorMarket } from "./vendors.js";

export class MissionService {
  constructor(
    private readonly store: MissionStore,
    private readonly market: VendorMarket,
    private readonly ledger: LedgerAdapter
  ) {}

  async createMission(input: MissionInput): Promise<Mission> {
    const now = new Date().toISOString();
    const mission: Mission = {
      id: randomUUID(),
      companyName: input.companyName,
      brief: input.brief,
      preferredCategory: input.preferredCategory,
      status: "draft",
      totalBudgetMotes: input.totalBudgetMotes,
      treasuryRemainingMotes: input.totalBudgetMotes,
      categoryCaps: input.categoryCaps,
      ledgerMode: this.ledger.mode,
      vendorIdsSeen: [],
      events: [
        this.makeEvent("lead", "company-opened", `${input.companyName} is live with a capped treasury.`, {
          budget: input.totalBudgetMotes
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
    const vendors = await this.market.list(mission.preferredCategory);
    return { mission, vendors };
  }

  async listCandidateVendors(missionId: string): Promise<Vendor[]> {
    const mission = await this.requireMission(missionId);
    return this.market.list(mission.preferredCategory);
  }

  async buyTrial(missionId: string, vendorId: string): Promise<{
    mission: Mission;
    delivery: DeliveryPayload;
    verdict: VerificationVerdict;
  }> {
    const mission = await this.requireMission(missionId);
    if (isTerminalStatus(mission.status)) {
      throw new Error("Mission already closed.");
    }

    const vendor = await this.market.get(vendorId);
    const delivery = await this.buyTrialService(mission, vendor);
    const verdict = this.verifyDelivery(delivery);

    mission.verdicts.push(verdict);
    mission.updatedAt = new Date().toISOString();
    mission.events.push(
      this.makeEvent(
        "verifier",
        verdict.accepted ? "trial-accepted" : "trial-rejected",
        verdict.reason,
        { vendorId: vendor.id, score: verdict.score }
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

    mission.status = "running";
    mission.updatedAt = new Date().toISOString();
    const vendors = await this.market.list(mission.preferredCategory);
    mission.events.push(
      this.makeEvent("scout", "market-scan", `Scout found ${vendors.length} vendors in ${mission.preferredCategory}.`, {
        count: vendors.length
      })
    );

    for (const vendor of vendors) {
      mission.vendorIdsSeen.push(vendor.id);
      mission.events.push(
        this.makeEvent("scout", "vendor-shortlisted", `${vendor.name} made the shortlist.`, {
          price: vendor.trialPriceMotes,
          score: vendor.qualityScore
        })
      );

      try {
        await this.buyTrial(mission.id, vendor.id);
        const refreshed = await this.requireMission(mission.id);
        mission.treasuryRemainingMotes = refreshed.treasuryRemainingMotes;
        mission.updatedAt = refreshed.updatedAt;
        mission.spends = refreshed.spends;
        mission.verdicts = refreshed.verdicts;
        mission.receipts = refreshed.receipts;
        mission.events = refreshed.events;
      } catch (error) {
        mission.events.push(
          this.makeEvent("buyer", "trial-failed", error instanceof Error ? error.message : "Trial failed.", {
            vendorId: vendor.id
          })
        );
      }
    }

    const accepted = mission.verdicts
      .filter((verdict) => verdict.accepted)
      .sort((left, right) => right.score - left.score);

    if (accepted.length === 0) {
      mission.status = "failed";
      mission.updatedAt = new Date().toISOString();
      mission.events.push(
        this.makeEvent("lead", "mission-failed", "No vendor met the company standards.", undefined)
      );
      await this.store.save(mission);
      return mission;
    }

    mission.recommendedVendorId = accepted[0]?.vendorId;
    mission.status = "review";
    mission.updatedAt = new Date().toISOString();
    mission.events.push(
      this.makeEvent(
        "lead",
        "vendor-recommended",
        `Lead recommends ${accepted[0]?.vendorId} for approval.`,
        { vendorId: accepted[0]?.vendorId ?? null }
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

    const vendorId = requestedVendorId ?? mission.recommendedVendorId;
    if (!vendorId) {
      throw new Error("No vendor is ready for approval.");
    }

    const verdict = mission.verdicts.find((candidate) => candidate.vendorId === vendorId && candidate.accepted);
    if (!verdict) {
      throw new Error("Selected vendor does not have an approved trial.");
    }

    const closeReceipt = await this.ledger.recordReceipt({
      missionId: mission.id,
      vendorId,
      role: "bookkeeper",
      amountMotes: 0,
      proofHash: createProofHash([mission.id, vendorId, "close"]),
      status: "closed"
    });

    mission.receipts.push(closeReceipt);
    mission.approvedVendorId = vendorId;
    mission.status = "completed";
    mission.updatedAt = new Date().toISOString();
    mission.events.push(
      this.makeEvent("bookkeeper", "ledger-closed", `Bookkeeper anchored the closing receipt ${closeReceipt.txHash.slice(0, 12)}.`, {
        txHash: closeReceipt.txHash
      })
    );
    mission.events.push(
      this.makeEvent("lead", "company-dissolved", `${mission.companyName} dissolved after approving ${vendorId}.`, {
        vendorId
      })
    );

    mission.spends = mission.spends.map((spend) =>
      spend.vendorId === vendorId
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
    mission.spends.push(spendEvent);
    mission.events.push(
      this.makeEvent("bookkeeper", "receipt-anchored", `Receipt ${receipt.txHash.slice(0, 12)} recorded for ${vendor.name}.`, {
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

    const categoryCap = mission.categoryCaps[vendor.category] ?? 0;
    const spentInCategory = mission.spends
      .filter((spend) => spend.category === vendor.category)
      .reduce((total, spend) => total + spend.amountMotes, 0);

    if (spentInCategory + vendor.trialPriceMotes > categoryCap) {
      throw new Error(`Category cap exceeded for ${vendor.category}.`);
    }
  }

  private async requireMission(missionId: string): Promise<Mission> {
    const mission = await this.store.get(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }
    return mission;
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
