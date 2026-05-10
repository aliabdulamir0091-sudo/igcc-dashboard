import { useState } from "react";
import {
  ALL_FILTER_VALUE,
  COST_CENTER_HIERARCHY,
  ROO_SUB_HUBS,
  getCostCenterFilterMembers,
  getCostCenterGroupValue,
  matchesCostCenterFilter,
} from "../data/costCenterHierarchy";
import financialInputsData from "../data/financialInputsData.json";

const DEFAULT_YEAR = "2025";
const GENERAL_COST_ALLOCATIONS = [
  { poolCostCenter: "GRLBG_23", hub: "BGC Hub" },
  { poolCostCenter: "GRLRO_23", hub: "ROO Hub" },
];
const GENERAL_POOL_COST_CENTERS = new Set(GENERAL_COST_ALLOCATIONS.map((rule) => rule.poolCostCenter));
const MANAGEMENT_SOURCE_COST_CENTER = "Management";
const HEAD_OFFICE_COST_CENTER = "HO_SB_23";
const HIDDEN_COST_CENTER_ROWS = new Set(["Camp"]);
const EXECUTIVE_HUB_ORDER = [
  "BGC Hub",
  "ROO Hub",
  "Total Hub",
  "BP Hub",
  "Camp",
  "Head Office",
  "West Qurna",
];
const ROO_ASSIGNED_COST_CENTERS = new Set(ROO_SUB_HUBS.flatMap((group) => group.costCenters));
const COST_CENTER_ALIASES = {
  "PWT PWRI1_23": "PWRI-PWT",
};
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
  && (ignoreCostCenter || matchesCostCenterFilter(entry.costCenter, filters.costCenter))
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
  sourceCostCenter: entry.sourceCostCenter || entry.costCenter,
  hub,
  amount,
  allocationSourceCostCenter: entry.costCenter,
  isAllocatedGeneralCost: true,
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
      const hub = getCostCenterHub(basis.costCenter, managementRow.hub);
      allocatedRows.push(createAllocatedManagementRow(
        managementRow,
        basis.costCenter,
        (managementRow.amount || 0) * (basis.amount / basisTotal),
        hub,
      ));
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

const normalizeCostCenter = (costCenter) => COST_CENTER_ALIASES[costCenter] || costCenter;

const formatHubLabel = (hub) => hub.replace(/\s+Hub$/, "");

