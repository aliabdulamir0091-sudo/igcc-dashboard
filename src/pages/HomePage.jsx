import { useMemo, useState } from "react";

import { Icon } from "../components/Icons";
import { NAV_ITEMS } from "../data/navigation";
import { ALL_FILTER_VALUE } from "../data/costCenterHierarchy";
import { useAfpFinancialInputs } from "../hooks/useAfpFinancialInputs";
import igccLogo from "../assets/igcc-logo.svg";

const DEFAULT_YEAR = "2026";
const HOME_YEAR_OPTIONS = ["2026", "2025"];

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
const formatPercent = (value) => `${Math.round(value || 0)}%`;
const formatSignedCurrency = (value) => {
  const formatted = formatCurrency(Math.abs(value || 0));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
};
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

const getMonthMovementReason = (current = createEmptyIgccSummary(), previous = createEmptyIgccSummary(), mode = "approved") => {
  const revenueKey = mode === "submitted" ? "submittedAfp" : "approvedAfp";
  const profitKey = mode === "submitted" ? "submittedProfit" : "approvedProfit";
  const revenueLabel = mode === "submitted" ? "submitted AFP" : "approved AFP";
  const profitChange = current[profitKey] - previous[profitKey];
  const revenueChange = current[revenueKey] - previous[revenueKey];
  const costChange = current.totalCost - previous.totalCost;

  if (!previous.totalCost && !previous[revenueKey]) {
    return "No previous month with comparable data.";
  }

  if (!profitChange) {
    return `Profit was flat because ${revenueLabel} and spent moved by the same net amount.`;
  }

  const revenueImpact = revenueChange;
  const costImpact = -costChange;
  const mainDriver = Math.abs(costImpact) > Math.abs(revenueImpact)
    ? costChange > 0
      ? `spent increased by ${formatSignedCurrency(costChange)}`
      : `spent decreased by ${formatCurrency(Math.abs(costChange))}`
    : revenueChange < 0
      ? `${revenueLabel} decreased by ${formatSignedCurrency(revenueChange)}`
      : `${revenueLabel} increased by ${formatSignedCurrency(revenueChange)}`;

  return `${profitChange < 0 ? "Profit is lower" : "Profit is higher"} mainly because ${mainDriver}.`;
};

