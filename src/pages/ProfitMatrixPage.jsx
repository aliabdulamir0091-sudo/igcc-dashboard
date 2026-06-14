import { useMemo, useState } from "react";
import { Icon } from "../components/Icons";
import {
  ALL_FILTER_VALUE,
  BGC_SUB_HUBS,
  COST_CENTER_HIERARCHY,
  ROO_SUB_HUBS,
  getCostCenterFilterLabel,
  getCostCenterFilterMembers,
  getCostCenterGroupValue,
  matchesCostCenterFilter,
} from "../data/costCenterHierarchy";
import { useAfpFinancialInputs } from "../hooks/useAfpFinancialInputs";

const BASIS_OPTIONS = [
  { id: "approved", label: "Approved AFP" },
  { id: "submitted", label: "Submitted AFP" },
];

const MONTH_LABELS = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  10: "Oct",
  11: "Nov",
  12: "Dec",
};

const CURRENCY_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const COMPACT_FORMAT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const GENERAL_COST_ALLOCATIONS = [
  { poolCostCenter: "GRLBG_23", hub: "BGC Hub" },
  { poolCostCenter: "GRLRO_23", hub: "ROO Hub" },
];
const GENERAL_POOL_COST_CENTERS = new Set(GENERAL_COST_ALLOCATIONS.map((rule) => rule.poolCostCenter));
const MANAGEMENT_SOURCE_COST_CENTER = "Management";
const HEAD_OFFICE_COST_CENTER = "HO_SB_23";
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
const BGC_ASSIGNED_COST_CENTERS = new Set(BGC_SUB_HUBS.flatMap((group) => group.costCenters));
const REPORT_COST_CENTER_ALIASES = {
  "PWT PWRI1_23": "PWRI-PWT",
};

const roundCurrency = (value) => Math.round(((value || 0) + Number.EPSILON) * 100) / 100;
const formatCurrency = (value) => CURRENCY_FORMAT.format(value || 0);
const formatCompactCurrency = (value) => `$${COMPACT_FORMAT.format(value || 0)}`;
const formatPercent = (value) => `${NUMBER_FORMAT.format(value || 0)}%`;
const getShare = (value, total) => (total ? ((value || 0) / total) * 100 : 0);
const sumRows = (rows, predicate) => rows.reduce((sum, entry) => (
  predicate(entry) ? sum + (entry.amount || 0) : sum
), 0);

const getQuarter = (period) => `Q${Math.ceil(Number(period?.slice(5, 7) || 1) / 3)}`;
const getPeriodLabel = (period) => `${MONTH_LABELS[period.slice(5, 7)] || period.slice(5, 7)} ${period.slice(2, 4)}`;
const normalizeReportCostCenter = (costCenter) => REPORT_COST_CENTER_ALIASES[costCenter] || costCenter;

const getReportCostCenterMembers = (filterValue) => {
  const members = getCostCenterFilterMembers(filterValue);
  const expandedMembers = new Set(members);
  for (const member of members) expandedMembers.add(normalizeReportCostCenter(member));
  for (const [alias, normalized] of Object.entries(REPORT_COST_CENTER_ALIASES)) {
    if (expandedMembers.has(alias) || expandedMembers.has(normalized)) {
      expandedMembers.add(alias);
      expandedMembers.add(normalized);
    }
  }
  return [...expandedMembers];
};

const isReportCostCenterMember = (costCenter, members) => (
  members.includes(costCenter) || members.includes(normalizeReportCostCenter(costCenter))
);

const matchesPortfolio = (entry, portfolio) => (
  !portfolio
  || portfolio === ALL_FILTER_VALUE
  || (portfolio === "basra" && entry.region === "Basra")
  || (portfolio === "kirkuk" && entry.region === "Kirkuk")
  || (portfolio === "head-office" && entry.hub === "Head Office")
);

const matchesCostCenterScope = (costCenter, filters = {}) => (
  !filters.costCenter
  || filters.costCenter === ALL_FILTER_VALUE
  || matchesCostCenterFilter(costCenter, filters.costCenter)
);

