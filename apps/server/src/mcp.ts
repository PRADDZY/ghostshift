import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import { defaultLaunchStackMandate, launchStackLanes, launchStackTemplateId } from "@ghostshift/shared";
import { createAppContext } from "./app.js";

const context = createAppContext();
const server = new McpServer({
  name: "ghostshift",
  version: "0.1.0"
});

function asStructuredContent<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

server.registerTool(
  "refresh_market_evidence",
  {
    description: "Refresh the curated public-market evidence snapshot from official vendor pages.",
    inputSchema: {}
  },
  async () => {
    const snapshot = await context.research.refreshSnapshot();
    return {
      content: [
        {
          type: "text",
          text: `Refreshed evidence snapshot ${snapshot.id} with ${snapshot.vendors.length} real vendors.`
        }
      ],
      structuredContent: { snapshot: asStructuredContent(snapshot) }
    };
  }
);

server.registerTool(
  "inspect_vendor_evidence",
  {
    description: "Inspect the latest or pinned evidence snapshot for a real vendor.",
    inputSchema: {
      vendorId: z.string().min(3),
      snapshotId: z.string().uuid().optional()
    }
  },
  async ({ vendorId, snapshotId }) => {
    const evidence = await context.research.getVendorEvidence(vendorId, snapshotId);
    return {
      content: [
        {
          type: "text",
          text: `${evidence.vendorName} has confidence ${evidence.confidenceScore} with ${evidence.citations.length} citation(s).`
        }
      ],
      structuredContent: { evidence: asStructuredContent(evidence) }
    };
  }
);

server.registerTool(
  "launch_company",
  {
    description: "Create a new GhostShift pop-up company with a treasury and mission brief.",
    inputSchema: {
      companyName: z.string().min(3),
      brief: z.string().min(12),
      preferredCategory: z.string().default("infra"),
      totalBudgetMotes: z.number().int().positive(),
      categoryCapMotes: z.number().int().positive(),
      evidenceSnapshotId: z.string().uuid().optional()
    }
  },
  async ({ categoryCapMotes, ...args }) => {
    const mission = await context.service.createMission({
      ...args,
      categoryCaps: {
        [args.preferredCategory]: categoryCapMotes
      }
    });

    return {
      content: [
        {
          type: "text",
          text: `Company ${mission.companyName} launched with mission ${mission.id}.`
        }
      ],
      structuredContent: { mission: asStructuredContent(mission) }
    };
  }
);

server.registerTool(
  "run_negotiation_round",
  {
    description: "Preview the negotiation arena output for a vendor inside a mission.",
    inputSchema: {
      missionId: z.string().uuid(),
      vendorId: z.string().min(3)
    }
  },
  async ({ missionId, vendorId }) => {
    const result = await context.service.previewNegotiation(missionId, vendorId);
    return {
      content: [
        {
          type: "text",
          text: `${vendorId} ended the negotiation with ${result.finalOffer.trialPriceMotes} motes and score ${result.finalOffer.score}.`
        }
      ],
      structuredContent: {
        rounds: result.rounds.map((round) => asStructuredContent(round)),
        finalOffer: asStructuredContent(result.finalOffer)
      }
    };
  }
);

server.registerTool(
  "list_candidate_vendors",
  {
    description: "List vendors the scout can short-list for a mission.",
    inputSchema: {
      missionId: z.string().uuid()
    }
  },
  async ({ missionId }) => {
    const vendors = await context.service.listCandidateVendors(missionId);
    return {
      content: [
        {
          type: "text",
          text: `Scout found ${vendors.length} candidate vendors.`
        }
      ],
      structuredContent: { vendors: vendors.map((vendor) => asStructuredContent(vendor)) }
    };
  }
);

