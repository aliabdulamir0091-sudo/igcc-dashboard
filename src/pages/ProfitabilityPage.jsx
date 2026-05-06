import { Fragment, useMemo, useState } from "react";
import { Icon } from "../components/Icons";
import { ALL_FILTER_VALUE } from "../data/costCenterHierarchy";
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
const roundCurrency = (value) => Math.round(((value || 0) + Number.EPSILON) * 100) / 100;
const formatCurrency = (value) => CURRENCY_FORMAT.format(value || 0);
const formatPercent = (value) => `${NUMBER_FORMAT.format(value || 0)}%`;
const getShare = (value, total) => (total ? ((value || 0) / total) * 100 : 0);
const formatReportAmount = (value) => `${(value || 0) < 0 ? "-" : ""}$${NUMBER_FORMAT.format(Math.abs(value || 0) / 1000000)}M`;

const getQuarter = (period) => `Q${Math.ceil(Number(period?.slice(5, 7) || 1) / 3)}`;

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
  const grossProfit = revenue - totalCost;
  const isCostCenterLevel = Boolean(selectedCostCenter && selectedCostCenter !== ALL_FILTER_VALUE);
  const issuedCreditNotes = isCostCenterLevel
    ? sumRows(creditRows, (entry) => entry.issuedBy === selectedCostCenter)
    : 0;
  const receivedCreditNotes = isCostCenterLevel
    ? sumRows(creditRows, (entry) => entry.costCenter === selectedCostCenter)
    : 0;
  const updatedRevenue = revenue + issuedCreditNotes;
  const updatedCost = totalCost + receivedCreditNotes;
  const netProfit = isCostCenterLevel ? updatedRevenue - updatedCost : grossProfit;
  const netMargin = getShare(netProfit, isCostCenterLevel ? updatedRevenue : revenue);
  const costToRevenue = getShare(isCostCenterLevel ? updatedCost : totalCost, isCostCenterLevel ? updatedRevenue : revenue);

  return {
    revenue: roundCurrency(revenue),
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

function ReportKpiCard({ icon, label, value, movement, sparkline, tone = "green" }) {
  return (
    <article className={`report-kpi-card tone-${tone}`}>
      <div className="report-kpi-top">
        <span><Icon name={icon} /></span>
        <p>{label}</p>
      </div>
      <strong>{value}</strong>
      <em className={movement >= 0 ? "is-up" : "is-down"}>
        {movement >= 0 ? "Up" : "Down"} {formatPercent(Math.abs(movement))} vs previous period
      </em>
      <FilledSparkline values={sparkline} tone={tone} />
    </article>
  );
}

function ReportInfoRow({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReportFormulaCard({ tone = "green", children }) {
  return <div className={`report-formula tone-${tone}`}>{children}</div>;
}

function ReportAnalysisCard({ title, unit, rows, formula, tone = "green" }) {
  return (
    <article className="report-card report-analysis-card">
      <div className="report-section-title">
        <h3>{title}</h3>
        <span>{unit}</span>
      </div>
      <div className="report-analysis-list">
        {rows.map((row) => (
          <div key={row.label} className={row.total ? "is-total" : ""}>
            <span>{row.label}</span>
            <strong className={row.tone ? `tone-${row.tone}` : ""}>{formatReportAmount(row.value)}</strong>
          </div>
        ))}
      </div>
      <ReportFormulaCard tone={tone}>{formula}</ReportFormulaCard>
    </article>
  );
}

function ReportProfitabilityComparison({ approved, submitted }) {
  const rows = [
    { label: "Adjusted Revenue", approved: approved.updatedRevenue, submitted: submitted.updatedRevenue },
    { label: "Total Cost", approved: -approved.updatedCost, submitted: -submitted.updatedCost, tone: "red" },
    { label: "Net Profit", approved: approved.netProfit, submitted: submitted.netProfit, tone: "green" },
    { label: "Margin %", approved: formatPercent(approved.netMargin), submitted: formatPercent(submitted.netMargin), isPercent: true },
  ];

  return (
    <article className="report-card report-profit-card">
      <div className="report-section-title">
        <h3>Profitability Analysis</h3>
        <span>USD in Millions</span>
      </div>
      <div className="report-profit-table">
        <div />
        <strong>Approved Basis</strong>
        <strong>Submitted Basis</strong>
        {rows.map((row) => (
          <Fragment key={row.label}>
            <span>{row.label}</span>
            <b className={row.tone ? `tone-${row.tone}` : ""}>{row.isPercent ? row.approved : formatReportAmount(row.approved)}</b>
            <b className={row.tone ? `tone-${row.tone}` : ""}>{row.isPercent ? row.submitted : formatReportAmount(row.submitted)}</b>
          </Fragment>
        ))}
      </div>
      <ReportFormulaCard tone="blue">Margin = Net Profit / Adjusted Revenue</ReportFormulaCard>
    </article>
  );
}

function ReportHeader({ meta, approvedPnl }) {
  const isProfitable = approvedPnl.netProfit >= 0;

  return (
    <header className="pnl-report-header">
      <div className="pnl-report-brand">
        <img src={igccLogo} alt="IGCC" />
        <div>
          <h1>Profit & Loss Analysis Report</h1>
          <p>Cost Center Detailed Report</p>
        </div>
      </div>

      <div className="pnl-report-meta">
        <ReportInfoRow label="Report Date" value={meta.reportDate} />
        <ReportInfoRow label="Reporting Period" value={meta.periodLabel} />
        <ReportInfoRow label="Currency" value="USD" />
      </div>

      <div className="pnl-report-context">
        <ReportInfoRow label="Portfolio" value={meta.portfolio} />
        <ReportInfoRow label="Hub" value={meta.hub} />
        <ReportInfoRow label="Cost Center" value={meta.costCenter} />
        <ReportInfoRow label="Cost Center Name" value={meta.costCenterName} />
        <ReportInfoRow label="Region" value={meta.region} />
        <ReportInfoRow label="Report Scope" value={meta.scope} />
        <div className={`pnl-report-status ${isProfitable ? "is-good" : "is-loss"}`}>
          <span><Icon name={isProfitable ? "approve" : "spending"} /></span>
          <div>
            <small>Cost Center Status</small>
            <strong>{isProfitable ? "Profitable" : "Loss-Making"}</strong>
          </div>
          <div>
            <small>Net Margin (Approved)</small>
            <strong>{formatPercent(approvedPnl.netMargin)}</strong>
          </div>
        </div>
      </div>
    </header>
  );
}

function ReportSummaryCard({ approvedPnl, glRows, meta }) {
  const primaryDriver = glRows[0];
  const status = approvedPnl.netProfit >= 0 ? "profitable" : "loss-making";
  const trendText = approvedPnl.netMargin >= 10
    ? "margin quality is holding above the review threshold"
    : "margin is below the review threshold and needs attention";

  return (
    <article className="report-summary-card">
      <div>
        <span>Profitability Summary</span>
        <strong>{meta.costCenter} is {status} with {formatReportAmount(approvedPnl.netProfit)} net profit.</strong>
      </div>
      <p>
        Net margin is {formatPercent(approvedPnl.netMargin)} on approved AFP. {primaryDriver?.glName || "Cost activity"} is the main cost pressure at {formatPercent(primaryDriver?.share || 0)} of total cost, and {trendText}.
      </p>
    </article>
  );
}

function ReportTrendChart({ rows }) {
  const reportRows = rows.map((row) => ({
    ...row,
    revenue: row.approvedRevenue ?? row.revenue,
    netProfit: row.netProfitApproved ?? row.netProfit,
  }));

  return <MonthlyTrendChart rows={reportRows} />;
}

function ReportWaterfallChart({ pnl }) {
  const steps = [
    { label: "Approved AFP", value: pnl.revenue, tone: "green" },
    { label: "Issued CN", value: pnl.issuedCreditNotes, tone: "teal" },
    { label: "Adjusted Revenue", value: pnl.updatedRevenue, tone: "green" },
    { label: "Total Cost", value: -pnl.updatedCost, tone: "red" },
    { label: "Net Profit", value: pnl.netProfit, tone: pnl.netProfit >= 0 ? "blue" : "red" },
  ];
  const max = Math.max(...steps.map((step) => Math.abs(step.value)), 1);

  return (
    <article className="report-card report-waterfall-card">
      <div className="report-section-title">
        <h3>P&L Waterfall</h3>
        <span>Approved Basis | USD in Millions</span>
      </div>
      <div className="report-waterfall" role="img" aria-label="Profit and loss waterfall">
        {steps.map((step, index) => (
          <div key={step.label} className={`report-waterfall-step tone-${step.tone}`}>
            <div className="report-waterfall-track">
              <span style={{ "--bar-height": `${Math.max((Math.abs(step.value) / max) * 100, 8)}%` }} />
            </div>
            {index < steps.length - 1 ? <i /> : null}
            <strong>{formatReportAmount(step.value)}</strong>
            <small>{step.label}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function ReportGlBreakdown({ rows, totalCost }) {
  const colors = ["#2563eb", "#ef4444", "#16a34a", "#7c3aed", "#0ea5e9", "#f59e0b", "#64748b"];
  const gradientStops = rows.reduce((parts, row, index) => {
    const start = parts.total;
    const end = start + row.share;
    return {
      total: end,
      values: [...parts.values, `${colors[index % colors.length]} ${start}% ${end}%`],
    };
  }, { total: 0, values: [] }).values.join(", ");

  return (
    <article className="report-card report-gl-card">
      <div className="report-section-title">
        <h3>Cost Breakdown by GL</h3>
        <span>USD in Millions</span>
      </div>
      <div className="report-gl-layout">
        <div className="report-donut" style={{ "--donut-gradient": gradientStops || "#e2e8f0 0% 100%" }}>
          <div>
            <strong>{formatReportAmount(totalCost)}</strong>
            <span>Total Cost</span>
          </div>
        </div>
        <div className="report-gl-table">
          <div className="report-gl-head">
            <span>GL Name</span>
            <span>Amount</span>
            <span>% Cost</span>
            <span>Movement</span>
          </div>
          {rows.map((row, index) => (
            <div key={row.glName} className="report-gl-row">
              <span><i style={{ "--dot-color": colors[index % colors.length] }} />{row.glName}</span>
              <strong>{formatReportAmount(row.amount)}</strong>
              <em>{formatPercent(row.share)}</em>
              <FilledSparkline values={row.monthlyValues} tone={row.movement >= 0 ? "green" : "red"} />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function ReportMonthlyMovementTable({ rows }) {
  const metrics = [
    { key: "approvedRevenue", label: "Approved Revenue", tone: "green", formatter: formatReportAmount },
    { key: "totalCost", label: "Total Cost", tone: "red", formatter: formatReportAmount },
    { key: "netProfitApproved", label: "Net Profit", tone: "blue", formatter: formatReportAmount },
    { key: "netMarginApproved", label: "Net Margin %", tone: "teal", formatter: formatPercent, margin: true },
  ];

  return (
    <article className="report-card report-movement-table-card">
      <div className="report-section-title">
        <h3>Monthly Movement Table</h3>
        <span>Filled movement profile by metric</span>
      </div>
      <div className="report-movement-table">
        <div className="report-movement-head">
          <span>Month</span>
          {metrics.map((metric) => (
            <Fragment key={metric.key}>
              <span>{metric.label}</span>
              <span>MoM</span>
              <span>Trend</span>
            </Fragment>
          ))}
        </div>
        {rows.map((row, index) => (
          <div key={row.period} className="report-movement-row">
            <strong>{row.label}</strong>
            {metrics.map((metric) => {
              const previous = rows[index - 1]?.[metric.key];
              const movement = metric.margin
                ? (previous === undefined ? null : row[metric.key] - previous)
                : (index ? getTrend(row[metric.key], previous) : null);
              const history = rows.slice(0, index + 1).map((item) => item[metric.key]);
              return (
                <Fragment key={metric.key}>
                  <span>{metric.formatter(row[metric.key])}</span>
                  <em className={movement === null || movement >= 0 ? "is-up" : "is-down"}>
                    {movement === null ? "-" : metric.margin ? `${NUMBER_FORMAT.format(movement)} pp` : formatPercent(Math.abs(movement))}
                  </em>
                  <FilledSparkline values={history} tone={metric.tone} />
                </Fragment>
              );
            })}
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
    { key: "netProfit", label: "Net Profit", color: "#2563eb", areaId: "netProfitArea" },
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
            <p><span>Spent Report Cost</span><strong>{formatCurrency(pnl.totalCost)}</strong></p>
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

export function ProfitabilityPage({ filters = {} }) {
  const revenueBasis = "approved";
  const [drilldownCostCenter, setDrilldownCostCenter] = useState("");
  const [tableFilters, setTableFilters] = useState(DEFAULT_TABLE_FILTERS);
  const [sortConfig, setSortConfig] = useState({ key: "costCenter", direction: "asc" });
  const [activeFilterColumn, setActiveFilterColumn] = useState("");
  const filterCostCenter = filters.costCenter && filters.costCenter !== ALL_FILTER_VALUE ? filters.costCenter : "";
  const selectedCostCenter = filterCostCenter || drilldownCostCenter;
  const revenueBasisLabel = REVENUE_BASIS_OPTIONS.find((option) => option.id === revenueBasis)?.label || "Approved AFP";

  const analysis = useMemo(() => {
    const entries = financialInputsData.entries || [];
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
        month: entry.month,
        year: entry.year,
        approvedRevenue: 0,
        submittedRevenue: 0,
        totalCost: 0,
      };
      if (entry.type === "approved") current.approvedRevenue += entry.amount || 0;
      if (entry.type === "submitted") current.submittedRevenue += entry.amount || 0;
      if (entry.type === "spent") current.totalCost += entry.amount || 0;
      periodMap.set(entry.period, current);
    }
    const monthlyTrend = [...periodMap.values()]
      .map((row) => {
        const issued = selectedCostCenter ? sumRows(creditContextRows, (entry) => entry.period === row.period && entry.issuedBy === selectedCostCenter) : 0;
        const received = selectedCostCenter ? sumRows(creditContextRows, (entry) => entry.period === row.period && entry.costCenter === selectedCostCenter) : 0;
        const approvedRevenue = selectedCostCenter ? row.approvedRevenue + issued : row.approvedRevenue;
        const submittedRevenue = selectedCostCenter ? row.submittedRevenue + issued : row.submittedRevenue;
        const updatedCost = row.totalCost + received;
        const cost = selectedCostCenter ? updatedCost : row.totalCost;
        const approvedGrossProfit = row.approvedRevenue - row.totalCost;
        const submittedGrossProfit = row.submittedRevenue - row.totalCost;
        const netProfitApproved = selectedCostCenter ? approvedRevenue - cost : approvedGrossProfit;
        const netProfitSubmitted = selectedCostCenter ? submittedRevenue - cost : submittedGrossProfit;
        return {
          ...row,
          label: `${row.month || row.period.slice(5)} ${row.year || row.period.slice(0, 4)}`,
          approvedRevenue: roundCurrency(approvedRevenue),
          submittedRevenue: roundCurrency(submittedRevenue),
          revenue: roundCurrency(revenueBasis === "approved" ? approvedRevenue : submittedRevenue),
          totalCost: roundCurrency(cost),
          grossProfit: roundCurrency(revenueBasis === "approved" ? approvedGrossProfit : submittedGrossProfit),
          netProfit: roundCurrency(revenueBasis === "approved" ? netProfitApproved : netProfitSubmitted),
          netProfitApproved: roundCurrency(netProfitApproved),
          netProfitSubmitted: roundCurrency(netProfitSubmitted),
          netMargin: getShare(revenueBasis === "approved" ? netProfitApproved : netProfitSubmitted, revenueBasis === "approved" ? approvedRevenue : submittedRevenue),
          netMarginApproved: getShare(netProfitApproved, approvedRevenue),
          netMarginSubmitted: getShare(netProfitSubmitted, submittedRevenue),
        };
      })
      .filter((row) => row.approvedRevenue || row.submittedRevenue || row.totalCost || row.netProfit)
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
        const isIssued = entry.issuedBy === selectedCostCenter;
        const isReceived = entry.costCenter === selectedCostCenter;
        if (!isIssued && !isReceived) continue;
        const mode = isIssued ? "Issued" : "Received";
        const label = entry.category || entry.issuedBy || "Credit Note";
        const key = `${mode}-${label}`;
        const current = cnCategoryMap.get(key) || { mode, label, amount: 0 };
        current.amount += entry.amount || 0;
        cnCategoryMap.set(key, current);
      }
    }

    const transactions = selectedCostCenter
      ? [
        ...contextRows.filter((entry) => ["spent", revenueBasis].includes(entry.type)),
        ...creditContextRows.filter((entry) => entry.issuedBy === selectedCostCenter || entry.costCenter === selectedCostCenter),
      ]
        .sort((a, b) => b.period.localeCompare(a.period) || Math.abs(b.amount || 0) - Math.abs(a.amount || 0))
        .slice(0, 18)
      : [];

    const glMap = new Map();
    for (const entry of contextRows) {
      if (entry.type !== "spent") continue;
      const glName = entry.glName || "Unclassified Cost";
      const current = glMap.get(glName) || { glName, amount: 0, periodValues: new Map() };
      current.amount += entry.amount || 0;
      current.periodValues.set(entry.period, (current.periodValues.get(entry.period) || 0) + (entry.amount || 0));
      glMap.set(glName, current);
    }
    const allPeriods = monthlyTrend.map((row) => row.period);
    const glRows = [...glMap.values()]
      .map((row) => {
        const monthlyValues = allPeriods.map((period) => roundCurrency(row.periodValues.get(period) || 0));
        return {
          ...row,
          amount: roundCurrency(row.amount),
          share: getShare(row.amount, selectedCostCenter ? approvedPnl.updatedCost : approvedPnl.totalCost),
          movement: getTrend(monthlyValues.at(-1) || 0, monthlyValues.at(-2) || 0),
          monthlyValues,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 7);

    const scopeEntry = contextRows.find((entry) => entry.costCenter === selectedCostCenter) || contextRows.find((entry) => entry.costCenter);
    const periodLabel = monthlyTrend.length
      ? `${monthlyTrend[0].label} - ${monthlyTrend.at(-1).label}`
      : "No selected period";
    const portfolioLabel = filters.portfolio === "basra" ? "Basra"
      : filters.portfolio === "kirkuk" ? "Kirkuk"
        : filters.portfolio === "head-office" ? "Head Office"
          : "IGCC";
    const reportMeta = {
      portfolio: portfolioLabel,
      hub: filters.hub && filters.hub !== ALL_FILTER_VALUE ? filters.hub : scopeEntry?.hub || "All hubs",
      costCenter: selectedCostCenter || "All selected cost centers",
      costCenterName: selectedCostCenter ? "Detailed cost center" : "Portfolio rollup",
      region: scopeEntry?.region || portfolioLabel,
      scope: selectedCostCenter ? "Single Cost Center" : filters.hub && filters.hub !== ALL_FILTER_VALUE ? "Hub" : filters.portfolio && filters.portfolio !== ALL_FILTER_VALUE ? "Portfolio" : "IGCC",
      periodLabel,
      reportDate: new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
    };

    return {
      pnl,
      approvedPnl,
      submittedPnl,
      monthlyTrend,
      glRows,
      reportMeta,
      costCenterRows,
      cnBreakdown: [...cnCategoryMap.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
      transactions,
    };
  }, [filters, revenueBasis, selectedCostCenter]);

  const reportKpiCards = [
    { icon: "approve", label: "Adjusted Revenue (Approved Basis)", value: formatReportAmount(analysis.approvedPnl.updatedRevenue), movement: getTrend(analysis.monthlyTrend.at(-1)?.approvedRevenue || 0, analysis.monthlyTrend.at(-2)?.approvedRevenue || 0), tone: "green", sparkline: analysis.monthlyTrend.map((row) => row.approvedRevenue) },
    { icon: "submit", label: "Adjusted Revenue (Submitted Basis)", value: formatReportAmount(analysis.submittedPnl.updatedRevenue), movement: getTrend(analysis.monthlyTrend.at(-1)?.submittedRevenue || 0, analysis.monthlyTrend.at(-2)?.submittedRevenue || 0), tone: "green", sparkline: analysis.monthlyTrend.map((row) => row.submittedRevenue) },
    { icon: "spending", label: "Total Cost", value: formatReportAmount(analysis.approvedPnl.updatedCost), movement: getTrend(analysis.monthlyTrend.at(-1)?.totalCost || 0, analysis.monthlyTrend.at(-2)?.totalCost || 0), tone: "red", sparkline: analysis.monthlyTrend.map((row) => row.totalCost) },
    { icon: "net", label: "Net Profit (Approved Basis)", value: formatReportAmount(analysis.approvedPnl.netProfit), movement: getTrend(analysis.monthlyTrend.at(-1)?.netProfitApproved || 0, analysis.monthlyTrend.at(-2)?.netProfitApproved || 0), tone: analysis.approvedPnl.netProfit >= 0 ? "blue" : "red", sparkline: analysis.monthlyTrend.map((row) => row.netProfitApproved) },
    { icon: "pnl", label: "Net Profit (Submitted Basis)", value: formatReportAmount(analysis.submittedPnl.netProfit), movement: getTrend(analysis.monthlyTrend.at(-1)?.netProfitSubmitted || 0, analysis.monthlyTrend.at(-2)?.netProfitSubmitted || 0), tone: analysis.submittedPnl.netProfit >= 0 ? "green" : "red", sparkline: analysis.monthlyTrend.map((row) => row.netProfitSubmitted) },
    { icon: "executive", label: "Margin % (Approved Basis)", value: formatPercent(analysis.approvedPnl.netMargin), movement: (analysis.monthlyTrend.at(-1)?.netMarginApproved || 0) - (analysis.monthlyTrend.at(-2)?.netMarginApproved || 0), tone: analysis.approvedPnl.netMargin >= 10 ? "blue" : "amber", sparkline: analysis.monthlyTrend.map((row) => row.netMarginApproved) },
    { icon: "executive", label: "Margin % (Submitted Basis)", value: formatPercent(analysis.submittedPnl.netMargin), movement: (analysis.monthlyTrend.at(-1)?.netMarginSubmitted || 0) - (analysis.monthlyTrend.at(-2)?.netMarginSubmitted || 0), tone: analysis.submittedPnl.netMargin >= 10 ? "blue" : "amber", sparkline: analysis.monthlyTrend.map((row) => row.netMarginSubmitted) },
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
    <section className="page-stack pnl-page pnl-report-page">
      <ReportHeader meta={analysis.reportMeta} approvedPnl={analysis.approvedPnl} />

      <ReportSummaryCard approvedPnl={analysis.approvedPnl} glRows={analysis.glRows} meta={analysis.reportMeta} />

      <section className="report-kpi-grid" aria-label="P&L KPI summary">
        {reportKpiCards.map((card) => <ReportKpiCard key={card.label} {...card} />)}
      </section>

      <section className="report-analysis-grid">
        <ReportAnalysisCard
          title="Revenue Analysis"
          unit="USD in Millions"
          tone="green"
          rows={[
            { label: "Approved AFP", value: analysis.approvedPnl.revenue },
            { label: "Submitted AFP", value: analysis.submittedPnl.revenue },
            { label: "Issued Credit Notes (CN)", value: analysis.approvedPnl.issuedCreditNotes },
            { label: "Adjusted Revenue (Approved Basis)", value: analysis.approvedPnl.updatedRevenue, total: true, tone: "green" },
            { label: "Adjusted Revenue (Submitted Basis)", value: analysis.submittedPnl.updatedRevenue, total: true, tone: "green" },
          ]}
          formula="Adjusted Revenue = AFP + Issued CN"
        />
        <ReportAnalysisCard
          title="Cost Analysis"
          unit="USD in Millions"
          tone="red"
          rows={[
            { label: "Cost from Spent Report", value: analysis.approvedPnl.totalCost },
            { label: "Received Credit Notes (CN)", value: analysis.approvedPnl.receivedCreditNotes },
            { label: "Total Cost", value: analysis.approvedPnl.updatedCost, total: true, tone: "red" },
          ]}
          formula="Total Cost = Cost from Spent Report + Received CN"
        />
        <ReportProfitabilityComparison approved={analysis.approvedPnl} submitted={analysis.submittedPnl} />
      </section>

      <section className="report-visual-grid">
        <ReportTrendChart rows={analysis.monthlyTrend} />
        <ReportWaterfallChart pnl={analysis.approvedPnl} />
        <ReportGlBreakdown rows={analysis.glRows} totalCost={analysis.approvedPnl.updatedCost} />
      </section>

      <ReportMonthlyMovementTable rows={analysis.monthlyTrend} />

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
    </section>
  );
}
