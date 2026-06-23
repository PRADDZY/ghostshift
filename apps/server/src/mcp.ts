import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

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
  "launch_company",
  {
    description: "Create a new GhostShift pop-up company with a treasury and mission brief.",
    inputSchema: {
      companyName: z.string().min(3),
      brief: z.string().min(12),
      preferredCategory: z.string().default("infra"),
      totalBudgetMotes: z.number().int().positive(),
      categoryCapMotes: z.number().int().positive()
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
    return {
      content: [
        {
          type: "text",
          text: `${mission.companyName} closed after approving ${mission.approvedVendorId}.`
        }
      ],
      structuredContent: { mission: asStructuredContent(mission) }
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
