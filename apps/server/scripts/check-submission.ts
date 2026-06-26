import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface WranglerDatabaseConfig {
  readonly database_id?: string;
  readonly preview_database_id?: string;
}

interface WranglerEnvConfig {
  readonly vars?: Record<string, string>;
  readonly d1_databases?: WranglerDatabaseConfig[];
}

interface WranglerConfig {
  readonly env?: Record<string, WranglerEnvConfig>;
}

interface SecretEntry {
  readonly name?: string;
}

interface HealthResponse {
  readonly ok: boolean;
  readonly ledgerMode?: string;
}

interface MissionReceipt {
  readonly txHash: string;
  readonly explorerUrl?: string;
  readonly mode?: string;
}

interface MissionResponse {
  readonly id: string;
  readonly status: string;
  readonly ledgerMode?: string;
  readonly receipts?: MissionReceipt[];
}

interface MissionReport {
  readonly mission: MissionResponse;
  readonly receipts: MissionReceipt[];
}

const packageDir = dirname(fileURLToPath(import.meta.url));
const workerDir = resolve(packageDir, "..");
const repoRoot = resolve(packageDir, "../../..");
const wranglerConfigPath = join(workerDir, "wrangler.jsonc");
const wasmPath = join(
  repoRoot,
  "contracts",
  "ghostshift-ledger",
  "target",
  "wasm32-unknown-unknown",
  "release",
  "ghostshift_ledger.wasm"
);
const zeroUuid = "00000000-0000-0000-0000-000000000000";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function logStep(message: string): void {
  console.log(`\n[submission] ${message}`);
}

function fail(message: string): never {
  throw new Error(message);
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) {
    return true;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed === zeroUuid || trimmed.includes("REPLACE_WITH");
}

function parseJsonOutput<T>(raw: string): T {
  const text = raw.trim();
  if (!text) {
    fail("Expected JSON output but command returned nothing.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const arrayStart = text.indexOf("[");
    const arrayEnd = text.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(text.slice(arrayStart, arrayEnd + 1)) as T;
    }

    const objectStart = text.indexOf("{");
    const objectEnd = text.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(text.slice(objectStart, objectEnd + 1)) as T;
    }

    fail(`Could not parse JSON output:\n${text}`);
  }
}

function runCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) {
    fail(`Command failed (${command} ${args.join(" ")}).\n${output}`);
  }

  return output;
}

async function requireFile(path: string, message: string): Promise<void> {
  try {
    await access(path, fsConstants.F_OK);
  } catch {
    fail(message);
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);

  if (!response.ok) {
    fail(`Request failed (${response.status}) for ${url}.\n${text}`);
  }

  return body;
}

