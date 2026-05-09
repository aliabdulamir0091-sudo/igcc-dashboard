import { useMemo, useState } from "react";
import { Icon } from "../components/Icons";
import {
  ALL_FILTER_VALUE,
  COST_CENTER_HIERARCHY,
  getCostCenterFilterMembers,
  getCostCenterFilterLabel,
  matchesCostCenterFilter,
} from "../data/costCenterHierarchy";
import financialInputsData from "../data/financialInputsData.json";
import igccLogo from "../assets/igcc-logo.svg";

const REVENUE_BASIS_OPTIONS = [
  { id: "approved", label: "Approved AFP" },
  { id: "submitted", label: "Submitted AFP" },
];

const PROFITABILITY_COLUMNS = [
  { key: "region", label: "Region", type: "text" },
  { key: "hub", label: "Hub", type: "text" },
  { key: "costCenter", label: "Cost Center", type: "text" },
  { key: "revenue", label: "Revenue", type: "number", align: "right" },
  { key: "totalCost", label: "Total Cost", type: "number", align: "right" },
  { key: "grossProfit", label: "Gross Profit", type: "number", align: "right" },
  { key: "netProfit", label: "Net Profit", type: "number", align: "right" },
  { key: "netMargin", label: "Net Margin %", type: "number", align: "right" },
  { key: "costToRevenue", label: "Cost-to-Revenue %", type: "number", align: "right" },
  { key: "status", label: "Status", type: "status" },
];

const DEFAULT_TABLE_FILTERS = PROFITABILITY_COLUMNS.reduce((filters, column) => {
  if (column.type === "number") {
    filters[`${column.key}Min`] = "";
    filters[`${column.key}Max`] = "";
  } else {
    filters[column.key] = [];
  }
  return filters;
}, {});

