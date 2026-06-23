import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { MissionInput } from "@ghostshift/shared";

import { createLedgerAdapter } from "./domain/ledger";
import { MissionService } from "./domain/mission-service";
import { MissionStore } from "./domain/store";
import { VendorMarket } from "./domain/vendors";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");

export function createAppContext() {
  const missionPath = process.env.GHOSTSHIFT_MISSIONS_PATH ?? join(dataDir, "missions.json");
  const vendorPath = process.env.GHOSTSHIFT_VENDORS_PATH ?? join(dataDir, "vendors.json");
  const store = new MissionStore(missionPath);
  const market = new VendorMarket(vendorPath);
  const ledger = createLedgerAdapter(process.env);
  const service = new MissionService(store, market, ledger);

  return { ledger, market, service };
}

async function parseJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function sendJson(response: ServerResponse, statusCode: number, data: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

export function createHttpServer() {
  const context = createAppContext();

  return createServer(async (request, response) => {
    if (!request.url) {
      sendJson(response, 400, { error: "Missing URL." });
      return;
    }

    const url = new URL(request.url, "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean);

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, ledgerMode: context.ledger.mode });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/vendors") {
        const category = url.searchParams.get("category") ?? undefined;
        sendJson(response, 200, await context.market.list(category));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/missions") {
        const input = await parseJson<MissionInput>(request);
        sendJson(response, 201, await context.service.createMission(input));
        return;
      }

      if (request.method === "GET" && segments[0] === "api" && segments[1] === "missions" && segments[2]) {
        sendJson(response, 200, await context.service.getMissionView(segments[2]));
        return;
      }

      if (
        request.method === "POST" &&
        segments[0] === "api" &&
        segments[1] === "missions" &&
        segments[2] &&
        segments[3] === "run"
      ) {
        sendJson(response, 200, await context.service.runMission(segments[2]));
        return;
      }

      if (
        request.method === "POST" &&
        segments[0] === "api" &&
        segments[1] === "missions" &&
        segments[2] &&
        segments[3] === "approve"
      ) {
        const body = await parseJson<{ vendorId?: string }>(request);
        sendJson(response, 200, await context.service.approveVendor(segments[2], body.vendorId));
        return;
      }

      if (
        request.method === "POST" &&
        segments[0] === "api" &&
        segments[1] === "vendors" &&
        segments[2] &&
        segments[3] === "request-trial"
      ) {
        const requirement = await context.market.requestTrial(segments[2]);
        response.writeHead(402, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(requirement));
        return;
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
          sendJson(response, 402, { error: "payment proof required" });
          return;
        }
        sendJson(response, 200, await context.market.fulfillTrial(segments[2], body.paymentProof));
        return;
      }

      if (request.method === "GET" && url.pathname === "/") {
        const packageJson = JSON.parse(await readFile(join(here, "..", "package.json"), "utf8")) as {
          name: string;
          version: string;
        };
        sendJson(response, 200, {
          name: packageJson.name,
          version: packageJson.version,
          ledgerMode: context.ledger.mode
        });
        return;
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Unknown error." });
    }
  });
}
