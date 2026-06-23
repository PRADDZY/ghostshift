import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createAppContext, handleAppRequest, type AppContext } from "./app.js";
import type { GhostShiftEnv } from "./domain/ledger.js";

async function readBody(request: IncomingMessage): Promise<Uint8Array | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function toHeaders(source: IncomingMessage["headers"]): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return headers;
}

async function toRequest(request: IncomingMessage): Promise<Request> {
  const origin = `http://${request.headers.host ?? "localhost"}`;
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readBody(request);

  return new Request(new URL(request.url ?? "/", origin), {
    method: request.method ?? "GET",
    headers: toHeaders(request.headers),
    body: body ? Buffer.from(body) : undefined
  });
}

async function sendResponse(response: ServerResponse, next: Response): Promise<void> {
  const headers: Record<string, string> = {};
  next.headers.forEach((value, key) => {
    headers[key] = value;
  });

  response.writeHead(next.status, headers);
  response.end(await next.arrayBuffer());
}

async function handleNodeRequest(request: IncomingMessage, response: ServerResponse, context: AppContext) {
  const next = await handleAppRequest(await toRequest(request), context);
  await sendResponse(response, next);
}

export function createHttpServer(env: GhostShiftEnv = process.env as GhostShiftEnv) {
  const context = createAppContext(env);

  return createServer(async (request, response) => {
    try {
      await handleNodeRequest(request, response, context);
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error." }));
    }
  });
}
