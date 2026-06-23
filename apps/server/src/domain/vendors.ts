import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import type { DeliveryPayload, PaymentRequirement, Vendor } from "@ghostshift/shared";

export class VendorMarket {
  constructor(private readonly vendorFilePath: string) {}

  async list(category?: string): Promise<Vendor[]> {
    const vendors = JSON.parse(await readFile(this.vendorFilePath, "utf8")) as Vendor[];
    return category ? vendors.filter((vendor) => vendor.category === category) : vendors;
  }

  async get(vendorId: string): Promise<Vendor> {
    const vendor = (await this.list()).find((candidate) => candidate.id === vendorId);
    if (!vendor) {
      throw new Error(`Unknown vendor: ${vendorId}`);
    }
    return vendor;
  }

  async requestTrial(vendorId: string): Promise<PaymentRequirement> {
    const vendor = await this.get(vendorId);
    return {
      requirementId: randomUUID(),
      vendorId,
      amountMotes: vendor.trialPriceMotes,
      payableTo: vendor.payoutAddress,
      memo: `trial:${vendor.id}`,
      paymentUrl: `/api/vendors/${vendor.id}/fulfill-trial`
    };
  }

  async fulfillTrial(vendorId: string, paymentProof: string): Promise<DeliveryPayload> {
    if (!paymentProof) {
      throw new Error("payment proof missing");
    }

    const vendor = await this.get(vendorId);
    const now = new Date();
    const freshnessSeconds = vendor.deliveryMode === "fresh" ? 35 : vendor.deliveryMode === "stale" ? 390 : 18;
    const artifactUrl = vendor.deliveryMode === "malformed" ? undefined : vendor.sampleArtifactUrl;

    return {
      deliveryId: randomUUID(),
      vendorId,
      artifactType: "vendor-profile",
      artifactUrl,
      sample:
        vendor.deliveryMode === "malformed"
          ? "Payload missing artifact URL."
          : `${vendor.name} returned a trial artifact for payment proof ${paymentProof.slice(0, 12)}.`,
      deliveredAt: now.toISOString(),
      freshnessSeconds,
      qualityScore: vendor.qualityScore
    };
  }
}
