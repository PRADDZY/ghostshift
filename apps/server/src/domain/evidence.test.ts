import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MarketResearchService } from "./evidence.js";
import { FileEvidenceSnapshotStore } from "./store.js";

test("evidence refresh builds a live snapshot with extracted pricing and security snippets", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "ghostshift-evidence-"));
  const evidenceFile = join(tempDir, "evidence.json");
  await writeFile(evidenceFile, "[]\n");

  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    return new Response(
      `<html><head><title>${url}</title></head><body>
        Pricing starts free and scales with usage.
        SOC 2 security posture with API-first setup.
        Browser automation sessions for agent workflows.
      </body></html>`,
      { status: 200 }
    );
  };

  const service = new MarketResearchService(new FileEvidenceSnapshotStore(evidenceFile), fetchImpl);
  const snapshot = await service.refreshSnapshot();
  const browserVendor = snapshot.vendors.find((entry) => entry.vendorId === "browserbase");

  assert.equal(snapshot.mode, "live");
  assert.equal(snapshot.vendors.length > 0, true);
  assert.equal(browserVendor?.pricingSummary.toLowerCase().includes("pricing"), true);
  assert.equal(browserVendor?.securitySummary.toLowerCase().includes("soc 2"), true);
  assert.equal((browserVendor?.citations.length ?? 0) > 0, true);
});