const matchesFilters = (entry, filters = {}, { ignoreCostCenter = false, ignoreTimeDetail = false } = {}) => (
  matchesPortfolio(entry, filters.portfolio)
  && (!filters.hub || filters.hub === ALL_FILTER_VALUE || entry.hub === filters.hub)
  && (ignoreCostCenter || matchesCostCenterFilter(entry.costCenter, filters.costCenter))
  && (!filters.year || filters.year === ALL_FILTER_VALUE || entry.year === filters.year)
  && (ignoreTimeDetail || filters.period !== "monthly" || !filters.month || filters.month === ALL_FILTER_VALUE || entry.month === filters.month)
  && (ignoreTimeDetail || filters.period !== "quarterly" || !filters.quarter || filters.quarter === ALL_FILTER_VALUE || getQuarter(entry.period) === filters.quarter)
);

const getHubCostCenters = (hub, poolCostCenter) => (
  COST_CENTER_HIERARCHY.find((group) => group.hub === hub)?.costCenters || []
).filter((costCenter) => costCenter !== poolCostCenter);

const getCostCenterHub = (costCenter, fallbackHub) => (
  COST_CENTER_HIERARCHY.find((group) => group.costCenters.includes(costCenter))?.hub || fallbackHub || "Other"
);

const getAllOperationalCostCenters = () => COST_CENTER_HIERARCHY
  .filter((group) => group.hub !== "Head Office")
  .flatMap((group) => group.costCenters)
  .filter((costCenter) => !GENERAL_POOL_COST_CENTERS.has(costCenter) && costCenter !== HEAD_OFFICE_COST_CENTER);

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

const allocateGeneralSpentCosts = (entries, filters = {}) => {
  const periodFilters = {
    ...filters,
    costCenter: ALL_FILTER_VALUE,
    hub: ALL_FILTER_VALUE,
  };
  const periodRows = entries.filter((entry) => matchesFilters(entry, periodFilters, { ignoreTimeDetail: true }));
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
      allocatedRows.push(createAllocatedManagementRow(
        managementRow,
        basis.costCenter,
        (managementRow.amount || 0) * (basis.amount / basisTotal),
        getCostCenterHub(basis.costCenter, managementRow.hub),
      ));
    }
  }

  return [
    ...entries.filter((entry) => !(entry.type === "spent" && allocatedEntryIds.has(entry))),
    ...allocatedRows,
  ];
};

const getCellTone = (value) => {
  if (value < 0) return "loss";
  if (value === 0) return "empty";
  return "profit";
};

const createEmptyCell = (period) => ({
  period,
  approvedRevenue: 0,
  submittedRevenue: 0,
  totalCost: 0,
  issuedCreditNotes: 0,
  receivedCreditNotes: 0,
  approvedProfit: 0,
  submittedProfit: 0,
});

const sumMatrixRows = (rows, periods, hub, type = "hub", label = hub) => {
  const total = rows.reduce((sum, row) => ({
    approvedRevenue: sum.approvedRevenue + row.approvedRevenue,
    submittedRevenue: sum.submittedRevenue + row.submittedRevenue,
    totalCost: sum.totalCost + row.totalCost,
    approvedProfit: sum.approvedProfit + row.approvedProfit,
    submittedProfit: sum.submittedProfit + row.submittedProfit,
  }), {
    approvedRevenue: 0,
    submittedRevenue: 0,
    totalCost: 0,
    approvedProfit: 0,
    submittedProfit: 0,
  });

  const periodMap = new Map();
  for (const period of periods) {
    const cellTotal = rows.reduce((sum, row) => {
      const cell = row.periods.get(period) || createEmptyCell(period);
      return {
        ...sum,
        approvedRevenue: sum.approvedRevenue + cell.approvedRevenue,
        submittedRevenue: sum.submittedRevenue + cell.submittedRevenue,
        totalCost: sum.totalCost + cell.totalCost,
        approvedProfit: sum.approvedProfit + cell.approvedProfit,
        submittedProfit: sum.submittedProfit + cell.submittedProfit,
      };
    }, createEmptyCell(period));

    periodMap.set(period, {
      ...cellTotal,
      approvedRevenue: roundCurrency(cellTotal.approvedRevenue),
      submittedRevenue: roundCurrency(cellTotal.submittedRevenue),
      totalCost: roundCurrency(cellTotal.totalCost),
      approvedProfit: roundCurrency(cellTotal.approvedProfit),
      submittedProfit: roundCurrency(cellTotal.submittedProfit),
    });
  }

  return {
    type,
    key: `${type}-${hub}-${label}`,
    costCenter: label,
    hub,
    region: rows[0]?.region || "",
    periods: periodMap,
    approvedRevenue: roundCurrency(total.approvedRevenue),
    submittedRevenue: roundCurrency(total.submittedRevenue),
    totalCost: roundCurrency(total.totalCost),
    approvedProfit: roundCurrency(total.approvedProfit),
    submittedProfit: roundCurrency(total.submittedProfit),
    approvedMargin: getShare(total.approvedProfit, total.approvedRevenue),
    submittedMargin: getShare(total.submittedProfit, total.submittedRevenue),
  };
};