async function main(): Promise<void> {
  logStep("Checking live Wrangler config placeholders.");
  const wrangler = JSON.parse(await readFile(wranglerConfigPath, "utf8")) as WranglerConfig;
  const live = wrangler.env?.live;

  if (!live) {
    fail("apps/server/wrangler.jsonc is missing env.live.");
  }

  if (live.vars?.GHOSTSHIFT_LEDGER_MODE !== "casper") {
    fail("env.live must set GHOSTSHIFT_LEDGER_MODE to casper.");
  }

  if (isPlaceholder(live.vars?.GHOSTSHIFT_LEDGER_CONTRACT_HASH)) {
    fail("Replace env.live.vars.GHOSTSHIFT_LEDGER_CONTRACT_HASH before running submission:check.");
  }

  const baseUrlValue = process.env.GHOSTSHIFT_PUBLIC_BASE_URL?.trim() || live.vars?.GHOSTSHIFT_PUBLIC_BASE_URL?.trim();
  if (isPlaceholder(baseUrlValue)) {
    fail("Set a real GHOSTSHIFT_PUBLIC_BASE_URL in env.live.vars or the current shell before running submission:check.");
  }

  const database = live.d1_databases?.[0];
  if (!database) {
    fail("env.live must define a D1 database binding.");
  }

  if (isPlaceholder(database.database_id) || isPlaceholder(database.preview_database_id)) {
    fail("Replace env.live D1 database_id and preview_database_id before running submission:check.");
  }

  logStep("Checking the compiled Casper contract artifact.");
  await requireFile(
    wasmPath,
    "Build the Casper contract first with pnpm casper:build-contract so the live checklist can verify the real Wasm artifact."
  );

  logStep("Checking Wrangler authentication.");
  runCommand(pnpmCommand, ["exec", "wrangler", "whoami", "--config", "wrangler.jsonc"], workerDir);

  logStep("Checking Wrangler live secret inventory.");
  const secretOutput = runCommand(
    pnpmCommand,
    ["exec", "wrangler", "secret", "list", "--env", "live", "--format", "json", "--config", "wrangler.jsonc"],
    workerDir
  );
  const secrets = parseJsonOutput<SecretEntry[]>(secretOutput);
  const hasPrivateKeySecret = secrets.some((entry) => entry.name === "GHOSTSHIFT_PRIVATE_KEY_PEM");
  if (!hasPrivateKeySecret) {
    fail("Wrangler live secrets do not include GHOSTSHIFT_PRIVATE_KEY_PEM.");
  }

  logStep("Running the repo verification suite.");
  runCommand(pnpmCommand, ["test"], repoRoot);
  runCommand(pnpmCommand, ["build"], repoRoot);

  const baseUrl = baseUrlValue!.replace(/\/$/, "");

  logStep("Checking the public Worker health endpoint.");
  const health = await fetchJson<HealthResponse>(`${baseUrl}/api/health`);
  if (!health.ok || health.ledgerMode !== "casper") {
    fail(`Expected ${baseUrl}/api/health to report ledgerMode=casper.`);
  }

  logStep("Running a single-lane live Casper smoke mission.");
  const mission = await fetchJson<MissionResponse>(`${baseUrl}/api/missions`, {
    method: "POST",
    body: JSON.stringify({
      companyName: "GhostShift Qualification Smoke",
      brief: "Anchor a single live browser-lane trial and the desk close on Casper testnet.",
      preferredCategory: "infra",
      totalBudgetMotes: 1_700_000_000,
      categoryCaps: {
        infra: 1_700_000_000
      },
      requiredLanes: ["browser"],
      mandate: {
        maxTrialSpendMotes: 1_700_000_000,
        laneCaps: {
          browser: 1_700_000_000
        },
        requireFinalApproval: true,
        allowedVendorsByLane: {
          browser: ["orbit-browser"]
        }
      }
    })
  });

  await fetchJson<MissionResponse>(`${baseUrl}/api/missions/${mission.id}/run`, {
    method: "POST",
    body: JSON.stringify({})
  });
  await fetchJson<MissionResponse>(`${baseUrl}/api/missions/${mission.id}/approve`, {
    method: "POST",
    body: JSON.stringify({})
  });

  const report = await fetchJson<MissionReport>(`${baseUrl}/api/missions/${mission.id}/report`);

  if (report.mission.status !== "completed") {
    fail(`Expected mission ${mission.id} to finish in completed status, got ${report.mission.status}.`);
  }

  if (report.mission.ledgerMode !== "casper") {
    fail(`Expected mission ${mission.id} to run in casper mode.`);
  }

  if (report.receipts.length < 2) {
    fail(`Expected at least 2 live receipts for mission ${mission.id}, got ${report.receipts.length}.`);
  }

  if (report.receipts.some((receipt) => receipt.mode !== "casper")) {
    fail(`Mission ${mission.id} returned a non-casper receipt.`);
  }

  const explorerUrls = report.receipts
    .map((receipt) => receipt.explorerUrl)
    .filter((value): value is string => Boolean(value));

  if (explorerUrls.length === 0) {
    fail(`Mission ${mission.id} did not return any explorer URLs.`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        missionId: mission.id,
        receiptCount: report.receipts.length,
        explorerUrls
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[submission] readiness check failed");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