const getCostCenterRow = (rowsByCostCenter, costCenter, hub) => {
  if (!rowsByCostCenter.has(costCenter)) {
    rowsByCostCenter.set(costCenter, {
      type: "costCenter",
      costCenter,
      hub: getCostCenterHub(costCenter, hub),
      spentCost: 0,
      allocatedGeneralCost: 0,
      allocatedManagementCost: 0,
      receivedCn: 0,
      totalCost: 0,
      submittedAfp: 0,
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
    if (
      entry.type !== "spent"
      || GENERAL_POOL_COST_CENTERS.has(entry.costCenter)
      || HIDDEN_COST_CENTER_ROWS.has(normalizeCostCenter(entry.costCenter))
      || entry.sourceCostCenter === MANAGEMENT_SOURCE_COST_CENTER
    ) continue;
    getCostCenterRow(rowsByCostCenter, normalizeCostCenter(entry.costCenter), entry.hub).spentCost += Number(entry.amount) || 0;
  }

  for (const entry of rows) {
    const costCenter = normalizeCostCenter(entry.costCenter);
    if (HIDDEN_COST_CENTER_ROWS.has(costCenter)) continue;
    const row = getCostCenterRow(rowsByCostCenter, costCenter, entry.hub);
    if (entry.type === "spent" && entry.isAllocatedGeneralCost) {
      row.allocatedGeneralCost += Number(entry.amount) || 0;
    } else if (entry.type === "spent" && entry.isAllocatedManagementCost) {
      row.allocatedManagementCost += Number(entry.amount) || 0;
    } else if (entry.type === "creditNotes") {
      row.receivedCn += Number(entry.amount) || 0;
    } else if (entry.type === "submitted") {
      row.submittedAfp += Number(entry.amount) || 0;
    } else if (entry.type === "approved") {
      row.approvedAfp += Number(entry.amount) || 0;
    }
  }

  return [...rowsByCostCenter.values()]
    .map((row) => {
      const totalCost = row.spentCost + row.allocatedGeneralCost + row.allocatedManagementCost + row.receivedCn;
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

const sumCostCenterRows = (rows, hub, type = "hub", label = formatHubLabel(hub)) => {
  const total = rows.reduce((sum, row) => ({
    spentCost: sum.spentCost + row.spentCost,
    allocatedGeneralCost: sum.allocatedGeneralCost + row.allocatedGeneralCost,
    allocatedManagementCost: sum.allocatedManagementCost + row.allocatedManagementCost,
    receivedCn: sum.receivedCn + row.receivedCn,
    totalCost: sum.totalCost + row.totalCost,
    submittedAfp: sum.submittedAfp + row.submittedAfp,
    approvedAfp: sum.approvedAfp + row.approvedAfp,
    profit: sum.profit + row.profit,
  }), {
    spentCost: 0,
    allocatedGeneralCost: 0,
    allocatedManagementCost: 0,
    receivedCn: 0,
    totalCost: 0,
    submittedAfp: 0,
    approvedAfp: 0,
    profit: 0,
  });

  return {
    type,
    costCenter: label,
    hub,
    ...total,
    margin: getShare(total.profit, total.approvedAfp),
  };
};

const buildRooRows = (rows) => {
  const rowsByCostCenter = new Map(rows.map((row) => [row.costCenter, row]));
  const orderedRows = [];
  const unassignedRows = rows
    .filter((row) => !ROO_ASSIGNED_COST_CENTERS.has(row.costCenter))
    .sort((a, b) => a.costCenter.localeCompare(b.costCenter));

  for (const group of ROO_SUB_HUBS) {
    const listedRows = group.costCenters.map((costCenter) => rowsByCostCenter.get(costCenter)).filter(Boolean);
    const groupRows = group.label === "Other Project" ? [...listedRows, ...unassignedRows] : listedRows;
    if (!groupRows.length) continue;
    orderedRows.push({
      ...sumCostCenterRows(groupRows, "ROO Hub", "subgroup", group.label),
      filterCostCenter: getCostCenterGroupValue(group.id),
    }, ...groupRows);
  }

  return orderedRows;
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

  const hubRows = orderedHubs.flatMap((hub) => {
    const rows = rowsByHub.get(hub).sort((a, b) => a.costCenter.localeCompare(b.costCenter));
    if (hub === "ROO Hub") return [sumCostCenterRows(rows, hub), ...buildRooRows(rows)];
    return [sumCostCenterRows(rows, hub), ...rows];
  });
  return costCenterRows.length
    ? [sumCostCenterRows(costCenterRows, "IGCC", "igcc", "IGCC Level 1"), ...hubRows]
    : hubRows;
};

function SummaryValue({ value, isPercent = false, tone }) {
  const className = tone || (value < 0 ? "is-negative" : "");
  return (
    <td className={`is-number ${className}`}>
      {isPercent ? formatPercent(value) : formatWholeNumber(value)}
    </td>
  );
}

const getRowCostCenters = (row, costCenterRows) => {
  if (!row) return [];
  if (row.type === "costCenter") return [row.costCenter];
  if (row.type === "subgroup") {
    const members = getCostCenterFilterMembers(row.filterCostCenter);
    return members.length ? members : costCenterRows.filter((item) => item.hub === row.hub).map((item) => item.costCenter);
  }
  if (row.type === "hub") return costCenterRows.filter((item) => item.hub === row.hub).map((item) => item.costCenter);
  if (row.type === "igcc") return costCenterRows.map((item) => item.costCenter);
  return [];
};

const groupAmounts = (entries, getKey) => [...entries.reduce((map, entry) => {
  const key = getKey(entry);
  map.set(key, (map.get(key) || 0) + (Number(entry.amount) || 0));
  return map;
}, new Map())]
  .map(([label, amount]) => ({ label, amount }))
  .filter((item) => item.amount)
  .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

const buildSimpleReport = (row, costCenterRows, allocatedEntries, rawEntries, filters) => {
  if (!row) return null;
  const members = new Set(getRowCostCenters(row, costCenterRows));
  const rowsInScope = (entries, type) => entries.filter((entry) => (
    entry.type === type
    && members.has(normalizeCostCenter(entry.costCenter))
    && matchesFilters(entry, filters, { ignoreCostCenter: true })
  ));
  const rawSpentRows = rowsInScope(rawEntries, "spent")
    .filter((entry) => (
      !GENERAL_POOL_COST_CENTERS.has(entry.costCenter)
      && !HIDDEN_COST_CENTER_ROWS.has(normalizeCostCenter(entry.costCenter))
      && entry.sourceCostCenter !== MANAGEMENT_SOURCE_COST_CENTER
    ));
  const cnRows = rowsInScope(allocatedEntries, "creditNotes");

  const approvedMargin = row.approvedAfp - row.totalCost;
  const submittedMargin = row.submittedAfp - row.totalCost;

  return {
    title: row.type === "costCenter" ? row.costCenter : row.costCenter,
    scope: row.type === "costCenter" ? row.hub : `${row.type.toUpperCase()} | ${members.size} cost centers`,
    approvedAfp: row.approvedAfp,
    submittedAfp: row.submittedAfp,
    directCost: row.spentCost,
    generalHubCost: row.allocatedGeneralCost,
    managementCost: row.allocatedManagementCost,
    receivedCn: row.receivedCn,
    totalCost: row.totalCost,
    approvedMargin,
    approvedMarginPercent: getShare(approvedMargin, row.approvedAfp),
    submittedMargin,
    submittedMarginPercent: getShare(submittedMargin, row.submittedAfp),
    spendBreakdown: groupAmounts(rawSpentRows, (entry) => entry.glName || "Unclassified"),
    cnBreakdown: groupAmounts(cnRows, (entry) => entry.category || entry.issuedBy || "Credit Note"),
  };
};

function SimpleReportModal({ report, onClose }) {
  if (!report) return null;
  const costRows = [
    ["Approved AFP", report.approvedAfp],
    ["Submitted AFP", report.submittedAfp],
    ["Direct Cost from Spent report", report.directCost],
    ["General Hub Cost", report.generalHubCost],
    ["Management Cost", report.managementCost],
    ["CN", report.receivedCn],
  ];
  return (
    <div className="simple-report-backdrop" onClick={onClose}>
      <article className="simple-report-sheet" aria-label={`${report.title} simple report`} onClick={(event) => event.stopPropagation()}>
        <header className="simple-report-header">
          <div>
            <span>Simple report</span>
            <h3>{report.title}</h3>
            <p>{report.scope}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close report">Close</button>
        </header>
        <table className="simple-report-table">
          <tbody>
            {costRows.map(([label, value]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{formatWholeNumber(value)}</td>
                <td />
              </tr>
            ))}
            <tr className="is-total">
              <td>Total Cost</td>
              <td>{formatWholeNumber(report.totalCost)}</td>
              <td />
            </tr>
            <tr>
              <td>Margin- Approved AFP</td>
              <td className={report.approvedMargin < 0 ? "is-bad" : "is-good"}>{formatWholeNumber(report.approvedMargin)}</td>
              <td>{formatPercent(report.approvedMarginPercent)}</td>
            </tr>
            <tr>
              <td>Margin Submitted AFP</td>
              <td className={report.submittedMargin < 0 ? "is-bad" : "is-good"}>{formatWholeNumber(report.submittedMargin)}</td>
              <td>{formatPercent(report.submittedMarginPercent)}</td>
            </tr>
            <tr className="is-section">
              <td colSpan={3}>Spent Report Cost Breakdown</td>
            </tr>
            {(report.spendBreakdown.length ? report.spendBreakdown : [{ label: "No spent detail", amount: 0 }]).map((item) => (
              <tr key={`spent-${item.label}`}>
                <td>{item.label}</td>
                <td>{item.amount ? formatWholeNumber(item.amount) : ""}</td>
                <td />
              </tr>
            ))}
            <tr className="is-section">
              <td colSpan={3}>Received CN Breakdown</td>
            </tr>
            {(report.cnBreakdown.length ? report.cnBreakdown : [{ label: "No CN detail", amount: 0 }]).map((item) => (
              <tr key={`cn-${item.label}`}>
                <td>{item.label}</td>
                <td>{item.amount ? formatWholeNumber(item.amount) : ""}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </div>
  );
}

export function ExecutiveCockpitPage({ filters = {}, onNavigate, onApplyFilters }) {
  const [reportRow, setReportRow] = useState(null);
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
  const selectedReport = buildSimpleReport(reportRow, costCenterRows, costCenterEntries, rawEntries, costCenterFilters);
  const costCenterYearLabel = isYearFiltered ? `Year ${year}` : "Years 2025 & 2026";
  const rows = [
    { label: "Total Revenue (Approved AFP)", key: "revenue", highlight: true },
    { label: "Direct Cost", key: "directCost" },
    { label: "Gross Profit", key: "grossProfit", highlight: true },
    { label: "Indirect Cost (Head Office)", key: "overhead" },
    { label: "Total Cost", key: "totalCost" },
    { label: "Net Profit", key: "netProfit", highlight: true },
  ];
  const openDetailRow = (row) => {
    setReportRow(row);
  };
  const navigateDetailRow = (row) => {
    if (!onNavigate || !onApplyFilters) return;
    const nextFilters = {
      ...filters,
      hub: ALL_FILTER_VALUE,
      costCenter: ALL_FILTER_VALUE,
    };
    if (row.type === "hub") {
      nextFilters.hub = row.hub;
    } else if (row.type === "subgroup") {
      nextFilters.hub = "ROO Hub";
      nextFilters.costCenter = row.filterCostCenter || ALL_FILTER_VALUE;
    } else if (row.type === "costCenter") {
      nextFilters.hub = row.hub;
      nextFilters.costCenter = row.costCenter;
    }
    onApplyFilters(nextFilters);
    onNavigate("detail");
  };

  return (
    <section className="page-stack executive-cockpit-page">
      <div className="page-heading executive-heading">
        <p className="eyebrow">Operations control view</p>
        <h2>IGCC Operations Performance</h2>
        <p>Hub, cost center, AFP, cost, CN, and profit view.</p>
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
                <th>Management Cost</th>
                <th>Received CN</th>
                <th>Total Cost</th>
                <th>Submitted AFP</th>
                <th>Approved AFP</th>
                <th>Profit</th>
                <th>Margin %</th>
                <th>Submitted Margin %</th>
              </tr>
            </thead>
            <tbody>
              {hubCostCenterRows.length ? hubCostCenterRows.map((row) => (
                <tr
                  key={`${row.type}-${row.hub}-${row.costCenter}`}
                  role="button"
                  tabIndex={0}
                  className={[
                    "is-clickable-row",
                    row.type === "igcc" ? "is-igcc-total" : "",
                    row.type === "hub" ? "is-hub-total" : "",
                    row.type === "subgroup" ? "is-subgroup-total" : "",
                    row.profit < 0 ? "has-loss" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => openDetailRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDetailRow(row);
                    }
                  }}
                  onDoubleClick={() => navigateDetailRow(row)}
                >
                  <td>{row.type === "costCenter" ? <span>{row.costCenter}</span> : row.costCenter}</td>
                  <SummaryValue value={row.spentCost} />
                  <SummaryValue value={row.allocatedGeneralCost} />
                  <SummaryValue value={row.allocatedManagementCost} />
                  <SummaryValue value={row.receivedCn} />
                  <SummaryValue value={row.totalCost} />
                  <SummaryValue value={row.submittedAfp} />
                  <SummaryValue value={row.approvedAfp} />
                  <SummaryValue value={row.profit} />
                  <SummaryValue value={row.margin} isPercent />
                  <SummaryValue value={getShare(row.submittedAfp - row.totalCost, row.submittedAfp)} isPercent />
                </tr>
              )) : (
                <tr>
                  <td className="executive-empty-row" colSpan={11}>No cost center data for the selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
      <SimpleReportModal report={selectedReport} onClose={() => setReportRow(null)} />
    </section>
  );
}
