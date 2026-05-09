import { ALL_FILTER_VALUE, COST_CENTER_HIERARCHY } from "../data/costCenterHierarchy";
import financialInputsData from "../data/financialInputsData.json";

const DEFAULT_YEAR = "2025";
const GENERAL_COST_ALLOCATIONS = [
  { poolCostCenter: "GRLBG_23", hub: "BGC Hub" },
  { poolCostCenter: "GRLRO_23", hub: "ROO Hub" },
];
const GENERAL_POOL_COST_CENTERS = new Set(GENERAL_COST_ALLOCATIONS.map((rule) => rule.poolCostCenter));
const EXECUTIVE_HUB_ORDER = [
  "BGC Hub",
  "ROO Hub",
  "Total Hub",
  "BP Hub",
  "Camp",
  "Head Office",
  "West Qurna",
];
const COST_CENTER_LOOKUP = new Map(COST_CENTER_HIERARCHY.flatMap((group) => (
  group.costCenters.map((costCenter) => [costCenter, { hub: group.hub, region: group.region }])
)));

const getSelectedYear = (filters = {}) => (
  filters.year && filters.year !== ALL_FILTER_VALUE ? filters.year : DEFAULT_YEAR
);

const hasSelectedYear = (filters = {}) => filters.year && filters.year !== ALL_FILTER_VALUE;

const buildQuarters = (year) => [
  { key: "q1", label: "Q-1", periods: [`${year}-01`, `${year}-02`, `${year}-03`] },
  { key: "q2", label: "Q-2", periods: [`${year}-04`, `${year}-05`, `${year}-06`] },
  { key: "q3", label: "Q-3", periods: [`${year}-07`, `${year}-08`, `${year}-09`] },
  { key: "q4", label: "Q-4", periods: [`${year}-10`, `${year}-11`, `${year}-12`] },
];

const getQuarter = (period) => `Q${Math.ceil(Number(period?.slice(5, 7) || 1) / 3)}`;

const isHeadOffice = (entry) => entry.hub === "Head Office" || entry.costCenter === "HO_SB_23";

const formatWholeNumber = (value) => Math.round(value || 0).toLocaleString("en-US");

const formatPercent = (value) => `${Math.round(value || 0)}%`;

const getShare = (value, revenue) => (revenue ? (value / revenue) * 100 : 0);

const sumRows = (rows, predicate) => rows.reduce((total, row) => (
  predicate(row) ? total + (Number(row.amount) || 0) : total
), 0);

const createEmptySummary = () => ({
  revenue: 0,
  directCost: 0,
  overhead: 0,
  grossProfit: 0,
  totalCost: 0,
  netProfit: 0,
});

const matchesPortfolio = (entry, portfolio) => (
  !portfolio
  || portfolio === ALL_FILTER_VALUE
  || (portfolio === "basra" && entry.region === "Basra")
  || (portfolio === "kirkuk" && entry.region === "Kirkuk")
  || (portfolio === "head-office" && entry.hub === "Head Office")
);

const matchesFilters = (entry, filters = {}, { ignoreCostCenter = false } = {}) => (
  matchesPortfolio(entry, filters.portfolio)
  && (!filters.hub || filters.hub === ALL_FILTER_VALUE || entry.hub === filters.hub)
  && (ignoreCostCenter || !filters.costCenter || filters.costCenter === ALL_FILTER_VALUE || entry.costCenter === filters.costCenter)
  && (!filters.year || filters.year === ALL_FILTER_VALUE || entry.year === filters.year)
  && (filters.period !== "monthly" || !filters.month || filters.month === ALL_FILTER_VALUE || entry.month === filters.month)
  && (filters.period !== "quarterly" || !filters.quarter || filters.quarter === ALL_FILTER_VALUE || getQuarter(entry.period) === filters.quarter)
);

const getHubCostCenters = (hub, poolCostCenter) => (
  COST_CENTER_HIERARCHY.find((group) => group.hub === hub)?.costCenters || []
).filter((costCenter) => costCenter !== poolCostCenter);

const createAllocatedSpentRow = (entry, costCenter, amount, hub) => ({
  ...entry,
  costCenter,
  sourceCostCenter: entry.costCenter,
  hub,
  amount,
  allocationSourceCostCenter: entry.costCenter,
  isAllocatedGeneralCost: true,
});

const allocateGeneralSpentCosts = (entries, filters = {}) => {
  const periodFilters = {
    ...filters,
    costCenter: ALL_FILTER_VALUE,
    hub: ALL_FILTER_VALUE,
  };
  const periodRows = entries.filter((entry) => matchesFilters(entry, periodFilters));
  const allocatedRows = [];
  const allocatedEntryIds = new Set();

  for (const rule of GENERAL_COST_ALLOCATIONS) {
    const recipients = getHubCostCenters(rule.hub, rule.poolCostCenter);
    if (!recipients.length) continue;

    const poolRows = periodRows.filter((entry) => entry.type === "spent" && entry.costCenter === rule.poolCostCenter);
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
        allocatedRows.push(createAllocatedSpentRow(
          poolRow,
          basis.costCenter,
          (poolRow.amount || 0) * (basis.amount / basisTotal),
          rule.hub,
        ));
      }
    }
  }

  return [
    ...entries.filter((entry) => !(entry.type === "spent" && allocatedEntryIds.has(entry))),
    ...allocatedRows,
  ];
};