const CURRENCY_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const COMPACT_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const roundCurrency = (value) => Math.round(((value || 0) + Number.EPSILON) * 100) / 100;
const formatCurrency = (value) => CURRENCY_FORMAT.format(value || 0);
const formatCompactCurrency = (value) => `$${COMPACT_NUMBER_FORMAT.format(value || 0)}`;
const formatPercent = (value) => `${NUMBER_FORMAT.format(value || 0)}%`;
const formatMillions = (value) => `${value < 0 ? "-" : ""}$${NUMBER_FORMAT.format(Math.abs(value || 0) / 1000000)}M`;
const formatReportCurrency = (value) => {
  const amount = Number(value || 0);
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  if (absolute >= 1000000) return `${sign}$${NUMBER_FORMAT.format(absolute / 1000000)}M`;
  if (absolute >= 1000) return `${sign}$${NUMBER_FORMAT.format(absolute / 1000)}K`;
  return `${sign}$${NUMBER_FORMAT.format(absolute)}`;
};
const getShare = (value, total) => (total ? ((value || 0) / total) * 100 : 0);
const escapeXml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const getQuarter = (period) => `Q${Math.ceil(Number(period?.slice(5, 7) || 1) / 3)}`;
const REPORT_COST_CENTER_ALIASES = {
  "PWT PWRI1_23": "PWRI-PWT",
};
const normalizeReportCostCenter = (costCenter) => REPORT_COST_CENTER_ALIASES[costCenter] || costCenter;
const getReportCostCenterMembers = (filterValue) => {
  const members = getCostCenterFilterMembers(filterValue);
  const expandedMembers = new Set(members);
  for (const member of members) {
    expandedMembers.add(normalizeReportCostCenter(member));
  }
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

const GENERAL_COST_ALLOCATIONS = [
  { poolCostCenter: "GRLBG_23", hub: "BGC Hub" },
  { poolCostCenter: "GRLRO_23", hub: "ROO Hub" },
];
const GENERAL_POOL_COST_CENTERS = new Set(GENERAL_COST_ALLOCATIONS.map((rule) => rule.poolCostCenter));
const MANAGEMENT_SOURCE_COST_CENTER = "Management";
const HEAD_OFFICE_COST_CENTER = "HO_SB_23";

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

const getCostCenterHub = (costCenter, fallbackHub) => (
  COST_CENTER_HIERARCHY.find((group) => group.costCenters.includes(costCenter))?.hub || fallbackHub || "Other"
);

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
  .filter((costCenter) => !GENERAL_POOL_COST_CENTERS.has(costCenter) && costCenter !== HEAD_OFFICE_COST_CENTER);

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

const getStatus = (netMargin, netProfit) => {
  if (netProfit < 0) return { label: "Loss-Making", tone: "loss" };
  if (netMargin < 10) return { label: "Low Margin", tone: "low" };
  return { label: "Good Margin", tone: "good" };
};

const getTrend = (current, previous) => {
  if (!previous) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const sumRows = (rows, predicate) => rows.reduce((sum, entry) => (
  predicate(entry) ? sum + (entry.amount || 0) : sum
), 0);

const passesNumberFilter = (value, min, max) => {
  const numericValue = Number(value || 0);
  const minValue = min === "" ? null : Number(min);
  const maxValue = max === "" ? null : Number(max);
  return (!Number.isFinite(minValue) || numericValue >= minValue)
    && (!Number.isFinite(maxValue) || numericValue <= maxValue);
};

const getSortValue = (row, key) => (key === "status" ? row.status.label : row[key]);
const getFilterValue = (row, key) => (key === "status" ? row.status.label : row[key]);

function ColumnStateIcon({ isSorted, direction, isFiltered }) {
  if (isSorted) {
    return (
      <svg className="pnl-header-state-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d={direction === "asc" ? "M12 5l-5 6h10l-5-6Zm0 14V8" : "M12 19l5-6H7l5 6Zm0-14v11"} />
      </svg>
    );
  }

  return (
    <svg className={`pnl-header-state-icon ${isFiltered ? "is-filtered" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />
    </svg>
  );
}

function ProfitabilityColumnHeader({
  column,
  filters,
  sortConfig,
  activeColumn,
  options,
  onFilterChange,
  onSort,
  onToggleColumn,
  onToggleValue,
  onSelectAll,
  onClearColumn,
}) {
  const isSorted = sortConfig.key === column.key;
  const selectedValues = filters[column.key] || [];
  const isOpen = activeColumn === column.key;
  const isFiltered = column.type === "number"
    ? Boolean(filters[`${column.key}Min`] || filters[`${column.key}Max`])
    : selectedValues.length > 0;
  const ascendingLabel = column.type === "number" ? "Small to large" : "A to Z";
  const descendingLabel = column.type === "number" ? "Large to small" : "Z to A";

  return (
    <th className={column.align === "right" ? "is-number" : ""}>
      <div className="pnl-column-head">
        <button type="button" className={isOpen || isFiltered ? "is-active" : ""} onClick={() => onToggleColumn(column.key)}>
          <span>{column.label}</span>
          <ColumnStateIcon isSorted={isSorted} direction={sortConfig.direction} isFiltered={isFiltered} />
        </button>
        {isOpen ? (
          <div className="pnl-filter-popover">
            <div className="pnl-sort-options">
              <button type="button" onClick={() => onSort(column.key, "asc")}>{ascendingLabel}</button>
              <button type="button" onClick={() => onSort(column.key, "desc")}>{descendingLabel}</button>
            </div>

            {column.type === "number" ? (
              <div className="pnl-number-filter-panel">
                <label>
                  <span>Minimum</span>
                  <input
                    type="number"
                    value={filters[`${column.key}Min`]}
                    onChange={(event) => onFilterChange(`${column.key}Min`, event.target.value)}
                  />
                </label>
                <label>
                  <span>Maximum</span>
                  <input
                    type="number"
                    value={filters[`${column.key}Max`]}
                    onChange={(event) => onFilterChange(`${column.key}Max`, event.target.value)}
                  />
                </label>
              </div>
            ) : (
              <>
                <div className="pnl-filter-actions">
                  <button type="button" onClick={() => onSelectAll(column.key, options)}>Select all</button>
                  <button type="button" onClick={() => onClearColumn(column)}>Clear</button>
                </div>
                <div className="pnl-filter-values">
                  {options.map((option) => (
                    <label key={option}>
                      <input
                        type="checkbox"
                        checked={selectedValues.includes(option)}
                        onChange={() => onToggleValue(column.key, option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </th>
  );
}

const calculatePnl = ({ rows, creditRows, selectedCostCenter, revenueBasis }) => {
  const revenue = sumRows(rows, (entry) => entry.type === revenueBasis);
  const totalCost = sumRows(rows, (entry) => entry.type === "spent");
  const allocatedGeneralCost = sumRows(rows, (entry) => entry.type === "spent" && entry.isAllocatedGeneralCost);
  const allocatedManagementCost = sumRows(rows, (entry) => entry.type === "spent" && entry.isAllocatedManagementCost);
  const baseSpentCost = totalCost - allocatedGeneralCost - allocatedManagementCost;
  const grossProfit = revenue - totalCost;
  const isCostCenterLevel = Boolean(selectedCostCenter && selectedCostCenter !== ALL_FILTER_VALUE);
  const selectedCostCenters = getReportCostCenterMembers(selectedCostCenter);
  const issuedCreditNotes = isCostCenterLevel
    ? sumRows(creditRows, (entry) => isReportCostCenterMember(entry.issuedBy, selectedCostCenters))
    : 0;
  const receivedCreditNotes = isCostCenterLevel
    ? sumRows(creditRows, (entry) => isReportCostCenterMember(entry.costCenter, selectedCostCenters))
    : 0;
  const updatedRevenue = revenue + issuedCreditNotes;
  const updatedCost = totalCost + receivedCreditNotes;
  const netProfit = isCostCenterLevel ? updatedRevenue - updatedCost : grossProfit;
  const netMargin = getShare(netProfit, isCostCenterLevel ? updatedRevenue : revenue);
  const costToRevenue = getShare(isCostCenterLevel ? updatedCost : totalCost, isCostCenterLevel ? updatedRevenue : revenue);

  return {
    revenue: roundCurrency(revenue),
    baseSpentCost: roundCurrency(baseSpentCost),
    allocatedGeneralCost: roundCurrency(allocatedGeneralCost),
    allocatedManagementCost: roundCurrency(allocatedManagementCost),
    totalCost: roundCurrency(totalCost),
    grossProfit: roundCurrency(grossProfit),
    issuedCreditNotes: roundCurrency(issuedCreditNotes),
    receivedCreditNotes: roundCurrency(receivedCreditNotes),
    creditNotesAdjustment: roundCurrency(issuedCreditNotes - receivedCreditNotes),
    updatedRevenue: roundCurrency(updatedRevenue),
    updatedCost: roundCurrency(updatedCost),
    netProfit: roundCurrency(netProfit),
    netMargin,
    costToRevenue,
    isCostCenterLevel,
  };
};

function FilledSparkline({ values = [], tone = "blue" }) {
  const cleanValues = values.map((value) => Number(value || 0));
  const min = Math.min(...cleanValues, 0);
  const max = Math.max(...cleanValues, 1);
  const range = max - min || 1;
  const width = 150;
  const height = 44;
  const points = cleanValues.map((value, index) => {
    const x = cleanValues.length <= 1 ? width / 2 : (index / (cleanValues.length - 1)) * width;
    const y = height - (((value - min) / range) * (height - 8)) - 4;
    return [x, y];
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg className={`pnl-sparkline tone-${tone}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path className="spark-area" d={area} />
      <path className="spark-line" d={line} />
    </svg>
  );
}

function PnlKpiCard({ icon, label, value, context, tone = "blue", sparkline = [], movement = 0 }) {
  return (
    <article className={`pnl-kpi-card tone-${tone}`}>
      <div className="pnl-kpi-top">
        <span><Icon name={icon} /></span>
        <small>{context}</small>
      </div>
      <div className="pnl-kpi-value-block">
        <p>{label}</p>
        <strong>{value}</strong>
        <em className={movement >= 0 ? "is-up" : "is-down"}>
          {movement >= 0 ? "+" : "-"}{formatPercent(Math.abs(movement))} vs prior period
        </em>
      </div>
      <FilledSparkline values={sparkline} tone={tone} />
    </article>
  );
}

function ProfitabilitySummary({ pnl, selectedCostCenter, revenueBasisLabel }) {
  const scope = selectedCostCenter || "portfolio";
  const subjectReference = selectedCostCenter ? "cost center" : "portfolio";
  const revenue = pnl.isCostCenterLevel ? pnl.updatedRevenue : pnl.revenue;
  const cost = pnl.isCostCenterLevel ? pnl.updatedCost : pnl.totalCost;
  const isProfitable = pnl.netProfit >= 0;
  const basisLabel = revenueBasisLabel.toLowerCase();
  const resultLabel = isProfitable ? "net profit" : "net loss";
  const headline = isProfitable
    ? `The ${basisLabel} ${scope} is profitable, with revenue comfortably exceeding cost and producing a healthy net margin.`
    : `The ${basisLabel} ${scope} needs attention, with cost exceeding revenue and creating a negative margin.`;
  const costEfficiencyText = isProfitable
    ? `indicating the ${subjectReference} remains profitable while still leaving room to improve cost efficiency.`
    : "indicating cost pressure is outweighing revenue and requires focused review.";
  const statusLabel = pnl.netProfit >= 0 ? "Healthy margin" : "Needs review";

  return (
    <article className="pnl-narrative-card">
      <div>
        <span>Profitability Summary</span>
        <strong>{headline}</strong>
      </div>
      <p>
        Revenue of {formatCurrency(revenue)} against {formatCurrency(cost)} in cost generated {formatCurrency(Math.abs(pnl.netProfit))} in {resultLabel}, resulting in a {formatPercent(pnl.netMargin)} margin.
        {" "}
        Cost-to-revenue stands at {formatPercent(pnl.costToRevenue)}, {costEfficiencyText}
      </p>
      <aside className={pnl.netProfit >= 0 ? "is-good" : "is-loss"}>
        <small>{statusLabel}</small>
        <strong>{formatPercent(pnl.netMargin)}</strong>
      </aside>
    </article>
  );
}

function RevenueBasisToggle({ revenueBasis, onChange }) {
  return (
    <div className="pnl-toggle" aria-label="Revenue basis">
      {REVENUE_BASIS_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={revenueBasis === option.id ? "is-active" : ""}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PnlStatement({ pnl }) {
  const statementRows = [
    { label: "Revenue", value: pnl.revenue, type: "positive" },
    { label: "Less: Total Cost", value: -pnl.totalCost, type: "negative" },
    { label: "Gross Profit", value: pnl.grossProfit, type: "subtotal" },
    ...(pnl.isCostCenterLevel ? [
      { label: "Issued Credit Notes", value: pnl.issuedCreditNotes, type: "positive" },
      { label: "Received Credit Notes", value: -pnl.receivedCreditNotes, type: "negative" },
    ] : []),
    { label: "Net Profit", value: pnl.netProfit, type: "total" },
    { label: "Net Margin %", value: formatPercent(pnl.netMargin), type: "ratio" },
  ];

  return (
    <article className="surface-card pnl-statement-card">
      <div className="pnl-card-heading">
        <div>
          <p className="eyebrow">P&L Statement</p>
          <h3>Financial statement view</h3>
        </div>
        <span>{pnl.isCostCenterLevel ? "CN integrated" : "CN excluded from totals"}</span>
      </div>
      <div className="pnl-statement-list">
        {statementRows.map((row) => (
          <div key={row.label} className={`statement-row ${row.type}`}>
            <span>{row.label}</span>
            <strong>{typeof row.value === "number" ? formatCurrency(row.value) : row.value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function WaterfallChart({ pnl }) {
  const steps = [
    { label: "Revenue", value: pnl.isCostCenterLevel ? pnl.updatedRevenue : pnl.revenue, tone: "green", caption: "AFP basis" },
    { label: "Total Cost", value: -(pnl.isCostCenterLevel ? pnl.updatedCost : pnl.totalCost), tone: "red", caption: "Cost drawdown" },
    { label: "Gross Profit", value: pnl.grossProfit, tone: pnl.grossProfit >= 0 ? "blue" : "red", caption: "Operating result" },
    { label: "Net Profit", value: pnl.netProfit, tone: pnl.netProfit >= 0 ? "teal" : "red", caption: "Final position" },
  ];
  const max = Math.max(...steps.map((step) => Math.abs(step.value)), 1);

  return (
    <article className="surface-card pnl-chart-card">
      <div className="pnl-card-heading">
        <div>
          <p className="eyebrow">Waterfall</p>
          <h3>Revenue to net profit</h3>
        </div>
      </div>
      <div className="waterfall-chart" role="img" aria-label="P&L waterfall chart">
        {steps.map((step, index) => (
          <div key={step.label} className={`waterfall-step tone-${step.tone}`}>
            <div className="waterfall-bar-wrap">
              <span style={{ "--bar-height": `${Math.max((Math.abs(step.value) / max) * 100, 6)}%` }} />
            </div>
            {index < steps.length - 1 ? <i aria-hidden="true" /> : null}
            <strong>{formatCompactCurrency(step.value)}</strong>
            <small>{step.label}</small>
            <em>{step.caption}</em>
          </div>
        ))}
      </div>
    </article>
  );
}

function MonthlyTrendChart({ rows }) {
  const width = 920;
  const height = 330;
  const padding = { top: 28, right: 44, bottom: 48, left: 66 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const series = [
    { key: "revenue", label: "Revenue", color: "#16a34a", areaId: "revenueArea" },
    { key: "totalCost", label: "Total Cost", color: "#ef4444", areaId: "totalCostArea" },
    { key: "netProfit", label: "Net Profit", color: "#0f766e", areaId: "netProfitArea" },
  ];
  const values = rows.flatMap((row) => series.map((item) => row[item.key] || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const x = (index) => padding.left + (rows.length <= 1 ? innerWidth / 2 : (index / (rows.length - 1)) * innerWidth);
  const y = (value) => padding.top + innerHeight - (((value - min) / range) * innerHeight);
  const pathFor = (key) => rows.map((row, index) => {
    const point = [x(index), y(row[key] || 0)];
    if (index === 0) return `M ${point[0].toFixed(1)} ${point[1].toFixed(1)}`;
    const previous = [x(index - 1), y(rows[index - 1][key] || 0)];
    const control = (point[0] - previous[0]) * 0.46;
    return `C ${(previous[0] + control).toFixed(1)} ${previous[1].toFixed(1)}, ${(point[0] - control).toFixed(1)} ${point[1].toFixed(1)}, ${point[0].toFixed(1)} ${point[1].toFixed(1)}`;
  }).join(" ");
  const areaFor = (key) => `${pathFor(key)} L ${x(rows.length - 1).toFixed(1)} ${padding.top + innerHeight} L ${padding.left} ${padding.top + innerHeight} Z`;
  const latest = rows.at(-1);

  return (
    <article className="surface-card pnl-trend-card">
      <div className="pnl-card-heading">
        <div>
          <p className="eyebrow">Monthly Trend</p>
          <h3>Profitability movement over time</h3>
        </div>
        {latest ? (
          <div className="pnl-latest-chip">
            <span>Latest net margin</span>
            <strong>{formatPercent(latest.netMargin)}</strong>
          </div>
        ) : null}
        <div className="pnl-chart-legend">
          {series.map((item) => <span key={item.key} style={{ "--legend-color": item.color }}>{item.label}</span>)}
          <span style={{ "--legend-color": "#d97706" }}>Net Margin Points</span>
        </div>
      </div>
      {rows.length ? (
        <svg className="pnl-trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly profitability trend">
          <defs>
            {series.map((item) => (
              <linearGradient key={item.areaId} id={item.areaId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={item.color} stopOpacity="0.18" />
                <stop offset="70%" stopColor={item.color} stopOpacity="0.05" />
                <stop offset="100%" stopColor={item.color} stopOpacity="0" />
              </linearGradient>
            ))}
            <filter id="trendGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const value = min + range * tick;
            const tickY = y(value);
            return (
              <g key={tick}>
                <line x1={padding.left} y1={tickY} x2={width - padding.right} y2={tickY} />
                <text x={padding.left - 12} y={tickY + 4}>{formatCurrency(value).replace(".00", "")}</text>
              </g>
            );
          })}
          {series.map((item) => (
            <path key={`${item.key}-area`} className="trend-area" d={areaFor(item.key)} fill={`url(#${item.areaId})`} />
          ))}
          {series.map((item) => (
            <path key={item.key} d={pathFor(item.key)} style={{ "--line-color": item.color }} />
          ))}
          {series.map((item) => rows.map((row, index) => (
            index === rows.length - 1 ? (
              <circle key={`${item.key}-${row.period}`} className="trend-endpoint" cx={x(index)} cy={y(row[item.key] || 0)} r="5" style={{ "--line-color": item.color }} />
            ) : null
          )))}
          {rows.map((row, index) => (
            <g key={row.period}>
              <text className="period-label" x={x(index)} y={height - 16}>{row.period.slice(2)}</text>
              <circle className="margin-dot" cx={x(index)} cy={y(row.netProfit || 0)} r={Math.max(Math.min(Math.abs(row.netMargin) / 4, 9), 4)} />
            </g>
          ))}
        </svg>
      ) : <div className="pnl-empty-state">No monthly P&L activity for the selected filters.</div>}
    </article>
  );
}

function MonthlyMovementCards({ rows }) {
  const latest = rows.at(-1);
  const previous = rows.at(-2);
  const metrics = [
    { key: "revenue", label: "Revenue", tone: "green" },
    { key: "totalCost", label: "Total Cost", tone: "red" },
    { key: "grossProfit", label: "Gross Profit", tone: "blue" },
    { key: "netProfit", label: "Net Profit", tone: "teal" },
  ];

  return (
    <section className="pnl-movement-grid" aria-label="Monthly movement">
      {metrics.map((metric) => {
        const movement = getTrend(latest?.[metric.key] || 0, previous?.[metric.key] || 0);
        return (
          <article key={metric.key} className={`pnl-movement-card tone-${metric.tone}`}>
            <div>
              <span>{metric.label}</span>
              <strong>{formatCompactCurrency(latest?.[metric.key] || 0)}</strong>
              <em className={movement >= 0 ? "is-up" : "is-down"}>{movement >= 0 ? "Up" : "Down"} {formatPercent(Math.abs(movement))}</em>
            </div>
            <FilledSparkline values={rows.map((row) => row[metric.key])} tone={metric.tone} />
          </article>
        );
      })}
    </section>
  );
}

function CostCenterDetail({ selectedCostCenter, pnl, cnBreakdown, transactions, revenueBasisLabel }) {
  if (!selectedCostCenter) return null;

  return (
    <section className="pnl-detail-grid" aria-label="Detailed cost center profitability">
      <article className="surface-card pnl-detail-card">
        <div className="pnl-card-heading">
          <div>
            <p className="eyebrow">Cost Center Drilldown</p>
            <h3>{selectedCostCenter}</h3>
          </div>
          <span>Detailed CN treatment</span>
        </div>

        <div className="pnl-audit-grid">
          <div>
            <h4>Revenue</h4>
            <p><span>{revenueBasisLabel}</span><strong>{formatCurrency(pnl.revenue)}</strong></p>
            <p><span>Issued Credit Notes</span><strong>{formatCurrency(pnl.issuedCreditNotes)}</strong></p>
            <p className="is-total"><span>Updated Revenue</span><strong>{formatCurrency(pnl.updatedRevenue)}</strong></p>
          </div>
          <div>
            <h4>Cost</h4>
            <p><span>Spent Report Cost</span><strong>{formatCurrency(pnl.baseSpentCost)}</strong></p>
            <p><span>Reallocated General Cost</span><strong>{formatCurrency(pnl.allocatedGeneralCost)}</strong></p>
            <p><span>Management Cost</span><strong>{formatCurrency(pnl.allocatedManagementCost)}</strong></p>
            <p><span>Received Credit Notes</span><strong>{formatCurrency(pnl.receivedCreditNotes)}</strong></p>
            <p className="is-total"><span>Updated Cost</span><strong>{formatCurrency(pnl.updatedCost)}</strong></p>
          </div>
          <div>
            <h4>Profitability</h4>
            <p><span>Gross Profit</span><strong>{formatCurrency(pnl.grossProfit)}</strong></p>
            <p><span>Net Profit</span><strong>{formatCurrency(pnl.netProfit)}</strong></p>
            <p className="is-total"><span>Net Margin %</span><strong>{formatPercent(pnl.netMargin)}</strong></p>
          </div>
        </div>
      </article>

      <article className="surface-card pnl-cn-card">
        <div className="pnl-card-heading">
          <div>
            <p className="eyebrow">Credit Notes</p>
            <h3>Issued vs received</h3>
          </div>
        </div>
        <div className="pnl-cn-list">
          {cnBreakdown.length ? cnBreakdown.map((row) => (
            <div key={`${row.mode}-${row.label}`}>
              <span>{row.mode}</span>
              <strong>{row.label}</strong>
              <em>{formatCurrency(row.amount)}</em>
            </div>
          )) : <div><strong>No credit notes found</strong><em>{formatCurrency(0)}</em></div>}
        </div>
      </article>

      <article className="surface-card pnl-transactions-card">
        <div className="pnl-card-heading">
          <div>
            <p className="eyebrow">Transactions</p>
            <h3>Detailed activity sample</h3>
          </div>
        </div>
        <div className="analysis-table-wrap compact-pnl-table">
          <table className="analysis-table pnl-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Type</th>
                <th>GL / CN Item</th>
                <th className="is-number">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((entry, index) => (
                <tr key={`${entry.period}-${entry.type}-${entry.glName || entry.category}-${index}`}>
                  <td>{entry.period}</td>
                  <td>{entry.type}</td>
                  <td>{entry.glName || entry.category || entry.issuedBy || "AFP"}</td>
                  <td className="is-number">{formatCurrency(entry.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function PrintMetricCard({ label, value, trend, values, tone = "green" }) {
  return (
    <article className={`print-metric-card tone-${tone}`}>
      <div>
        <span><Icon name={tone === "red" ? "spending" : "net"} /></span>
        <p>{label}</p>
      </div>
      <strong>{value}</strong>
      <em className={trend >= 0 ? "is-up" : "is-down"}>{trend >= 0 ? "Up" : "Down"} {formatPercent(Math.abs(trend))} vs previous period</em>
      <FilledSparkline values={values} tone={tone} />
    </article>
  );
}

function PrintGlBreakdown({ rows, totalCost }) {
  return (
    <article className="print-report-card print-gl-card">
      <h3>Cost Breakdown by GL <small>Total Cost {formatMillions(totalCost)}</small></h3>
      <div className="print-gl-bars">
        {rows.slice(0, 5).map((row) => (
          <div key={row.glName}>
            <p>
              <span>{row.glName}</span>
              <strong>{formatMillions(row.amount)}</strong>
              <em>{formatPercent(row.share)}</em>
            </p>
            <i style={{ "--bar-width": `${Math.min(row.share, 100)}%` }} />
          </div>
        ))}
      </div>
    </article>
  );
}

const svgPath = (values, x, y, width, height) => {
  const cleanValues = values.map((value) => Number(value || 0));
  const min = Math.min(...cleanValues, 0);
  const max = Math.max(...cleanValues, 1);
  const range = max - min || 1;
  return cleanValues.map((value, index) => {
    const pointX = x + (cleanValues.length <= 1 ? width / 2 : (index / (cleanValues.length - 1)) * width);
    const pointY = y + height - (((value - min) / range) * height);
    return `${index === 0 ? "M" : "L"}${pointX.toFixed(1)},${pointY.toFixed(1)}`;
  }).join(" ");
};

const svgSpark = (values, x, y, color) => `<path d="${svgPath(values, x, y, 76, 22)}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;

const svgKpi = ({ x, y, title, value, trend, values, color }) => `
  <rect x="${x}" y="${y}" width="160" height="96" rx="12" fill="#fff" stroke="#dbe4ef"/>
  <circle cx="${x + 24}" cy="${y + 24}" r="16" fill="${color}22"/>
  <text x="${x + 48}" y="${y + 24}" font-size="11" font-weight="800" fill="#102033">${escapeXml(title)}</text>
  <text x="${x + 18}" y="${y + 55}" font-size="23" font-weight="900" fill="#081a33">${escapeXml(value)}</text>
  <text x="${x + 18}" y="${y + 75}" font-size="9" font-weight="800" fill="${trend >= 0 ? "#15803d" : "#dc2626"}">${trend >= 0 ? "Up" : "Down"} ${escapeXml(formatPercent(Math.abs(trend)))} vs previous month</text>
  ${svgSpark(values, x + 70, y + 62, color)}
`;

const svgCard = (x, y, width, height, title, body, subtitle = "") => `
  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="#fff" stroke="#dbe4ef"/>
  <text x="${x + 16}" y="${y + 28}" font-size="13" font-weight="900" fill="#071b6f">${escapeXml(title)}</text>
  ${subtitle ? `<text x="${x + width - 16}" y="${y + 28}" text-anchor="end" font-size="9" font-weight="800" fill="#64748b">${escapeXml(subtitle)}</text>` : ""}
  ${body}
`;

const svgReportKpiIcon = (type, x, y, color) => {
  const icons = {
    status: `<circle cx="${x + 12}" cy="${y + 12}" r="7" fill="none" stroke="${color}" stroke-width="2"/><path d="M${x + 8} ${y + 12}l3 3 6-7" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    revenue: `<path d="M${x + 7} ${y + 16}h10M${x + 12} ${y + 6}v12" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/><path d="M${x + 8} ${y + 8}c2-3 8-3 8 1 0 5-8 2-8 7 0 4 7 4 9 1" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`,
    cost: `<path d="M${x + 7} ${y + 7}h10v11l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5V7Z" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/><path d="M${x + 9} ${y + 11}h6M${x + 9} ${y + 14}h5" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`,
    profit: `<path d="M${x + 6} ${y + 17}h12M${x + 8} ${y + 15}l3-4 3 2 4-6" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M${x + 16} ${y + 7}h2v2" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`,
  };
  return icons[type] || icons.profit;
};

const svgReportKpi = ({ x, y, width, label, value, caption, color, type = "profit" }) => `
  <rect x="${x}" y="${y}" width="${width}" height="76" rx="12" fill="#fff" stroke="#dbe4ef"/>
  <rect x="${x}" y="${y}" width="${width}" height="4" rx="2" fill="${color}"/>
  <rect x="${x + 14}" y="${y + 15}" width="30" height="30" rx="10" fill="${color}16" stroke="${color}38"/>
  ${svgReportKpiIcon(type, x + 17, y + 18, color)}
  <text x="${x + 54}" y="${y + 28}" font-size="7.6" font-weight="900" fill="#475569">${escapeXml(label)}</text>
  <text x="${x + 14}" y="${y + 62}" font-size="16" font-weight="900" fill="#071936">${escapeXml(value)}</text>
  ${caption ? `<rect x="${x + width - 76}" y="${y + 52}" width="62" height="14" rx="7" fill="${color}12"/>
  <text x="${x + width - 45}" y="${y + 61}" text-anchor="middle" font-size="5.8" font-weight="900" fill="${color}">${escapeXml(caption)}</text>` : ""}
`;

const svgDonutSegment = ({ cx, cy, radius, color, percent, offset }) => {
  const circumference = 2 * Math.PI * radius;
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="28" stroke-dasharray="${(percent / 100 * circumference).toFixed(2)} ${circumference.toFixed(2)}" stroke-dashoffset="${(-offset / 100 * circumference).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
};

const svgBar = ({ x, y, width, value, max, color }) => {
  const safeMax = Math.max(max, 1);
  const barWidth = Math.max(Math.abs(value) / safeMax * width, value ? 8 : 0);
  return `<rect x="${x}" y="${y}" width="${width}" height="7" rx="4" fill="#e8edf5"/><rect x="${x}" y="${y}" width="${barWidth.toFixed(1)}" height="7" rx="4" fill="${color}"/>`;
};

const svgWrappedText = (text, x, y, maxChars, lineHeight, attrs = "") => {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2).map((part, index) => `<text x="${x}" y="${y + index * lineHeight}" ${attrs}>${escapeXml(part)}</text>`).join("");
};

const svgCostCenterDetailTable = (rows) => {
  const visibleRows = rows.slice(0, 7);
  const subtotal = visibleRows.reduce((total, row) => ({
    revenue: total.revenue + row.revenue,
    baseSpentCost: total.baseSpentCost + row.baseSpentCost,
    allocatedGeneralCost: total.allocatedGeneralCost + row.allocatedGeneralCost,
    allocatedManagementCost: total.allocatedManagementCost + row.allocatedManagementCost,
    receivedCreditNotes: total.receivedCreditNotes + row.receivedCreditNotes,
    updatedCost: total.updatedCost + row.updatedCost,
    netProfit: total.netProfit + row.netProfit,
  }), {
    revenue: 0,
    baseSpentCost: 0,
    allocatedGeneralCost: 0,
    allocatedManagementCost: 0,
    receivedCreditNotes: 0,
    updatedCost: 0,
    netProfit: 0,
  });
  const subtotalMargin = getShare(subtotal.netProfit, subtotal.revenue);
  const headers = [
    ["Cost Center", 62, "start"],
    ["AFP", 150, "end"],
    ["Spent", 220, "end"],
    ["Gen", 290, "end"],
    ["Mgmt", 360, "end"],
    ["CN", 430, "end"],
    ["Total", 515, "end"],
    ["Profit", 610, "end"],
    ["Margin", 710, "end"],
  ];
  const header = headers.map(([label, x, anchor]) => (
    `<text x="${x}" y="970" text-anchor="${anchor}" font-size="6.8" font-weight="900" fill="#64748b">${escapeXml(label)}</text>`
  )).join("");
  const body = visibleRows.map((row, index) => {
    const y = 986 + index * 11;
    const profitColor = row.netProfit >= 0 ? "#15803d" : "#dc2626";
    return `<rect x="54" y="${y - 8}" width="686" height="11" fill="${index % 2 ? "#fff" : "#f8fafc"}"/>
      <text x="62" y="${y}" font-size="6.8" font-weight="850" fill="#102033">${escapeXml(row.costCenter)}</text>
      <text x="150" y="${y}" text-anchor="end" font-size="6.8" font-weight="800" fill="#102033">${escapeXml(formatReportCurrency(row.revenue))}</text>
      <text x="220" y="${y}" text-anchor="end" font-size="6.8" font-weight="800" fill="#102033">${escapeXml(formatReportCurrency(row.baseSpentCost))}</text>
      <text x="290" y="${y}" text-anchor="end" font-size="6.8" font-weight="800" fill="#ea580c">${escapeXml(formatReportCurrency(row.allocatedGeneralCost))}</text>
      <text x="360" y="${y}" text-anchor="end" font-size="6.8" font-weight="800" fill="#0f766e">${escapeXml(formatReportCurrency(row.allocatedManagementCost))}</text>
      <text x="430" y="${y}" text-anchor="end" font-size="6.8" font-weight="800" fill="#7c3aed">${escapeXml(formatReportCurrency(row.receivedCreditNotes))}</text>
      <text x="515" y="${y}" text-anchor="end" font-size="6.8" font-weight="900" fill="#102033">${escapeXml(formatReportCurrency(row.updatedCost))}</text>
      <text x="610" y="${y}" text-anchor="end" font-size="6.8" font-weight="900" fill="${profitColor}">${escapeXml(formatReportCurrency(row.netProfit))}</text>
      <text x="710" y="${y}" text-anchor="end" font-size="6.8" font-weight="900" fill="${profitColor}">${escapeXml(formatPercent(row.netMargin))}</text>`;
  }).join("");
  const moreNote = rows.length > visibleRows.length
    ? `<text x="54" y="1066" font-size="7" font-weight="800" fill="#64748b">Showing ${visibleRows.length} of ${rows.length} cost centers. Use Executive table for full detail.</text>`
    : "";
  const subtotalY = 986 + visibleRows.length * 11;
  const subtotalProfitColor = subtotal.netProfit >= 0 ? "#15803d" : "#dc2626";
  const subtotalRow = `<rect x="54" y="${subtotalY - 8}" width="686" height="13" fill="#e8f5ee"/>
    <line x1="54" y1="${subtotalY - 9}" x2="740" y2="${subtotalY - 9}" stroke="#16a34a" stroke-width="1.4"/>
    <text x="62" y="${subtotalY}" font-size="7.2" font-weight="900" fill="#063b24">Subtotal</text>
    <text x="150" y="${subtotalY}" text-anchor="end" font-size="7.2" font-weight="900" fill="#063b24">${escapeXml(formatReportCurrency(subtotal.revenue))}</text>
    <text x="220" y="${subtotalY}" text-anchor="end" font-size="7.2" font-weight="900" fill="#063b24">${escapeXml(formatReportCurrency(subtotal.baseSpentCost))}</text>
    <text x="290" y="${subtotalY}" text-anchor="end" font-size="7.2" font-weight="900" fill="#c2410c">${escapeXml(formatReportCurrency(subtotal.allocatedGeneralCost))}</text>
    <text x="360" y="${subtotalY}" text-anchor="end" font-size="7.2" font-weight="900" fill="#0f766e">${escapeXml(formatReportCurrency(subtotal.allocatedManagementCost))}</text>
    <text x="430" y="${subtotalY}" text-anchor="end" font-size="7.2" font-weight="900" fill="#7c3aed">${escapeXml(formatReportCurrency(subtotal.receivedCreditNotes))}</text>
    <text x="515" y="${subtotalY}" text-anchor="end" font-size="7.2" font-weight="900" fill="#063b24">${escapeXml(formatReportCurrency(subtotal.updatedCost))}</text>
    <text x="610" y="${subtotalY}" text-anchor="end" font-size="7.2" font-weight="900" fill="${subtotalProfitColor}">${escapeXml(formatReportCurrency(subtotal.netProfit))}</text>
    <text x="710" y="${subtotalY}" text-anchor="end" font-size="7.2" font-weight="900" fill="${subtotalProfitColor}">${escapeXml(formatPercent(subtotalMargin))}</text>`;
  return `<text x="54" y="948" font-size="13" font-weight="900" fill="#071b6f">7. Site Cost Allocation Detail</text><rect x="54" y="956" width="686" height="${Math.max(55, 37 + visibleRows.length * 11)}" rx="7" fill="#fff" stroke="#dbe4ef"/><line x1="54" y1="976" x2="740" y2="976" stroke="#dbe4ef"/>${header}${body}${subtotalRow}${moreNote}`;
};

const buildPnlReportSvg = ({ analysis, selectedCostCenter }) => {
  const approved = analysis.print.approvedPnl;
  const submitted = analysis.print.submittedPnl;
  const rows = analysis.print.monthlyRows.slice(-4);
  const latest = rows.at(-1) || {};
  const previous = rows.at(-2) || {};
  const topDriver = analysis.print.glRows[0];
  const isProfitable = approved.netProfit >= 0;
  const revenueTrend = getTrend(latest.approvedRevenue || 0, previous.approvedRevenue || 0);
  const costTrend = getTrend(latest.totalCost || 0, previous.totalCost || 0);
  const profitTrend = getTrend(latest.netProfitApproved || 0, previous.netProfitApproved || 0);
  const marginTrend = (latest.netMarginApproved || 0) - (previous.netMarginApproved || 0);
  const cnImpact = approved.issuedCreditNotes - approved.receivedCreditNotes;
  const afpGap = submitted.updatedRevenue - approved.updatedRevenue;
  const profitGap = submitted.netProfit - approved.netProfit;
  const approvalRate = getShare(approved.updatedRevenue, submitted.updatedRevenue);
  const gapColor = Math.abs(afpGap) < 1 ? "#16a34a" : afpGap > 0 ? "#f59e0b" : "#16a34a";
  const gapStatus = Math.abs(afpGap) < 1
    ? "No submitted-to-approved AFP gap."
    : afpGap > 0
      ? `Submitted AFP is above approved by ${formatReportCurrency(afpGap)}.`
      : `Approved AFP is above submitted by ${formatReportCurrency(Math.abs(afpGap))}.`;
  const reportDateLabel = analysis.print.meta.reportDate.split(",")[0];
  const reportPeriodLabel = analysis.print.meta.periodLabel.length > 19
    ? `${analysis.print.meta.periodLabel.slice(0, 18)}...`
    : analysis.print.meta.periodLabel;
  const glColors = ["#1d66b8", "#16a34a", "#f59e0b", "#7c3aed", "#14b8a6", "#0ea5e9", "#f97316", "#64748b", "#84cc16", "#db2777"];
  const glDistributionRows = analysis.print.glRows.map((row, index) => ({
    label: row.glName,
    amount: row.amount,
    share: row.share,
    color: glColors[index % glColors.length],
  }));
  const glShareTotal = glDistributionRows.reduce((total, row) => total + row.share, 0);
  const unallocatedShare = Math.max(0, 100 - glShareTotal);
  const distributionRows = [
    ...glDistributionRows,
    ...(unallocatedShare > 0.1 ? [{ label: "Received CN Adj.", amount: approved.updatedCost - approved.totalCost, share: unallocatedShare, color: "#e8edf5" }] : []),
  ];
  let donutOffset = 0;
  const donutSegments = distributionRows.map((row) => {
    const segment = svgDonutSegment({ cx: 122, cy: 526, radius: 39, color: row.color, percent: row.share, offset: donutOffset });
    donutOffset += row.share;
    return segment;
  }).join("");
  const distributionLegend = distributionRows.map((row, index) => {
    const y = 482 + index * 13;
    return `<circle cx="204" cy="${y - 4}" r="3.4" fill="${row.color}"/><text x="212" y="${y}" font-size="6.1" font-weight="850" fill="#102033">${escapeXml(row.label.slice(0, 21))}</text><text x="342" y="${y}" text-anchor="end" font-size="6.1" font-weight="900" fill="#102033">${escapeXml(formatReportCurrency(row.amount || 0))}</text><text x="376" y="${y}" text-anchor="end" font-size="6.1" font-weight="900" fill="#102033">${escapeXml(formatPercent(row.share))}</text>`;
  }).join("");
  const distributionTable = `<text x="212" y="460" font-size="5.8" font-weight="900" fill="#64748b">GL NAME</text><text x="342" y="460" text-anchor="end" font-size="5.8" font-weight="900" fill="#64748b">AMOUNT</text><text x="376" y="460" text-anchor="end" font-size="5.8" font-weight="900" fill="#64748b">SHARE</text><line x1="202" y1="468" x2="378" y2="468" stroke="#e7edf5"/>${distributionLegend}`;
  const cnRows = (analysis.cnBreakdown.length ? analysis.cnBreakdown : [{ mode: "No CN", label: "No credit notes", amount: 0 }]).slice(0, 4);
  const maxCn = Math.max(...cnRows.map((row) => Math.abs(row.amount)), 1);
  const cnBars = cnRows.map((row, index) => {
    const y = 470 + index * 30;
    const color = row.mode === "Issued" ? "#16a34a" : "#7c3aed";
    const label = row.mode === "Received" ? row.label : `${row.mode} - ${row.label}`;
    return `<text x="420" y="${y}" font-size="9.2" font-weight="850" fill="#102033">${escapeXml(label.slice(0, 34))}</text>${svgBar({ x: 420, y: y + 8, width: 150, value: row.amount, max: maxCn, color })}<text x="718" y="${y}" text-anchor="end" font-size="9.2" font-weight="900" fill="${color}">${escapeXml(formatReportCurrency(row.amount))}</text>`;
  }).join("");
  const bridgeMax = Math.max(Math.abs(approved.grossProfit), Math.abs(cnImpact), Math.abs(approved.netProfit), 1);
  const bridgeItems = [
    { label: ["Site Profit", "Before CN"], value: approved.grossProfit, color: "#2f6fb8" },
    { label: ["CN Impact"], value: cnImpact, color: "#16877a" },
    { label: ["Final Site Profit"], value: approved.netProfit, color: "#1b8177" },
  ];
  const bridgeBars = bridgeItems.map((item, index) => {
    const x = 106 + index * 214;
    const width = 58;
    const center = x + width / 2;
    const baseline = 704;
    const barHeight = Math.max(Math.abs(item.value) / bridgeMax * 38, item.value ? 7 : 0);
    const y = item.value >= 0 ? baseline - barHeight : baseline;
    const labelLines = item.label.map((line, lineIndex) => (
      `<text x="${center}" y="${654 + lineIndex * 10}" text-anchor="middle" font-size="7.6" font-weight="850" fill="#475569">${escapeXml(line)}</text>`
    )).join("");
    return `${labelLines}<rect x="${x}" y="${y}" width="${width}" height="${barHeight}" rx="1.5" fill="${item.color}"/><text x="${center}" y="690" text-anchor="middle" font-size="8.2" font-weight="900" fill="#0f2742">${escapeXml(formatReportCurrency(item.value))}</text>`;
  }).join("");
  const insightLines = [
    `${selectedCostCenter || "Selected scope"} is ${isProfitable ? "covering cost" : "below cost recovery"} on approved AFP, with ${formatReportCurrency(approved.netProfit)} site profit.`,
    `${gapStatus} Use this to follow up pending AFP approval before month close.`,
    `${topDriver?.glName || "Top GL"} is the main site cost driver at ${formatReportCurrency(topDriver?.amount || 0)} (${formatPercent(topDriver?.share || 0)}).`,
    `Credit notes changed profit by ${formatReportCurrency(cnImpact)}; confirm source and receiving cost center with operations.`,
    `Margin is ${approved.netMargin >= 20 ? "healthy" : approved.netMargin >= 0 ? "watch-listed" : "under pressure"}; focus site action on the largest GL and CN items.`,
  ];
  const insights = insightLines.map((line, index) => `<text x="78" y="${828 + index * 20}" font-size="9.5" font-weight="900" fill="#0f766e">${index + 1}</text>${svgWrappedText(line, 104, 828 + index * 20, 96, 10, 'font-size="8.6" font-weight="750" fill="#102033"')}`).join("");
  const actions = [
    ["AFP", "Close AFP gap", "Follow up submitted vs approved AFP.", "#0f766e"],
    ["GL", "Check main cost driver", "Validate quantity, manpower, and equipment use.", "#f59e0b"],
    ["CN", "Confirm CN source", "Agree issued and received CN with the site team.", "#7c3aed"],
    ["MRG", "Recover margin", "Target the largest controllable cost items.", "#14b8a6"],
  ].map((item, index) => {
    const x = 54 + index * 174;
    return `<rect x="${x}" y="956" width="160" height="82" rx="8" fill="#fff" stroke="#dbe4ef"/><circle cx="${x + 18}" cy="981" r="10" fill="#fff" stroke="${item[3]}" stroke-width="2"/><text x="${x + 18}" y="984" text-anchor="middle" font-size="6.5" font-weight="900" fill="${item[3]}">${item[0]}</text><text x="${x + 34}" y="978" font-size="8.5" font-weight="900" fill="#102033">${escapeXml(item[1])}</text>${svgWrappedText(item[2], x + 14, 1010, 32, 10, 'font-size="8" font-weight="700" fill="#334155"')}`;
  }).join("");
  const detailSection = analysis.print.costCenterDetailRows?.length > 1
    ? svgCostCenterDetailTable(analysis.print.costCenterDetailRows)
    : `<text x="54" y="944" font-size="13" font-weight="900" fill="#071b6f">7. Construction Actions</text>${actions}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123"><rect width="794" height="1123" fill="#fff"/><rect x="28" y="28" width="738" height="1067" rx="16" fill="#fff" stroke="#dbe4ef"/><image href="${igccLogo}" x="58" y="58" width="58" height="58"/><rect x="132" y="52" width="392" height="78" rx="0" fill="#071936"/><path d="M472 52h52v78h-68c20-24 25-50 16-78Z" fill="#99f6e4"/><text x="160" y="79" font-size="17" font-weight="900" fill="#fff">PROFIT &amp; LOSS</text><text x="160" y="104" font-size="13.5" font-weight="900" fill="#8ee6d2">SITE COST REPORT</text><text x="160" y="122" font-size="6.8" font-weight="850" fill="#fff">${escapeXml(analysis.print.meta.scopeLabel || selectedCostCenter || "Cost Center")} | ${escapeXml(analysis.print.meta.hub)} | ${escapeXml(analysis.print.meta.region)} | USD</text><rect x="538" y="52" width="202" height="78" fill="#0b2b52"/><text x="554" y="77" font-size="7.8" font-weight="800" fill="#cbd5e1">Report Date</text><text x="636" y="77" font-size="7.8" font-weight="900" fill="#fff">${escapeXml(reportDateLabel)}</text><text x="554" y="100" font-size="7.8" font-weight="800" fill="#cbd5e1">Period</text><text x="636" y="100" font-size="7.8" font-weight="900" fill="#fff">${escapeXml(reportPeriodLabel)}</text><text x="554" y="121" font-size="7.8" font-weight="800" fill="#cbd5e1">Currency</text><text x="636" y="121" font-size="7.8" font-weight="900" fill="#fff">USD</text>${svgReportKpi({ x: 54, y: 160, width: 160, label: "Status", value: isProfitable ? "Profitable" : "Loss", caption: "", color: isProfitable ? "#16a34a" : "#dc2626", type: "status" })}${svgReportKpi({ x: 224, y: 160, width: 160, label: "Approved AFP", value: formatReportCurrency(approved.updatedRevenue), caption: `Submitted ${formatReportCurrency(submitted.updatedRevenue)}`, color: "#16a34a", type: "revenue" })}${svgReportKpi({ x: 394, y: 160, width: 160, label: "Total Cost", value: formatReportCurrency(approved.updatedCost), caption: `${costTrend >= 0 ? "Up" : "Down"} ${formatPercent(Math.abs(costTrend))}`, color: "#ef4444", type: "cost" })}${svgReportKpi({ x: 564, y: 160, width: 176, label: "Site Profit", value: formatReportCurrency(approved.netProfit), caption: `Submitted ${formatReportCurrency(submitted.netProfit)}`, color: "#2563eb", type: "profit" })}${svgCard(54, 274, 336, 150, "1. AFP & Site Cost Check", [["Submitted AFP", submitted.updatedRevenue, "#0f766e"], ["Approved AFP", approved.updatedRevenue, "#102033"], ["AFP Gap", afpGap, gapColor], ["Site Cost", -approved.updatedCost, "#dc2626"], ["Approved Site Profit", approved.netProfit, approved.netProfit >= 0 ? "#15803d" : "#dc2626"], ["Submitted Site Profit", submitted.netProfit, submitted.netProfit >= 0 ? "#15803d" : "#dc2626"], ["Profit Gap", profitGap, gapColor]].map((row, index) => `<text x="74" y="${318 + index * 14}" font-size="8.1" font-weight="${index === 1 || index === 4 || index === 5 ? 900 : 750}" fill="#102033">${escapeXml(row[0])}</text><text x="354" y="${318 + index * 14}" text-anchor="end" font-size="8.1" font-weight="900" fill="${row[2]}">${escapeXml(formatReportCurrency(row[1]))}</text><line x1="74" y1="${323 + index * 14}" x2="354" y2="${323 + index * 14}" stroke="#e7edf5"/>`).join(""))}${svgCard(404, 274, 336, 134, "2. Construction Summary", `<text x="424" y="318" font-size="10" font-weight="900" fill="#102033">AFP Approval Check</text><text x="424" y="335" font-size="9.2" fill="#334155">${escapeXml(gapStatus)} Approval rate ${escapeXml(formatPercent(approvalRate))}.</text><text x="424" y="362" font-size="10" font-weight="900" fill="#102033">Site Profit View</text><text x="424" y="379" font-size="9.2" fill="#334155">Approved profit ${escapeXml(formatReportCurrency(approved.netProfit))}; submitted profit ${escapeXml(formatReportCurrency(submitted.netProfit))}.</text><text x="424" y="399" font-size="10" font-weight="900" fill="#102033">Action Required</text><text x="520" y="399" font-size="9.2" fill="#334155">Close AFP gap, check top GL, confirm CN source.</text>`)}${svgCard(54, 430, 336, 150, "3. Site Cost Distribution", `<circle cx="120" cy="526" r="39" fill="none" stroke="#e8edf5" stroke-width="24"/>${donutSegments}<circle cx="120" cy="526" r="22" fill="#fff"/>${distributionTable}`)}${svgCard(404, 430, 336, 150, "4. Received CN Breakdown", cnBars, `Impact ${formatReportCurrency(cnImpact)}`)}${svgCard(54, 604, 686, 150, "5. Site Profit Movement", `<line x1="92" y1="704" x2="672" y2="704" stroke="#e2e8f0"/><line x1="164" y1="674" x2="320" y2="674" stroke="#94a3b8" stroke-dasharray="4 4"/><line x1="378" y1="674" x2="534" y2="674" stroke="#94a3b8" stroke-dasharray="4 4"/>${bridgeBars}`)}${svgCard(54, 774, 686, 150, "6. Site Follow-up Notes", insights)}${detailSection}<text x="54" y="1072" font-size="9" font-weight="800" fill="#0f766e">Notes:</text><text x="92" y="1072" font-size="9" fill="#334155">AFP: Application for Payment | CN: Credit Notes | pp: Percentage Points</text></svg>`;
};

const openPnlReportTemplate = ({ analysis, selectedCostCenter }) => {
  const reportWindow = window.open("", "_blank", "width=980,height=1200");
  if (!reportWindow) return;
  reportWindow.document.write(`<!doctype html><html><head><title>P&L Cost Center Report</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0;background:#e5e7eb;font-family:Arial,sans-serif}.toolbar{position:sticky;top:0;display:flex;justify-content:center;gap:10px;padding:10px;background:#0b1220;z-index:2}.toolbar button{border:0;border-radius:999px;padding:9px 16px;background:#14b8a6;color:#fff;font-weight:800;cursor:pointer}.toolbar button:disabled{background:#64748b;cursor:wait}.sheet{width:210mm;min-height:297mm;margin:14px auto;background:#fff;box-shadow:0 18px 46px rgba(15,23,42,.24)}svg{display:block;width:210mm;height:297mm}@media print{html,body{background:#fff}.toolbar{display:none}.sheet{margin:0;box-shadow:none}}</style></head><body><div class="toolbar"><button id="print-report-button" disabled>Preparing report...</button><button onclick="window.close()">Close</button></div><main class="sheet">${buildPnlReportSvg({ analysis, selectedCostCenter })}</main><script>window.addEventListener("load",function(){var button=document.getElementById("print-report-button");button.disabled=false;button.textContent="Download / Print PDF";button.addEventListener("click",function(){window.focus();window.print();});});</script></body></html>`);
  reportWindow.document.close();
  reportWindow.focus();
};

function ProfitabilityPrintReport({ analysis, selectedCostCenter, isScreen = false }) {
  const approved = analysis.print.approvedPnl;
  const reportRows = analysis.print.monthlyRows.slice(-4);
  const latest = reportRows.at(-1);
  const previous = reportRows.at(-2);
  const isProfitable = approved.netProfit >= 0;
  const topDriver = analysis.print.glRows[0];
  const costTrend = getTrend(latest?.totalCost || 0, previous?.totalCost || 0);
  const profitTrend = getTrend(latest?.netProfitApproved || 0, previous?.netProfitApproved || 0);

  return (
    <section className={`pnl-print-report ${isScreen ? "is-report-screen" : ""}`} aria-label="Printable Profit and Loss report">
      <header className="print-report-header">
        <div className="print-brand">
          <img src={igccLogo} alt="IGCC" />
          <div>
            <h1><span>Profit & Loss</span> Cost Center Report</h1>
            <p>{selectedCostCenter || "Cost Center"} | {analysis.print.meta.hub} | {analysis.print.meta.portfolio} | USD</p>
          </div>
        </div>
        <div className="print-meta">
          <p><span>Report Date</span><strong>{analysis.print.meta.reportDate}</strong></p>
          <p><span>Reporting Period</span><strong>{analysis.print.meta.periodLabel}</strong></p>
          <p><span>Currency</span><strong>USD</strong></p>
        </div>
      </header>

      <section className="print-status-band">
        <div>
          <span>Cost Center</span>
          <strong>{selectedCostCenter || "All selected cost centers"}</strong>
          <em>{analysis.print.meta.hub} | {analysis.print.meta.portfolio} | {analysis.print.meta.region}</em>
        </div>
        <div className={isProfitable ? "is-good" : "is-loss"}>
          <span>Status</span>
          <strong>{isProfitable ? "Profitable" : "Loss-Making"}</strong>
          <em>{formatPercent(approved.netMargin)} net margin</em>
        </div>
        <div>
          <span>Discussion Focus</span>
          <strong>{topDriver?.glName || "Cost discipline"}</strong>
          <em>{formatPercent(topDriver?.share || 0)} of total cost</em>
        </div>
      </section>

      <section className="print-kpi-grid">
        <PrintMetricCard label="Adjusted Revenue" value={formatMillions(approved.updatedRevenue)} trend={getTrend(latest?.approvedRevenue || 0, previous?.approvedRevenue || 0)} values={reportRows.map((row) => row.approvedRevenue)} tone="green" />
        <PrintMetricCard label="Total Cost" value={formatMillions(approved.updatedCost)} trend={getTrend(latest?.totalCost || 0, previous?.totalCost || 0)} values={reportRows.map((row) => row.totalCost)} tone="red" />
        <PrintMetricCard label="Net Profit" value={formatMillions(approved.netProfit)} trend={profitTrend} values={reportRows.map((row) => row.netProfitApproved)} tone="blue" />
        <PrintMetricCard label="Net Margin" value={formatPercent(approved.netMargin)} trend={(latest?.netMarginApproved || 0) - (previous?.netMarginApproved || 0)} values={reportRows.map((row) => row.netMarginApproved)} tone="blue" />
      </section>

      <section className="print-analysis-grid">
        <article className="print-report-card print-bridge-card">
          <h3>Revenue & Cost Bridge <small>Approved Basis | USD in Millions</small></h3>
          <div>
            <p><span>Approved AFP</span><strong>{formatMillions(approved.revenue)}</strong></p>
            <p><span>Issued Credit Notes</span><strong>{formatMillions(approved.issuedCreditNotes)}</strong></p>
            <p className="is-total"><span>Adjusted Revenue</span><strong>{formatMillions(approved.updatedRevenue)}</strong></p>
            <p><span>Spent Report Cost</span><strong className="is-red">{formatMillions(-approved.baseSpentCost)}</strong></p>
            <p><span>Reallocated General Cost</span><strong className="is-red">{formatMillions(-approved.allocatedGeneralCost)}</strong></p>
            <p><span>Management Cost</span><strong className="is-red">{formatMillions(-approved.allocatedManagementCost)}</strong></p>
            <p><span>Received Credit Notes</span><strong className="is-red">{formatMillions(-approved.receivedCreditNotes)}</strong></p>
            <p className="is-final"><span>Net Profit</span><strong>{formatMillions(approved.netProfit)}</strong></p>
          </div>
        </article>
        <article className="print-report-card print-discussion-card">
          <h3>Operational Discussion Summary <small>For Operations / Construction Review</small></h3>
          <p>The cost center is <strong>{isProfitable ? "profitable" : "loss-making"}</strong> with {formatPercent(approved.netMargin)} approved-basis net margin.</p>
          <p>Main cost pressure is <strong>{topDriver?.glName || "not identified"}</strong>, representing {formatPercent(topDriver?.share || 0)} of total cost.</p>
          <p>Latest cost movement is <strong className={costTrend <= 0 ? "is-green" : "is-red"}>{costTrend >= 0 ? "up" : "down"} {formatPercent(Math.abs(costTrend))}</strong>; net profit movement is <strong>{profitTrend >= 0 ? "up" : "down"} {formatPercent(Math.abs(profitTrend))}</strong>.</p>
        </article>
      </section>

      <section className="print-trend-section">
        <MonthlyTrendChart rows={reportRows.map((row) => ({ ...row, revenue: row.approvedRevenue, netProfit: row.netProfitApproved }))} />
      </section>

      <section className="print-visual-grid">
        <PrintGlBreakdown rows={analysis.print.glRows} totalCost={approved.updatedCost} />
        <section className="print-movement-table">
          <h3>Monthly Movement</h3>
          {reportRows.map((row) => (
            <p key={row.period}>
              <strong>{row.label}</strong>
              <span>{formatMillions(row.approvedRevenue)}</span>
              <span>{formatMillions(row.totalCost)}</span>
              <span>{formatMillions(row.netProfitApproved)}</span>
              <span>{formatPercent(row.netMarginApproved)}</span>
            </p>
          ))}
        </section>
      </section>
    </section>
  );
}

export function ProfitabilityPage({ filters = {}, activePage }) {
  const [revenueBasis, setRevenueBasis] = useState("approved");
  const [drilldownCostCenter, setDrilldownCostCenter] = useState("");
  const [tableFilters, setTableFilters] = useState(DEFAULT_TABLE_FILTERS);
  const [sortConfig, setSortConfig] = useState({ key: "costCenter", direction: "asc" });
  const [activeFilterColumn, setActiveFilterColumn] = useState("");
  const filterCostCenter = filters.costCenter && filters.costCenter !== ALL_FILTER_VALUE ? filters.costCenter : "";
  const selectedCostCenter = filterCostCenter || drilldownCostCenter;
  const isDetailPage = activePage === "detail";
  const selectedCostCenters = getReportCostCenterMembers(selectedCostCenter);
  const revenueBasisLabel = REVENUE_BASIS_OPTIONS.find((option) => option.id === revenueBasis)?.label || "Approved AFP";

  const analysis = useMemo(() => {
    const entries = allocateGeneralSpentCosts(financialInputsData.entries || [], filters);
    const filteredRows = entries.filter((entry) => matchesFilters(entry, filters));
    const contextRows = selectedCostCenter
      ? entries.filter((entry) => matchesFilters(entry, { ...filters, costCenter: selectedCostCenter }))
      : filteredRows;
    const creditContextRows = selectedCostCenter
      ? entries.filter((entry) => entry.type === "creditNotes" && matchesFilters(entry, filters, { ignoreCostCenter: true }))
      : [];
    const pnl = calculatePnl({
      rows: contextRows,
      creditRows: creditContextRows,
      selectedCostCenter,
      revenueBasis,
    });
    const approvedPnl = calculatePnl({
      rows: contextRows,
      creditRows: creditContextRows,
      selectedCostCenter,
      revenueBasis: "approved",
    });
    const submittedPnl = calculatePnl({
      rows: contextRows,
      creditRows: creditContextRows,
      selectedCostCenter,
      revenueBasis: "submitted",
    });

    const periodMap = new Map();
    for (const entry of contextRows) {
      if (entry.type === "creditNotes") continue;
      const current = periodMap.get(entry.period) || {
        period: entry.period,
        revenue: 0,
        totalCost: 0,
        grossProfit: 0,
        netProfit: 0,
        netMargin: 0,
      };
      if (entry.type === revenueBasis) current.revenue += entry.amount || 0;
      if (entry.type === "spent") current.totalCost += entry.amount || 0;
      periodMap.set(entry.period, current);
    }
    const monthlyTrend = [...periodMap.values()]
      .map((row) => {
        const issued = selectedCostCenter ? sumRows(creditContextRows, (entry) => entry.period === row.period && isReportCostCenterMember(entry.issuedBy, selectedCostCenters)) : 0;
        const received = selectedCostCenter ? sumRows(creditContextRows, (entry) => entry.period === row.period && isReportCostCenterMember(entry.costCenter, selectedCostCenters)) : 0;
        const grossProfit = row.revenue - row.totalCost;
        const updatedRevenue = row.revenue + issued;
        const updatedCost = row.totalCost + received;
        const netProfit = selectedCostCenter ? updatedRevenue - updatedCost : grossProfit;
        return {
          ...row,
          revenue: roundCurrency(selectedCostCenter ? updatedRevenue : row.revenue),
          totalCost: roundCurrency(selectedCostCenter ? updatedCost : row.totalCost),
          grossProfit: roundCurrency(grossProfit),
          netProfit: roundCurrency(netProfit),
          netMargin: getShare(netProfit, selectedCostCenter ? updatedRevenue : row.revenue),
        };
      })
      .filter((row) => row.revenue || row.totalCost || row.netProfit)
      .sort((a, b) => a.period.localeCompare(b.period));

    const costCenterMap = new Map();
    const costCenterCreditRows = entries.filter((entry) => entry.type === "creditNotes" && matchesFilters(entry, filters, { ignoreCostCenter: true }));
    for (const entry of filteredRows) {
      if (entry.type === "creditNotes") continue;
      const current = costCenterMap.get(entry.costCenter) || {
        region: entry.region,
        hub: entry.hub,
        costCenter: entry.costCenter,
        revenue: 0,
        totalCost: 0,
      };
      if (entry.type === revenueBasis) current.revenue += entry.amount || 0;
      if (entry.type === "spent") current.totalCost += entry.amount || 0;
      costCenterMap.set(entry.costCenter, current);
    }
    const costCenterRows = [...costCenterMap.values()]
      .map((row) => {
        const issued = sumRows(costCenterCreditRows, (entry) => entry.issuedBy === row.costCenter);
        const received = sumRows(costCenterCreditRows, (entry) => entry.costCenter === row.costCenter);
        const grossProfit = row.revenue - row.totalCost;
        const updatedRevenue = row.revenue + issued;
        const updatedCost = row.totalCost + received;
        const netProfit = updatedRevenue - updatedCost;
        const netMargin = getShare(netProfit, updatedRevenue);
        return {
          ...row,
          revenue: roundCurrency(row.revenue),
          totalCost: roundCurrency(row.totalCost),
          grossProfit: roundCurrency(grossProfit),
          netProfit: roundCurrency(netProfit),
          netMargin,
          costToRevenue: getShare(updatedCost, updatedRevenue),
          status: getStatus(netMargin, netProfit),
        };
      })
      .sort((a, b) => a.region.localeCompare(b.region) || a.hub.localeCompare(b.hub) || a.costCenter.localeCompare(b.costCenter));

    const cnCategoryMap = new Map();
    if (selectedCostCenter) {
      for (const entry of creditContextRows) {
        const isIssued = isReportCostCenterMember(entry.issuedBy, selectedCostCenters);
        const isReceived = isReportCostCenterMember(entry.costCenter, selectedCostCenters);
        if (!isIssued && !isReceived) continue;
        const mode = isReceived ? "Received" : "Issued";
        const label = isReceived
          ? normalizeReportCostCenter(entry.issuedBy || entry.category || "Credit Note")
          : normalizeReportCostCenter(entry.costCenter || entry.category || "Credit Note");
        const key = `${mode}-${label}`;
        const current = cnCategoryMap.get(key) || { mode, label, amount: 0 };
        current.amount += entry.amount || 0;
        cnCategoryMap.set(key, current);
      }
    }

    const transactions = selectedCostCenter
      ? [
        ...contextRows.filter((entry) => ["spent", revenueBasis].includes(entry.type)),
        ...creditContextRows.filter((entry) => isReportCostCenterMember(entry.issuedBy, selectedCostCenters) || isReportCostCenterMember(entry.costCenter, selectedCostCenters)),
      ]
        .sort((a, b) => b.period.localeCompare(a.period) || Math.abs(b.amount || 0) - Math.abs(a.amount || 0))
        .slice(0, 18)
      : [];

    const printPeriodMap = new Map();
    for (const entry of contextRows) {
      if (entry.type === "creditNotes") continue;
      const current = printPeriodMap.get(entry.period) || {
        period: entry.period,
        label: `${entry.month || entry.period.slice(5)} ${entry.year || entry.period.slice(0, 4)}`,
        approvedRevenue: 0,
        submittedRevenue: 0,
        totalCost: 0,
      };
      if (entry.type === "approved") current.approvedRevenue += entry.amount || 0;
      if (entry.type === "submitted") current.submittedRevenue += entry.amount || 0;
      if (entry.type === "spent") current.totalCost += entry.amount || 0;
      printPeriodMap.set(entry.period, current);
    }
    const monthlyRows = [...printPeriodMap.values()]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((row) => {
        const issued = selectedCostCenter ? sumRows(creditContextRows, (entry) => entry.period === row.period && isReportCostCenterMember(entry.issuedBy, selectedCostCenters)) : 0;
        const received = selectedCostCenter ? sumRows(creditContextRows, (entry) => entry.period === row.period && isReportCostCenterMember(entry.costCenter, selectedCostCenters)) : 0;
        const approvedRevenue = selectedCostCenter ? row.approvedRevenue + issued : row.approvedRevenue;
        const submittedRevenue = selectedCostCenter ? row.submittedRevenue + issued : row.submittedRevenue;
        const totalCost = selectedCostCenter ? row.totalCost + received : row.totalCost;
        const netProfitApproved = approvedRevenue - totalCost;
        const netProfitSubmitted = submittedRevenue - totalCost;
        return {
          ...row,
          approvedRevenue: roundCurrency(approvedRevenue),
          submittedRevenue: roundCurrency(submittedRevenue),
          totalCost: roundCurrency(totalCost),
          netProfitApproved: roundCurrency(netProfitApproved),
          netProfitSubmitted: roundCurrency(netProfitSubmitted),
          netMarginApproved: getShare(netProfitApproved, approvedRevenue),
          netMarginSubmitted: getShare(netProfitSubmitted, submittedRevenue),
          netMargin: getShare(netProfitApproved, approvedRevenue),
        };
      });

    const glMap = new Map();
    for (const entry of contextRows) {
      if (entry.type !== "spent") continue;
      const glName = entry.isAllocatedManagementCost
        ? "Management Cost"
        : entry.isAllocatedGeneralCost
          ? "Reallocated General Cost"
          : entry.glName || "Unclassified Cost";
      const current = glMap.get(glName) || { glName, amount: 0, periodValues: new Map() };
      current.amount += entry.amount || 0;
      current.periodValues.set(entry.period, (current.periodValues.get(entry.period) || 0) + (entry.amount || 0));
      glMap.set(glName, current);
    }
    const printPeriods = monthlyRows.map((row) => row.period);
    const detailMap = new Map();
    for (const entry of contextRows) {
      const costCenter = normalizeReportCostCenter(entry.costCenter);
      const current = detailMap.get(costCenter) || {
        costCenter,
        revenue: 0,
        baseSpentCost: 0,
        allocatedGeneralCost: 0,
        allocatedManagementCost: 0,
        receivedCreditNotes: 0,
      };
      if (entry.type === "approved") current.revenue += entry.amount || 0;
      if (entry.type === "spent" && entry.isAllocatedGeneralCost) current.allocatedGeneralCost += entry.amount || 0;
      if (entry.type === "spent" && entry.isAllocatedManagementCost) current.allocatedManagementCost += entry.amount || 0;
      if (entry.type === "spent" && !entry.isAllocatedGeneralCost && !entry.isAllocatedManagementCost) current.baseSpentCost += entry.amount || 0;
      detailMap.set(costCenter, current);
    }
    for (const entry of creditContextRows) {
      const costCenter = normalizeReportCostCenter(entry.costCenter);
      if (!detailMap.has(costCenter)) continue;
      detailMap.get(costCenter).receivedCreditNotes += entry.amount || 0;
    }
    const costCenterDetailRows = [...detailMap.values()]
      .map((row) => {
        const updatedCost = row.baseSpentCost + row.allocatedGeneralCost + row.allocatedManagementCost + row.receivedCreditNotes;
        const netProfit = row.revenue - updatedCost;
        return {
          ...row,
          updatedCost: roundCurrency(updatedCost),
          netProfit: roundCurrency(netProfit),
          netMargin: getShare(netProfit, row.revenue),
          revenue: roundCurrency(row.revenue),
          baseSpentCost: roundCurrency(row.baseSpentCost),
          allocatedGeneralCost: roundCurrency(row.allocatedGeneralCost),
          allocatedManagementCost: roundCurrency(row.allocatedManagementCost),
          receivedCreditNotes: roundCurrency(row.receivedCreditNotes),
        };
      })
      .filter((row) => row.revenue || row.updatedCost || row.receivedCreditNotes)
      .sort((a, b) => b.revenue - a.revenue);
    const specialDistributionLabels = new Set(["Reallocated General Cost", "Management Cost"]);
    const allGlRows = [...glMap.values()]
      .map((row) => {
        const monthlyValues = printPeriods.map((period) => roundCurrency(row.periodValues.get(period) || 0));
        return {
          ...row,
          amount: roundCurrency(row.amount),
          share: getShare(row.amount, approvedPnl.updatedCost),
          movement: getTrend(monthlyValues.at(-1) || 0, monthlyValues.at(-2) || 0),
          monthlyValues,
        };
      })
      .sort((a, b) => b.amount - a.amount);
    const specialGlRows = allGlRows.filter((row) => specialDistributionLabels.has(row.glName));
    const regularGlRows = allGlRows.filter((row) => !specialDistributionLabels.has(row.glName));
    const glRows = [
      ...regularGlRows.slice(0, Math.max(0, 7 - specialGlRows.length)),
      ...specialGlRows,
    ].sort((a, b) => b.amount - a.amount);

    const scopeEntry = contextRows.find((entry) => entry.costCenter === selectedCostCenter) || contextRows.find((entry) => entry.costCenter);
    const portfolioLabel = filters.portfolio === "basra" ? "Basra"
      : filters.portfolio === "kirkuk" ? "Kirkuk"
        : filters.portfolio === "head-office" ? "Head Office"
          : "IGCC";

    return {
      pnl,
      monthlyTrend,
      costCenterRows,
      cnBreakdown: [...cnCategoryMap.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
      transactions,
      print: {
        approvedPnl,
        submittedPnl,
        monthlyRows,
        glRows,
        costCenterDetailRows,
        meta: {
          scopeLabel: getCostCenterFilterLabel(selectedCostCenter) || selectedCostCenter || "Cost Center",
          portfolio: portfolioLabel,
          hub: filters.hub && filters.hub !== ALL_FILTER_VALUE ? filters.hub : scopeEntry?.hub || "All hubs",
          region: scopeEntry?.region || portfolioLabel,
          periodLabel: monthlyRows.length
            ? monthlyRows[0].label === monthlyRows.at(-1).label
              ? monthlyRows[0].label
              : `${monthlyRows[0].label} - ${monthlyRows.at(-1).label}`
            : "No selected period",
          reportDate: new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date()),
        },
      },
    };
  }, [filters, revenueBasis, selectedCostCenter]);

  const kpiCards = [
    { icon: "approve", label: "Revenue", value: formatCompactCurrency(analysis.pnl.isCostCenterLevel ? analysis.pnl.updatedRevenue : analysis.pnl.revenue), context: revenueBasisLabel, tone: "green", sparkline: analysis.monthlyTrend.map((row) => row.revenue), movement: getTrend(analysis.monthlyTrend.at(-1)?.revenue || 0, analysis.monthlyTrend.at(-2)?.revenue || 0) },
    { icon: "spending", label: "Total Cost", value: formatCompactCurrency(analysis.pnl.isCostCenterLevel ? analysis.pnl.updatedCost : analysis.pnl.totalCost), context: analysis.pnl.isCostCenterLevel ? "Spent + allocation + received CN" : "Spent with allocation", tone: "red", sparkline: analysis.monthlyTrend.map((row) => row.totalCost), movement: getTrend(analysis.monthlyTrend.at(-1)?.totalCost || 0, analysis.monthlyTrend.at(-2)?.totalCost || 0) },
    { icon: "pnl", label: "Gross Profit", value: formatCompactCurrency(analysis.pnl.grossProfit), context: "AFP less spent cost", tone: analysis.pnl.grossProfit >= 0 ? "blue" : "red", sparkline: analysis.monthlyTrend.map((row) => row.grossProfit), movement: getTrend(analysis.monthlyTrend.at(-1)?.grossProfit || 0, analysis.monthlyTrend.at(-2)?.grossProfit || 0) },
    ...(analysis.pnl.isCostCenterLevel ? [{ icon: "credit", label: "Credit Notes Adjustment", value: formatCompactCurrency(analysis.pnl.creditNotesAdjustment), context: "Issued less received CN", tone: "amber", sparkline: analysis.monthlyTrend.map((row) => row.netProfit), movement: getTrend(analysis.monthlyTrend.at(-1)?.netProfit || 0, analysis.monthlyTrend.at(-2)?.netProfit || 0) }] : []),
    { icon: "net", label: "Net Profit", value: formatCompactCurrency(analysis.pnl.netProfit), context: analysis.pnl.isCostCenterLevel ? "CN-adjusted result" : "Clean high-level total", tone: analysis.pnl.netProfit >= 0 ? "teal" : "red", sparkline: analysis.monthlyTrend.map((row) => row.netProfit), movement: getTrend(analysis.monthlyTrend.at(-1)?.netProfit || 0, analysis.monthlyTrend.at(-2)?.netProfit || 0) },
    { icon: "executive", label: "Net Margin %", value: formatPercent(analysis.pnl.netMargin), context: "Net profit / revenue", tone: analysis.pnl.netMargin >= 10 ? "green" : "amber", sparkline: analysis.monthlyTrend.map((row) => row.netMargin), movement: (analysis.monthlyTrend.at(-1)?.netMargin || 0) - (analysis.monthlyTrend.at(-2)?.netMargin || 0) },
    ...(analysis.pnl.isCostCenterLevel ? [{ icon: "costCenter", label: "Cost-to-Revenue %", value: formatPercent(analysis.pnl.costToRevenue), context: "Cost discipline ratio", tone: analysis.pnl.costToRevenue <= 90 ? "blue" : "red", sparkline: analysis.monthlyTrend.map((row) => row.costToRevenue || 0), movement: 0 }] : []),
  ];

  const displayedCostCenterRows = useMemo(() => {
    const filtered = analysis.costCenterRows.filter((row) => PROFITABILITY_COLUMNS.every((column) => {
      if (column.type === "number") {
        return passesNumberFilter(row[column.key], tableFilters[`${column.key}Min`], tableFilters[`${column.key}Max`]);
      }
      const selectedValues = tableFilters[column.key] || [];
      return !selectedValues.length || selectedValues.includes(getFilterValue(row, column.key));
    }));

    return [...filtered].sort((a, b) => {
      const first = getSortValue(a, sortConfig.key);
      const second = getSortValue(b, sortConfig.key);
      const direction = sortConfig.direction === "asc" ? 1 : -1;
      if (typeof first === "number" || typeof second === "number") {
        return ((Number(first) || 0) - (Number(second) || 0)) * direction;
      }
      return String(first ?? "").localeCompare(String(second ?? "")) * direction;
    });
  }, [analysis.costCenterRows, sortConfig, tableFilters]);

  const tableFilterOptions = useMemo(() => Object.fromEntries(
    PROFITABILITY_COLUMNS
      .filter((column) => column.type !== "number")
      .map((column) => [
        column.key,
        [...new Set(analysis.costCenterRows.map((row) => getFilterValue(row, column.key)).filter(Boolean))]
          .sort((a, b) => String(a).localeCompare(String(b))),
      ]),
  ), [analysis.costCenterRows]);

  const updateTableFilter = (key, value) => {
    setTableFilters((current) => ({ ...current, [key]: value }));
    setActiveFilterColumn("");
  };

  const setColumnSort = (key, direction) => {
    setSortConfig({ key, direction });
    setActiveFilterColumn("");
  };

  const toggleFilterColumn = (key) => {
    setActiveFilterColumn((current) => (current === key ? "" : key));
  };

  const toggleFilterValue = (key, value) => {
    setTableFilters((current) => {
      const selected = current[key] || [];
      return {
        ...current,
        [key]: selected.includes(value)
          ? selected.filter((item) => item !== value)
          : [...selected, value],
      };
    });
    setActiveFilterColumn("");
  };

  const selectAllFilterValues = (key, values) => {
    setTableFilters((current) => ({ ...current, [key]: [...values] }));
    setActiveFilterColumn("");
  };

  const clearColumnFilter = (column) => {
    setTableFilters((current) => {
      if (column.type === "number") {
        return { ...current, [`${column.key}Min`]: "", [`${column.key}Max`]: "" };
      }
      return { ...current, [column.key]: [] };
    });
    setActiveFilterColumn("");
  };

  const clearTableFilters = () => {
    setTableFilters(DEFAULT_TABLE_FILTERS);
    setSortConfig({ key: "costCenter", direction: "asc" });
    setActiveFilterColumn("");
  };

  return (
    <section className="page-stack pnl-page">
      <div className="pnl-hero-card">
        <div className="pnl-heading">
          <div>
            <p className="eyebrow">{isDetailPage ? "Operations drilldown" : "Detailed Financial Analysis"}</p>
            <h2>{isDetailPage ? "Operations Detail" : "Profit & Loss Analysis"}</h2>
            <p>{isDetailPage ? "Detailed AFP, cost, CN, and site profit view for the selected operation scope." : "Revenue, cost, margin, Credit Note impact, and cost-center profitability drilldown."}</p>
          </div>
          <div className="pnl-heading-actions">
            <RevenueBasisToggle revenueBasis={revenueBasis} onChange={setRevenueBasis} />
            <button
              type="button"
              className="pnl-print-button"
              disabled={!selectedCostCenter}
              title={selectedCostCenter ? "Open the cost center report" : "Select one cost center from the table first"}
              onClick={() => {
                if (selectedCostCenter) openPnlReportTemplate({ analysis, selectedCostCenter });
              }}
            >
              <Icon name="spending" />
              Download cost center report
            </button>
          </div>
        </div>

        <ProfitabilitySummary
          pnl={analysis.pnl}
          selectedCostCenter={selectedCostCenter}
          revenueBasisLabel={revenueBasisLabel}
        />
      </div>

      <section className="pnl-kpi-grid" aria-label="P&L KPI summary">
        {kpiCards.map((card) => <PnlKpiCard key={card.label} {...card} />)}
      </section>

      <section className="pnl-main-grid">
        <PnlStatement pnl={analysis.pnl} />
        <WaterfallChart pnl={analysis.pnl} />
      </section>

      <MonthlyTrendChart rows={analysis.monthlyTrend} />

      <div className="pnl-section-heading">
        <p className="eyebrow">Monthly Movement</p>
        <h3>How profitability is evolving</h3>
      </div>
      <MonthlyMovementCards rows={analysis.monthlyTrend} />

      <section className="pnl-table-grid">
        <article className="surface-card pnl-profitability-table-card">
          <div className="pnl-card-heading">
            <div>
              <p className="eyebrow">Cost Center Profitability</p>
              <h3>Detailed profitability table</h3>
            </div>
            <div className="pnl-table-actions">
              <span>{displayedCostCenterRows.length} of {analysis.costCenterRows.length} cost centers</span>
              <button type="button" onClick={clearTableFilters}>Clear filters</button>
            </div>
          </div>
          <div className="analysis-table-wrap pnl-profitability-table-wrap">
            <table className="analysis-table pnl-table pnl-cost-center-table">
              <thead>
                <tr>
                  {PROFITABILITY_COLUMNS.map((column) => (
                    <ProfitabilityColumnHeader
                      key={column.key}
                      column={column}
                      filters={tableFilters}
                      sortConfig={sortConfig}
                      activeColumn={activeFilterColumn}
                      options={tableFilterOptions[column.key] || []}
                      onFilterChange={updateTableFilter}
                      onSort={setColumnSort}
                      onToggleColumn={toggleFilterColumn}
                      onToggleValue={toggleFilterValue}
                      onSelectAll={selectAllFilterValues}
                      onClearColumn={clearColumnFilter}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedCostCenterRows.map((row) => (
                  <tr
                    key={row.costCenter}
                    className={`is-clickable-row ${selectedCostCenter === row.costCenter ? "is-selected" : ""}`}
                    onClick={() => setDrilldownCostCenter(row.costCenter)}
                  >
                    <td>{row.region}</td>
                    <td>{row.hub}</td>
                    <td><strong>{row.costCenter}</strong></td>
                    <td className="is-number">{formatCurrency(row.revenue)}</td>
                    <td className="is-number">{formatCurrency(row.totalCost)}</td>
                    <td className="is-number">{formatCurrency(row.grossProfit)}</td>
                    <td className="is-number">{formatCurrency(row.netProfit)}</td>
                    <td className="is-number">{formatPercent(row.netMargin)}</td>
                    <td className="is-number">{formatPercent(row.costToRevenue)}</td>
                    <td><span className={`pnl-status tone-${row.status.tone}`}>{row.status.label}</span></td>
                  </tr>
                ))}
                {!displayedCostCenterRows.length ? (
                  <tr>
                    <td colSpan={PROFITABILITY_COLUMNS.length} className="pnl-empty-table-cell">
                      No cost centers match the selected column filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <CostCenterDetail
        selectedCostCenter={selectedCostCenter}
        pnl={analysis.pnl}
        cnBreakdown={analysis.cnBreakdown}
        transactions={analysis.transactions}
        revenueBasisLabel={revenueBasisLabel}
      />

      <ProfitabilityPrintReport analysis={analysis} selectedCostCenter={selectedCostCenter} />
    </section>
  );
}