export function HomePage({ onNavigate, accessProfile, filters, onApplyFilters }) {
  const [selectedHomeMonth, setSelectedHomeMonth] = useState(() => {
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    return month;
  });
  const today = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date());
  const {
    entries,
    spentEntries,
    isLoadingAfpMaster,
    isLoadingSpentReport,
  } = useAfpFinancialInputs();
  const isLoading = isLoadingAfpMaster || isLoadingSpentReport;
  const selectedYear = filters?.year && filters.year !== ALL_FILTER_VALUE ? filters.year : DEFAULT_YEAR;
  const handleHomeYearChange = (year) => {
    onApplyFilters?.({ ...filters, year });
  };
  const yearOptions = useMemo(() => {
    const dataYears = new Set([
      ...entries.map((entry) => entry.year).filter(Boolean),
      ...spentEntries.map((entry) => entry.year).filter(Boolean),
      ...HOME_YEAR_OPTIONS,
    ]);
    return [...dataYears].sort((a, b) => Number(b) - Number(a));
  }, [entries, spentEntries]);
  const { months, byMonth, yearTotal } = useMemo(
    () => buildHomeIgccSummary({ entries, spentEntries, year: selectedYear }),
    [entries, spentEntries, selectedYear],
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
  const chartMonths = months.map((month) => ({
    ...month,
    summary: byMonth[month.key] || createEmptyIgccSummary(),
  }));
  const selectedMonth = chartMonths.find((month) => month.key === selectedHomeMonth) || chartMonths.find((month) => (
    month.summary.totalCost || month.summary.approvedAfp || month.summary.submittedAfp
  )) || chartMonths[0];
  const previousMonth = selectedMonth ? chartMonths[Math.max(chartMonths.findIndex((month) => month.key === selectedMonth.key) - 1, 0)] : null;
  const selectedSummary = selectedMonth?.summary || createEmptyIgccSummary();
  const previousSummary = previousMonth && previousMonth.key !== selectedMonth?.key ? previousMonth.summary : createEmptyIgccSummary();
  const approvedProfitChange = selectedSummary.approvedProfit - previousSummary.approvedProfit;
  const submittedProfitChange = selectedSummary.submittedProfit - previousSummary.submittedProfit;
  const monthMovementCards = [
    {
      label: "Approved Profit",
      value: selectedSummary.approvedProfit,
      change: approvedProfitChange,
      reason: getMonthMovementReason(selectedSummary, previousSummary, "approved"),
      tone: getDeviationTone(selectedSummary.approvedProfit),
    },
    {
      label: "Submitted Profit",
      value: selectedSummary.submittedProfit,
      change: submittedProfitChange,
      reason: getMonthMovementReason(selectedSummary, previousSummary, "submitted"),
      tone: getDeviationTone(selectedSummary.submittedProfit),
    },
  ];
  const activeMonths = chartMonths
    .filter((month) => month.summary.totalCost || month.summary.approvedAfp || month.summary.submittedAfp);
  const latestActiveMonth = activeMonths.at(-1);
  const strongestMonth = activeMonths
    .slice()
    .sort((a, b) => b.summary.approvedProfit - a.summary.approvedProfit)[0];
  const insightCards = [
    {
      label: "Latest active month",
      value: latestActiveMonth ? latestActiveMonth.label : "No data",
      detail: latestActiveMonth
        ? `${formatCurrency(latestActiveMonth.summary.approvedProfit)} approved profit`
        : "Waiting for monthly inputs",
    },
    {
      label: "Best approved profit",
      value: strongestMonth ? strongestMonth.label : "No data",
      detail: strongestMonth
        ? `${formatCurrency(strongestMonth.summary.approvedProfit)} at ${formatPercent(strongestMonth.summary.approvedMargin)} margin`
        : "Waiting for monthly inputs",
    },
    {
      label: "Data rule",
      value: "CN excluded",
      detail: "Spent Report + Not Recorded only",
    },
  ];
  const renderYearSwitch = (label) => (
    <div className="home-year-switch" aria-label={label}>
      {yearOptions.map((year) => (
        <button
          key={year}
          type="button"
          className={year === selectedYear ? "is-active" : ""}
          onClick={() => handleHomeYearChange(year)}
        >
          {year}
        </button>
      ))}
    </div>
  );

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
            <p>One clean view of {selectedYear} spend, AFP, and profit performance</p>
            <div className="home-title-year-control">
              <strong>Switch year</strong>
              {renderYearSwitch("Home title year switch")}
            </div>
          </div>
          <div className="home-hero-actions">
            <span><Icon name="calendar" /> {today}</span>
            <button type="button" onClick={() => onNavigate("executive")}><Icon name="filter" /> Open Analysis</button>
          </div>
        </header>

        <article className="home-performance-board">
          <div className="home-board-head">
            <div>
              <span className="home-kicker">Live P&L overview</span>
              <h3>{selectedYear} Performance Board</h3>
              <p>Approved AFP, submitted AFP, and spend movement in one view.</p>
            </div>
            <div className="home-board-legend" aria-label="Chart legend">
              <span><i className="is-cost" /> Spent</span>
              <span><i className="is-approved" /> Approved</span>
              <span><i className="is-submitted" /> Submitted</span>
            </div>
          </div>

          <div className="home-command-metrics" aria-label={`IGCC ${selectedYear} profit and loss totals`}>
            {homePnlHighlights.map((item) => (
              <div className={`home-command-metric ${item.tone}`} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.isPercent ? formatPercent(item.value) : formatCurrency(item.value)}</strong>
              </div>
            ))}
          </div>

          <div className="home-month-chart" aria-label={`Monthly IGCC chart for ${selectedYear}`}>
            {chartMonths.map((month) => {
              const { summary } = month;
              const hasData = summary.totalCost || summary.approvedAfp || summary.submittedAfp;
              return (
                <article className={`home-month-column ${hasData ? "" : "is-empty"}`} key={month.key}>
                  <div className="home-month-column-bars" aria-hidden="true">
                    <span className="is-cost" style={{ height: `${Math.max(3, (summary.totalCost / maxMonthlyScale) * 100)}%` }} />
                    <span className="is-approved" style={{ height: `${Math.max(3, (summary.approvedAfp / maxMonthlyScale) * 100)}%` }} />
                    <span className="is-submitted" style={{ height: `${Math.max(3, (summary.submittedAfp / maxMonthlyScale) * 100)}%` }} />
                  </div>
                  <strong>{month.label}</strong>
                  <div className="home-month-profit-values">
                    <small className={`is-approved ${getDeviationTone(summary.approvedProfit)}`}>
                      <span>Approved</span>
                      <strong>{formatCurrency(summary.approvedProfit)}</strong>
                    </small>
                    <small className={`is-submitted ${getDeviationTone(summary.submittedProfit)}`}>
                      <span>Submitted</span>
                      <strong>{formatCurrency(summary.submittedProfit)}</strong>
                    </small>
                  </div>
                </article>
              );
            })}
          </div>

          <section className="home-month-analysis" aria-label="Selected month profit analysis">
            <div className="home-month-analysis-head">
              <div>
                <span className="home-kicker">Monthly position</span>
                <h4>{selectedMonth?.label} {selectedYear} Profit Movement</h4>
                <p>Compared with {previousMonth && previousMonth.key !== selectedMonth?.key ? `${previousMonth.label} ${selectedYear}` : "the previous month"}.</p>
              </div>
              <div className="home-month-switch" aria-label="Select month for profit movement">
                {chartMonths.map((month) => (
                  <button
                    key={month.key}
                    type="button"
                    className={month.key === selectedMonth?.key ? "is-active" : ""}
                    onClick={() => setSelectedHomeMonth(month.key)}
                  >
                    {month.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="home-month-analysis-grid">
              {monthMovementCards.map((item) => (
                <article className={`home-month-analysis-card ${item.tone}`} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{formatCurrency(item.value)}</strong>
                  <small>{formatSignedCurrency(item.change)} vs previous month</small>
                  <p>{item.reason}</p>
                </article>
              ))}
              <article className="home-month-analysis-card is-neutral">
                <span>Cost Position</span>
                <strong>{formatCurrency(selectedSummary.totalCost)}</strong>
                <small>{formatSignedCurrency(selectedSummary.totalCost - previousSummary.totalCost)} vs previous month</small>
                <p>Spent is compared against approved and submitted AFP to explain the monthly profit position.</p>
              </article>
            </div>
          </section>

          <div className="home-insight-strip">
            {insightCards.map((item) => (
              <div className="home-signal-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </article>

        <section className="home-actions-clean home-actions-modern" aria-label="Dashboard destinations">
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