const getCostCenterHub = (costCenter, fallbackHub) => (
  COST_CENTER_LOOKUP.get(costCenter)?.hub || fallbackHub || "Other"
);

const formatHubLabel = (hub) => hub.replace(/\s+Hub$/, "");

const getCostCenterRow = (rowsByCostCenter, costCenter, hub) => {
  if (!rowsByCostCenter.has(costCenter)) {
    rowsByCostCenter.set(costCenter, {
      type: "costCenter",
      costCenter,
      hub: getCostCenterHub(costCenter, hub),
      spentCost: 0,
      allocatedGeneralCost: 0,
      receivedCn: 0,
      totalCost: 0,
      approvedAfp: 0,
      profit: 0,
      margin: 0,
    });
  }
  return rowsByCostCenter.get(costCenter);
};

const buildIgccSummary = (entries, filters, year, quarters) => {
  const yearFilters = { ...filters, year };
  const yearRows = entries.filter((entry) => matchesFilters(entry, yearFilters));
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
    const summary = byQuarter[quarter.key] || createEmptySummary();
    return {
      revenue: total.revenue + summary.revenue,
      directCost: total.directCost + summary.directCost,
      overhead: total.overhead + summary.overhead,
      grossProfit: total.grossProfit + summary.grossProfit,
      totalCost: total.totalCost + summary.totalCost,
      netProfit: total.netProfit + summary.netProfit,
    };
  }, createEmptySummary());

  return { byQuarter, yearTotal };
};

const buildCostCenterSummary = (allocatedEntries, rawEntries, filters) => {
  const yearFilters = { ...filters };
  const rowsByCostCenter = new Map();
  const rawRows = rawEntries.filter((entry) => matchesFilters(entry, yearFilters));
  const rows = allocatedEntries.filter((entry) => matchesFilters(entry, yearFilters));

  for (const entry of rawRows) {
    if (entry.type !== "spent" || GENERAL_POOL_COST_CENTERS.has(entry.costCenter)) continue;
    getCostCenterRow(rowsByCostCenter, entry.costCenter, entry.hub).spentCost += Number(entry.amount) || 0;
  }

  for (const entry of rows) {
    const row = getCostCenterRow(rowsByCostCenter, entry.costCenter, entry.hub);
    if (entry.type === "spent" && entry.isAllocatedGeneralCost) {
      row.allocatedGeneralCost += Number(entry.amount) || 0;
    } else if (entry.type === "creditNotes") {
      row.receivedCn += Number(entry.amount) || 0;
    } else if (entry.type === "approved") {
      row.approvedAfp += Number(entry.amount) || 0;
    }
  }

  return [...rowsByCostCenter.values()]
    .map((row) => {
      const totalCost = row.spentCost + row.allocatedGeneralCost + row.receivedCn;
      const profit = row.approvedAfp - totalCost;
      return {
        ...row,
        totalCost,
        profit,
        margin: getShare(profit, row.approvedAfp),
      };
    })
    .filter((row) => row.spentCost || row.allocatedGeneralCost || row.receivedCn || row.approvedAfp)
    .sort((a, b) => {
      const hubOrder = COST_CENTER_HIERARCHY.findIndex((group) => group.hub === a.hub)
        - COST_CENTER_HIERARCHY.findIndex((group) => group.hub === b.hub);
      return hubOrder || a.costCenter.localeCompare(b.costCenter);
    });
};

const sumCostCenterRows = (rows, hub) => {
  const total = rows.reduce((sum, row) => ({
    spentCost: sum.spentCost + row.spentCost,
    allocatedGeneralCost: sum.allocatedGeneralCost + row.allocatedGeneralCost,
    receivedCn: sum.receivedCn + row.receivedCn,
    totalCost: sum.totalCost + row.totalCost,
    approvedAfp: sum.approvedAfp + row.approvedAfp,
    profit: sum.profit + row.profit,
  }), {
    spentCost: 0,
    allocatedGeneralCost: 0,
    receivedCn: 0,
    totalCost: 0,
    approvedAfp: 0,
    profit: 0,
  });

  return {
    type: "hub",
    costCenter: formatHubLabel(hub),
    hub,
    ...total,
    margin: getShare(total.profit, total.approvedAfp),
  };
};

