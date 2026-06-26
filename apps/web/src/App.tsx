import { startTransition, useDeferredValue, useEffect, useEffectEvent, useState } from "react";

import {
  defaultLaunchStackMandate,
  isTerminalStatus,
  launchStackLanes,
  launchStackTemplateId,
  type EvidenceSnapshot,
  type Mission,
  type MissionInput,
  type MissionNegotiationView,
  type MissionReport,
  type MissionView,
  type NegotiatedOffer,
  type Vendor
} from "@ghostshift/shared";

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function createInitialInput(): MissionInput {
  return {
    companyName: "GhostShift / Mission Atlas",
    brief:
      "Refresh public-market evidence, negotiate lane by lane, and return an approval-ready launch stack with Casper receipts.",
    preferredCategory: "infra",
    totalBudgetMotes: 6_500_000_000,
    categoryCaps: { infra: 6_500_000_000 },
    stackTemplateId: launchStackTemplateId,
    requiredLanes: [...launchStackLanes],
    mandate: {
      ...defaultLaunchStackMandate,
      laneCaps: { ...defaultLaunchStackMandate.laneCaps }
    }
  };
}

function formatMotes(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatLabel(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function shortId(value?: string): string {
  if (!value) {
    return "pending";
  }

  return value.length <= 12 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function verdictFor(vendor: Vendor, mission?: Mission | null) {
  return mission?.verdicts.find((entry) => entry.vendorId === vendor.id);
}

function spendFor(vendor: Vendor, mission?: Mission | null) {
  return mission?.spends.find((entry) => entry.vendorId === vendor.id);
}

function evidenceFor(snapshot: EvidenceSnapshot | null, vendorId: string) {
  return snapshot?.vendors.find((entry) => entry.vendorId === vendorId);
}

function negotiatedOfferFor(
  vendorId: string,
  negotiation?: MissionNegotiationView | null,
  mission?: Mission | null
): NegotiatedOffer | undefined {
  const rounds = negotiation?.rounds ?? mission?.negotiationRounds ?? [];
  return [...rounds].reverse().find((entry) => entry.vendorId === vendorId)?.offer;
}

function lanesFor(vendors: Vendor[], mission: Mission | null, input: MissionInput): string[] {
  if (mission?.requiredLanes.length) {
    return mission.requiredLanes;
  }

  if (input.requiredLanes?.length) {
    return input.requiredLanes;
  }

  return [...new Set(vendors.map((vendor) => vendor.lane))];
}

function vendorTone(vendor: Vendor, mission?: Mission | null): "winner" | "good" | "bad" | "pending" {
  const approved = mission?.approvedVendorIdsByLane?.[vendor.lane] === vendor.id;
  if (approved) {
    return "winner";
  }

  const recommended = mission?.recommendedVendorIdsByLane?.[vendor.lane] === vendor.id;
  if (recommended) {
    return "good";
  }

  const verdict = verdictFor(vendor, mission);
  if (!verdict) {
    return "pending";
  }

  return verdict.accepted ? "good" : "bad";
}

export function App() {
  const [input, setInput] = useState<MissionInput>(createInitialInput);
  const [catalog, setCatalog] = useState<Vendor[]>([]);
  const [view, setView] = useState<MissionView | null>(null);
  const [report, setReport] = useState<MissionReport | null>(null);
  const [negotiation, setNegotiation] = useState<MissionNegotiationView | null>(null);
  const [marketSnapshot, setMarketSnapshot] = useState<EvidenceSnapshot | null>(null);
  const [pinnedSnapshot, setPinnedSnapshot] = useState<EvidenceSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [marketLoading, setMarketLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, init);
    const body = (await response.json()) as T | { error: string };
    if (!response.ok) {
      throw new Error("error" in body ? body.error : "Request failed.");
    }
    return body as T;
  }

  const syncMissionBundle = useEffectEvent(async (missionId: string) => {
    const nextView = await request<MissionView>(`/api/missions/${missionId}`);
    const [nextReport, nextNegotiation, nextSnapshot] = await Promise.all([
      request<MissionReport>(`/api/missions/${missionId}/report`),
      request<MissionNegotiationView>(`/api/missions/${missionId}/negotiation`),
      nextView.mission.evidenceSnapshotId
        ? request<EvidenceSnapshot>(`/api/evidence/${nextView.mission.evidenceSnapshotId}`)
        : request<EvidenceSnapshot>("/api/evidence/latest")
    ]);

    startTransition(() => {
      setCatalog(nextView.vendors);
      setView(nextView);
      setReport(nextReport);
      setNegotiation(nextNegotiation);
      setPinnedSnapshot(nextSnapshot);
    });
  });

  const syncMarketContext = useEffectEvent(async (mode: "latest" | "refresh" = "latest") => {
    const [snapshot, vendors] = await Promise.all([
      mode === "refresh"
        ? request<EvidenceSnapshot>("/api/evidence/refresh", { method: "POST" })
        : request<EvidenceSnapshot>("/api/evidence/latest"),
      catalog.length > 0 ? Promise.resolve(catalog) : request<Vendor[]>("/api/vendors")
    ]);

    startTransition(() => {
      setCatalog(vendors);
      setMarketSnapshot(snapshot);
      setInput((current) => ({
        ...current,
        evidenceSnapshotId: snapshot.id
      }));
    });

    return snapshot;
  });

  useEffect(() => {
    void (async () => {
      setMarketLoading(true);
      setError(null);

      try {
        await syncMarketContext();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load market evidence.");
      } finally {
        setMarketLoading(false);
      }
    })();
  }, []);

  const mission = view?.mission ?? null;
  const vendors = view?.vendors ?? catalog;
  const deferredRounds = useDeferredValue(negotiation?.rounds ?? mission?.negotiationRounds ?? []);
  const deferredEvents = useDeferredValue(mission?.events ?? []);

  useEffect(() => {
    if (!mission || isTerminalStatus(mission.status)) {
      return;
    }

    const handle = window.setInterval(() => {
      void syncMissionBundle(mission.id).catch(() => undefined);
    }, 4000);

    return () => window.clearInterval(handle);
  }, [mission?.id, mission?.status]);

  async function createMission() {
    setLoading(true);
    setError(null);

    try {
      const missionInput: MissionInput = {
        ...input,
        evidenceSnapshotId: input.evidenceSnapshotId ?? marketSnapshot?.id
      };
      const nextMission = await request<Mission>("/api/missions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(missionInput)
      });
      await syncMissionBundle(nextMission.id);
      setStatusNote(`Desk pinned to evidence snapshot ${shortId(nextMission.evidenceSnapshotId)}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open company.");
    } finally {
      setLoading(false);
    }
  }

  async function runMission() {
    if (!mission) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await request<Mission>(`/api/missions/${mission.id}/run`, { method: "POST" });
      await syncMissionBundle(mission.id);
      setStatusNote("Negotiation arena finished. Review the lane-by-lane counter-offers below.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not run mission.");
    } finally {
      setLoading(false);
    }
  }

  async function approveMission(vendorId?: string) {
    if (!mission) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await request<Mission>(`/api/missions/${mission.id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vendorId })
      });
      await syncMissionBundle(mission.id);
      setStatusNote("Launch stack approved and the desk is now sealed on Casper.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not close company.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshMission() {
    if (!mission) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await syncMissionBundle(mission.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh mission.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshEvidence() {
    setMarketLoading(true);
    setError(null);

    try {
      const nextSnapshot = await syncMarketContext("refresh");
      setStatusNote(
        mission && mission.evidenceSnapshotId && mission.evidenceSnapshotId !== nextSnapshot.id
          ? `Live market evidence moved to ${shortId(nextSnapshot.id)}. Open another desk to use it; this mission stays pinned to ${shortId(mission.evidenceSnapshotId)}.`
          : `Live market evidence refreshed to ${shortId(nextSnapshot.id)}.`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh market evidence.");
    } finally {
      setMarketLoading(false);
    }
  }

  const activeLanes = lanesFor(vendors, mission, input);
  const mandate = mission?.mandate ?? input.mandate ?? defaultLaunchStackMandate;
  const selectedCount = Object.keys(mission?.recommendedVendorIdsByLane ?? {}).length;
  const approvedCount = Object.keys(mission?.approvedVendorIdsByLane ?? {}).length;
  const currentSnapshot = pinnedSnapshot ?? marketSnapshot;
  const spentMotes = report?.spendSummary.spentMotes ?? (mission ? mission.totalBudgetMotes - mission.treasuryRemainingMotes : 0);
  const pinnedDifferent =
    Boolean(marketSnapshot && pinnedSnapshot) && marketSnapshot?.id !== pinnedSnapshot?.id;
  const liveReceipts = mission?.receipts.filter((receipt) => receipt.mode === "casper") ?? [];
  const isLegacyApproval = (mission?.requiredLanes.length ?? input.requiredLanes?.length ?? 0) === 0;

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Evidence-backed agent procurement</p>
          <h1>GhostShift</h1>
          <p className="lede">
            A temporary buying desk for AI teams that does more than recommend tools. GhostShift refreshes a public
            evidence pack, negotiates lane by lane, pays for trials inside a signed mandate, and closes the desk with
            Casper receipts.
          </p>

          <div className="hero-stat-row">
            <article className="hero-stat">
              <span>Market mode</span>
              <strong>{currentSnapshot?.mode === "live" ? "Live crawl" : currentSnapshot ? "Seeded pack" : "Loading"}</strong>
              <p>{currentSnapshot ? `${currentSnapshot.vendors.length} vendor evidence files ready.` : "Fetching official pages."}</p>
            </article>
            <article className="hero-stat">
              <span>Required lanes</span>
              <strong>{activeLanes.length}</strong>
              <p>{activeLanes.map((lane) => formatLabel(lane)).join(", ")}</p>
            </article>
            <article className="hero-stat">
              <span>Ledger mode</span>
              <strong>{mission?.ledgerMode ?? "mock"}</strong>
              <p>{mission?.ledgerMode === "casper" ? "Receipts are live on Casper." : "Local desk still in mock mode."}</p>
            </article>
          </div>

          <div className="status-banner">
            <div>
              <span className="status-flag">{mission ? `Desk ${mission.status}` : "Standby"}</span>
              <strong>{mission ? mission.companyName : "Open a desk to pin the current market snapshot."}</strong>
            </div>
            <p>
              {statusNote ??
                "Refresh the evidence pack, launch a desk with that snapshot, then run the negotiation arena to see where each lane lands."}
            </p>
          </div>
        </div>

        <div className="hero-card">
          <label>
            Company name
            <input
              value={input.companyName}
              onChange={(event) => setInput((current) => ({ ...current, companyName: event.target.value }))}
            />
          </label>

          <label>
            Procurement brief
            <textarea
              rows={4}
              value={input.brief}
              onChange={(event) => setInput((current) => ({ ...current, brief: event.target.value }))}
            />
          </label>

          <div className="cap-grid">
            <label>
              Total treasury
              <input
                type="number"
                value={input.totalBudgetMotes}
                onChange={(event) => {
                  const totalBudgetMotes = Number(event.target.value);
                  setInput((current) => ({
                    ...current,
                    totalBudgetMotes,
                    categoryCaps: { infra: totalBudgetMotes }
                  }));
                }}
              />
            </label>

            <label>
              Max per trial
              <input
                type="number"
                value={input.mandate?.maxTrialSpendMotes ?? defaultLaunchStackMandate.maxTrialSpendMotes}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    mandate: {
                      ...(current.mandate ?? defaultLaunchStackMandate),
                      laneCaps: { ...(current.mandate?.laneCaps ?? defaultLaunchStackMandate.laneCaps) },
                      maxTrialSpendMotes: Number(event.target.value)
                    }
                  }))
                }
              />
            </label>
          </div>

          <div className="lane-cap-grid">
            {activeLanes.map((lane) => (
              <label key={lane}>
                {formatLabel(lane)} cap
                <input
                  type="number"
                  value={input.mandate?.laneCaps?.[lane] ?? defaultLaunchStackMandate.laneCaps[lane] ?? 0}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      mandate: {
                        ...(current.mandate ?? defaultLaunchStackMandate),
                        maxTrialSpendMotes:
                          current.mandate?.maxTrialSpendMotes ?? defaultLaunchStackMandate.maxTrialSpendMotes,
                        laneCaps: {
                          ...(current.mandate?.laneCaps ?? defaultLaunchStackMandate.laneCaps),
                          [lane]: Number(event.target.value)
                        }
                      }
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <div className="snapshot-card">
            <div className="snapshot-top">
              <span>Market evidence pack</span>
              <strong>{marketSnapshot ? shortId(marketSnapshot.id) : "loading"}</strong>
            </div>
            <p>
              {marketSnapshot
                ? `${marketSnapshot.mode === "live" ? "Live" : "Seeded"} snapshot from ${formatTimestamp(marketSnapshot.createdAt)}.`
                : "Loading the current vendor evidence pack."}
            </p>
            <div className="snapshot-grid">
              <div>
                <span>Vendors</span>
                <strong>{marketSnapshot?.vendors.length ?? 0}</strong>
              </div>
              <div>
                <span>Pinned desk</span>
                <strong>{mission?.evidenceSnapshotId ? shortId(mission.evidenceSnapshotId) : "none"}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{pinnedDifferent ? "newer market live" : "in sync"}</strong>
              </div>
            </div>
          </div>

          <div className="action-row">
            <button disabled={loading || marketLoading} onClick={createMission}>
              {mission ? "Open another desk" : "Launch buying desk"}
            </button>
            <button className="secondary" disabled={marketLoading || loading} onClick={refreshEvidence}>
              {marketLoading ? "Refreshing..." : "Refresh evidence pack"}
            </button>
          </div>

          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>

      <section className="overview-grid">
        <article className="metric-card">
          <span>Desk status</span>
          <strong>{mission?.status ?? "draft"}</strong>
          <p>{mission ? mission.brief : "No active desk yet. The market evidence pack is ready first."}</p>
        </article>

        <article className="metric-card">
          <span>Coverage</span>
          <strong>
            {mission?.status === "completed" ? approvedCount : selectedCount}/{activeLanes.length}
          </strong>
          <p>
            {mission?.status === "completed"
              ? "Approved lanes in the final launch stack."
              : "Lanes that already have a negotiated winner."}
          </p>
        </article>

        <article className="metric-card">
          <span>Spend</span>
          <strong>{formatMotes(spentMotes)}</strong>
          <p>{mission ? `${formatMotes(mission.treasuryRemainingMotes)} motes still unspent.` : "No trial spend yet."}</p>
        </article>

        <article className="metric-card">
          <span>Blockers</span>
          <strong>{mission?.blockers.length ?? 0}</strong>
          <p>{mission?.blockers.join(" ") || "No blockers. Every required lane can continue sourcing."}</p>
        </article>

        <article className="metric-card">
          <span>Casper receipts</span>
          <strong>{liveReceipts.length}</strong>
          <p>{mission ? `${mission.receipts.length} total ledger writes recorded.` : "Receipt rail starts after the first paid trial."}</p>
        </article>
      </section>

      <section className="control-strip">
        <button disabled={!mission || loading || mission.status === "running"} onClick={runMission}>
          {loading && mission?.status === "running" ? "Running..." : "Run negotiation arena"}
        </button>
        <button disabled={!mission || mission.status !== "review" || loading} onClick={() => approveMission()}>
          Approve launch stack
        </button>
        <button className="secondary" disabled={!mission || loading} onClick={refreshMission}>
          Refresh desk
        </button>
      </section>

      <section className="board">
        <div className="panel">
          <div className="panel-head">
            <span>Proof pack</span>
            <strong>{currentSnapshot ? shortId(currentSnapshot.id) : "loading"}</strong>
          </div>

          <div className="proof-grid">
            <article className="proof-card">
              <span>Snapshot</span>
              <strong>{currentSnapshot?.mode === "live" ? "Live evidence" : currentSnapshot ? "Seeded evidence" : "Pending"}</strong>
              <p>{currentSnapshot ? `Built ${formatTimestamp(currentSnapshot.createdAt)}.` : "Waiting for the market pack."}</p>
            </article>

            <article className="proof-card">
              <span>Pinning</span>
              <strong>{mission?.evidenceSnapshotId ? shortId(mission.evidenceSnapshotId) : "not pinned"}</strong>
              <p>
                {pinnedDifferent
                  ? "The market has a newer live pack, but this mission remains pinned to its original snapshot."
                  : "The active mission and the current market pack are aligned."}
              </p>
            </article>

            <article className="proof-card">
              <span>Lane leaders</span>
              <div className="proof-vendor-list">
                {activeLanes.map((lane) => {
                  const winnerId =
                    mission?.approvedVendorIdsByLane?.[lane] ?? mission?.recommendedVendorIdsByLane?.[lane];
                  const winnerEvidence =
                    (winnerId ? evidenceFor(currentSnapshot, winnerId) : undefined) ??
                    currentSnapshot?.vendors
                      .filter((entry) => entry.lane === lane)
                      .sort((left, right) => right.confidenceScore - left.confidenceScore)[0];

                  return (
                    <div key={lane}>
                      <strong>{formatLabel(lane)}</strong>
                      <span>
                        {winnerEvidence
                          ? `${winnerEvidence.vendorName} / ${winnerEvidence.confidenceScore}`
                          : "pending"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span>Mandate</span>
            <strong>{formatMotes(mandate.maxTrialSpendMotes)} max per trial</strong>
          </div>

          <div className="mandate-grid">
            <article className="metric-card mini">
              <span>Template</span>
              <strong>{mission?.stackTemplateId ?? input.stackTemplateId ?? launchStackTemplateId}</strong>
              <p>Every lane can negotiate inside policy, but the desk still pauses for final approval.</p>
            </article>

            <article className="metric-card mini">
              <span>Lane caps</span>
              <div className="stack-list">
                {activeLanes.map((lane) => (
                  <div key={lane}>
                    <strong>{formatLabel(lane)}</strong>
                    <span>{formatMotes(mandate.laneCaps[lane] ?? 0)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="metric-card mini">
              <span>Recommended stack</span>
              <div className="stack-list">
                {activeLanes.map((lane) => (
                  <div key={lane}>
                    <strong>{formatLabel(lane)}</strong>
                    <span>
                      {mission?.approvedVendorIdsByLane?.[lane] ??
                        mission?.recommendedVendorIdsByLane?.[lane] ??
                        "pending"}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>

        <div className="panel wide">
          <div className="panel-head">
            <span>Lane war room</span>
            <strong>{activeLanes.length} lanes under watch</strong>
          </div>

          <div className="lane-stack">
            {activeLanes.map((lane) => {
              const laneVendors = vendors.filter((vendor) => vendor.lane === lane);
              const laneRounds = deferredRounds.filter((round) => round.lane === lane);
              const blocker = mission?.blockers.find(
                (entry) => entry.includes(` ${lane} `) || entry.endsWith(` ${lane}.`)
              );
              const laneWinner =
                mission?.approvedVendorIdsByLane?.[lane] ?? mission?.recommendedVendorIdsByLane?.[lane] ?? "No winner yet";

              return (
                <section className="lane-section" key={lane}>
                  <div className="lane-header">
                    <div>
                      <p>{formatLabel(lane)}</p>
                      <strong>{laneWinner}</strong>
                    </div>
                    <span>{blocker ?? "Inside mandate"}</span>
                  </div>

                  <div className="arena-strip">
                    {laneRounds.length > 0 ? (
                      laneRounds.map((round) => (
                        <article className={`arena-round actor-${round.actor}`} key={round.id}>
                          <div>
                            <p>
                              {round.actor} / round {round.round}
                            </p>
                            <strong>{round.vendorName}</strong>
                          </div>
                          <span>{formatMotes(round.offer.trialPriceMotes)}</span>
                          <p>{round.message}</p>
                          <div className="offer-grid">
                            <span>{round.offer.setupMinutes} min setup</span>
                            <span>{round.offer.securityGrade}</span>
                            <span>{round.offer.score ? `${round.offer.score} score` : "scoring"}</span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="empty">Run the negotiation arena to generate counter-offers and lane winners.</p>
                    )}
                  </div>

                  <div className="vendor-grid">
                    {laneVendors.map((vendor) => {
                      const verdict = verdictFor(vendor, mission);
                      const spend = spendFor(vendor, mission);
                      const tone = vendorTone(vendor, mission);
                      const evidence = evidenceFor(currentSnapshot, vendor.id);
                      const negotiatedOffer = negotiatedOfferFor(vendor.id, negotiation, mission);

                      return (
                        <article className={`vendor-card ${tone}`} key={vendor.id}>
                          <div className="vendor-top">
                            <div>
                              <p>{vendor.category}</p>
                              <h2>{vendor.name}</h2>
                            </div>
                            <span>{negotiatedOffer?.score ?? vendor.qualityScore}</span>
                          </div>

                          <p>{vendor.tagline}</p>

                          <div className="signal-list">
                            <span className="pill">{negotiatedOffer?.securityGrade ?? vendor.securityGrade}</span>
                            <span className="pill">{negotiatedOffer?.setupMinutes ?? vendor.setupMinutes} min</span>
                            <span className="pill">{evidence?.confidenceScore ?? 0} conf</span>
                            {negotiatedOffer?.supportsMcp ?? vendor.supportsMcp ? <span className="pill">MCP</span> : null}
                            {negotiatedOffer?.supportsX402 ?? vendor.supportsX402 ? <span className="pill">x402</span> : null}
                          </div>

                          <dl>
                            <div>
                              <dt>Baseline trial</dt>
                              <dd>{formatMotes(vendor.trialPriceMotes)}</dd>
                            </div>
                            <div>
                              <dt>Negotiated</dt>
                              <dd>{negotiatedOffer ? formatMotes(negotiatedOffer.trialPriceMotes) : "pending"}</dd>
                            </div>
                            <div>
                              <dt>Verdict</dt>
                              <dd>{verdict ? (verdict.accepted ? "accepted" : "rejected") : "pending"}</dd>
                            </div>
                            <div>
                              <dt>Spend state</dt>
                              <dd>{spend?.status ?? "not started"}</dd>
                            </div>
                          </dl>

                          {evidence ? (
                            <div className="evidence-copy">
                              <p>{evidence.pricingSummary}</p>
                              <p>{evidence.securitySummary}</p>
                            </div>
                          ) : (
                            <p className="empty">No evidence loaded for this vendor in the active snapshot.</p>
                          )}

                          <div className="citation-row">
                            {evidence?.citations.slice(0, 3).map((citation) => (
                              <a key={`${vendor.id}-${citation.url}`} className="citation-link" href={citation.url} target="_blank" rel="noreferrer">
                                {citation.label} / {extractHost(citation.url)}
                              </a>
                            )) ?? <span className="empty">No citations yet.</span>}
                          </div>

                          {verdict ? <p className={verdict.accepted ? "good" : "bad"}>{verdict.reason}</p> : null}

                          {isLegacyApproval ? (
                            <button
                              disabled={!mission || mission.status !== "review" || !verdict?.accepted || loading}
                              onClick={() => approveMission(vendor.id)}
                            >
                              Approve this vendor
                            </button>
                          ) : (
                            <p className="empty">
                              {mission?.approvedVendorIdsByLane?.[lane] === vendor.id
                                ? "Approved into the launch stack."
                                : mission?.recommendedVendorIdsByLane?.[lane] === vendor.id
                                  ? "Current lane winner."
                                  : "Evidence and negotiation candidate only."}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span>Agent timeline</span>
            <strong>{mission?.events.length ?? 0} events</strong>
          </div>

          <div className="timeline">
            {deferredEvents.length > 0 ? (
              deferredEvents.map((event) => (
                <article key={event.id} className={`timeline-item role-${event.role}`}>
                  <div>
                    <p>{event.role}</p>
                    <strong>{event.action.replaceAll("-", " ")}</strong>
                  </div>
                  <span>{formatTimestamp(event.createdAt)}</span>
                  <p>{event.message}</p>
                </article>
              ))
            ) : (
              <p className="empty">Launch a desk to generate the first event trail.</p>
            )}
          </div>
        </div>

        <div className="panel wide">
          <div className="panel-head">
            <span>Receipt rail</span>
            <strong>{mission?.receipts.length ?? 0} ledger writes</strong>
          </div>

          <div className="receipt-list">
            {mission?.receipts.length ? (
              mission.receipts.map((receipt) => (
                <article className="receipt" key={receipt.txHash}>
                  <div>
                    <p>{receipt.mode}</p>
                    <strong className="mono">{shortId(receipt.txHash)}</strong>
                  </div>
                  <span>{formatTimestamp(receipt.recordedAt)}</span>
                  <p className="mono">{shortId(receipt.proofHash)}</p>
                  {receipt.explorerUrl ? (
                    <a href={receipt.explorerUrl} target="_blank" rel="noreferrer">
                      Open Casper deploy
                    </a>
                  ) : (
                    <p className="empty">Mock receipt</p>
                  )}
                </article>
              ))
            ) : (
              <p className="empty">The receipt rail will populate after the first paid trial.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
