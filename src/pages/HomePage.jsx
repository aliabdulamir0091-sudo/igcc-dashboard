import { useMemo } from "react";

import { Icon } from "../components/Icons";
import { NAV_ITEMS } from "../data/navigation";
import { useAfpFinancialInputs } from "../hooks/useAfpFinancialInputs";
import igccLogo from "../assets/igcc-logo.svg";

const pageCards = [
  {
    id: "executive",
    icon: "executive",
    title: "IGCC Operations Performance",
    detail: "Hub, cost center, AFP, cost, CN, and profit view",
    action: "Open",
  },
  {
    id: "spending",
    icon: "spending",
    title: "Financial Input",
    detail: "Spend, AFP, GL drilldown, CN allocation detail",
    action: "Open",
  },
  {
    id: "profitMatrix",
    icon: "pnl",
    title: "Profit Matrix",
    detail: "Monthly approved and submitted AFP profit by cost center",
    action: "Open",
  },
  {
    id: "afp",
    icon: "approve",
    title: "AFP Master",
    detail: "Live AFP submissions and approvals from Google Sheets",
    action: "Open",
  },
];

const sideItems = [
  { id: "home", icon: "home", label: "Home" },
  { id: "executive", icon: "executive", label: "Operations Performance" },
  { id: "profitMatrix", icon: "pnl", label: "Profit Matrix" },
  { id: "afp", icon: "approve", label: "AFP Master" },
  { id: "spending", icon: "spending", label: "Financial Input" },
  { id: "data", icon: "download", label: "Data & Sync" },
  { id: "settings", icon: "folder", label: "Settings" },
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatCurrency = (value) => currencyFormatter.format(value || 0);

const getDeviationTone = (value) => {
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "";
};

const buildHomeSummary = (entries) => {
  const totals = entries.reduce((summary, entry) => {
    const amount = Number(entry.amount) || 0;
    if (entry.type === "spent") summary.spent += amount;
    if (entry.type === "submitted") summary.submitted += amount;
    if (entry.type === "approved") summary.approved += amount;
    return summary;
  }, { spent: 0, submitted: 0, approved: 0 });

  const costCenterMap = new Map();
  for (const entry of entries) {
    if (entry.type !== "submitted" && entry.type !== "approved") continue;
    const costCenter = entry.costCenter || "Unassigned";
    const current = costCenterMap.get(costCenter) || {
      costCenter,
      hub: entry.hub || "Unassigned",
      submitted: 0,
      approved: 0,
    };
    current[entry.type] += Number(entry.amount) || 0;
    if (entry.hub && current.hub === "Unassigned") current.hub = entry.hub;
    costCenterMap.set(costCenter, current);
  }

  const deviations = [...costCenterMap.values()]
    .map((row) => ({
      ...row,
      deviation: row.approved - row.submitted,
      absoluteDeviation: Math.abs(row.approved - row.submitted),
    }))
    .filter((row) => row.absoluteDeviation > 0)
    .sort((a, b) => b.absoluteDeviation - a.absoluteDeviation);

  return {
    totals,
    topDeviation: deviations[0] || null,
    deviations: deviations.slice(0, 6),
  };
};

export function HomePage({ onNavigate, accessProfile }) {
  const today = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date());
  const {
    entries,
    isLoadingAfpMaster,
    isLoadingSpentReport,
    isLoadingCreditNotes,
  } = useAfpFinancialInputs();
  const isLoading = isLoadingAfpMaster || isLoadingSpentReport || isLoadingCreditNotes;
  const { totals, topDeviation, deviations } = useMemo(() => buildHomeSummary(entries), [entries]);

  return (
    <section className="home-dashboard-frame">
      <aside className="home-sidebar">
        <div className="home-sidebar-brand">
          <img className="home-brand-logo" src={igccLogo} alt="" />
          <strong>IGCC</strong>
          <small>Financial</small>
        </div>

        <nav className="home-sidebar-nav" aria-label="Home navigation">
          {sideItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === "home" ? "is-active" : ""}
              onClick={() => {
                if (NAV_ITEMS.some((navItem) => navItem.id === item.id)) onNavigate(item.id);
              }}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="home-admin-card">
          <span>{accessProfile?.email?.slice(0, 2).toUpperCase() || "AD"}</span>
          <div>
            <strong>{accessProfile?.displayName || "Admin"}</strong>
            <small>IGCC Team</small>
          </div>
        </div>
      </aside>

      <div className="home-dashboard-main">
        <header className="home-dashboard-hero">
          <span className="home-hero-icon"><Icon name="executive" /></span>
          <div>
            <h1>IGCC Financial Control</h1>
            <p>High-level spend, AFP, and approval deviation overview</p>
          </div>
          <div className="home-hero-actions">
            <span><Icon name="calendar" /> {today}</span>
            <button type="button" onClick={() => onNavigate("executive")}><Icon name="filter" /> Open Analysis</button>
          </div>
        </header>

        <section className="home-executive-grid" aria-label="High level financial summary">
          <article className="home-executive-card tone-spent">
            <div>
              <span><Icon name="spending" /></span>
              <p>Total Value of Spent Report</p>
            </div>
            <strong>{isLoading ? "Loading" : formatCurrency(totals.spent)}</strong>
            <small>All loaded spent report entries</small>
          </article>

          <article className="home-executive-card tone-submitted">
            <div>
              <span><Icon name="submit" /></span>
              <p>Total Submitted AFP</p>
            </div>
            <strong>{isLoading ? "Loading" : formatCurrency(totals.submitted)}</strong>
            <small>AFP submitted value</small>
          </article>

          <article className="home-executive-card tone-approved">
            <div>
              <span><Icon name="approve" /></span>
              <p>Total Approved AFP</p>
            </div>
            <strong>{isLoading ? "Loading" : formatCurrency(totals.approved)}</strong>
            <small>AFP approved value</small>
          </article>

          <article className="home-executive-card tone-deviation is-wide">
            <div>
              <span><Icon name="net" /></span>
              <p>Highest AFP Deviation</p>
            </div>
            <strong>{isLoading ? "Loading" : topDeviation ? topDeviation.costCenter : "No deviation"}</strong>
            <small>
              {topDeviation
                ? `${formatCurrency(topDeviation.deviation)} approved vs submitted gap`
                : "Submitted and approved AFP are aligned"}
            </small>
          </article>
        </section>

        <section className="home-command-grid-v2">
          <article className="home-deviation-panel">
            <div className="home-panel-title">
              <span><Icon name="net" /></span>
              <div>
                <h2>Cost Center AFP Deviation</h2>
                <p>Largest difference between approved and submitted AFP</p>
              </div>
              <button type="button" onClick={() => onNavigate("profitMatrix")}>Open matrix <i aria-hidden="true">&gt;</i></button>
            </div>

            <div className="home-deviation-table">
              <div className="home-deviation-head">
                <span>Cost Center</span>
                <span>Submitted</span>
                <span>Approved</span>
                <span>Deviation</span>
              </div>
              {deviations.length ? deviations.map((row) => (
                <button key={row.costCenter} type="button" onClick={() => onNavigate("profitMatrix")}>
                  <strong>{row.costCenter}<small>{row.hub}</small></strong>
                  <span>{formatCurrency(row.submitted)}</span>
                  <span>{formatCurrency(row.approved)}</span>
                  <span className={getDeviationTone(row.deviation)}>{formatCurrency(row.deviation)}</span>
                </button>
              )) : (
                <div className="home-deviation-empty">No submitted vs approved AFP deviation found.</div>
              )}
            </div>
          </article>

          <section className="home-page-cards compact" aria-label="Dashboard destinations">
            {pageCards.map((card) => (
              <article key={card.id} className="home-page-card">
                <span className="home-page-card-icon"><Icon name={card.icon} /></span>
                <div>
                  <h2>{card.title}</h2>
                  <p>{card.detail}</p>
                </div>
                <button type="button" onClick={() => onNavigate(card.id)}>{card.action}</button>
                <i aria-hidden="true">&rarr;</i>
              </article>
            ))}
          </section>
        </section>
      </div>
    </section>
  );
}
