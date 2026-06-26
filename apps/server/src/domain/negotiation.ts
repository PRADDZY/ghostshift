import { randomUUID } from "node:crypto";

import type {
  NegotiatedOffer,
  NegotiationRound,
  ProcurementMandate,
  Vendor,
  VendorEvidence
} from "@ghostshift/shared";

interface NegotiationContext {
  lane: string;
  laneCap: number;
  mandate: ProcurementMandate;
}

export function runNegotiationArena(
  vendor: Vendor,
  evidence: VendorEvidence,
  context: NegotiationContext
): { rounds: NegotiationRound[]; finalOffer: NegotiatedOffer } {
  const baseline = makeOffer(vendor, evidence, evidence.trialPriceMotes, evidence.setupMinutes, "Baseline offer loaded from the active evidence snapshot.");
  const buyerCounterPrice = Math.max(
    Math.round(Math.min(context.mandate.maxTrialSpendMotes, context.laneCap, evidence.trialPriceMotes) * 0.9),
    Math.round(evidence.trialPriceMotes * 0.78)
  );
  const buyerCounterSetup = Math.max(10, Math.min(evidence.setupMinutes, evidence.setupMinutes - 2));
  const buyerCounter = makeOffer(
    vendor,
    evidence,
    buyerCounterPrice,
    buyerCounterSetup,
    `Buyer counters inside the signed cap for ${context.lane}.`
  );

  const concessionFactor = vendor.reliability >= 0.95 ? 0.35 : vendor.reliability >= 0.9 ? 0.5 : 0.7;
  const finalPrice = Math.max(
    Math.round(evidence.trialPriceMotes - (evidence.trialPriceMotes - buyerCounterPrice) * concessionFactor),
    Math.round(evidence.trialPriceMotes * 0.75)
  );
  const finalSetup = Math.max(Math.round((evidence.setupMinutes + buyerCounterSetup) / 2), 10);
  const finalOffer = finalizeOffer(
    makeOffer(vendor, evidence, finalPrice, finalSetup, "Vendor responds with a final concession grounded in the current evidence pack."),
    context
  );

  const rounds: NegotiationRound[] = [
    makeRound(vendor, context.lane, "scout", 1, "Scout loaded the baseline public-market position.", baseline),
    makeRound(vendor, context.lane, "buyer", 2, `Buyer requested a sharper trial package under the ${context.lane} mandate.`, buyerCounter),
    makeRound(vendor, context.lane, "vendor", 3, finalOffer.reason, finalOffer)
  ];

  return {
    rounds,
    finalOffer
  };
}

function makeRound(
  vendor: Vendor,
  lane: string,
  actor: NegotiationRound["actor"],
  round: number,
  message: string,
  offer: NegotiatedOffer
): NegotiationRound {
  return {
    id: randomUUID(),
    lane,
    vendorId: vendor.id,
    vendorName: vendor.name,
    actor,
    round,
    message,
    offer,
    createdAt: new Date().toISOString()
  };
}

function makeOffer(
  vendor: Vendor,
  evidence: VendorEvidence,
  trialPriceMotes: number,
  setupMinutes: number,
  reason: string
): NegotiatedOffer {
  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    lane: vendor.lane,
    trialPriceMotes,
    setupMinutes,
    securityGrade: evidence.securityGrade,
    supportsMcp: evidence.supportsMcp,
    supportsX402: evidence.supportsX402,
    confidenceScore: evidence.confidenceScore,
    score: 0,
    accepted: false,
    reason,
    citations: evidence.citations
  };
}

function finalizeOffer(offer: NegotiatedOffer, context: NegotiationContext): NegotiatedOffer {
  const securityScore = scoreSecurity(offer.securityGrade);
  const priceEfficiency = scorePriceEfficiency(offer.trialPriceMotes, context.laneCap);
  const setupScore = scoreSetup(offer.setupMinutes);
  const fitScore = scoreFit(offer);
  const confidenceScore = offer.confidenceScore;
  const score =
    fitScore * 0.35 +
    securityScore * 0.25 +
    priceEfficiency * 0.2 +
    setupScore * 0.1 +
    confidenceScore * 0.1;

  const laneRejection = getLaneRejection(context.lane, offer, securityScore);
  const budgetRejected =
    offer.trialPriceMotes > context.mandate.maxTrialSpendMotes || offer.trialPriceMotes > context.laneCap;
  const accepted = !laneRejection && !budgetRejected && offer.confidenceScore >= 65 && score >= 72;

  const reason = laneRejection
    ? laneRejection
    : budgetRejected
      ? `Vendor refused to come inside the ${context.lane} mandate cap.`
      : accepted
        ? `Vendor conceded to ${offer.trialPriceMotes} motes with a scorecard result of ${score.toFixed(1)}.`
        : `Vendor remained above the confidence/fit threshold with a scorecard result of ${score.toFixed(1)}.`;

  return {
    ...offer,
    accepted,
    reason,
    score: Number(score.toFixed(1))
  };
}

function getLaneRejection(
  lane: string,
  offer: NegotiatedOffer,
  securityScore: number
): string | undefined {
  if (lane === "auth" && securityScore < 90) {
    return "Auth vendor failed the security confidence floor for identity lanes.";
  }

  if (lane === "browser" && !offer.supportsMcp) {
    return "Browser vendor lacks a clear automation control surface for the launch desk.";
  }

  if (lane === "knowledge" && offer.confidenceScore < 75) {
    return "Knowledge vendor evidence was too weak to support a retrieval-heavy launch lane.";
  }

  return undefined;
}

function scoreSecurity(grade: string): number {
  switch (grade.toUpperCase()) {
    case "A+":
      return 98;
    case "A":
      return 92;
    case "B":
      return 80;
    default:
      return 65;
  }
}

function scorePriceEfficiency(price: number, laneCap: number): number {
  const ratio = laneCap === 0 ? 1 : price / laneCap;
  if (ratio <= 0.6) {
    return 95;
  }

  if (ratio <= 0.75) {
    return 88;
  }

  if (ratio <= 0.9) {
    return 78;
  }

  return 60;
}

function scoreSetup(setupMinutes: number): number {
  if (setupMinutes <= 12) {
    return 95;
  }

  if (setupMinutes <= 18) {
    return 88;
  }

  if (setupMinutes <= 24) {
    return 78;
  }

  return 65;
}

function scoreFit(offer: NegotiatedOffer): number {
  const signalScore = (offer.supportsMcp ? 12 : 0) + (offer.supportsX402 ? 6 : 0);
  return Math.min(96, 72 + signalScore + Math.round(offer.confidenceScore * 0.1));
}
