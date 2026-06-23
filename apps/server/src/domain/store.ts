import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Mission } from "@ghostshift/shared";

export class MissionStore {
  constructor(private readonly filePath: string) {}

  async all(): Promise<Mission[]> {
    await this.ensureFile();
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
    await writeFile(this.filePath, JSON.stringify(next, null, 2));
  }

  private async ensureFile(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      await readFile(this.filePath, "utf8");
    } catch {
      await writeFile(this.filePath, "[]\n");
    }
  }
}