const buildRooMatrixRows = (rows, periods) => {
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
      ...sumMatrixRows(groupRows, periods, "ROO Hub", "subgroup", group.label),
      filterCostCenter: getCostCenterGroupValue(group.id),
    }, ...groupRows);
  }

  return orderedRows;
};

const buildGroupedMatrixRows = (rows, periods, groups, assignedCostCenters) => {
  const rowsByCostCenter = new Map(rows.map((row) => [row.costCenter, row]));
  const orderedRows = [];
  const unassignedRows = rows
    .filter((row) => !assignedCostCenters.has(row.costCenter))
    .sort((a, b) => a.costCenter.localeCompare(b.costCenter));

  for (const group of groups) {
    const groupRows = group.costCenters.map((costCenter) => rowsByCostCenter.get(costCenter)).filter(Boolean);
    if (!groupRows.length) continue;
    orderedRows.push({
      ...sumMatrixRows(groupRows, periods, group.hub, "subgroup", group.label),
      filterCostCenter: getCostCenterGroupValue(group.id),
    }, ...groupRows);
  }

  return [...orderedRows, ...unassignedRows];
};

const buildHubMatrixRows = (costCenterRows, periods) => {
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
    if (hub === "BGC Hub") return [sumMatrixRows(rows, periods, hub), ...buildGroupedMatrixRows(rows, periods, BGC_SUB_HUBS, BGC_ASSIGNED_COST_CENTERS)];
    if (hub === "ROO Hub") return [sumMatrixRows(rows, periods, hub), ...buildRooMatrixRows(rows, periods)];
    return [sumMatrixRows(rows, periods, hub), ...rows];
  });

  return costCenterRows.length
    ? [sumMatrixRows(costCenterRows, periods, "IGCC", "igcc", "IGCC Level 1"), ...hubRows]
    : hubRows;
};

function ProfitCell({ cell, viewMode }) {
  if (!cell) return <span className="profit-matrix-empty">-</span>;

  const value = viewMode === "approved" ? cell.approvedProfit : cell.submittedProfit;
  return (
    <span className={`profit-matrix-value tone-${getCellTone(value)}`}>
      {value ? formatCompactCurrency(value) : "-"}
    </span>
  );
}

