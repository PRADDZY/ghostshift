import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { MissionInput, Vendor } from "@ghostshift/shared";
import { createLedgerAdapter } from "./ledger.js";
import { MissionService } from "./mission-service.js";
import { FileMissionStore } from "./store.js";
import { VendorMarket } from "./vendors.js";

function makeVendor(overrides: Partial<Vendor> & Pick<Vendor, "id" | "name" | "category" | "lane">): Vendor {
  return {
    tagline: "Test vendor",
    payoutAddress: `casper-test:${overrides.id}`,
    trialPriceMotes: 100,
    qualityScore: 90,
    reliability: 0.9,
    setupMinutes: 10,
    securityGrade: "A",
    supportsMcp: true,
    supportsX402: true,
    deliveryMode: "fresh",
    sampleArtifactUrl: `https://${overrides.id}.example/trial.json`,
    ...overrides
  };
}

async function makeService(vendors: Vendor[]) {
  const tempDir = await mkdtemp(join(tmpdir(), "ghostshift-"));
  const missionFile = join(tempDir, "missions.json");

  await writeFile(missionFile, "[]\n");

  return {
    service: new MissionService(
      new FileMissionStore(missionFile),
      new VendorMarket(vendors),
      createLedgerAdapter({ GHOSTSHIFT_LEDGER_MODE: "mock" })
    ),
    missionFile
  };
}

async function createMission(service: MissionService, input: MissionInput) {
  return service.createMission(input);
}

test("legacy single-category missions still recommend one vendor", async () => {
  const { service, missionFile } = await makeService([
    makeVendor({ id: "alpha", name: "Alpha", category: "infra", lane: "browser", trialPriceMotes: 100 }),
    makeVendor({
      id: "stale",
      name: "Stale",
      category: "infra",
      lane: "browser",
      trialPriceMotes: 80,
      qualityScore: 85,
      deliveryMode: "stale"
    }),
    makeVendor({
      id: "broken",
      name: "Broken",
      category: "infra",
      lane: "browser",
      trialPriceMotes: 70,
      qualityScore: 70,
      deliveryMode: "malformed"
    })
  ]);

  const mission = await createMission(service, {
    companyName: "Legacy Test",
    brief: "Keep the old single-lane procurement flow working.",
    preferredCategory: "infra",
    totalBudgetMotes: 500,
    categoryCaps: { infra: 500 }
  });

  const updated = await service.runMission(mission.id);
  const raw = JSON.parse(await readFile(missionFile, "utf8")) as Array<{ verdicts: Array<{ accepted: boolean }> }>;

  assert.equal(updated.status, "review");
  assert.equal(updated.recommendedVendorId, "alpha");
  assert.equal(updated.recommendedVendorIdsByLane.infra, "alpha");
  assert.equal(raw[0]?.verdicts.filter((entry) => entry.accepted).length, 1);
});

test("multi-lane missions reach review only when every required lane is filled", async () => {
  const { service } = await makeService([
    makeVendor({ id: "browser-good", name: "Browser Good", category: "infra", lane: "browser", trialPriceMotes: 90 }),
    makeVendor({
      id: "browser-stale",
      name: "Browser Stale",
      category: "infra",
      lane: "browser",
      trialPriceMotes: 75,
      qualityScore: 82,
      deliveryMode: "stale"
    }),
    makeVendor({ id: "auth-good", name: "Auth Good", category: "infra", lane: "auth", trialPriceMotes: 95 }),
    makeVendor({
      id: "auth-bad",
      name: "Auth Bad",
      category: "infra",
      lane: "auth",
      trialPriceMotes: 60,
      qualityScore: 74,
      deliveryMode: "malformed"
    })
  ]);

  const mission = await createMission(service, {
    companyName: "Stack Test",
    brief: "Source two launch-stack lanes and stop only when both are covered.",
    preferredCategory: "infra",
    totalBudgetMotes: 400,
    categoryCaps: { infra: 400 },
    stackTemplateId: "agent-app-launch",
    requiredLanes: ["browser", "auth"],
    mandate: {
      maxTrialSpendMotes: 100,
      laneCaps: { browser: 180, auth: 180 },
      requireFinalApproval: true
    }
  });

  const updated = await service.runMission(mission.id);

  assert.equal(updated.status, "review");
  assert.deepEqual(updated.recommendedVendorIdsByLane, {
    browser: "browser-good",
    auth: "auth-good"
  });
});

