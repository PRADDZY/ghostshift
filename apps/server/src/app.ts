import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { MissionInput } from "@ghostshift/shared";

import { createLedgerAdapter, type GhostShiftEnv } from "./domain/ledger.js";
import { MissionService } from "./domain/mission-service.js";
import { D1MissionStore, FileMissionStore, type D1DatabaseLike } from "./domain/store.js";
import { VendorMarket } from "./domain/vendors.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");

export interface AppContext {
  readonly ledgerMode: "mock" | "casper";
  readonly service: MissionService;
  readonly market: VendorMarket;
}

function hasD1Binding(value: unknown): value is D1DatabaseLike {
  return Boolean(value && typeof value === "object" && "prepare" in value);
}

function createCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...createCorsHeaders(),
      ...extraHeaders
    }
  });
}

async function parseJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export function createAppContext(env: GhostShiftEnv = process.env as GhostShiftEnv): AppContext {
  const missionPath = env.GHOSTSHIFT_MISSIONS_PATH ?? join(dataDir, "missions.json");
  const store = hasD1Binding(env.DB) ? new D1MissionStore(env.DB) : new FileMissionStore(missionPath);
  const market = new VendorMarket();
  const ledger = createLedgerAdapter(env);
  const service = new MissionService(store, market, ledger);

  return {
    ledgerMode: ledger.mode,
    market,
    service
  };
}

export async function handleAppRequest(request: Request, context: AppContext): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: createCorsHeaders()
    });
  }

  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true, ledgerMode: context.ledgerMode });
    }

    if (request.method === "GET" && url.pathname === "/api/vendors") {
      const category = url.searchParams.get("category") ?? undefined;
      return json(await context.market.list(category));
    }

    if (request.method === "POST" && url.pathname === "/api/missions") {
      const input = await parseJson<MissionInput>(request);
      return json(await context.service.createMission(input), 201);
    }

    if (request.method === "GET" && segments[0] === "api" && segments[1] === "missions" && segments[2]) {
      return json(await context.service.getMissionView(segments[2]));
    }

    if (
      request.method === "POST" &&
      segments[0] === "api" &&
      segments[1] === "missions" &&
      segments[2] &&
      segments[3] === "run"
    ) {
      return json(await context.service.runMission(segments[2]));
    }

    if (
      request.method === "POST" &&
      segments[0] === "api" &&
      segments[1] === "missions" &&
      segments[2] &&
      segments[3] === "approve"
    ) {
      const body = await parseJson<{ vendorId?: string }>(request);
      return json(await context.service.approveVendor(segments[2], body.vendorId));
    }

    if (
      request.method === "POST" &&
      segments[0] === "api" &&
      segments[1] === "vendors" &&
      segments[2] &&
      segments[3] === "request-trial"
    ) {
      return json(await context.market.requestTrial(segments[2]), 402);
    }

    if (
      request.method === "POST" &&
      segments[0] === "api" &&
      segments[1] === "vendors" &&
      segments[2] &&
      segments[3] === "fulfill-trial"
    ) {
      const body = await parseJson<{ paymentProof?: string }>(request);
      if (!body.paymentProof) {
        return json({ error: "payment proof required" }, 402);
      }
      return json(await context.market.fulfillTrial(segments[2], body.paymentProof));
    }

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        name: "ghostshift",
        version: "0.1.0",
        ledgerMode: context.ledgerMode
      });
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error." }, 400);
  }
}