server.registerTool(
  "buy_trial_service",
  {
    description: "Pay a vendor's trial request, fetch the delivery, and store the verifier's verdict.",
    inputSchema: {
      missionId: z.string().uuid(),
      vendorId: z.string().min(3)
    }
  },
  async ({ missionId, vendorId }) => {
    const result = await context.service.buyTrial(missionId, vendorId);
    return {
      content: [
        {
          type: "text",
          text: `Buyer ran a trial with ${vendorId}. Verdict: ${result.verdict.accepted ? "accepted" : "rejected"}.`
        }
      ],
      structuredContent: {
        mission: asStructuredContent(result.mission),
        delivery: asStructuredContent(result.delivery),
        verdict: asStructuredContent(result.verdict)
      }
    };
  }
);

server.registerTool(
  "verify_trial_delivery",
  {
    description: "Read the latest verification verdict for a vendor.",
    inputSchema: {
      missionId: z.string().uuid(),
      vendorId: z.string().min(3)
    }
  },
  async ({ missionId, vendorId }) => {
    const verdict = await context.service.getVendorVerdict(missionId, vendorId);
    return {
      content: [
        {
          type: "text",
          text: verdict.reason
        }
      ],
      structuredContent: { verdict: asStructuredContent(verdict) }
    };
  }
);

server.registerTool(
  "close_company",
  {
    description: "Approve the recommended vendor and dissolve the pop-up company.",
    inputSchema: {
      missionId: z.string().uuid(),
      vendorId: z.string().optional()
    }
  },
  async ({ missionId, vendorId }) => {
    const mission = await context.service.approveVendor(missionId, vendorId);
    const approvedCount = Object.keys(mission.approvedVendorIdsByLane).length;
    return {
      content: [
        {
          type: "text",
          text:
            approvedCount > 1
              ? `${mission.companyName} closed after approving ${approvedCount} launch lanes.`
              : `${mission.companyName} closed after approving ${mission.approvedVendorId}.`
        }
      ],
      structuredContent: { mission: asStructuredContent(mission) }
    };
  }
);

server.registerTool(
  "source_launch_stack",
  {
    description: "Source a launch-day infra stack under a guardrailed mandate and return a structured report.",
    inputSchema: {
      companyName: z.string().min(3),
      brief: z.string().min(12),
      totalBudgetMotes: z.number().int().positive(),
      evidenceSnapshotId: z.string().uuid().optional(),
      requiredLanes: z.array(z.string().min(2)).default([...launchStackLanes]),
      maxTrialSpendMotes: z.number().int().positive().default(defaultLaunchStackMandate.maxTrialSpendMotes),
      laneCaps: z.record(z.string(), z.number().int().positive()).optional()
    }
  },
  async ({ companyName, brief, totalBudgetMotes, evidenceSnapshotId, requiredLanes, maxTrialSpendMotes, laneCaps }) => {
    const mission = await context.service.createMission({
      companyName,
      brief,
      preferredCategory: "infra",
      totalBudgetMotes,
      categoryCaps: { infra: totalBudgetMotes },
      evidenceSnapshotId,
      stackTemplateId: launchStackTemplateId,
      requiredLanes,
      mandate: {
        maxTrialSpendMotes,
        laneCaps: laneCaps ?? Object.fromEntries(requiredLanes.map((lane) => [lane, defaultLaunchStackMandate.laneCaps[lane] ?? maxTrialSpendMotes])),
        requireFinalApproval: true
      }
    });

    await context.service.runMission(mission.id);
    const report = await context.service.getMissionReport(mission.id);

    return {
      content: [
        {
          type: "text",
          text:
            report.mission.status === "review"
              ? `${report.mission.companyName} sourced a launch stack across ${report.lanes.length} lanes.`
              : `${report.mission.companyName} stopped with ${report.blockers.length} blocker(s).`
        }
      ],
      structuredContent: { report: asStructuredContent(report) }
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GhostShift MCP server running on stdio.");
}

main().catch((error) => {
  console.error("GhostShift MCP failed:", error);
  process.exit(1);
});
