import { useMemo } from "react";

import { Icon } from "../components/Icons";
import { NAV_ITEMS } from "../data/navigation";
import { useAfpFinancialInputs } from "../hooks/useAfpFinancialInputs";
import igccLogo from "../assets/igcc-logo.svg";

const DEFAULT_YEAR = "2026";

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
const formatWholeNumber = (value) => Math.round(value || 0).toLocaleString("en-US");
const formatPercent = (value) => `${Math.round(value || 0)}%`;
const getShare = (value, revenue) => (revenue ? (value / revenue) * 100 : 0);
const sumRows = (rows, predicate) => rows.reduce((total, row) => (
  predicate(row) ? total + (Number(row.amount) || 0) : total
), 0);

const MONTHS = [
  { key: "01", label: "Jan" },
  { key: "02", label: "Feb" },
  { key: "03", label: "Mar" },
  { key: "04", label: "Apr" },
  { key: "05", label: "May" },
  { key: "06", label: "Jun" },
  { key: "07", label: "Jul" },
  { key: "08", label: "Aug" },
  { key: "09", label: "Sep" },
  { key: "10", label: "Oct" },
  { key: "11", label: "Nov" },
  { key: "12", label: "Dec" },
];

const createEmptyIgccSummary = () => ({
  totalCost: 0,
  approvedAfp: 0,
  submittedAfp: 0,
  approvedProfit: 0,
  submittedProfit: 0,
  approvedMargin: 0,
  submittedMargin: 0,
});

const buildHomeIgccSummary = ({ entries, spentEntries, year = DEFAULT_YEAR }) => {
  const afpRows = entries
    .filter((entry) => entry.year === year)
    .filter((entry) => entry.type !== "creditNotes");
  const spentRows = spentEntries.filter((entry) => entry.year === year);
  const months = MONTHS.map((month) => ({
    ...month,
    period: `${year}-${month.key}`,
  }));
  const byMonth = {};

  for (const month of months) {
    const monthAfpRows = afpRows.filter((entry) => entry.period === month.period);
    const monthSpentRows = spentRows.filter((entry) => entry.period === month.period);
    const totalCost = sumRows(monthSpentRows, (entry) => entry.type === "spent");
    const approvedAfp = sumRows(monthAfpRows, (entry) => entry.type === "approved");
    const submittedAfp = sumRows(monthAfpRows, (entry) => entry.type === "submitted");
    const approvedProfit = approvedAfp - totalCost;
    const submittedProfit = submittedAfp - totalCost;
    byMonth[month.key] = {
      totalCost,
      approvedAfp,
      submittedAfp,
      approvedProfit,
      submittedProfit,
      approvedMargin: getShare(approvedProfit, approvedAfp),
      submittedMargin: getShare(submittedProfit, submittedAfp),
    };
  }

  const yearTotal = months.reduce((total, month) => {
    const summary = byMonth[month.key] || createEmptyIgccSummary();
    return {
      totalCost: total.totalCost + summary.totalCost,
      approvedAfp: total.approvedAfp + summary.approvedAfp,
      submittedAfp: total.submittedAfp + summary.submittedAfp,
      approvedProfit: total.approvedProfit + summary.approvedProfit,
      submittedProfit: total.submittedProfit + summary.submittedProfit,
    };
  }, createEmptyIgccSummary());
  yearTotal.approvedMargin = getShare(yearTotal.approvedProfit, yearTotal.approvedAfp);
  yearTotal.submittedMargin = getShare(yearTotal.submittedProfit, yearTotal.submittedAfp);

  return { months, byMonth, yearTotal };
};

const igccSummaryRows = [
  { label: "Total Spent + Not Recorded", key: "totalCost" },
  { label: "Approved AFP", key: "approvedAfp", highlight: true },
  { label: "Submitted AFP", key: "submittedAfp", highlight: true },
  { label: "Profit / Loss (Approved AFP)", key: "approvedProfit", highlight: true },
  { label: "Profit / Loss (Submitted AFP)", key: "submittedProfit", highlight: true },
  { label: "Margin (Approved AFP)", key: "approvedMargin", isPercent: true },
  { label: "Margin (Submitted AFP)", key: "submittedMargin", isPercent: true },
];

const getDeviationTone = (value) => {
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "";
};

const getValueTone = (key, value) => {
  if (!key.toLowerCase().includes("profit") && !key.toLowerCase().includes("margin")) return "";
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "";
};

