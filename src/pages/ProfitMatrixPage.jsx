import { useMemo, useState } from "react";
import { Icon } from "../components/Icons";
import {
  ALL_FILTER_VALUE,
  COST_CENTER_HIERARCHY,
  getCostCenterFilterLabel,
  getCostCenterFilterMembers,
  matchesCostCenterFilter,
} from "../data/costCenterHierarchy";
import { useAfpFinancialInputs } from "../hooks/useAfpFinancialInputs";

const BASIS_OPTIONS = [
  { id: "both", label: "Both" },
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

function ProfitCell({ cell, viewMode }) {
  if (!cell) return <span className="profit-matrix-empty">-</span>;

  if (viewMode !== "both") {
    const value = viewMode === "approved" ? cell.approvedProfit : cell.submittedProfit;
    return (
      <span className={`profit-matrix-value tone-${getCellTone(value)}`}>
        {value ? formatCompactCurrency(value) : "-"}
      </span>
    );
  }

  return (
    <span className="profit-matrix-pair">
      <span className={`tone-${getCellTone(cell.approvedProfit)}`}>A {cell.approvedProfit ? formatCompactCurrency(cell.approvedProfit) : "-"}</span>
      <span className={`tone-${getCellTone(cell.submittedProfit)}`}>S {cell.submittedProfit ? formatCompactCurrency(cell.submittedProfit) : "-"}</span>
    </span>
  );
}

export function ProfitMatrixPage({ filters = {} }) {
  const [viewMode, setViewMode] = useState("both");
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

    return {
      periods,
      rows,
      totals: {
        ...totals,
        approvedMargin: getShare(totals.approvedProfit, totals.approvedRevenue),
        submittedMargin: getShare(totals.submittedProfit, totals.submittedRevenue),
      },
    };
  }, [financialEntries, filters]);

  const visibleRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return analysis.rows;
    return analysis.rows.filter((row) => (
      row.costCenter.toLowerCase().includes(query)
      || row.hub.toLowerCase().includes(query)
      || row.region.toLowerCase().includes(query)
    ));
  }, [analysis.rows, searchTerm]);

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
        <div className="profit-matrix-toggle" aria-label="Profit basis">
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
                <th className="is-number">Approved Total</th>
                <th className="is-number">Submitted Total</th>
                {analysis.periods.map((period) => (
                  <th key={period} className="is-month">{getPeriodLabel(period)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.costCenter}>
                  <td className="profit-matrix-sticky-col">
                    <strong>{row.costCenter}</strong>
                    <span>{row.region}</span>
                  </td>
                  <td>{row.hub}</td>
                  <td className={`is-number ${row.approvedProfit < 0 ? "is-loss" : "is-profit"}`}>{formatCurrency(row.approvedProfit)}</td>
                  <td className={`is-number ${row.submittedProfit < 0 ? "is-loss" : "is-profit"}`}>{formatCurrency(row.submittedProfit)}</td>
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