export function ProfitMatrixPage({ filters = {} }) {
  const [viewMode, setViewMode] = useState("approved");
  const [searchTerm, setSearchTerm] = useState("");
  const { entries: financialEntries, isLoadingAfpMaster, isLoadingSpentReport, isLoadingCreditNotes } = useAfpFinancialInputs();

  const analysis = useMemo(() => {
    const scopedFilters = { ...filters };
    const entries = allocateGeneralSpentCosts(financialEntries || [], scopedFilters);
    const activityRows = entries.filter((entry) => (
      entry.type !== "creditNotes"
      && matchesFilters(entry, scopedFilters, { ignoreTimeDetail: true })
    ));
    const creditRows = entries.filter((entry) => (
      entry.type === "creditNotes"
      && matchesFilters(entry, scopedFilters, { ignoreCostCenter: true, ignoreTimeDetail: true })
    ));
    const periods = [...new Set(activityRows.map((entry) => entry.period).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    const rowMap = new Map();

    for (const entry of activityRows) {
      const costCenter = normalizeReportCostCenter(entry.costCenter);
      const row = rowMap.get(costCenter) || {
        costCenter,
        hub: entry.hub,
        region: entry.region,
        approvedRevenue: 0,
        submittedRevenue: 0,
        totalCost: 0,
        approvedProfit: 0,
        submittedProfit: 0,
        periods: new Map(),
      };
      const cell = row.periods.get(entry.period) || {
        period: entry.period,
        approvedRevenue: 0,
        submittedRevenue: 0,
        totalCost: 0,
        issuedCreditNotes: 0,
        receivedCreditNotes: 0,
        approvedProfit: 0,
        submittedProfit: 0,
      };

      if (entry.type === "approved") cell.approvedRevenue += entry.amount || 0;
      if (entry.type === "submitted") cell.submittedRevenue += entry.amount || 0;
      if (entry.type === "spent") cell.totalCost += entry.amount || 0;

      row.periods.set(entry.period, cell);
      rowMap.set(costCenter, row);
    }

    for (const entry of creditRows) {
      const issuedCostCenter = normalizeReportCostCenter(entry.issuedBy);
      const receivedCostCenter = normalizeReportCostCenter(entry.costCenter);
      for (const costCenter of [issuedCostCenter, receivedCostCenter]) {
        if (!costCenter) continue;
        if (!matchesCostCenterScope(costCenter, scopedFilters)) continue;
        const row = rowMap.get(costCenter) || {
          costCenter,
          hub: getCostCenterHub(costCenter, entry.hub),
          region: entry.region,
          approvedRevenue: 0,
          submittedRevenue: 0,
          totalCost: 0,
          approvedProfit: 0,
          submittedProfit: 0,
          periods: new Map(),
        };
        const cell = row.periods.get(entry.period) || {
          period: entry.period,
          approvedRevenue: 0,
          submittedRevenue: 0,
          totalCost: 0,
          issuedCreditNotes: 0,
          receivedCreditNotes: 0,
          approvedProfit: 0,
          submittedProfit: 0,
        };
        const members = getReportCostCenterMembers(costCenter);
        if (isReportCostCenterMember(entry.issuedBy, members)) cell.issuedCreditNotes += entry.amount || 0;
        if (isReportCostCenterMember(entry.costCenter, members)) cell.receivedCreditNotes += entry.amount || 0;
        row.periods.set(entry.period, cell);
        rowMap.set(costCenter, row);
      }
    }

    const rows = [...rowMap.values()]
      .map((row) => {
        const periodCells = new Map();
        for (const period of periods) {
          const cell = row.periods.get(period);
          if (!cell) continue;
          const approvedRevenue = cell.approvedRevenue + cell.issuedCreditNotes;
          const submittedRevenue = cell.submittedRevenue + cell.issuedCreditNotes;
          const totalCost = cell.totalCost + cell.receivedCreditNotes;
          const approvedProfit = approvedRevenue - totalCost;
          const submittedProfit = submittedRevenue - totalCost;
          const nextCell = {
            ...cell,
            approvedRevenue: roundCurrency(approvedRevenue),
            submittedRevenue: roundCurrency(submittedRevenue),
            totalCost: roundCurrency(totalCost),
            approvedProfit: roundCurrency(approvedProfit),
            submittedProfit: roundCurrency(submittedProfit),
          };
          row.approvedRevenue += nextCell.approvedRevenue;
          row.submittedRevenue += nextCell.submittedRevenue;
          row.totalCost += nextCell.totalCost;
          row.approvedProfit += nextCell.approvedProfit;
          row.submittedProfit += nextCell.submittedProfit;
          periodCells.set(period, nextCell);
        }

        return {
          ...row,
          periods: periodCells,
          approvedRevenue: roundCurrency(row.approvedRevenue),
          submittedRevenue: roundCurrency(row.submittedRevenue),
          totalCost: roundCurrency(row.totalCost),
          approvedProfit: roundCurrency(row.approvedProfit),
          submittedProfit: roundCurrency(row.submittedProfit),
          approvedMargin: getShare(row.approvedProfit, row.approvedRevenue),
          submittedMargin: getShare(row.submittedProfit, row.submittedRevenue),
        };
      })
      .filter((row) => row.approvedRevenue || row.submittedRevenue || row.totalCost)
      .sort((a, b) => a.region.localeCompare(b.region) || a.hub.localeCompare(b.hub) || a.costCenter.localeCompare(b.costCenter));

    const totals = rows.reduce((total, row) => ({
      approvedRevenue: total.approvedRevenue + row.approvedRevenue,
      submittedRevenue: total.submittedRevenue + row.submittedRevenue,
      totalCost: total.totalCost + row.totalCost,
      approvedProfit: total.approvedProfit + row.approvedProfit,
      submittedProfit: total.submittedProfit + row.submittedProfit,
    }), {
      approvedRevenue: 0,
      submittedRevenue: 0,
      totalCost: 0,
      approvedProfit: 0,
      submittedProfit: 0,
    });

    const displayRows = buildHubMatrixRows(rows.map((row) => ({
      ...row,
      type: "costCenter",
      key: `costCenter-${row.costCenter}`,
    })), periods);

    return {
      periods,
      rows,
      displayRows,
      totals: {
        ...totals,
        approvedMargin: getShare(totals.approvedProfit, totals.approvedRevenue),
        submittedMargin: getShare(totals.submittedProfit, totals.submittedRevenue),
      },
    };
  }, [financialEntries, filters]);

  const visibleRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return analysis.displayRows;
    return analysis.displayRows.filter((row) => (
      row.costCenter.toLowerCase().includes(query)
      || row.hub.toLowerCase().includes(query)
      || row.region.toLowerCase().includes(query)
    ));
  }, [analysis.displayRows, searchTerm]);

  const scopeLabel = getCostCenterFilterLabel(filters.costCenter) || (filters.costCenter && filters.costCenter !== ALL_FILTER_VALUE ? filters.costCenter : "All cost centers");
  const isLoading = isLoadingAfpMaster || isLoadingSpentReport || isLoadingCreditNotes;

  return (
    <section className="page-stack profit-matrix-page">
      <div className="page-heading profit-matrix-heading">
        <div>
          <p className="eyebrow">Profit Matrix</p>
          <h2>Monthly Cost Center Profit</h2>
          <p>Cost centers are listed vertically and months run horizontally, with profit calculated from approved AFP and submitted AFP against spent cost.</p>
        </div>
        <div className="profit-matrix-toggle" aria-label="Profit basis filter">
          {BASIS_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={viewMode === option.id ? "is-active" : ""}
              onClick={() => setViewMode(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <section className="profit-matrix-kpis" aria-label="Profit matrix summary">
        <article>
          <span><Icon name="costCenter" /> Scope</span>
          <strong>{scopeLabel}</strong>
          <small>{visibleRows.length} cost centers shown</small>
        </article>
        <article>
          <span><Icon name="approve" /> Approved Profit</span>
          <strong className={analysis.totals.approvedProfit < 0 ? "is-loss" : ""}>{formatCurrency(analysis.totals.approvedProfit)}</strong>
          <small>{formatPercent(analysis.totals.approvedMargin)} approved margin</small>
        </article>
        <article>
          <span><Icon name="submit" /> Submitted Profit</span>
          <strong className={analysis.totals.submittedProfit < 0 ? "is-loss" : ""}>{formatCurrency(analysis.totals.submittedProfit)}</strong>
          <small>{formatPercent(analysis.totals.submittedMargin)} submitted margin</small>
        </article>
        <article>
          <span><Icon name="spending" /> Total Cost</span>
          <strong>{formatCurrency(analysis.totals.totalCost)}</strong>
          <small>Spent + allocations + received CN</small>
        </article>
      </section>

      <section className="profit-matrix-toolbar" aria-label="Profit matrix controls">
        <label>
          <span>Search</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Cost center, hub, or region"
          />
        </label>
        <div>
          <strong>{analysis.periods.length}</strong>
          <span>month columns</span>
        </div>
      </section>

      <section className="profit-matrix-table-shell" aria-label="Monthly profit by cost center">
        <div className="profit-matrix-scroll">
          <table className="profit-matrix-table">
            <thead>
              <tr>
                <th className="profit-matrix-sticky-col">Cost Center</th>
                <th>Hub</th>
                <th className="is-number">{viewMode === "approved" ? "Approved Total" : "Submitted Total"}</th>
                {analysis.periods.map((period) => (
                  <th key={period} className="is-month">{getPeriodLabel(period)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.key || row.costCenter}
                  className={[
                    row.type === "igcc" ? "is-igcc-total" : "",
                    row.type === "hub" ? "is-hub-total" : "",
                    row.type === "subgroup" ? "is-subgroup-total" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <td className="profit-matrix-sticky-col">
                    <strong>{row.costCenter}</strong>
                    <span>{row.type === "subgroup" ? "Cost center combination" : row.region}</span>
                  </td>
                  <td>{row.hub}</td>
                  <td className={`is-number ${(viewMode === "approved" ? row.approvedProfit : row.submittedProfit) < 0 ? "is-loss" : "is-profit"}`}>
                    {formatCurrency(viewMode === "approved" ? row.approvedProfit : row.submittedProfit)}
                  </td>
                  {analysis.periods.map((period) => (
                    <td key={`${row.costCenter}-${period}`}>
                      <ProfitCell cell={row.periods.get(period)} viewMode={viewMode} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isLoading ? <p className="profit-matrix-loading">Refreshing live AFP, spent, and credit note data...</p> : null}
      </section>
    </section>
  );
}