const buildHomeSummary = (entries) => {
  const yearlyMap = new Map();
  const totals = entries.reduce((summary, entry) => {
    const amount = Number(entry.amount) || 0;
    const year = String(entry.year || entry.period?.slice(0, 4) || "Unassigned");
    const yearRow = yearlyMap.get(year) || {
      year,
      spent: 0,
      submitted: 0,
      approved: 0,
      costCenters: new Map(),
    };

    if (entry.type === "spent") summary.spent += amount;
    if (entry.type === "submitted") summary.submitted += amount;
    if (entry.type === "approved") summary.approved += amount;

    if (entry.type === "spent") yearRow.spent += amount;
    if (entry.type === "submitted") yearRow.submitted += amount;
    if (entry.type === "approved") yearRow.approved += amount;

    if (entry.type === "submitted" || entry.type === "approved") {
      const costCenter = entry.costCenter || "Unassigned";
      const current = yearRow.costCenters.get(costCenter) || {
        costCenter,
        hub: entry.hub || "Unassigned",
        submitted: 0,
        approved: 0,
      };
      current[entry.type] += amount;
      if (entry.hub && current.hub === "Unassigned") current.hub = entry.hub;
      yearRow.costCenters.set(costCenter, current);
    }

    yearlyMap.set(year, yearRow);
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
    yearRows: [...yearlyMap.values()]
      .map((row) => {
        const topYearDeviation = [...row.costCenters.values()]
          .map((item) => ({
            ...item,
            deviation: item.approved - item.submitted,
            absoluteDeviation: Math.abs(item.approved - item.submitted),
          }))
          .filter((item) => item.absoluteDeviation > 0)
          .sort((a, b) => b.absoluteDeviation - a.absoluteDeviation)[0] || null;

        return {
          year: row.year,
          spent: row.spent,
          submitted: row.submitted,
          approved: row.approved,
          deviation: row.approved - row.submitted,
          topDeviation: topYearDeviation,
        };
      })
      .sort((a, b) => b.year.localeCompare(a.year)),
  };
};

export function HomePage({ onNavigate, accessProfile }) {
  const today = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date());
  const {
    entries,
    spentEntries,
    isLoadingAfpMaster,
    isLoadingSpentReport,
  } = useAfpFinancialInputs();
  const isLoading = isLoadingAfpMaster || isLoadingSpentReport;
  const { totals, deviations, yearRows } = useMemo(() => buildHomeSummary(entries), [entries]);
  const { months, byMonth, yearTotal } = useMemo(
    () => buildHomeIgccSummary({ entries, spentEntries, year: DEFAULT_YEAR }),
    [entries, spentEntries],
  );
  const maxMonthlyScale = Math.max(
    ...months.flatMap((month) => {
      const summary = byMonth[month.key] || createEmptyIgccSummary();
      return [summary.totalCost, summary.approvedAfp, summary.submittedAfp];
    }),
    1,
  );
  const homePnlHighlights = [
    { label: "Total Spent", value: yearTotal.totalCost, tone: "" },
    { label: "Approved AFP", value: yearTotal.approvedAfp, tone: "is-blue" },
    { label: "Approved Profit", value: yearTotal.approvedProfit, tone: getDeviationTone(yearTotal.approvedProfit) },
    { label: "Approved Margin", value: yearTotal.approvedMargin, isPercent: true, tone: getDeviationTone(yearTotal.approvedMargin) },
  ];

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

        <article className="surface-card home-igcc-summary-card">
          <div className="home-igcc-heading">
            <div>
              <span className="home-kicker">Live P&L overview</span>
              <h3>IGCC Monthly Profit & Loss</h3>
            </div>
            <div className="home-igcc-badges">
              <span>Year {DEFAULT_YEAR}</span>
              <span>CN excluded</span>
            </div>
          </div>

          <div className="home-igcc-kpis" aria-label={`IGCC ${DEFAULT_YEAR} profit and loss totals`}>
            {homePnlHighlights.map((item) => (
              <div className={`home-igcc-kpi ${item.tone}`} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.isPercent ? formatPercent(item.value) : formatCurrency(item.value)}</strong>
              </div>
            ))}
          </div>

          <div className="home-igcc-months" aria-label={`Monthly IGCC profit and loss for ${DEFAULT_YEAR}`}>
            {months.map((month) => {
              const summary = byMonth[month.key] || createEmptyIgccSummary();
              return (
                <article className="home-igcc-month-card" key={month.key}>
                  <div className="home-igcc-month-head">
                    <strong>{month.label}</strong>
                    <span className={getDeviationTone(summary.approvedProfit)}>
                      {formatCurrency(summary.approvedProfit)}
                    </span>
                  </div>
                  <div className="home-igcc-month-bars" aria-hidden="true">
                    <span style={{ width: `${Math.max(2, (summary.totalCost / maxMonthlyScale) * 100)}%` }} />
                    <span style={{ width: `${Math.max(2, (summary.approvedAfp / maxMonthlyScale) * 100)}%` }} />
                    <span style={{ width: `${Math.max(2, (summary.submittedAfp / maxMonthlyScale) * 100)}%` }} />
                  </div>
                  <dl>
                    <div><dt>Spent</dt><dd>{formatWholeNumber(summary.totalCost)}</dd></div>
                    <div><dt>Approved</dt><dd>{formatWholeNumber(summary.approvedAfp)}</dd></div>
                    <div><dt>Submitted</dt><dd>{formatWholeNumber(summary.submittedAfp)}</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>

          <div className="home-igcc-matrix" aria-label={`Detailed IGCC monthly P&L for ${DEFAULT_YEAR}`}>
            <div className="home-igcc-matrix-row is-head">
              <span>Item</span>
              {months.map((month) => <span key={month.key}>{month.label}</span>)}
              <span>Year {DEFAULT_YEAR}</span>
            </div>
            {igccSummaryRows.map((row) => (
              <div className={`home-igcc-matrix-row ${row.highlight ? "is-highlight" : ""}`} key={row.key}>
                <strong>{row.label}</strong>
                {months.map((month) => {
                  const value = byMonth[month.key]?.[row.key] || 0;
                  return (
                    <span className={getValueTone(row.key, value)} key={month.key}>
                      {row.isPercent ? formatPercent(value) : formatWholeNumber(value)}
                    </span>
                  );
                })}
                <span className={getValueTone(row.key, yearTotal[row.key])}>
                  {row.isPercent ? formatPercent(yearTotal[row.key]) : formatWholeNumber(yearTotal[row.key])}
                </span>
              </div>
            ))}
          </div>
          <p className="executive-table-note">Total Spent + Not Recorded comes from the Google Sheet Spent Report and Not Recorded tabs. Issued and received CN are excluded from this Home P&L.</p>
        </article>

        <article className="home-year-panel" aria-label="High level financial summary by year">
          <div className="home-panel-title">
            <span><Icon name="executive" /></span>
            <div>
              <h2>Yearly Financial Summary</h2>
              <p>Spent report, submitted AFP, approved AFP, and highest cost-center deviation</p>
            </div>
            <button type="button" onClick={() => onNavigate("executive")}>Open analysis <i aria-hidden="true">&gt;</i></button>
          </div>

          <div className="home-year-table">
            <div className="home-year-table-head">
              <span>Year</span>
              <span>Total Spent Report</span>
              <span>Submitted AFP</span>
              <span>Approved AFP</span>
              <span>Highest Deviation</span>
              <span>Gap</span>
            </div>
            {isLoading ? (
              <div className="home-year-empty">Loading yearly financial summary...</div>
            ) : yearRows.length ? yearRows.map((row) => (
              <button key={row.year} type="button" onClick={() => onNavigate("executive")}>
                <strong>{row.year}</strong>
                <span>{formatCurrency(row.spent)}</span>
                <span>{formatCurrency(row.submitted)}</span>
                <span>{formatCurrency(row.approved)}</span>
                <span>
                  {row.topDeviation ? row.topDeviation.costCenter : "No deviation"}
                  {row.topDeviation ? <small>{row.topDeviation.hub}</small> : null}
                </span>
                <span className={getDeviationTone(row.topDeviation?.deviation || 0)}>
                  {row.topDeviation ? formatCurrency(row.topDeviation.deviation) : formatCurrency(0)}
                </span>
              </button>
            )) : (
              <div className="home-year-empty">No financial entries loaded.</div>
            )}
            <div className="home-year-total">
              <strong>Total</strong>
              <span>{formatCurrency(totals.spent)}</span>
              <span>{formatCurrency(totals.submitted)}</span>
              <span>{formatCurrency(totals.approved)}</span>
              <span>All years</span>
              <span className={getDeviationTone(totals.approved - totals.submitted)}>{formatCurrency(totals.approved - totals.submitted)}</span>
            </div>
          </div>
        </article>

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
