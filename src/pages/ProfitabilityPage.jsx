import { useMemo, useState } from "react";
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
const COMPACT_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const roundCurrency = (value) => Math.round(((value || 0) + Number.EPSILON) * 100) / 100;
const formatCurrency = (value) => CURRENCY_FORMAT.format(value || 0);
const formatCompactCurrency = (value) => `$${COMPACT_NUMBER_FORMAT.format(value || 0)}`;
const formatPercent = (value) => `${NUMBER_FORMAT.format(value || 0)}%`;
const formatMillions = (value) => `${value < 0 ? "-" : ""}$${NUMBER_FORMAT.format(Math.abs(value || 0) / 1000000)}M`;
const getShare = (value, total) => (total ? ((value || 0) / total) * 100 : 0);

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
  const scope = selectedCostCenter || "the selected portfolio";
  const revenue = pnl.isCostCenterLevel ? pnl.updatedRevenue : pnl.revenue;
  const cost = pnl.isCostCenterLevel ? pnl.updatedCost : pnl.totalCost;
  const profitTone = pnl.netProfit >= 0 ? "profitable" : "loss-making";
  const costPressure = `Cost-to-revenue is ${formatPercent(pnl.costToRevenue)}, showing how much revenue is consumed by cost.`;
  const statusLabel = pnl.netProfit >= 0 ? "Healthy margin" : "Needs review";

  return (
    <article className="pnl-narrative-card">
      <div>
        <span>Profitability Summary</span>
        <strong>{scope} is {profitTone} on a {revenueBasisLabel.toLowerCase()} basis.</strong>
      </div>
      <p>
        Revenue is {formatCurrency(revenue)} against {formatCurrency(cost)} cost, producing {formatCurrency(pnl.netProfit)} net profit and {formatPercent(pnl.netMargin)} net margin.
        <br />
        {costPressure} {pnl.netMargin < 10 ? "Margin requires attention." : "Margin remains within a healthy range."}
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

function PrintAnalysisCard({ title, rows, formula, tone = "green" }) {
  return (
    <article className="print-report-card print-analysis-card">
      <h3>{title} <small>USD in Millions</small></h3>
      <div>
        {rows.map((row) => (
          <p key={row.label} className={row.total ? "is-total" : ""}>
            <span>{row.label}</span>
            <strong className={row.tone ? `is-${row.tone}` : ""}>{formatMillions(row.value)}</strong>
          </p>
        ))}
      </div>
      <footer className={`tone-${tone}`}>{formula}</footer>
    </article>
  );
}

function PrintWaterfall({ pnl }) {
  const steps = [
    { label: "Approved AFP", value: pnl.revenue, tone: "green" },
    { label: "Issued CN", value: pnl.issuedCreditNotes, tone: "green" },
    { label: "Adjusted Revenue", value: pnl.updatedRevenue, tone: "green" },
    { label: "Total Cost", value: -pnl.updatedCost, tone: "red" },
    { label: "Net Profit", value: pnl.netProfit, tone: "blue" },
  ];
  const max = Math.max(...steps.map((step) => Math.abs(step.value)), 1);

  return (
    <article className="print-report-card print-waterfall-card">
      <h3>P&L Waterfall <small>Approved Basis</small></h3>
      <div className="print-waterfall">
        {steps.map((step) => (
          <div key={step.label} className={`tone-${step.tone}`}>
            <span style={{ "--bar-height": `${Math.max((Math.abs(step.value) / max) * 100, 8)}%` }} />
            <strong>{formatMillions(step.value)}</strong>
            <small>{step.label}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function PrintGlBreakdown({ rows, totalCost }) {
  return (
    <article className="print-report-card print-gl-card">
      <h3>Cost Breakdown by GL <small>USD in Millions</small></h3>
      <div className="print-gl-layout">
        <div className="print-donut">
          <strong>{formatMillions(totalCost)}</strong>
          <span>Total Cost</span>
        </div>
        <div className="print-gl-table">
          {rows.map((row) => (
            <p key={row.glName}>
              <span>{row.glName}</span>
              <strong>{formatMillions(row.amount)}</strong>
              <em>{formatPercent(row.share)}</em>
              <FilledSparkline values={row.monthlyValues} tone={row.movement >= 0 ? "green" : "red"} />
            </p>
          ))}
        </div>
      </div>
    </article>
  );
}

function ProfitabilityPrintReport({ analysis, selectedCostCenter, isScreen = false }) {
  const approved = analysis.print.approvedPnl;
  const submitted = analysis.print.submittedPnl;
  const latest = analysis.print.monthlyRows.at(-1);
  const previous = analysis.print.monthlyRows.at(-2);
  const isProfitable = approved.netProfit >= 0;

  return (
    <section className={`pnl-print-report ${isScreen ? "is-report-screen" : ""}`} aria-label="Printable Profit and Loss report">
      <header className="print-report-header">
        <div className="print-brand">
          <img src={igccLogo} alt="IGCC" />
          <div>
            <h1>Profit & Loss Analysis Report</h1>
            <p>Cost Center Detailed Report</p>
          </div>
        </div>
        <div className="print-meta">
          <p><span>Report Date</span><strong>{analysis.print.meta.reportDate}</strong></p>
          <p><span>Reporting Period</span><strong>{analysis.print.meta.periodLabel}</strong></p>
          <p><span>Currency</span><strong>USD</strong></p>
        </div>
      </header>

      <section className="print-context">
        <p><span>Portfolio</span><strong>{analysis.print.meta.portfolio}</strong></p>
        <p><span>Hub</span><strong>{analysis.print.meta.hub}</strong></p>
        <p><span>Cost Center</span><strong>{selectedCostCenter || "All selected cost centers"}</strong></p>
        <p><span>Region</span><strong>{analysis.print.meta.region}</strong></p>
        <div className={isProfitable ? "is-good" : "is-loss"}>
          <span><Icon name={isProfitable ? "approve" : "spending"} /></span>
          <strong>{isProfitable ? "Profitable" : "Loss-Making"}</strong>
          <em>Net Margin {formatPercent(approved.netMargin)}</em>
        </div>
      </section>

      <section className="print-kpi-grid">
        <PrintMetricCard label="Adjusted Revenue (Approved Basis)" value={formatMillions(approved.updatedRevenue)} trend={getTrend(latest?.approvedRevenue || 0, previous?.approvedRevenue || 0)} values={analysis.print.monthlyRows.map((row) => row.approvedRevenue)} tone="green" />
        <PrintMetricCard label="Adjusted Revenue (Submitted Basis)" value={formatMillions(submitted.updatedRevenue)} trend={getTrend(latest?.submittedRevenue || 0, previous?.submittedRevenue || 0)} values={analysis.print.monthlyRows.map((row) => row.submittedRevenue)} tone="green" />
        <PrintMetricCard label="Total Cost" value={formatMillions(approved.updatedCost)} trend={getTrend(latest?.totalCost || 0, previous?.totalCost || 0)} values={analysis.print.monthlyRows.map((row) => row.totalCost)} tone="red" />
        <PrintMetricCard label="Net Profit (Approved Basis)" value={formatMillions(approved.netProfit)} trend={getTrend(latest?.netProfitApproved || 0, previous?.netProfitApproved || 0)} values={analysis.print.monthlyRows.map((row) => row.netProfitApproved)} tone="blue" />
        <PrintMetricCard label="Net Profit (Submitted Basis)" value={formatMillions(submitted.netProfit)} trend={getTrend(latest?.netProfitSubmitted || 0, previous?.netProfitSubmitted || 0)} values={analysis.print.monthlyRows.map((row) => row.netProfitSubmitted)} tone="green" />
        <PrintMetricCard label="Margin % (Approved Basis)" value={formatPercent(approved.netMargin)} trend={(latest?.netMarginApproved || 0) - (previous?.netMarginApproved || 0)} values={analysis.print.monthlyRows.map((row) => row.netMarginApproved)} tone="blue" />
        <PrintMetricCard label="Margin % (Submitted Basis)" value={formatPercent(submitted.netMargin)} trend={(latest?.netMarginSubmitted || 0) - (previous?.netMarginSubmitted || 0)} values={analysis.print.monthlyRows.map((row) => row.netMarginSubmitted)} tone="blue" />
      </section>

      <section className="print-analysis-grid">
        <PrintAnalysisCard
          title="Revenue Analysis"
          rows={[
            { label: "Approved AFP", value: approved.revenue },
            { label: "Submitted AFP", value: submitted.revenue },
            { label: "Issued Credit Notes (CN)", value: approved.issuedCreditNotes },
            { label: "Adjusted Revenue (Approved Basis)", value: approved.updatedRevenue, total: true, tone: "green" },
            { label: "Adjusted Revenue (Submitted Basis)", value: submitted.updatedRevenue, total: true, tone: "green" },
          ]}
          formula="Adjusted Revenue = AFP + Issued CN"
        />
        <PrintAnalysisCard
          title="Cost Analysis"
          tone="red"
          rows={[
            { label: "Cost from Spent Report", value: approved.totalCost },
            { label: "Received Credit Notes (CN)", value: approved.receivedCreditNotes },
            { label: "Total Cost", value: approved.updatedCost, total: true, tone: "red" },
          ]}
          formula="Total Cost = Cost from Spent Report + Received CN"
        />
        <article className="print-report-card print-profit-card">
          <h3>Profitability Analysis <small>USD in Millions</small></h3>
          <div>
            <p><span>Adjusted Revenue</span><strong>{formatMillions(approved.updatedRevenue)}</strong><strong>{formatMillions(submitted.updatedRevenue)}</strong></p>
            <p><span>Total Cost</span><strong className="is-red">{formatMillions(-approved.updatedCost)}</strong><strong className="is-red">{formatMillions(-submitted.updatedCost)}</strong></p>
            <p><span>Net Profit</span><strong className="is-green">{formatMillions(approved.netProfit)}</strong><strong className="is-green">{formatMillions(submitted.netProfit)}</strong></p>
            <p><span>Margin %</span><strong>{formatPercent(approved.netMargin)}</strong><strong>{formatPercent(submitted.netMargin)}</strong></p>
          </div>
        </article>
      </section>

      <section className="print-visual-grid">
        <MonthlyTrendChart rows={analysis.print.monthlyRows.map((row) => ({ ...row, revenue: row.approvedRevenue, netProfit: row.netProfitApproved }))} />
        <PrintWaterfall pnl={approved} />
        <PrintGlBreakdown rows={analysis.print.glRows} totalCost={approved.updatedCost} />
      </section>

      <section className="print-movement-table">
        <h3>Monthly Movement Table</h3>
        {analysis.print.monthlyRows.map((row) => (
          <p key={row.period}>
            <strong>{row.label}</strong>
            <span>Revenue {formatMillions(row.approvedRevenue)}</span>
            <span>Cost {formatMillions(row.totalCost)}</span>
            <span>Net Profit {formatMillions(row.netProfitApproved)}</span>
            <span>Margin {formatPercent(row.netMarginApproved)}</span>
          </p>
        ))}
      </section>
    </section>
  );
}

export function ProfitabilityPage({ filters = {} }) {
  const [revenueBasis, setRevenueBasis] = useState("approved");
  const [drilldownCostCenter, setDrilldownCostCenter] = useState("");
  const [isReportOpen, setIsReportOpen] = useState(false);
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
        const issued = selectedCostCenter ? sumRows(creditContextRows, (entry) => entry.period === row.period && entry.issuedBy === selectedCostCenter) : 0;
        const received = selectedCostCenter ? sumRows(creditContextRows, (entry) => entry.period === row.period && entry.costCenter === selectedCostCenter) : 0;
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
        const issued = selectedCostCenter ? sumRows(creditContextRows, (entry) => entry.period === row.period && entry.issuedBy === selectedCostCenter) : 0;
        const received = selectedCostCenter ? sumRows(creditContextRows, (entry) => entry.period === row.period && entry.costCenter === selectedCostCenter) : 0;
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
      const glName = entry.glName || "Unclassified Cost";
      const current = glMap.get(glName) || { glName, amount: 0, periodValues: new Map() };
      current.amount += entry.amount || 0;
      current.periodValues.set(entry.period, (current.periodValues.get(entry.period) || 0) + (entry.amount || 0));
      glMap.set(glName, current);
    }
    const printPeriods = monthlyRows.map((row) => row.period);
    const glRows = [...glMap.values()]
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
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 7);

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
        meta: {
          portfolio: portfolioLabel,
          hub: filters.hub && filters.hub !== ALL_FILTER_VALUE ? filters.hub : scopeEntry?.hub || "All hubs",
          region: scopeEntry?.region || portfolioLabel,
          periodLabel: monthlyRows.length ? `${monthlyRows[0].label} - ${monthlyRows.at(-1).label}` : "No selected period",
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
    { icon: "spending", label: "Total Cost", value: formatCompactCurrency(analysis.pnl.isCostCenterLevel ? analysis.pnl.updatedCost : analysis.pnl.totalCost), context: analysis.pnl.isCostCenterLevel ? "Spent + received CN" : "Spent report only", tone: "red", sparkline: analysis.monthlyTrend.map((row) => row.totalCost), movement: getTrend(analysis.monthlyTrend.at(-1)?.totalCost || 0, analysis.monthlyTrend.at(-2)?.totalCost || 0) },
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

  if (isReportOpen) {
    return (
      <section className="page-stack pnl-report-view">
        <div className="pnl-report-toolbar">
          <div>
            <p className="eyebrow">Cost Center Report</p>
            <h2>{selectedCostCenter}</h2>
            <p>Printable Profit & Loss report for operational review and discussion.</p>
          </div>
          <div>
            <button type="button" className="pnl-report-secondary-button" onClick={() => setIsReportOpen(false)}>
              Back to analysis
            </button>
            <button type="button" className="pnl-print-button" onClick={() => window.print()}>
              <Icon name="spending" />
              Print report
            </button>
          </div>
        </div>
        <ProfitabilityPrintReport analysis={analysis} selectedCostCenter={selectedCostCenter} isScreen />
      </section>
    );
  }

  return (
    <section className="page-stack pnl-page">
      <div className="page-heading pnl-heading">
        <div>
          <p className="eyebrow">Detailed Financial Analysis</p>
          <h2>Profit & Loss Analysis</h2>
          <p>Revenue, cost, margin, Credit Note impact, and cost-center profitability drilldown.</p>
        </div>
        <div className="pnl-heading-actions">
          <RevenueBasisToggle revenueBasis={revenueBasis} onChange={setRevenueBasis} />
          <button
            type="button"
            className="pnl-print-button"
            disabled={!selectedCostCenter}
            title={selectedCostCenter ? "Open the cost center report" : "Select one cost center from the table first"}
            onClick={() => {
              if (selectedCostCenter) setIsReportOpen(true);
            }}
          >
            <Icon name="spending" />
            Open cost center report
          </button>
        </div>
      </div>

      <ProfitabilitySummary
        pnl={analysis.pnl}
        selectedCostCenter={selectedCostCenter}
        revenueBasisLabel={revenueBasisLabel}
      />

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
