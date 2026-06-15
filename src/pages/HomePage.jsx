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

const getDeviationTone = (value) => {
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "";
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
    { label: "Approved Profit", value: yearTotal.approvedProfit, tone: getDeviationTone(yearTotal.approvedProfit) },
    { label: "Submitted Profit", value: yearTotal.submittedProfit, tone: getDeviationTone(yearTotal.submittedProfit) },
    { label: "Approved Margin", value: yearTotal.approvedMargin, isPercent: true, tone: getDeviationTone(yearTotal.approvedMargin) },
  ];
  const activeMonths = months
    .map((month) => ({ ...month, summary: byMonth[month.key] || createEmptyIgccSummary() }))
    .filter((month) => month.summary.totalCost || month.summary.approvedAfp || month.summary.submittedAfp);
  const latestActiveMonth = activeMonths.at(-1);
  const strongestMonth = activeMonths
    .slice()
    .sort((a, b) => b.summary.approvedProfit - a.summary.approvedProfit)[0];
  const yearSourceRows = [
    { label: "Approved AFP", value: yearTotal.approvedAfp, tone: "is-blue" },
    { label: "Submitted AFP", value: yearTotal.submittedAfp, tone: "is-teal" },
    { label: "Spent + Not Recorded", value: yearTotal.totalCost, tone: "is-orange" },
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

      <div className="home-dashboard-main home-dashboard-main-clean">
        <header className="home-dashboard-hero">
          <span className="home-hero-icon"><Icon name="executive" /></span>
          <div>
            <h1>IGCC Financial Control</h1>
            <p>One clean view of 2026 spend, AFP, and profit performance</p>
          </div>
          <div className="home-hero-actions">
            <span><Icon name="calendar" /> {today}</span>
            <button type="button" onClick={() => onNavigate("executive")}><Icon name="filter" /> Open Analysis</button>
          </div>
        </header>

        <section className="home-overview-layout">
          <article className="surface-card home-igcc-summary-card home-igcc-summary-card-clean">
            <div className="home-igcc-heading">
              <div>
                <span className="home-kicker">Live P&L overview</span>
                <h3>2026 Monthly Performance</h3>
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

            <div className="home-month-strip" aria-label={`Monthly IGCC performance for ${DEFAULT_YEAR}`}>
              {months.map((month) => {
                const summary = byMonth[month.key] || createEmptyIgccSummary();
                const hasData = summary.totalCost || summary.approvedAfp || summary.submittedAfp;
                return (
                  <article className={`home-month-tile ${hasData ? "" : "is-empty"}`} key={month.key}>
                    <div className="home-month-tile-head">
                      <strong>{month.label}</strong>
                      <span className={getDeviationTone(summary.approvedProfit)}>
                        {formatCurrency(summary.approvedProfit)}
                      </span>
                    </div>
                    <div className="home-month-bars" aria-hidden="true">
                      <i style={{ width: `${Math.max(2, (summary.totalCost / maxMonthlyScale) * 100)}%` }} />
                      <i style={{ width: `${Math.max(2, (summary.approvedAfp / maxMonthlyScale) * 100)}%` }} />
                      <i style={{ width: `${Math.max(2, (summary.submittedAfp / maxMonthlyScale) * 100)}%` }} />
                    </div>
                    <div className="home-month-tile-footer">
                      <span>Margin</span>
                      <strong className={getDeviationTone(summary.approvedMargin)}>
                        {formatPercent(summary.approvedMargin)}
                      </strong>
                    </div>
                  </article>
                );
              })}
            </div>
          </article>

          <aside className="home-year-snapshot" aria-label={`IGCC ${DEFAULT_YEAR} snapshot`}>
            <div>
              <span className="home-kicker">Year snapshot</span>
              <h3>{DEFAULT_YEAR} totals</h3>
            </div>
            <div className="home-snapshot-list">
              {yearSourceRows.map((row) => (
                <div className={row.tone} key={row.label}>
                  <span>{row.label}</span>
                  <strong>{formatCurrency(row.value)}</strong>
                </div>
              ))}
            </div>
            <div className="home-insight-card">
              <span>Latest active month</span>
              <strong>{latestActiveMonth ? latestActiveMonth.label : "No data"}</strong>
              <small>
                {latestActiveMonth
                  ? `${formatCurrency(latestActiveMonth.summary.approvedProfit)} approved profit`
                  : "Waiting for monthly inputs"}
              </small>
            </div>
            <div className="home-insight-card">
              <span>Strongest approved profit</span>
              <strong>{strongestMonth ? strongestMonth.label : "No data"}</strong>
              <small>
                {strongestMonth
                  ? `${formatCurrency(strongestMonth.summary.approvedProfit)} at ${formatPercent(strongestMonth.summary.approvedMargin)} margin`
                  : "Waiting for monthly inputs"}
              </small>
            </div>
            <p>Total Spent includes Google Sheet Spent Report and Not Recorded tabs only. Issued and received CN are excluded.</p>
          </aside>
        </section>

        <section className="home-actions-clean" aria-label="Dashboard destinations">
          <div className="home-actions-clean-title">
            <span className="home-kicker">Work areas</span>
            <h2>Open the detail view you need</h2>
          </div>
          <div className="home-actions-clean-grid">
            {pageCards.map((card) => (
              <article key={card.id} className="home-action-card-clean">
                <span className="home-page-card-icon"><Icon name={card.icon} /></span>
                <div>
                  <h2>{card.title}</h2>
                  <p>{card.detail}</p>
                </div>
                <button type="button" onClick={() => onNavigate(card.id)}>{card.action}</button>
              </article>
            ))}
          </div>
          {isLoading ? <p className="home-loading-note">Loading latest Google Sheet financial inputs...</p> : null}
        </section>
      </div>
    </section>
  );
}
