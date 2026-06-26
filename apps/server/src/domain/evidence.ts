import { randomUUID } from "node:crypto";

import type { EvidenceCitation, EvidenceSnapshot, VendorEvidence } from "@ghostshift/shared";

import { vendorResearchSeeds, type VendorResearchSeed, type VendorSourceSeed } from "./vendor-catalog.js";
import type { EvidenceSnapshotStore } from "./store.js";

interface SourceFetchResult {
  label: string;
  url: string;
  fetchedAt: string;
  excerpt: string;
  text: string;
  ok: boolean;
}

export class MarketResearchService {
  constructor(
    private readonly store: EvidenceSnapshotStore,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async getLatestSnapshot(): Promise<EvidenceSnapshot> {
    const latest = await this.store.getLatest();
    if (latest) {
      return latest;
    }

    const seeded = this.buildSeededSnapshot();
    await this.store.save(seeded);
    return seeded;
  }

  async getSnapshot(snapshotId: string): Promise<EvidenceSnapshot> {
    const snapshot = await this.store.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Evidence snapshot not found: ${snapshotId}`);
    }
    return snapshot;
  }

  async refreshSnapshot(): Promise<EvidenceSnapshot> {
    const createdAt = new Date().toISOString();
    const vendors = await Promise.all(vendorResearchSeeds.map((seed) => this.buildLiveEvidence(seed, createdAt)));
    const snapshot: EvidenceSnapshot = {
      id: randomUUID(),
      mode: "live",
      createdAt,
      vendors
    };

    await this.store.save(snapshot);
    return snapshot;
  }

  async getVendorEvidence(vendorId: string, snapshotId?: string): Promise<VendorEvidence> {
    const snapshot = snapshotId ? await this.getSnapshot(snapshotId) : await this.getLatestSnapshot();
    const evidence = snapshot.vendors.find((candidate) => candidate.vendorId === vendorId);
    if (!evidence) {
      throw new Error(`Vendor evidence not found: ${vendorId}`);
    }
    return evidence;
  }

  private buildSeededSnapshot(): EvidenceSnapshot {
    const createdAt = new Date().toISOString();
    return {
      id: randomUUID(),
      mode: "seeded",
      createdAt,
      vendors: vendorResearchSeeds.map((seed) => this.buildSeededEvidence(seed, createdAt))
    };
  }

  private buildSeededEvidence(seed: VendorResearchSeed, createdAt: string): VendorEvidence {
    return this.makeVendorEvidence(
      seed,
      createdAt,
      seed.pricingNotes,
      seed.setupNotes,
      seed.trustNotes,
      seed.sources.map((source) => ({
        label: source.label,
        url: source.url,
        excerpt: this.sourceFallbackExcerpt(seed, source),
        fetchedAt: createdAt
      })),
      72
    );
  }

  private async buildLiveEvidence(seed: VendorResearchSeed, createdAt: string): Promise<VendorEvidence> {
    const results = await Promise.all(seed.sources.map((source) => this.fetchSource(seed, source)));
    const successful = results.filter((result) => result.ok);
    const citations = (successful.length > 0 ? successful : results.slice(0, 1)).map((result) => ({
      label: result.label,
      url: result.url,
      excerpt: result.excerpt,
      fetchedAt: result.fetchedAt
    }));

    return this.makeVendorEvidence(
      seed,
      createdAt,
      this.pickSummary(successful, seed.pricingNotes, ["pricing", "plan", "$", "free", "usage"]),
      this.pickSummary(successful, seed.setupNotes, ["api", "sdk", "setup", "integration", "session"]),
      this.pickSummary(successful, seed.trustNotes, ["security", "trust", "compliance", "soc", "gdpr"]),
      citations,
      this.scoreConfidence(successful.length, seed.sources.length)
    );
  }

  private makeVendorEvidence(
    seed: VendorResearchSeed,
    fetchedAt: string,
    pricingSummary: string,
    setupSummary: string,
    securitySummary: string,
    citations: EvidenceCitation[],
    confidenceScore: number
  ): VendorEvidence {
    return {
      vendorId: seed.vendor.id,
      vendorName: seed.vendor.name,
      lane: seed.vendor.lane,
      pricingSummary,
      setupSummary,
      securitySummary,
      featureClaims: [...seed.featureClaims],
      confidenceScore,
      trialPriceMotes: seed.vendor.trialPriceMotes,
      setupMinutes: seed.vendor.setupMinutes,
      securityGrade: seed.vendor.securityGrade,
      supportsMcp: seed.vendor.supportsMcp,
      supportsX402: seed.vendor.supportsX402,
      citations,
      fetchedAt
    };
  }

  private async fetchSource(seed: VendorResearchSeed, source: VendorSourceSeed): Promise<SourceFetchResult> {
    const fetchedAt = new Date().toISOString();

    try {
      const response = await this.fetchImpl(source.url, {
        headers: {
          accept: "text/html,application/xhtml+xml"
        }
      });
      const html = await response.text();
      const text = normaliseWhitespace(stripHtml(html));
      const title = extractTagContent(html, "title");
      const excerpt = this.pickExcerpt(text, source.keywords, this.sourceFallbackExcerpt(seed, source), title);

      return {
        label: source.label,
        url: source.url,
        fetchedAt,
        excerpt,
        text,
        ok: response.ok
      };
    } catch {
      return {
        label: source.label,
        url: source.url,
        fetchedAt,
        excerpt: this.sourceFallbackExcerpt(seed, source),
        text: "",
        ok: false
      };
    }
  }

  private pickSummary(results: SourceFetchResult[], fallback: string, keywords: string[]): string {
    const sentences = results.flatMap((result) => extractSentences(result.text));
    const match = sentences.find((sentence) =>
      keywords.some((keyword) => sentence.toLowerCase().includes(keyword.toLowerCase()))
    );
    return truncate(match ?? fallback, 220);
  }

  private pickExcerpt(text: string, keywords: string[], fallback: string, title?: string): string {
    const sentences = extractSentences(text);
    const match = sentences.find((sentence) =>
      keywords.some((keyword) => sentence.toLowerCase().includes(keyword.toLowerCase()))
    );
    return truncate(match ?? title ?? fallback, 220);
  }

  private sourceFallbackExcerpt(seed: VendorResearchSeed, source: VendorSourceSeed): string {
    const joined = `${seed.vendor.name} ${source.label}: ${seed.pricingNotes} ${seed.setupNotes} ${seed.trustNotes}`;
    return truncate(joined, 220);
  }

  private scoreConfidence(successes: number, total: number): number {
    if (successes === total) {
      return 95;
    }

    if (successes >= Math.max(2, Math.ceil(total / 2))) {
      return 85;
    }

    if (successes > 0) {
      return 70;
    }

    return 55;
  }
}

function extractTagContent(html: string, tagName: string): string | undefined {
  const match = html.match(new RegExp(`<${tagName}[^>]*>(.*?)</${tagName}>`, "i"));
  return match?.[1] ? normaliseWhitespace(stripHtml(match[1])) : undefined;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}
