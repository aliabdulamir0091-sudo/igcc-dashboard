import { useMemo } from "react";

import { Icon } from "../components/Icons";
import { COST_CENTER_HIERARCHY } from "../data/costCenterHierarchy";
import { NAV_ITEMS } from "../data/navigation";
import { useAfpFinancialInputs } from "../hooks/useAfpFinancialInputs";
import igccLogo from "../assets/igcc-logo.svg";

const DEFAULT_YEAR = "2026";
const GENERAL_COST_ALLOCATIONS = [
  { poolCostCenter: "GRLBG_23", hub: "BGC Hub" },
  { poolCostCenter: "GRLRO_23", hub: "ROO Hub" },
];
const MANAGEMENT_SOURCE_COST_CENTER = "Management";
const GENERAL_POOL_COST_CENTERS = new Set(GENERAL_COST_ALLOCATIONS.map((rule) => rule.poolCostCenter));
const HEAD_OFFICE_COST_CENTER = "HO_SB_23";
const HIDDEN_COST_CENTER_ROWS = new Set(["Camp"]);
const COST_CENTER_LOOKUP = new Map(COST_CENTER_HIERARCHY.flatMap((group) => (
  group.costCenters.map((costCenter) => [costCenter, { hub: group.hub, region: group.region }])
)));

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

const buildQuarters = (year) => [
  { key: "q1", label: "Q-1", periods: [`${year}-01`, `${year}-02`, `${year}-03`] },
  { key: "q2", label: "Q-2", periods: [`${year}-04`, `${year}-05`, `${year}-06`] },
  { key: "q3", label: "Q-3", periods: [`${year}-07`, `${year}-08`, `${year}-09`] },
  { key: "q4", label: "Q-4", periods: [`${year}-10`, `${year}-11`, `${year}-12`] },
];

const createEmptyIgccSummary = () => ({
  revenue: 0,
  directCost: 0,
  overhead: 0,
  grossProfit: 0,
  totalCost: 0,
  netProfit: 0,
});

const isHeadOffice = (entry) => entry.hub === "Head Office" || entry.costCenter === HEAD_OFFICE_COST_CENTER;

const getCostCenterHub = (costCenter, fallbackHub) => (
  COST_CENTER_LOOKUP.get(costCenter)?.hub || fallbackHub || "Other"
);

const getHubCostCenters = (hub, poolCostCenter) => (
  COST_CENTER_HIERARCHY.find((group) => group.hub === hub)?.costCenters || []
).filter((costCenter) => costCenter !== poolCostCenter);

const createAllocatedSpentRow = (entry, costCenter, amount, hub) => ({
  ...entry,
  costCenter,
  sourceCostCenter: entry.sourceCostCenter || entry.costCenter,
  hub,
  amount,
  allocationSourceCostCenter: entry.costCenter,
  isAllocatedGeneralCost: true,
});

const createAllocatedGeneralCreditNoteRow = (entry, costCenter, amount, hub) => ({
  ...entry,
  costCenter,
  sourceCostCenter: entry.sourceCostCenter || entry.costCenter,
  hub,
  amount,
  allocationSourceCostCenter: entry.costCenter,
  isAllocatedGeneralCreditNote: true,
});

const createAllocatedManagementRow = (entry, costCenter, amount, hub) => ({
  ...entry,
  costCenter,
  sourceCostCenter: entry.sourceCostCenter || entry.costCenter,
  hub,
  amount,
  allocationSourceCostCenter: MANAGEMENT_SOURCE_COST_CENTER,
  isAllocatedManagementCost: true,
});

const getAllOperationalCostCenters = () => COST_CENTER_HIERARCHY
  .filter((group) => group.hub !== "Head Office")
  .flatMap((group) => group.costCenters)
  .filter((costCenter) => !GENERAL_POOL_COST_CENTERS.has(costCenter) && costCenter !== HEAD_OFFICE_COST_CENTER && !HIDDEN_COST_CENTER_ROWS.has(costCenter));

