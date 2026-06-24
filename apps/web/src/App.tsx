import { useEffect, useState } from "react";

import {
  defaultLaunchStackMandate,
  launchStackLanes,
  launchStackTemplateId,
  type Mission,
  type MissionInput,
  type MissionView,
  type Vendor
} from "@ghostshift/shared";

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function createInitialInput(): MissionInput {
  return {
    companyName: "GhostShift / Mission Atlas",
    brief:
      "Source the launch-day browser, telemetry, auth, and knowledge stack for an AI product, stay inside a signed mandate, and return a stack that can be approved in one step.",
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

function verdictFor(vendor: Vendor, mission?: Mission) {
  return mission?.verdicts.find((entry) => entry.vendorId === vendor.id);
}

function spendFor(vendor: Vendor, mission?: Mission) {
  return mission?.spends.find((entry) => entry.vendorId === vendor.id);
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

function vendorTone(vendor: Vendor, mission?: Mission): "winner" | "good" | "bad" | "pending" {
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
  const [view, setView] = useState<MissionView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, init);
    const body = (await response.json()) as T | { error: string };
    if (!response.ok) {
      throw new Error("error" in body ? body.error : "Request failed.");
    }
    return body as T;
  }

  async function refreshMission(missionId: string) {
    const nextView = await request<MissionView>(`/api/missions/${missionId}`);
    setView(nextView);
  }

  async function createMission() {
    setLoading(true);
    setError(null);
    try {
      const mission = await request<Mission>("/api/missions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      await refreshMission(mission.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open company.");
    } finally {
      setLoading(false);
    }
  }

  async function runMission() {
    if (!view) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await request<Mission>(`/api/missions/${view.mission.id}/run`, { method: "POST" });
      await refreshMission(view.mission.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not run mission.");
    } finally {
      setLoading(false);
    }
  }

  async function approveMission(vendorId?: string) {
    if (!view) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await request<Mission>(`/api/missions/${view.mission.id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vendorId })
      });
      await refreshMission(view.mission.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not close company.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!view || view.mission.status === "completed" || view.mission.status === "failed") {
      return;
    }

    const handle = window.setInterval(() => {
      void refreshMission(view.mission.id);
    }, 4000);

    return () => window.clearInterval(handle);
  }, [view]);

  const vendors = view?.vendors ?? [];
  const mission = view?.mission ?? null;
  const activeLanes = lanesFor(vendors, mission, input);
  const mandate = mission?.mandate ?? input.mandate ?? defaultLaunchStackMandate;
  const selectedCount = Object.keys(mission?.recommendedVendorIdsByLane ?? {}).length;
  const approvedCount = Object.keys(mission?.approvedVendorIdsByLane ?? {}).length;

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Guardrailed launch stack buyer</p>
          <h1>GhostShift</h1>
          <p className="lede">
            Spin up a temporary buying desk for an AI team, let agents source the browser, telemetry, auth, and
            knowledge stack under a signed mandate, and dissolve the desk with a permanent ledger trail.
          </p>
          <div className="ledger-chip">
            <span>Ledger mode</span>
            <strong>{mission?.ledgerMode ?? "mock"}</strong>
          </div>
        </div>

        <div className="hero-card">
          <label>
            Company name
            <input
              value={input.companyName}
              onChange={(event) => setInput({ ...input, companyName: event.target.value })}
            />
          </label>
          <label>
            Procurement brief
            <textarea
              rows={4}
              value={input.brief}
              onChange={(event) => setInput({ ...input, brief: event.target.value })}
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
                  setInput({
                    ...input,
                    totalBudgetMotes,
                    categoryCaps: { infra: totalBudgetMotes }
                  });
                }}
              />
            </label>
            <label>
              Max per trial
              <input
                type="number"
                value={input.mandate?.maxTrialSpendMotes ?? defaultLaunchStackMandate.maxTrialSpendMotes}
                onChange={(event) =>
                  setInput({
                    ...input,
                    mandate: {
                      ...(input.mandate ?? defaultLaunchStackMandate),
                      laneCaps: { ...(input.mandate?.laneCaps ?? defaultLaunchStackMandate.laneCaps) },
                      maxTrialSpendMotes: Number(event.target.value)
                    }
                  })
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
                    setInput({
                      ...input,
                      mandate: {
                        ...(input.mandate ?? defaultLaunchStackMandate),
                        maxTrialSpendMotes:
                          input.mandate?.maxTrialSpendMotes ?? defaultLaunchStackMandate.maxTrialSpendMotes,
                        laneCaps: {
                          ...(input.mandate?.laneCaps ?? defaultLaunchStackMandate.laneCaps),
                          [lane]: Number(event.target.value)
                        }
                      }
                    })
                  }
                />
              </label>
            ))}
          </div>
          <div className="template-chip">
            <span>Template</span>
            <strong>{input.stackTemplateId ?? launchStackTemplateId}</strong>
          </div>
          <button disabled={loading} onClick={createMission}>
            {mission ? "Open another desk" : "Launch buying desk"}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>

      <section className="overview-grid">
        <article className="metric-card">
          <span>Desk status</span>
          <strong>{mission?.status ?? "draft"}</strong>
          <p>{mission ? mission.brief : "No active buying desk yet."}</p>
        </article>
        <article className="metric-card">
          <span>Stack coverage</span>
          <strong>
            {mission?.status === "completed" ? approvedCount : selectedCount}/{activeLanes.length}
          </strong>
          <p>
            {mission?.status === "completed"
              ? "Approved lanes in the final stack."
              : "Recommended lanes that already have a winning vendor."}
          </p>
        </article>
        <article className="metric-card">
          <span>Treasury</span>
          <strong>{formatMotes(mission?.treasuryRemainingMotes ?? input.totalBudgetMotes)}</strong>
          <p>Remaining motes after every paid trial.</p>
        </article>
        <article className="metric-card">
          <span>Blockers</span>
          <strong>{mission?.blockers.length ?? 0}</strong>
          <p>{mission?.blockers.join(" ") || "No blockers. The desk can keep sourcing."}</p>
        </article>
      </section>

      <section className="control-strip">
        <button disabled={!mission || loading || mission.status === "running"} onClick={runMission}>
          Run sourcing mission
        </button>
        <button disabled={!mission || mission.status !== "review" || loading} onClick={() => approveMission()}>
          Approve launch stack
        </button>
        <button disabled={!mission || loading} onClick={() => mission && refreshMission(mission.id)}>
          Refresh
        </button>
      </section>

      <section className="board">
        <div className="panel">
          <div className="panel-head">
            <span>Mandate</span>
            <strong>{formatMotes(mandate.maxTrialSpendMotes)} max per trial</strong>
          </div>
          <div className="mandate-grid">
            <article className="metric-card mini">
              <span>Final approval</span>
              <strong>{mandate.requireFinalApproval ? "required" : "not required"}</strong>
              <p>Agents can spend inside policy, but the stack still pauses for a final sign-off.</p>
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

        <div className="panel">
          <div className="panel-head">
            <span>Lane board</span>
            <strong>{activeLanes.length} required lanes</strong>
          </div>
          <div className="lane-stack">
            {activeLanes.map((lane) => {
              const laneVendors = vendors.filter((vendor) => vendor.lane === lane);
              const blocker = mission?.blockers.find(
                (entry) => entry.includes(` ${lane} `) || entry.endsWith(` ${lane}.`)
              );

              return (
                <section className="lane-section" key={lane}>
                  <div className="lane-header">
                    <div>
                      <p>{formatLabel(lane)}</p>
                      <strong>
                        {mission?.approvedVendorIdsByLane?.[lane] ??
                          mission?.recommendedVendorIdsByLane?.[lane] ??
                          "No winner yet"}
                      </strong>
                    </div>
                    <span>{blocker ?? "Within mandate"}</span>
                  </div>
                  <div className="vendor-grid">
                    {laneVendors.map((vendor) => {
                      const verdict = verdictFor(vendor, mission ?? undefined);
                      const spend = spendFor(vendor, mission ?? undefined);
                      const tone = vendorTone(vendor, mission ?? undefined);
                      const isLegacyApproval = (mission?.requiredLanes.length ?? input.requiredLanes?.length ?? 0) === 0;

                      return (
                        <article className={`vendor-card ${tone}`} key={vendor.id}>
                          <div className="vendor-top">
                            <div>
                              <p>{vendor.category}</p>
                              <h2>{vendor.name}</h2>
                            </div>
                            <span>{vendor.qualityScore}/100</span>
                          </div>
                          <p>{vendor.tagline}</p>
                          <div className="signal-list">
                            <span className="pill">{vendor.securityGrade}</span>
                            <span className="pill">{vendor.setupMinutes} min</span>
                            {vendor.supportsMcp ? <span className="pill">MCP</span> : null}
                            {vendor.supportsX402 ? <span className="pill">x402</span> : null}
                          </div>
                          <dl>
                            <div>
                              <dt>Trial price</dt>
                              <dd>{formatMotes(vendor.trialPriceMotes)}</dd>
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
                                  ? "Current winner for this lane."
                                  : "Trial evidence only."}
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
            {mission?.events.map((event) => (
              <article key={event.id} className={`timeline-item role-${event.role}`}>
                <div>
                  <p>{event.role}</p>
                  <strong>{event.action.replaceAll("-", " ")}</strong>
                </div>
                <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
                <p>{event.message}</p>
              </article>
            )) ?? <p className="empty">Launch a buying desk to generate the first ledger trail.</p>}
          </div>
        </div>

        <div className="panel wide">
          <div className="panel-head">
            <span>Receipt rail</span>
            <strong>{mission?.receipts.length ?? 0} ledger writes</strong>
          </div>
          <div className="receipt-list">
            {mission?.receipts.map((receipt) => (
              <article className="receipt" key={receipt.txHash}>
                <div>
                  <p>{receipt.mode}</p>
                  <strong>{receipt.txHash.slice(0, 18)}...</strong>
                </div>
                <span>{new Date(receipt.recordedAt).toLocaleString()}</span>
                <p>{receipt.proofHash.slice(0, 22)}...</p>
                {receipt.explorerUrl ? (
                  <a href={receipt.explorerUrl} target="_blank" rel="noreferrer">
                    Open Casper deploy
                  </a>
                ) : (
                  <p className="empty">Mock receipt</p>
                )}
              </article>
            )) ?? <p className="empty">The bookkeeper has not written any receipts yet.</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
