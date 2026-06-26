import type { Vendor } from "@ghostshift/shared";

export interface VendorSourceSeed {
  label: string;
  url: string;
  keywords: string[];
}

export interface VendorResearchSeed {
  vendor: Vendor;
  pricingNotes: string;
  setupNotes: string;
  trustNotes: string;
  featureClaims: string[];
  sources: VendorSourceSeed[];
}

function makeVendor(overrides: Partial<Vendor> & Pick<Vendor, "id" | "name" | "lane">): Vendor {
  return {
    category: "infra",
    tagline: "Curated real-world vendor in the GhostShift market.",
    payoutAddress: `casper-test:${overrides.id}`,
    trialPriceMotes: 1_000_000_000,
    qualityScore: 88,
    reliability: 0.9,
    setupMinutes: 18,
    securityGrade: "A",
    supportsMcp: false,
    supportsX402: false,
    deliveryMode: "fresh",
    sampleArtifactUrl: `https://${overrides.id}.ghostshift.local/trial.json`,
    ...overrides
  };
}

export const vendorResearchSeeds: VendorResearchSeed[] = [
  {
    vendor: makeVendor({
      id: "browserbase",
      name: "Browserbase",
      lane: "browser",
      tagline: "Browser automation infrastructure for AI agents.",
      trialPriceMotes: 1_450_000_000,
      qualityScore: 94,
      reliability: 0.98,
      setupMinutes: 14,
      securityGrade: "A",
      supportsMcp: true,
      supportsX402: false,
      sampleArtifactUrl: "https://www.browserbase.com"
    }),
    pricingNotes: "Usage-based browser session pricing with developer-first onboarding.",
    setupNotes: "Fast API onboarding for browser sessions and remote control.",
    trustNotes: "Public product, docs, and security pages provide the trust baseline.",
    featureClaims: ["browser sessions", "automation APIs", "agent workflows"],
    sources: [
      {
        label: "Homepage",
        url: "https://www.browserbase.com/",
        keywords: ["browser", "agent", "automation"]
      },
      {
        label: "Pricing",
        url: "https://www.browserbase.com/pricing",
        keywords: ["pricing", "usage", "$", "free"]
      },
      {
        label: "Docs",
        url: "https://docs.browserbase.com/",
        keywords: ["api", "session", "browser"]
      }
    ]
  },
  {
    vendor: makeVendor({
      id: "browserless",
      name: "Browserless",
      lane: "browser",
      tagline: "Hosted headless browser infrastructure.",
      trialPriceMotes: 1_200_000_000,
      qualityScore: 89,
      reliability: 0.91,
      setupMinutes: 16,
      securityGrade: "A",
      supportsMcp: false,
      supportsX402: false,
      sampleArtifactUrl: "https://www.browserless.io"
    }),
    pricingNotes: "Metered browser automation platform with managed browser infrastructure.",
    setupNotes: "API-first setup with practical automation examples.",
    trustNotes: "Operational and product documentation form the primary trust signal.",
    featureClaims: ["headless browsers", "automation APIs", "playwright support"],
    sources: [
      {
        label: "Homepage",
        url: "https://www.browserless.io/",
        keywords: ["automation", "playwright", "puppeteer"]
      },
      {
        label: "Pricing",
        url: "https://www.browserless.io/pricing",
        keywords: ["pricing", "plan", "$", "usage"]
      },
      {
        label: "Docs",
        url: "https://docs.browserless.io/",
        keywords: ["api", "browser", "session"]
      }
    ]
  },
  {
    vendor: makeVendor({
      id: "steel",
      name: "Steel",
      lane: "browser",
      tagline: "Browser infra built for AI-driven web tasks.",
      trialPriceMotes: 1_550_000_000,
      qualityScore: 91,
      reliability: 0.93,
      setupMinutes: 12,
      securityGrade: "A",
      supportsMcp: true,
      supportsX402: false,
      sampleArtifactUrl: "https://steel.dev"
    }),
    pricingNotes: "Developer-centric browser pricing positioned around AI workloads.",
    setupNotes: "Fast start for agent/browser integrations.",
    trustNotes: "Public docs and product pages provide the current trust baseline.",
    featureClaims: ["agent browsing", "browser sessions", "AI workflows"],
    sources: [
      {
        label: "Homepage",
        url: "https://steel.dev/",
        keywords: ["agent", "browser", "automation"]
      },
      {
        label: "Pricing",
        url: "https://steel.dev/pricing",
        keywords: ["pricing", "plan", "$", "usage"]
      },
      {
        label: "Docs",
        url: "https://docs.steel.dev/",
        keywords: ["api", "browser", "automation"]
      }
    ]
  },
  {
    vendor: makeVendor({
      id: "langfuse",
      name: "Langfuse",
      lane: "telemetry",
      tagline: "LLM observability and tracing for agent systems.",
      trialPriceMotes: 1_250_000_000,
      qualityScore: 93,
      reliability: 0.97,
      setupMinutes: 18,
      securityGrade: "A",
      supportsMcp: true,
      supportsX402: false,
      sampleArtifactUrl: "https://langfuse.com"
    }),
    pricingNotes: "Usage-oriented observability pricing tuned for AI application telemetry.",
    setupNotes: "Straightforward instrumentation path for traces and evaluations.",
    trustNotes: "Strong docs presence and public product positioning for LLM telemetry.",
    featureClaims: ["llm tracing", "observability", "evaluations"],
    sources: [
      {
        label: "Homepage",
        url: "https://langfuse.com/",
        keywords: ["tracing", "observability", "llm"]
      },
      {
        label: "Pricing",
        url: "https://langfuse.com/pricing",
        keywords: ["pricing", "usage", "$", "plan"]
      },
      {
        label: "Docs",
        url: "https://langfuse.com/docs",
        keywords: ["traces", "sdk", "observability"]
      }
    ]
  },
  {
    vendor: makeVendor({
      id: "helicone",
      name: "Helicone",
      lane: "telemetry",
      tagline: "Observability, logging, and monitoring for AI requests.",
      trialPriceMotes: 950_000_000,
      qualityScore: 86,
      reliability: 0.83,
      setupMinutes: 22,
      securityGrade: "B",
      supportsMcp: false,
      supportsX402: false,
      sampleArtifactUrl: "https://www.helicone.ai"
    }),
    pricingNotes: "Entry-friendly observability pricing for AI request tracking.",
    setupNotes: "Moderate integration effort with proxy and logging options.",
    trustNotes: "Public docs and hosted product material provide the primary trust signal.",
    featureClaims: ["request logging", "ai monitoring", "gateway insights"],
    sources: [
      {
        label: "Homepage",
        url: "https://www.helicone.ai/",
        keywords: ["observability", "logging", "ai"]
      },
      {
        label: "Pricing",
        url: "https://www.helicone.ai/pricing",
        keywords: ["pricing", "plan", "$", "usage"]
      },
      {
        label: "Docs",
        url: "https://docs.helicone.ai/",
        keywords: ["monitoring", "proxy", "requests"]
      }
    ]
  },
  {
    vendor: makeVendor({
      id: "sentry",
      name: "Sentry",
      lane: "telemetry",
      tagline: "Application monitoring with broad product telemetry coverage.",
      trialPriceMotes: 1_300_000_000,
      qualityScore: 84,
      reliability: 0.94,
      setupMinutes: 24,
      securityGrade: "A",
      supportsMcp: false,
      supportsX402: false,
      sampleArtifactUrl: "https://sentry.io"
    }),
    pricingNotes: "Broad monitoring pricing with free and paid plans.",
    setupNotes: "Well-documented, but wider platform scope means heavier setup than narrow AI tools.",
    trustNotes: "Mature public trust and documentation surface.",
    featureClaims: ["application monitoring", "tracing", "error telemetry"],
    sources: [
      {
        label: "Homepage",
        url: "https://sentry.io/",
        keywords: ["monitoring", "tracing", "errors"]
      },
      {
        label: "Pricing",
        url: "https://sentry.io/pricing/",
        keywords: ["pricing", "plan", "$", "free"]
      },
      {
        label: "Trust",
        url: "https://sentry.io/security/",
        keywords: ["security", "trust", "compliance"]
      }
    ]
  },
  {
    vendor: makeVendor({
      id: "clerk",
      name: "Clerk",
      lane: "auth",
      tagline: "Authentication and user management for modern apps.",
      trialPriceMotes: 1_300_000_000,
      qualityScore: 92,
      reliability: 0.96,
      setupMinutes: 14,
      securityGrade: "A",
      supportsMcp: false,
      supportsX402: false,
      sampleArtifactUrl: "https://clerk.com"
    }),
    pricingNotes: "Productized auth pricing with developer-friendly entry point.",
    setupNotes: "Fast integration path for modern web stacks.",
    trustNotes: "Strong public docs plus security/trust material.",
    featureClaims: ["auth", "sessions", "user management"],
    sources: [
      {
        label: "Homepage",
        url: "https://clerk.com/",
        keywords: ["auth", "user management", "sessions"]
      },
      {
        label: "Pricing",
        url: "https://clerk.com/pricing",
        keywords: ["pricing", "plan", "$", "free"]
      },
      {
        label: "Security",
        url: "https://clerk.com/security",
        keywords: ["security", "compliance", "trust"]
      }
    ]
  },
  {
    vendor: makeVendor({
      id: "stytch",
      name: "Stytch",
      lane: "auth",
      tagline: "API-first authentication and fraud controls.",
      trialPriceMotes: 1_250_000_000,
      qualityScore: 89,
      reliability: 0.91,
      setupMinutes: 17,
      securityGrade: "A",
      supportsMcp: false,
      supportsX402: false,
      sampleArtifactUrl: "https://stytch.com"
    }),
    pricingNotes: "API-first auth pricing with enterprise and developer positioning.",
    setupNotes: "Moderate setup with strong API docs.",
    trustNotes: "Security-forward public posture with auth-specific messaging.",
    featureClaims: ["api auth", "passkeys", "fraud controls"],
    sources: [
      {
        label: "Homepage",
        url: "https://stytch.com/",
        keywords: ["auth", "passkeys", "api"]
      },
      {
        label: "Pricing",
        url: "https://stytch.com/pricing",
        keywords: ["pricing", "plan", "$", "api"]
      },
      {
        label: "Security",
        url: "https://stytch.com/security",
        keywords: ["security", "trust", "compliance"]
      }
    ]
  },
  {
    vendor: makeVendor({
      id: "auth0",
      name: "Auth0",
      lane: "auth",
      tagline: "Enterprise-grade identity and access management.",
      trialPriceMotes: 1_450_000_000,
      qualityScore: 90,
      reliability: 0.95,
      setupMinutes: 22,
      securityGrade: "A+",
      supportsMcp: false,
      supportsX402: false,
      sampleArtifactUrl: "https://auth0.com"
    }),
    pricingNotes: "Enterprise-oriented identity pricing with a broad product footprint.",
    setupNotes: "Heavier integration path, but strong platform breadth.",
    trustNotes: "High-trust public security and enterprise identity posture.",
    featureClaims: ["enterprise identity", "authentication", "authorization"],
    sources: [
      {
        label: "Homepage",
        url: "https://auth0.com/",
        keywords: ["identity", "authentication", "authorization"]
      },
      {
        label: "Pricing",
        url: "https://auth0.com/pricing",
        keywords: ["pricing", "plan", "$", "enterprise"]
      },
      {
        label: "Security",
        url: "https://auth0.com/security",
        keywords: ["security", "trust", "compliance"]
      }
    ]
  },
  {
    vendor: makeVendor({
      id: "pinecone",
      name: "Pinecone",
      lane: "knowledge",
      tagline: "Managed vector database for retrieval and memory workloads.",
      trialPriceMotes: 1_600_000_000,
      qualityScore: 95,
      reliability: 0.98,
      setupMinutes: 15,
      securityGrade: "A",
      supportsMcp: true,
      supportsX402: false,
      sampleArtifactUrl: "https://www.pinecone.io"
    }),
    pricingNotes: "Managed vector infrastructure pricing with production positioning.",
    setupNotes: "Fast API start for retrieval and indexing workloads.",
    trustNotes: "Public trust posture and product docs support production-readiness claims.",
    featureClaims: ["vector database", "retrieval", "indexing"],
    sources: [
      {
        label: "Homepage",
        url: "https://www.pinecone.io/",
        keywords: ["vector", "retrieval", "index"]
      },
      {
        label: "Pricing",
        url: "https://www.pinecone.io/pricing/",
        keywords: ["pricing", "plan", "$", "usage"]
      },
      {
        label: "Docs",
        url: "https://docs.pinecone.io/",
        keywords: ["index", "vector", "api"]
      }
    ]
  },
  {
    vendor: makeVendor({
      id: "weaviate",
      name: "Weaviate",
      lane: "knowledge",
      tagline: "Open and managed vector search platform.",
      trialPriceMotes: 1_350_000_000,
      qualityScore: 90,
      reliability: 0.92,
      setupMinutes: 20,
      securityGrade: "A",
      supportsMcp: true,
      supportsX402: false,
      sampleArtifactUrl: "https://weaviate.io"
    }),
    pricingNotes: "Managed and open-source vector search options with flexible deployment.",
    setupNotes: "Moderate setup with strong retrieval-oriented docs.",
    trustNotes: "Public documentation and product posture support enterprise usage.",
    featureClaims: ["vector search", "retrieval", "hybrid search"],
    sources: [
      {
        label: "Homepage",
        url: "https://weaviate.io/",
        keywords: ["vector", "search", "retrieval"]
      },
      {
        label: "Pricing",
        url: "https://weaviate.io/pricing",
        keywords: ["pricing", "plan", "$", "cloud"]
      },
      {
        label: "Docs",
        url: "https://docs.weaviate.io/",
        keywords: ["vector", "search", "api"]
      }
    ]
  },
  {
    vendor: makeVendor({
      id: "supabase",
      name: "Supabase",
      lane: "knowledge",
      tagline: "Developer platform with database and vector capabilities.",
      trialPriceMotes: 1_250_000_000,
      qualityScore: 86,
      reliability: 0.9,
      setupMinutes: 24,
      securityGrade: "B",
      supportsMcp: false,
      supportsX402: false,
      sampleArtifactUrl: "https://supabase.com"
    }),
    pricingNotes: "Broad product pricing with developer-friendly entry plans.",
    setupNotes: "Wider product surface means more setup choices than narrow retrieval tools.",
    trustNotes: "Well-known public docs and security posture, but not retrieval-only positioning.",
    featureClaims: ["database", "vector", "developer platform"],
    sources: [
      {
        label: "Homepage",
        url: "https://supabase.com/",
        keywords: ["database", "vector", "postgres"]
      },
      {
        label: "Pricing",
        url: "https://supabase.com/pricing",
        keywords: ["pricing", "plan", "$", "free"]
      },
      {
        label: "Docs",
        url: "https://supabase.com/docs",
        keywords: ["vector", "postgres", "api"]
      }
    ]
  }
];

export const vendorCatalog: Vendor[] = vendorResearchSeeds.map((seed) => seed.vendor);