const buildHubCostCenterRows = (costCenterRows) => {
  const rowsByHub = costCenterRows.reduce((groups, row) => {
    if (!groups.has(row.hub)) groups.set(row.hub, []);
    groups.get(row.hub).push(row);
    return groups;
  }, new Map());
  const orderedHubs = [
    ...EXECUTIVE_HUB_ORDER.filter((hub) => rowsByHub.has(hub)),
    ...[...rowsByHub.keys()].filter((hub) => !EXECUTIVE_HUB_ORDER.includes(hub)).sort((a, b) => a.localeCompare(b)),
  ];

  return orderedHubs.flatMap((hub) => {
    const rows = rowsByHub.get(hub).sort((a, b) => a.costCenter.localeCompare(b.costCenter));
    return [sumCostCenterRows(rows, hub), ...rows];
  });
};

function SummaryValue({ value, isPercent = false, tone }) {
  const className = tone || (value < 0 ? "is-negative" : "");
  return (
    <td className={`is-number ${className}`}>
      {isPercent ? formatPercent(value) : formatWholeNumber(value)}
    </td>
  );
}

export function ExecutiveCockpitPage({ filters = {} }) {
  const isYearFiltered = hasSelectedYear(filters);
  const year = getSelectedYear(filters);
  const quarters = buildQuarters(year);
  const rawEntries = financialInputsData.entries || [];
  const summaryEntries = allocateGeneralSpentCosts(rawEntries, { ...filters, year });
  const costCenterFilters = isYearFiltered ? { ...filters, year } : { ...filters, year: ALL_FILTER_VALUE };
  const costCenterEntries = allocateGeneralSpentCosts(rawEntries, costCenterFilters);
  const { byQuarter, yearTotal } = buildIgccSummary(summaryEntries, filters, year, quarters);
  const costCenterRows = buildCostCenterSummary(costCenterEntries, rawEntries, costCenterFilters);
  const hubCostCenterRows = buildHubCostCenterRows(costCenterRows);
  const costCenterYearLabel = isYearFiltered ? `Year ${year}` : "Years 2025 & 2026";
  const rows = [
    { label: "Total Revenue (Approved AFP)", key: "revenue", highlight: true },
    { label: "Direct Cost", key: "directCost" },
    { label: "Gross Profit", key: "grossProfit", highlight: true },
    { label: "Indirect Cost (Head Office)", key: "overhead" },
    { label: "Total Cost", key: "totalCost" },
    { label: "Net Profit", key: "netProfit", highlight: true },
  ];

  return (
    <section className="page-stack executive-cockpit-page">
      <div className="page-heading executive-heading">
        <p className="eyebrow">CEO-level dashboard</p>
        <h2>Executive Cockpit</h2>
        <p>IGCC-level financial summary by quarter, based on approved Application for Payment revenue and actual cost.</p>
      </div>

      <article className="surface-card executive-summary-card">
        <div className="executive-table-title">
          <h3>1- IGCC-Level Summary</h3>
          <span>Year {year}</span>
        </div>
        <div className="executive-table-wrap">
          <table className="executive-summary-table">
            <thead>
              <tr>
                <th>Item</th>
                {quarters.map((quarter) => <th key={quarter.key}>{quarter.label}</th>)}
                <th>Year {year}</th>
                <th>% of Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={row.highlight ? "is-highlight" : ""}>
                  <td>{row.label}</td>
                  {quarters.map((quarter) => (
                    <SummaryValue key={quarter.key} value={byQuarter[quarter.key]?.[row.key] || 0} />
                  ))}
                  <SummaryValue value={yearTotal[row.key]} />
                  <SummaryValue value={getShare(yearTotal[row.key], yearTotal.revenue)} isPercent />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="executive-table-note">Indirect cost is calculated from Head Office only; general BGC and ROO costs are reallocated to their operational cost centers.</p>
      </article>

      <article className="surface-card executive-summary-card">
        <div className="executive-table-title">
          <h3>2- Cost Center Profitability Summary</h3>
          <span>{costCenterYearLabel} - {costCenterRows.length} cost centers</span>
        </div>
        <div className="executive-table-wrap">
          <table className="executive-summary-table executive-cost-center-table">
            <thead>
              <tr>
                <th>Cost Center</th>
                <th>Cost from Spent Report</th>
                <th>General Cost Reallocate</th>
                <th>Received CN</th>
                <th>Total Cost</th>
                <th>Approved AFP</th>
                <th>Profit</th>
                <th>Margin %</th>
              </tr>
            </thead>
            <tbody>
              {hubCostCenterRows.length ? hubCostCenterRows.map((row) => (
                <tr
                  key={`${row.type}-${row.hub}-${row.costCenter}`}
                  className={[
                    row.type === "hub" ? "is-hub-total" : "",
                    row.profit < 0 ? "has-loss" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <td>{row.type === "hub" ? row.costCenter : <span>{row.costCenter}</span>}</td>
                  <SummaryValue value={row.spentCost} />
                  <SummaryValue value={row.allocatedGeneralCost} />
                  <SummaryValue value={row.receivedCn} />
                  <SummaryValue value={row.totalCost} />
                  <SummaryValue value={row.approvedAfp} />
                  <SummaryValue value={row.profit} />
                  <SummaryValue value={row.margin} isPercent />
                </tr>
              )) : (
                <tr>
                  <td className="executive-empty-row" colSpan={8}>No cost center data for the selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