const allocateGeneralSpentCosts = (entries, year) => {
  const periodRows = entries.filter((entry) => entry.year === year);
  const allocatedRows = [];
  const allocatedEntryIds = new Set();

  for (const rule of GENERAL_COST_ALLOCATIONS) {
    const recipients = getHubCostCenters(rule.hub, rule.poolCostCenter);
    if (!recipients.length) continue;

    const poolRows = periodRows.filter((entry) => entry.type === "spent" && entry.costCenter === rule.poolCostCenter);
    const poolCreditNoteRows = periodRows.filter((entry) => entry.type === "creditNotes" && entry.costCenter === rule.poolCostCenter);
    const recipientRows = periodRows.filter((entry) => (
      entry.type === "spent"
      && recipients.includes(entry.costCenter)
      && !entry.isAllocatedGeneralCost
    ));
    const fallbackTotals = recipients.map((costCenter) => ({
      costCenter,
      amount: sumRows(recipientRows, (entry) => entry.costCenter === costCenter),
    })).filter((row) => row.amount > 0);
    const fallbackTotal = fallbackTotals.reduce((total, row) => total + row.amount, 0);

    for (const poolRow of poolRows) {
      const periodRecipientTotals = recipients.map((costCenter) => ({
        costCenter,
        amount: sumRows(recipientRows, (entry) => entry.period === poolRow.period && entry.costCenter === costCenter),
      })).filter((row) => row.amount > 0);
      const periodTotal = periodRecipientTotals.reduce((total, row) => total + row.amount, 0);
      const basisRows = periodTotal > 0 ? periodRecipientTotals : fallbackTotals;
      const basisTotal = periodTotal > 0 ? periodTotal : fallbackTotal;
      if (!basisTotal) continue;

      allocatedEntryIds.add(poolRow);
      for (const basis of basisRows) {
        allocatedRows.push(createAllocatedSpentRow(poolRow, basis.costCenter, (poolRow.amount || 0) * (basis.amount / basisTotal), rule.hub));
      }
    }

    for (const poolCreditNoteRow of poolCreditNoteRows) {
      const periodRecipientTotals = recipients.map((costCenter) => ({
        costCenter,
        amount: sumRows(recipientRows, (entry) => entry.period === poolCreditNoteRow.period && entry.costCenter === costCenter),
      })).filter((row) => row.amount > 0);
      const periodTotal = periodRecipientTotals.reduce((total, row) => total + row.amount, 0);
      const basisRows = periodTotal > 0 ? periodRecipientTotals : fallbackTotals;
      const basisTotal = periodTotal > 0 ? periodTotal : fallbackTotal;
      if (!basisTotal) continue;

      allocatedEntryIds.add(poolCreditNoteRow);
      for (const basis of basisRows) {
        allocatedRows.push(createAllocatedGeneralCreditNoteRow(poolCreditNoteRow, basis.costCenter, (poolCreditNoteRow.amount || 0) * (basis.amount / basisTotal), rule.hub));
      }
    }
  }

  const managementRecipients = getAllOperationalCostCenters();
  const managementRows = periodRows.filter((entry) => (
    entry.type === "spent"
    && entry.sourceCostCenter === MANAGEMENT_SOURCE_COST_CENTER
  ));
  const managementBasisRows = periodRows.filter((entry) => (
    entry.type === "spent"
    && managementRecipients.includes(entry.costCenter)
    && entry.sourceCostCenter !== MANAGEMENT_SOURCE_COST_CENTER
    && !entry.isAllocatedGeneralCost
    && !entry.isAllocatedManagementCost
  ));
  const fallbackManagementTotals = managementRecipients.map((costCenter) => ({
    costCenter,
    amount: sumRows(managementBasisRows, (entry) => entry.costCenter === costCenter),
  })).filter((row) => row.amount > 0);
  const fallbackManagementTotal = fallbackManagementTotals.reduce((total, row) => total + row.amount, 0);

  for (const managementRow of managementRows) {
    const periodRecipientTotals = managementRecipients.map((costCenter) => ({
      costCenter,
      amount: sumRows(managementBasisRows, (entry) => entry.period === managementRow.period && entry.costCenter === costCenter),
    })).filter((row) => row.amount > 0);
    const periodTotal = periodRecipientTotals.reduce((total, row) => total + row.amount, 0);
    const basisRows = periodTotal > 0 ? periodRecipientTotals : fallbackManagementTotals;
    const basisTotal = periodTotal > 0 ? periodTotal : fallbackManagementTotal;
    if (!basisTotal) continue;

    allocatedEntryIds.add(managementRow);
    for (const basis of basisRows) {
      allocatedRows.push(createAllocatedManagementRow(
        managementRow,
        basis.costCenter,
        (managementRow.amount || 0) * (basis.amount / basisTotal),
        getCostCenterHub(basis.costCenter, managementRow.hub),
      ));
    }
  }

  return [
    ...periodRows.filter((entry) => !allocatedEntryIds.has(entry)),
    ...allocatedRows,
  ];
};

