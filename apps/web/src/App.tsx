import { useEffect, useState } from "react";

import type { Mission, MissionInput, MissionView, Vendor } from "@ghostshift/shared";

const initialInput: MissionInput = {
  companyName: "GhostShift / Mission Atlas",
  brief: "Find a resilient infrastructure vendor, buy trials, verify outputs, and close with an on-chain ledger trail.",
  preferredCategory: "infra",
  totalBudgetMotes: 6_500_000_000,
  categoryCaps: { infra: 6_500_000_000 }
};

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function formatMotes(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function verdictFor(vendor: Vendor, mission?: Mission) {
  return mission?.verdicts.find((entry) => entry.vendorId === vendor.id);
}

function spendFor(vendor: Vendor, mission?: Mission) {
  return mission?.spends.find((entry) => entry.vendorId === vendor.id);
}

export function App() {
  const [input, setInput] = useState<MissionInput>(initialInput);
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
  const mission = view?.mission;

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Casper-native pop-up company</p>
          <h1>GhostShift</h1>
          <p className="lede">
            Spin up a temporary company of agents, let it buy what it needs under hard budget rules, and dissolve it
            with a permanent ledger trail.
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
            Mission brief
            <textarea
              rows={4}
              value={input.brief}
              onChange={(event) => setInput({ ...input, brief: event.target.value })}
            />
          </label>
          <div className="form-row">
            <label>
              Budget
              <input
                type="number"
                value={input.totalBudgetMotes}
                onChange={(event) => {
                  const totalBudgetMotes = Number(event.target.value);
                  setInput({
                    ...input,
                    totalBudgetMotes,
                    categoryCaps: { ...input.categoryCaps, infra: totalBudgetMotes }
                  });
                }}
              />
            </label>
            <button disabled={loading} onClick={createMission}>
              {mission ? "Re-open" : "Launch company"}
            </button>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>

      <section className="overview-grid">
        <article className="metric-card">
          <span>Mission status</span>
          <strong>{mission?.status ?? "draft"}</strong>
          <p>{mission ? mission.brief : "No active company yet."}</p>
        </article>
        <article className="metric-card">
          <span>Treasury</span>
          <strong>{formatMotes(mission?.treasuryRemainingMotes ?? input.totalBudgetMotes)}</strong>
          <p>Remaining motes after every approved trial payment.</p>
        </article>
        <article className="metric-card">
          <span>Recommended vendor</span>
          <strong>{mission?.recommendedVendorId ?? "pending"}</strong>
          <p>The lead agent only recommends vendors that survive verifier checks.</p>
        </article>
      </section>

      <section className="control-strip">
        <button disabled={!mission || loading || mission.status === "running"} onClick={runMission}>
          Run vendor mission
        </button>
        <button disabled={!mission || mission.status !== "review" || loading} onClick={() => approveMission()}>
          Approve recommended vendor
        </button>
        <button disabled={!mission || loading} onClick={() => mission && refreshMission(mission.id)}>
          Refresh
        </button>
      </section>

      <section className="board">
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
            )) ?? <p className="empty">Launch a company to generate the first ledger trail.</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span>Vendor floor</span>
            <strong>{vendors.length} candidates</strong>
          </div>
          <div className="vendor-grid">
            {vendors.map((vendor) => {
              const verdict = verdictFor(vendor, mission);
              const spend = spendFor(vendor, mission);
              return (
                <article className="vendor-card" key={vendor.id}>
                  <div className="vendor-top">
                    <div>
                      <p>{vendor.category}</p>
                      <h2>{vendor.name}</h2>
                    </div>
                    <span>{vendor.qualityScore}/100</span>
                  </div>
                  <p>{vendor.tagline}</p>
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
                  <button
                    disabled={!mission || mission.status !== "review" || !verdict?.accepted || loading}
                    onClick={() => approveMission(vendor.id)}
                  >
                    Approve this vendor
                  </button>
                </article>
              );
            })}
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