test("missions fail with blockers when a required lane has no acceptable vendor", async () => {
  const { service } = await makeService([
    makeVendor({
      id: "knowledge-stale",
      name: "Knowledge Stale",
      category: "infra",
      lane: "knowledge",
      trialPriceMotes: 70,
      qualityScore: 84,
      deliveryMode: "stale"
    }),
    makeVendor({
      id: "knowledge-bad",
      name: "Knowledge Bad",
      category: "infra",
      lane: "knowledge",
      trialPriceMotes: 65,
      qualityScore: 70,
      deliveryMode: "malformed"
    })
  ]);

  const mission = await createMission(service, {
    companyName: "Blocker Test",
    brief: "Fail if a launch lane cannot find a clean winner.",
    preferredCategory: "infra",
    totalBudgetMotes: 200,
    categoryCaps: { infra: 200 },
    requiredLanes: ["knowledge"],
    mandate: {
      maxTrialSpendMotes: 100,
      laneCaps: { knowledge: 150 },
      requireFinalApproval: true
    }
  });

  const updated = await service.runMission(mission.id);

  assert.equal(updated.status, "failed");
  assert.match(updated.blockers[0] ?? "", /knowledge vendor/);
});

test("trial spend caps reject overpriced vendors", async () => {
  const { service } = await makeService([
    makeVendor({ id: "expensive", name: "Expensive", category: "infra", lane: "browser", trialPriceMotes: 160 })
  ]);

  const mission = await createMission(service, {
    companyName: "Cap Test",
    brief: "Keep per-trial spend below the signed mandate.",
    preferredCategory: "infra",
    totalBudgetMotes: 300,
    categoryCaps: { infra: 300 },
    requiredLanes: ["browser"],
    mandate: {
      maxTrialSpendMotes: 150,
      laneCaps: { browser: 200 },
      requireFinalApproval: true
    }
  });

  await assert.rejects(() => service.buyTrial(mission.id, "expensive"), /Trial spend cap exceeded/);
});

test("final approval seals the full launch stack", async () => {
  const { service } = await makeService([
    makeVendor({ id: "browser-good", name: "Browser Good", category: "infra", lane: "browser", trialPriceMotes: 90 }),
    makeVendor({ id: "auth-good", name: "Auth Good", category: "infra", lane: "auth", trialPriceMotes: 95 })
  ]);

  const mission = await createMission(service, {
    companyName: "Approve Test",
    brief: "Approve the whole launch stack in one guarded final step.",
    preferredCategory: "infra",
    totalBudgetMotes: 400,
    categoryCaps: { infra: 400 },
    requiredLanes: ["browser", "auth"],
    mandate: {
      maxTrialSpendMotes: 100,
      laneCaps: { browser: 180, auth: 180 },
      requireFinalApproval: true
    }
  });

  await service.runMission(mission.id);
  const updated = await service.approveVendor(mission.id);

  assert.equal(updated.status, "completed");
  assert.equal(updated.approvedVendorIdsByLane.browser, "browser-good");
  assert.equal(updated.approvedVendorIdsByLane.auth, "auth-good");
  assert.equal(updated.receipts.length, 3);
});

test("mission reports include per-lane recommendations and spend totals", async () => {
  const { service } = await makeService([
    makeVendor({ id: "browser-good", name: "Browser Good", category: "infra", lane: "browser", trialPriceMotes: 90 }),
    makeVendor({ id: "auth-good", name: "Auth Good", category: "infra", lane: "auth", trialPriceMotes: 95 })
  ]);

  const mission = await createMission(service, {
    companyName: "Report Test",
    brief: "Return a structured stack report for another agent to consume.",
    preferredCategory: "infra",
    totalBudgetMotes: 400,
    categoryCaps: { infra: 400 },
    requiredLanes: ["browser", "auth"],
    mandate: {
      maxTrialSpendMotes: 100,
      laneCaps: { browser: 180, auth: 180 },
      requireFinalApproval: true
    }
  });

  await service.runMission(mission.id);
  const report = await service.getMissionReport(mission.id);

  assert.equal(report.lanes.length, 2);
  assert.equal(report.lanes[0]?.recommendedVendorId !== undefined, true);
  assert.equal(report.spendSummary.spentMotes > 0, true);
});