const buildHomeIgccSummary = (entries, year = DEFAULT_YEAR) => {
  const quarters = buildQuarters(year);
  const yearRows = allocateGeneralSpentCosts(entries, year);
  const byQuarter = {};

  for (const quarter of quarters) {
    const rows = yearRows.filter((entry) => quarter.periods.includes(entry.period));
    const revenue = sumRows(rows, (entry) => entry.type === "approved");
    const directCost = sumRows(rows, (entry) => entry.type === "spent" && !isHeadOffice(entry));
    const overhead = sumRows(rows, (entry) => entry.type === "spent" && isHeadOffice(entry));
    const totalCost = directCost + overhead;
    byQuarter[quarter.key] = {
      revenue,
      directCost,
      overhead,
      grossProfit: revenue - directCost,
      totalCost,
      netProfit: revenue - totalCost,
    };
  }

  const yearTotal = quarters.reduce((total, quarter) => {
    const summary = byQuarter[quarter.key] || createEmptyIgccSummary();
    return {
      revenue: total.revenue + summary.revenue,
      directCost: total.directCost + summary.directCost,
      overhead: total.overhead + summary.overhead,
      grossProfit: total.grossProfit + summary.grossProfit,
      totalCost: total.totalCost + summary.totalCost,
      netProfit: total.netProfit + summary.netProfit,
    };
  }, createEmptyIgccSummary());

  return { quarters, byQuarter, yearTotal };
};

const igccSummaryRows = [
  { label: "Total Revenue (Approved AFP)", key: "revenue", highlight: true },
  { label: "Direct Cost", key: "directCost" },
  { label: "Gross Profit", key: "grossProfit", highlight: true },
  { label: "Indirect Cost (Head Office)", key: "overhead" },
  { label: "Total Cost", key: "totalCost" },
  { label: "Net Profit", key: "netProfit", highlight: true },
];

const getDeviationTone = (value) => {
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
    isLoadingAfpMaster,
    isLoadingSpentReport,
    isLoadingCreditNotes,
  } = useAfpFinancialInputs();
  const isLoading = isLoadingAfpMaster || isLoadingSpentReport || isLoadingCreditNotes;
  const { totals, deviations, yearRows } = useMemo(() => buildHomeSummary(entries), [entries]);
  const { quarters, byQuarter, yearTotal } = useMemo(() => buildHomeIgccSummary(entries, DEFAULT_YEAR), [entries]);

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

        <article className="surface-card executive-summary-card home-igcc-summary-card">
          <div className="executive-table-title">
            <h3>1- IGCC-Level Summary</h3>
            <span>Year {DEFAULT_YEAR}</span>
          </div>
          <div className="executive-table-wrap home-igcc-table-wrap">
            <table className="executive-summary-table home-igcc-summary-table">
              <thead>
                <tr>
                  <th>Item</th>
                  {quarters.map((quarter) => <th key={quarter.key}>{quarter.label}</th>)}
                  <th>Year {DEFAULT_YEAR}</th>
                  <th>% of Revenue</th>
                </tr>
              </thead>
              <tbody>
                {igccSummaryRows.map((row) => (
                  <tr key={row.key} className={row.highlight ? "is-highlight" : ""}>
                    <td>{row.label}</td>
                    {quarters.map((quarter) => (
                      <td className="is-number" key={quarter.key}>{formatWholeNumber(byQuarter[quarter.key]?.[row.key] || 0)}</td>
                    ))}
                    <td className="is-number">{formatWholeNumber(yearTotal[row.key])}</td>
                    <td className="is-number">{formatPercent(getShare(yearTotal[row.key], yearTotal.revenue))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="executive-table-note">Indirect cost is calculated from Head Office only; general BGC and ROO costs are reallocated to their operational cost centers.</p>
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
