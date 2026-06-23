import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLedgerAdapter } from "./ledger";
import { MissionService } from "./mission-service";
import { MissionStore } from "./store";
import { VendorMarket } from "./vendors";

async function makeService() {
  const tempDir = await mkdtemp(join(tmpdir(), "ghostshift-"));
  const missionFile = join(tempDir, "missions.json");
  const vendorFile = join(tempDir, "vendors.json");

  await writeFile(missionFile, "[]\n");
  await writeFile(
    vendorFile,
    JSON.stringify(
      [
        {
          id: "alpha",
          name: "Alpha",
          category: "infra",
          tagline: "Fresh vendor",
          payoutAddress: "casper-test:alpha",
          trialPriceMotes: 100,
          qualityScore: 92,
          reliability: 0.9,
          deliveryMode: "fresh",
          sampleArtifactUrl: "https://alpha.example/trial.json"
        },
        {
          id: "stale",
          name: "Stale",
          category: "infra",
          tagline: "Stale vendor",
          payoutAddress: "casper-test:stale",
          trialPriceMotes: 80,
          qualityScore: 85,
          reliability: 0.8,
          deliveryMode: "stale",
          sampleArtifactUrl: "https://stale.example/trial.json"
        },
        {
          id: "broken",
          name: "Broken",
          category: "infra",
          tagline: "Broken vendor",
          payoutAddress: "casper-test:broken",
          trialPriceMotes: 70,
          qualityScore: 70,
          reliability: 0.5,
          deliveryMode: "malformed",
          sampleArtifactUrl: "https://broken.example/trial.json"
        }
      ],
      null,
      2
    )
  );

  return {
    service: new MissionService(
      new MissionStore(missionFile),
      new VendorMarket(vendorFile),
      createLedgerAdapter({ GHOSTSHIFT_LEDGER_MODE: "mock" })
    ),
    missionFile
  };
}

test("budget caps prevent overspend", async () => {
  const { service } = await makeService();
  const mission = await service.createMission({
    companyName: "Cap Test",
    brief: "Test budget caps",
    preferredCategory: "infra",
    totalBudgetMotes: 200,
    categoryCaps: { infra: 90 }
  });

  const updated = await service.runMission(mission.id);
  assert.equal(updated.status, "failed");
  assert.match(updated.events.at(-1)?.message ?? "", /No vendor met the company standards/);
});

test("mission cannot be approved before review", async () => {
  const { service } = await makeService();
  const mission = await service.createMission({
    companyName: "State Test",
    brief: "Test state guard",
    preferredCategory: "infra",
    totalBudgetMotes: 500,
    categoryCaps: { infra: 500 }
  });

  await assert.rejects(() => service.approveVendor(mission.id), /not ready for approval/);
});

test("verifier rejects stale and malformed trials but accepts one good vendor", async () => {
  const { service, missionFile } = await makeService();
  const mission = await service.createMission({
    companyName: "Verifier Test",
    brief: "Test verification path",
    preferredCategory: "infra",
    totalBudgetMotes: 500,
    categoryCaps: { infra: 500 }
  });

  const updated = await service.runMission(mission.id);
  const raw = JSON.parse(await readFile(missionFile, "utf8")) as Array<{ verdicts: Array<{ accepted: boolean }> }>;

  assert.equal(updated.status, "review");
  assert.equal(updated.recommendedVendorId, "alpha");
  assert.equal(raw[0]?.verdicts.filter((entry) => entry.accepted).length, 1);
});
