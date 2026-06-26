import { dirname } from "node:path";

import type { EvidenceSnapshot, Mission } from "@ghostshift/shared";

export interface MissionStore {
  all(): Promise<Mission[]>;
  get(missionId: string): Promise<Mission | undefined>;
  save(nextMission: Mission): Promise<void>;
}

export interface EvidenceSnapshotStore {
  all(): Promise<EvidenceSnapshot[]>;
  get(snapshotId: string): Promise<EvidenceSnapshot | undefined>;
  getLatest(): Promise<EvidenceSnapshot | undefined>;
  save(snapshot: EvidenceSnapshot): Promise<void>;
}

async function loadFs() {
  return import("node:fs/promises");
}

async function ensureJsonFile(filePath: string): Promise<void> {
  const { mkdir, readFile, writeFile } = await loadFs();
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await readFile(filePath, "utf8");
  } catch {
    await writeFile(filePath, "[]\n");
  }
}

export class FileMissionStore implements MissionStore {
  constructor(private readonly filePath: string) {}

  async all(): Promise<Mission[]> {
    await this.ensureFile();
    const { readFile } = await loadFs();
    const raw = await readFile(this.filePath, "utf8");
    return JSON.parse(raw) as Mission[];
  }

  async get(missionId: string): Promise<Mission | undefined> {
    const missions = await this.all();
    return missions.find((mission) => mission.id === missionId);
  }

  async save(nextMission: Mission): Promise<void> {
    const missions = await this.all();
    const next = missions.filter((mission) => mission.id !== nextMission.id);
    next.push(nextMission);
    next.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const { writeFile } = await loadFs();
    await writeFile(this.filePath, JSON.stringify(next, null, 2));
  }

  private async ensureFile(): Promise<void> {
    await ensureJsonFile(this.filePath);
  }
}

export class FileEvidenceSnapshotStore implements EvidenceSnapshotStore {
  constructor(private readonly filePath: string) {}

  async all(): Promise<EvidenceSnapshot[]> {
    await this.ensureFile();
    const { readFile } = await loadFs();
    const raw = await readFile(this.filePath, "utf8");
    return JSON.parse(raw) as EvidenceSnapshot[];
  }

  async get(snapshotId: string): Promise<EvidenceSnapshot | undefined> {
    const snapshots = await this.all();
    return snapshots.find((snapshot) => snapshot.id === snapshotId);
  }

  async getLatest(): Promise<EvidenceSnapshot | undefined> {
    const snapshots = await this.all();
    return snapshots.at(-1);
  }

  async save(snapshot: EvidenceSnapshot): Promise<void> {
    const snapshots = await this.all();
    const next = snapshots.filter((candidate) => candidate.id !== snapshot.id);
    next.push(snapshot);
    next.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const { writeFile } = await loadFs();
    await writeFile(this.filePath, JSON.stringify(next, null, 2));
  }

  private async ensureFile(): Promise<void> {
    await ensureJsonFile(this.filePath);
  }
}

interface D1ResultRow {
  data: string;
}

interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export class D1MissionStore implements MissionStore {
  private schemaReady: Promise<void> | undefined;

  constructor(private readonly db: D1DatabaseLike) {}

  async all(): Promise<Mission[]> {
    await this.ensureSchema();
    const result = await this.db.prepare("SELECT data FROM missions ORDER BY created_at ASC").all<D1ResultRow>();
    return result.results.map((row) => JSON.parse(row.data) as Mission);
  }

  async get(missionId: string): Promise<Mission | undefined> {
    await this.ensureSchema();
    const row = await this.db
      .prepare("SELECT data FROM missions WHERE id = ?1")
      .bind(missionId)
      .first<D1ResultRow>();

    return row ? (JSON.parse(row.data) as Mission) : undefined;
  }

  async save(nextMission: Mission): Promise<void> {
    await this.ensureSchema();
    await this.db
      .prepare(
        "INSERT OR REPLACE INTO missions (id, data, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)"
      )
      .bind(nextMission.id, JSON.stringify(nextMission), nextMission.createdAt, nextMission.updatedAt)
      .run();
  }

  private async ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.db
        .prepare(
          "CREATE TABLE IF NOT EXISTS missions (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        .run()
        .then(() => undefined);
    }

    await this.schemaReady;
  }
}

export class D1EvidenceSnapshotStore implements EvidenceSnapshotStore {
  private schemaReady: Promise<void> | undefined;

  constructor(private readonly db: D1DatabaseLike) {}

  async all(): Promise<EvidenceSnapshot[]> {
    await this.ensureSchema();
    const result = await this.db
      .prepare("SELECT data FROM evidence_snapshots ORDER BY created_at ASC")
      .all<D1ResultRow>();
    return result.results.map((row) => JSON.parse(row.data) as EvidenceSnapshot);
  }

  async get(snapshotId: string): Promise<EvidenceSnapshot | undefined> {
    await this.ensureSchema();
    const row = await this.db
      .prepare("SELECT data FROM evidence_snapshots WHERE id = ?1")
      .bind(snapshotId)
      .first<D1ResultRow>();

    return row ? (JSON.parse(row.data) as EvidenceSnapshot) : undefined;
  }

  async getLatest(): Promise<EvidenceSnapshot | undefined> {
    await this.ensureSchema();
    const row = await this.db
      .prepare("SELECT data FROM evidence_snapshots ORDER BY created_at DESC LIMIT 1")
      .first<D1ResultRow>();

    return row ? (JSON.parse(row.data) as EvidenceSnapshot) : undefined;
  }

  async save(snapshot: EvidenceSnapshot): Promise<void> {
    await this.ensureSchema();
    await this.db
      .prepare(
        "INSERT OR REPLACE INTO evidence_snapshots (id, data, created_at, mode) VALUES (?1, ?2, ?3, ?4)"
      )
      .bind(snapshot.id, JSON.stringify(snapshot), snapshot.createdAt, snapshot.mode)
      .run();
  }

  private async ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.db
        .prepare(
          "CREATE TABLE IF NOT EXISTS evidence_snapshots (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, mode TEXT NOT NULL)"
        )
        .run()
        .then(() => undefined);
    }

    await this.schemaReady;
  }
}
