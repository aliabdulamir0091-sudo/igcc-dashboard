import { useState } from "react";
import financialInputsData from "../data/financialInputsData.json";
import { matchesCostCenterFilter } from "../data/costCenterHierarchy";
import { Icon } from "../components/Icons";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const formatCurrency = (value) => currencyFormatter.format(value || 0);
const formatPercent = (value) => `${percentFormatter.format(value || 0)}%`;
const getShare = (amount, total) => (total ? (amount / total) * 100 : 0);
const getTrend = (current, previous) => (previous ? ((current - previous) / Math.abs(previous)) * 100 : 0);
const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const downloadCsv = (filename, rows) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const matchesPortfolio = (entry, portfolio) => (
  !portfolio
  || portfolio === "all"
  || (portfolio === "basra" && entry.region === "Basra")
  || (portfolio === "kirkuk" && entry.region === "Kirkuk")
  || (portfolio === "head-office" && entry.hub === "Head Office")
);

const getGroupedPeriod = (entry, mode) => {
  if (mode === "yearly") return entry.year || entry.period;
  if (mode === "quarterly") {
    const monthNumber = Number(entry.period?.slice(5, 7));
    const quarter = Math.max(Math.ceil((monthNumber || 1) / 3), 1);
    return `${entry.year}-Q${quarter}`;
  }
  return entry.period;
};

const getPeriodLabelParts = (period) => {
  if (/^\d{4}-Q\d$/.test(period)) return { period, month: period.slice(5), year: period.slice(0, 4) };
  if (/^\d{4}$/.test(period)) return { period, month: "Year", year: period };
  return { period, month: period?.slice(5) || "", year: period?.slice(0, 4) || "" };
};

const addAmount = (map, key, base, field, amount) => {
  const current = map.get(key) || { ...base, spent: 0, submitted: 0, approved: 0, creditNotes: 0, count: 0 };
  current[field] += amount || 0;
  current.count += 1;
  map.set(key, current);
};

const roundCurrency = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeRows = (rows) => rows
  .map((row) => ({
    ...row,
    spent: roundCurrency(row.spent),
    submitted: roundCurrency(row.submitted),
    approved: roundCurrency(row.approved),
    creditNotes: roundCurrency(row.creditNotes),
    netMovement: roundCurrency(row.approved - row.spent),
    afpGap: roundCurrency(row.submitted - row.approved),
  }));

const buildFilteredInputs = (data, filters = {}) => {
  const filteredEntries = data.entries.filter((entry) => (
    matchesPortfolio(entry, filters.portfolio)
    && (!filters.hub || filters.hub === "all" || entry.hub === filters.hub)
    && matchesCostCenterFilter(entry.costCenter, filters.costCenter)
    && (!filters.year || filters.year === "all" || entry.year === filters.year)
    && (filters.period !== "monthly" || !filters.month || filters.month === "all" || entry.month === filters.month)
    && (filters.period !== "quarterly" || !filters.quarter || filters.quarter === "all" || `Q${Math.ceil(Number(entry.period?.slice(5, 7) || 1) / 3)}` === filters.quarter)
  ));

  const monthlyMap = new Map();
  const costCenterMap = new Map();
  const glMap = new Map();
  const glCostCenterMap = new Map();
  const creditNoteMap = new Map();
  const creditNoteCategoryMap = new Map();
  const creditNoteCostCenterCategoryMap = new Map();

  for (const entry of filteredEntries) {
    const amount = entry.amount || 0;
    const period = getGroupedPeriod(entry, filters.period);
    const field = entry.type;
    const periodParts = getPeriodLabelParts(period);
    addAmount(monthlyMap, period, periodParts, field, amount);
    addAmount(costCenterMap, entry.costCenter, {
      costCenter: entry.costCenter,
      hub: entry.hub,
      region: entry.region,
    }, field, amount);

    if (entry.type === "spent") {
      const glName = entry.glName || "Unclassified";
      addAmount(glMap, glName, { glName }, "spent", amount);
      addAmount(glCostCenterMap, `${glName}__${entry.costCenter}`, {
        glName,
        costCenter: entry.costCenter,
        hub: entry.hub,
        region: entry.region,
      }, "spent", amount);
    }

    if (entry.type === "creditNotes") {
      const category = entry.category || "Credit Note";
      addAmount(creditNoteMap, entry.costCenter, {
        costCenter: entry.costCenter,
        hub: entry.hub,
        region: entry.region,
      }, "creditNotes", amount);
      addAmount(creditNoteCategoryMap, category, {
        category,
        issuedBy: entry.issuedBy || "",
      }, "creditNotes", amount);
      addAmount(creditNoteCostCenterCategoryMap, `${category}__${entry.costCenter}`, {
        category,
        issuedBy: entry.issuedBy || "",
        costCenter: entry.costCenter,
        hub: entry.hub,
        region: entry.region,
      }, "creditNotes", amount);
    }
  }

  const monthlyFlow = normalizeRows([...monthlyMap.values()]).sort((a, b) => a.period.localeCompare(b.period));
  const byCostCenter = normalizeRows([...costCenterMap.values()]).sort((a, b) => Math.abs(b.spent) - Math.abs(a.spent));
  const byGlName = normalizeRows([...glMap.values()])
    .map((row) => ({ ...row, amount: row.spent }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const glMonthlyMap = new Map();
  const costCenterMonthlyMap = new Map();
  for (const entry of filteredEntries) {
    if (entry.type !== "spent") continue;
    const glName = entry.glName || "Unclassified";
    const glPeriodKey = `${glName}__${entry.period}`;
    const costCenterPeriodKey = `${entry.costCenter}__${entry.period}`;
    glMonthlyMap.set(glPeriodKey, (glMonthlyMap.get(glPeriodKey) || 0) + (entry.amount || 0));
    costCenterMonthlyMap.set(costCenterPeriodKey, (costCenterMonthlyMap.get(costCenterPeriodKey) || 0) + (entry.amount || 0));
  }
  const addSparkline = (row, keyName) => ({
    ...row,
    sparkline: monthlyFlow.map((periodRow) => roundCurrency((keyName === "glName" ? glMonthlyMap : costCenterMonthlyMap).get(`${row[keyName]}__${periodRow.period}`) || 0)),
  });
  const byGlNameWithTrend = byGlName.map((row) => addSparkline(row, "glName"));
  const byGlCostCenter = normalizeRows([...glCostCenterMap.values()])
    .map((row) => ({ ...row, amount: row.spent }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const creditNoteRows = normalizeRows([...creditNoteMap.values()])
    .map((row) => ({ ...row, amount: row.creditNotes }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const creditNoteCategoryRows = normalizeRows([...creditNoteCategoryMap.values()])
    .map((row) => ({ ...row, amount: row.creditNotes }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const creditNoteCostCenterCategoryRows = normalizeRows([...creditNoteCostCenterCategoryMap.values()])
    .map((row) => ({ ...row, amount: row.creditNotes }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const totals = filteredEntries.reduce((acc, entry) => {
    acc[entry.type] += entry.amount || 0;
    return acc;
  }, { spent: 0, submitted: 0, approved: 0, creditNotes: 0 });
  totals.spent = roundCurrency(totals.spent);
  totals.submitted = roundCurrency(totals.submitted);
  totals.approved = roundCurrency(totals.approved);
  totals.creditNotes = roundCurrency(totals.creditNotes);
  totals.netMovement = roundCurrency(totals.approved - totals.spent);
  totals.afpGap = roundCurrency(totals.submitted - totals.approved);

  const topCostCenter = byCostCenter[0];
  const topGlName = byGlName[0];
  const approvalRate = totals.submitted ? (totals.approved / totals.submitted) * 100 : 0;
  const cnShare = getShare(totals.creditNotes, totals.spent);
  const insights = [
    topCostCenter ? {
      label: "Top Cost Center",
      value: topCostCenter.costCenter,
      detail: `${topCostCenter.hub} contributes ${formatPercent(getShare(topCostCenter.spent, totals.spent))} of filtered spent.`,
    } : null,
    topGlName ? {
      label: "Top Cost Driver",
      value: topGlName.glName,
      detail: `${topGlName.glName} represents ${formatPercent(getShare(topGlName.amount, totals.spent))} of filtered spent.`,
    } : null,
    {
      label: "AFP Gap",
      value: totals.afpGap,
      detail: `Submitted vs approved gap. Approval rate is ${formatPercent(approvalRate)}.`,
    },
    {
      label: "CN Share",
      value: totals.creditNotes,
      detail: `Allocation detail only. CN equals ${formatPercent(cnShare)} of filtered spent.`,
    },
  ].filter(Boolean);

  return {
    totals,
    monthlyFlow,
    byCostCenter,
    byGlName: byGlNameWithTrend,
    byGlCostCenter,
    costCenterSparklineByName: Object.fromEntries(byCostCenter.map((row) => {
      const trendedRow = addSparkline(row, "costCenter");
      return [row.costCenter, trendedRow.sparkline];
    })),
    creditNotes: {
      total: totals.creditNotes,
      shareOfSpent: cnShare,
      byCostCenter: creditNoteRows,
      byCategory: creditNoteCategoryRows,
      byCostCenterCategory: creditNoteCostCenterCategoryRows,
    },
    insights,
  };
};

function FinancialKpiCard({ icon, label, value, context, tone = "blue", trend, featured = false }) {
  const trendValue = Number.isFinite(trend) ? trend : 0;

  return (
    <article className={`financial-kpi-card tone-${tone} ${featured ? "is-featured" : ""}`}>
      <div className="financial-kpi-top">
        <span className="financial-kpi-icon"><Icon name={icon} /></span>
        <span>{context}</span>
      </div>
      <p>{label}</p>
      <strong>{value}</strong>
      <small className={trendValue >= 0 ? "is-positive" : "is-negative"}>
        {trendValue >= 0 ? "up" : "down"} {formatPercent(Math.abs(trendValue))} vs previous period
      </small>
    </article>
  );
}

function MonthlyTrendChart({ rows }) {
  if (!rows.length) {
    return (
      <article className="surface-card financial-chart-card">
        <div className="chart-header">
          <div>
            <p className="eyebrow">Main Flow</p>
            <h3>Financial Flow: Spent -&gt; Submitted -&gt; Approved -&gt; Adjustments</h3>
          </div>
        </div>
        <div className="empty-filter-state">No financial inputs match the selected filters.</div>
      </article>
    );
  }

  const width = 920;
  const height = 340;
  const padding = { top: 28, right: 28, bottom: 48, left: 64 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const series = [
    { key: "spent", label: "Total Spent", color: "#2563eb" },
    { key: "submitted", label: "AFP Submitted", color: "#16a34a" },
    { key: "approved", label: "AFP Approved", color: "#7c3aed" },
  ];
  const maxValue = Math.max(...rows.flatMap((row) => series.map((item) => row[item.key] || 0)), 1);
  const x = (index) => padding.left + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * chartWidth);
  const y = (value) => padding.top + chartHeight - ((value || 0) / maxValue) * chartHeight;
  const buildPath = (key) => rows.map((row, index) => {
    const current = [x(index), y(row[key])];
    if (index === 0) return `M ${current[0].toFixed(1)} ${current[1].toFixed(1)}`;
    const previous = [x(index - 1), y(rows[index - 1][key])];
    const controlOffset = (current[0] - previous[0]) * 0.5;
    return `C ${(previous[0] + controlOffset).toFixed(1)} ${previous[1].toFixed(1)}, ${(current[0] - controlOffset).toFixed(1)} ${current[1].toFixed(1)}, ${current[0].toFixed(1)} ${current[1].toFixed(1)}`;
  }).join(" ");
  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <article className="surface-card financial-chart-card">
      <div className="chart-header">
        <div>
          <p className="eyebrow">Main Flow</p>
          <h3>Financial Flow: Spent -&gt; Submitted -&gt; Approved -&gt; Adjustments</h3>
        </div>
        <div className="chart-legend">
          {series.map((item) => (
            <span key={item.key} style={{ "--legend-color": item.color }}>{item.label}</span>
          ))}
        </div>
      </div>

      <svg className="monthly-flow-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly trend for spent, submitted AFP, and approved AFP">
        {gridLines.map((line) => {
          const lineY = padding.top + chartHeight - chartHeight * line;
          return (
            <g key={line}>
              <line x1={padding.left} y1={lineY} x2={width - padding.right} y2={lineY} />
              <text x={padding.left - 12} y={lineY + 4}>{formatCurrency(maxValue * line).replace(".00", "")}</text>
            </g>
          );
        })}
        {series.map((item) => (
          <path key={item.key} d={buildPath(item.key)} style={{ "--line-color": item.color }} />
        ))}
        {series.map((item) => (
          <path key={`${item.key}-fill`} className="chart-line-glow" d={`${buildPath(item.key)} L ${x(rows.length - 1).toFixed(1)} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`} style={{ "--line-color": item.color }} />
        ))}
        {rows.map((row, index) => (
          <text key={row.period} className="chart-period-label" x={x(index)} y={height - 16}>
            {index % 2 === 0 || rows.length < 10 ? row.period.slice(2) : ""}
          </text>
        ))}
      </svg>
    </article>
  );
}

function InsightList({ insights }) {
  return (
    <article className="surface-card insights-card">
      <div className="chart-header">
        <div>
          <p className="eyebrow">Top Insights</p>
          <h3>Financial Signals</h3>
        </div>
      </div>
      <div className="insight-list">
        {insights.map((insight) => (
          <div className="insight-item" key={insight.label}>
            <span>{insight.label}</span>
            <strong>{typeof insight.value === "number" ? formatCurrency(insight.value) : insight.value}</strong>
            <p>{insight.detail}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function SmartSummary({ totals, byCostCenter, byGlName, creditNotes, monthlyFlow }) {
  const topCostCenter = byCostCenter[0];
  const topGl = byGlName[0];
  const topCn = creditNotes.byCategory[0];
  const activeSpentMonths = monthlyFlow.filter((row) => row.spent);
  const latest = activeSpentMonths.at(-1);
  const previous = activeSpentMonths.at(-2);
  const monthlyChange = latest && previous ? getTrend(latest.spent, previous.spent) : 0;

  const items = [
    topGl ? {
      label: "Top GL driver",
      value: topGl.glName,
      detail: `${formatPercent(getShare(topGl.amount, totals.spent))} of spent`,
    } : null,
    topCostCenter ? {
      label: "Top cost center",
      value: topCostCenter.costCenter,
      detail: `${formatCurrency(topCostCenter.spent)} spent`,
    } : null,
    topCn ? {
      label: "Top CN item",
      value: topCn.category,
      detail: `${topCn.issuedBy || "Legacy CN"} issued ${formatCurrency(topCn.amount)}`,
    } : null,
    latest && previous ? {
      label: "Latest spend movement",
      value: `${monthlyChange >= 0 ? "+" : ""}${formatPercent(monthlyChange)}`,
      detail: `${latest.period} vs ${previous.period}`,
    } : null,
  ].filter(Boolean);

  return (
    <section className="smart-summary-grid" aria-label="Spend watchlist">
      {items.map((item) => (
        <article className="smart-summary-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <p>{item.detail}</p>
        </article>
      ))}
    </section>
  );
}

function getGlFilteredCostCenterRows(rows, selectedGlNames, sortMode) {
  const visibleGlSet = new Set(selectedGlNames);
  const costCenterMap = new Map();

  for (const row of rows) {
    if (!visibleGlSet.has(row.glName)) continue;
    const current = costCenterMap.get(row.costCenter) || {
      costCenter: row.costCenter,
      hub: row.hub,
      region: row.region,
      total: 0,
      count: 0,
      byGl: {},
    };
    current.byGl[row.glName] = (current.byGl[row.glName] || 0) + (row.amount || 0);
    current.total += row.amount || 0;
    current.count += row.count || 0;
    costCenterMap.set(row.costCenter, current);
  }

  return [...costCenterMap.values()].sort((a, b) => {
    if (sortMode === "cost-center") return a.costCenter.localeCompare(b.costCenter);
    if (sortMode === "hub") return a.hub.localeCompare(b.hub) || Math.abs(b.total) - Math.abs(a.total);
    return Math.abs(b.total) - Math.abs(a.total);
  });
}

const segmentColors = ["#2563eb", "#7c3aed", "#0f766e", "#f97316", "#db2777", "#64748b"];

const getShortLabel = (label) => {
  if (!label) return "";
  const cleanLabel = label.replace(/&/g, " ").replace(/\s+/g, " ").trim();
  const words = cleanLabel.split(" ");
  if (cleanLabel.length <= 18) return cleanLabel;
  return words.slice(0, 3).join(" ");
};

function SpendShareBar({ percent, segments = [] }) {
  const width = Math.min(Math.max(percent || 0, 0), 100);
  const normalizedSegments = segments.filter((segment) => segment.amount > 0);

  return (
    <div className="spend-profile-cell">
      <div className="spend-profile-meta">
        <strong>{formatPercent(percent)} of spent</strong>
      </div>
      {normalizedSegments.length ? (
        <div className="spend-segment-list">
          {normalizedSegments.map((segment, index) => (
            <span key={segment.label} style={{ "--segment-color": segmentColors[index % segmentColors.length] }}>
              <i />
              <b>{getShortLabel(segment.label)}</b>
              <em>{formatCurrency(segment.amount)} - {formatPercent(segment.percent)}</em>
            </span>
          ))}
        </div>
      ) : null}
      <div className="spend-profile-bar" aria-hidden="true">
        {normalizedSegments.length ? (
          normalizedSegments.map((segment, index) => (
            <span
              key={segment.label}
              className="spend-profile-segment"
              style={{
                "--bar-width": `${Math.min(Math.max(segment.percent || 0, 0), 100)}%`,
                "--segment-color": segmentColors[index % segmentColors.length],
              }}
            />
          ))
        ) : (
          <span style={{ "--bar-width": `${width}%` }} />
        )}
      </div>
    </div>
  );
}

function SpendingSparkline({ values = [] }) {
  const width = 132;
  const height = 34;
  const positiveValues = values.filter((value) => value > 0);
  const maxValue = Math.max(...positiveValues, 1);
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value || 0) / maxValue) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg className="spending-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Spending trend">
      <polyline points={points} />
    </svg>
  );
}

function CreditNoteTable({ creditNotes, totalSpent, onSelectCostCenter }) {
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [pendingCategories, setPendingCategories] = useState([]);
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);
  const [sortMode, setSortMode] = useState("share-desc");
  const categoryOptions = creditNotes.byCategory.map((row) => row.category);
  const selectedSet = new Set(selectedCategories);
  const pendingSet = new Set(pendingCategories);
  const activeCategories = categoryOptions.filter((category) => selectedSet.has(category));
  const isCostCenterMode = activeCategories.length > 0;
  const receiverRows = (() => {
    const categorySet = new Set(activeCategories);
    const receiverMap = new Map();
    for (const row of creditNotes.byCostCenterCategory) {
      if (!categorySet.has(row.category)) continue;
      const current = receiverMap.get(row.costCenter) || {
        costCenter: row.costCenter,
        hub: row.hub,
        total: 0,
        byCategory: {},
      };
      current.byCategory[row.category] = (current.byCategory[row.category] || 0) + row.amount;
      current.total += row.amount;
      receiverMap.set(row.costCenter, current);
    }
    return [...receiverMap.values()].sort((a, b) => {
      if (sortMode === "name") return a.costCenter.localeCompare(b.costCenter);
      if (sortMode === "amount-desc") return Math.abs(b.total) - Math.abs(a.total);
      return getShare(b.total, creditNotes.total) - getShare(a.total, creditNotes.total);
    });
  })();
  const rows = isCostCenterMode
    ? receiverRows
    : [...creditNotes.byCategory].sort((a, b) => (sortMode === "name" ? a.category.localeCompare(b.category) : Math.abs(b.amount) - Math.abs(a.amount)));
  const exportRows = rows.map((row) => (
    isCostCenterMode
      ? {
        costCenter: row.costCenter,
        hub: row.hub,
        cnAmount: roundCurrency(row.total),
        cnShare: formatPercent(getShare(row.total, creditNotes.total)),
        selectedItems: activeCategories.join("; "),
      }
      : {
        cnItem: row.category,
        issuedBy: row.issuedBy || "Legacy CN",
        cnAmount: roundCurrency(row.amount),
        cnShare: formatPercent(getShare(row.amount, creditNotes.total)),
      }
  ));

  const togglePending = (category) => {
    setPendingCategories((current) => (
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    ));
  };

  const openDrilldown = () => {
    setPendingCategories(selectedCategories);
    setIsDrilldownOpen((current) => !current);
  };

  const applyDrilldown = () => {
    setSelectedCategories(pendingCategories);
    setIsDrilldownOpen(false);
  };

  const clearDrilldown = () => {
    setPendingCategories([]);
    setSelectedCategories([]);
    setIsDrilldownOpen(false);
  };

  return (
    <article className="surface-card credit-note-analysis-card">
      <div className="chart-header">
        <div>
          <p className="eyebrow">Credit Notes</p>
          <h3>{isCostCenterMode ? "CN Receiver Drilldown" : "Credit Note Analysis"}</h3>
          <p>{isCostCenterMode ? `${activeCategories.join(", ")} selected. Rows show receiving cost centers.` : "CN allocation detail by issuer under the active header filters."}</p>
        </div>
        <div className="cn-impact-pill">
          <strong>{formatCurrency(creditNotes.total)}</strong>
          <span>{formatPercent(getShare(creditNotes.total, totalSpent))} vs spent</span>
        </div>
        <label className="analysis-sort-control">
          <span>Sort</span>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
            <option value="share-desc">{isCostCenterMode ? "Highest %" : "Highest amount"}</option>
            <option value="amount-desc">Highest amount</option>
            <option value="name">Name</option>
          </select>
        </label>
        <button type="button" className="analysis-export-button" onClick={() => downloadCsv("credit-note-analysis.csv", exportRows)}>Export CSV</button>
      </div>

      <div className="analysis-table-wrap credit-note-table-wrap">
        <table className="analysis-table credit-note-table">
          <thead>
            <tr>
              <th className="analysis-dimension-heading">
                <button type="button" onClick={openDrilldown} aria-expanded={isDrilldownOpen}>
                  {isCostCenterMode ? "Cost Center" : "CN Item"}
                  <span>{activeCategories.length ? `${activeCategories.length} selected` : "Drill down"}</span>
                  <i aria-hidden="true">v</i>
                </button>
                {isDrilldownOpen ? (
                  <div className="dimension-popover">
                    <div className="dimension-popover-head">
                      <strong>Drill down by CN item</strong>
                      <span>Select CN items to see receiving cost centers.</span>
                    </div>
                    <div className="dimension-option-list">
                      {categoryOptions.map((category) => (
                        <label key={category}>
                          <input
                            type="checkbox"
                            checked={pendingSet.has(category)}
                            onChange={() => togglePending(category)}
                          />
                          <span>{category}</span>
                        </label>
                      ))}
                    </div>
                    <div className="dimension-popover-actions">
                      <span>{pendingCategories.length} selected</span>
                      <button type="button" className="ghost-button" onClick={clearDrilldown}>Clear</button>
                      <button type="button" onClick={applyDrilldown}>Apply</button>
                    </div>
                  </div>
                ) : null}
              </th>
              <th>{isCostCenterMode ? "CN Item Mix" : "Issued By"}</th>
              <th>CN Share</th>
              <th>CN Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={isCostCenterMode ? row.costCenter : row.category}
                className={isCostCenterMode ? "is-clickable-row" : ""}
                onClick={() => {
                  if (isCostCenterMode) onSelectCostCenter?.(row.costCenter);
                }}
              >
                <td>
                  <strong>{isCostCenterMode ? row.costCenter : row.category}</strong>
                  <span>{isCostCenterMode ? row.hub : "CN item"}</span>
                </td>
                <td>
                  {isCostCenterMode ? (
                    <div className="spend-segment-list">
                      {activeCategories.map((category, index) => (
                        row.byCategory[category] ? (
                          <span key={category} style={{ "--segment-color": segmentColors[index % segmentColors.length] }}>
                            <i />
                            <b>{category}</b>
                            <em>{formatCurrency(row.byCategory[category])}</em>
                          </span>
                        ) : null
                      ))}
                    </div>
                  ) : (
                    <span className="cn-issued-by">{row.issuedBy || "Legacy CN"}</span>
                  )}
                </td>
                <td>
                  <SpendShareBar percent={getShare(isCostCenterMode ? row.total : row.amount, creditNotes.total)} />
                </td>
                <td className="is-number"><strong>{formatCurrency(isCostCenterMode ? row.total : row.amount)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function SpendAnalysisTable({ byCostCenter, byGlCostCenter, byGlName, costCenterSparklineByName, totals, onSelectCostCenter }) {
  const [selectedGlNames, setSelectedGlNames] = useState([]);
  const [pendingGlNames, setPendingGlNames] = useState([]);
  const [sortMode, setSortMode] = useState("spent-desc");
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const glOptions = byGlName.map((row) => row.glName);
  const costCenterLookup = new Map(byCostCenter.map((row) => [row.costCenter, row]));
  const activeGlSet = new Set(selectedGlNames);
  const pendingGlSet = new Set(pendingGlNames);
  const activeGlNames = glOptions.filter((glName) => activeGlSet.has(glName));
  const filteredGlOptions = glOptions.filter((glName) => glName.toLowerCase().includes(searchTerm.trim().toLowerCase()));
  const isCostCenterMode = activeGlNames.length > 0;
  const costCenterRows = getGlFilteredCostCenterRows(byGlCostCenter, activeGlNames, sortMode).map((row) => {
    const totalsForCostCenter = costCenterLookup.get(row.costCenter) || {};
    return {
      ...row,
      spent: totalsForCostCenter.spent || 0,
      sparkline: costCenterSparklineByName[row.costCenter] || [],
    };
  }).sort((a, b) => {
    if (sortMode === "cost-center") return a.costCenter.localeCompare(b.costCenter);
    if (sortMode === "hub") return a.hub.localeCompare(b.hub) || getShare(b.total, b.spent) - getShare(a.total, a.spent);
    return getShare(b.total, b.spent) - getShare(a.total, a.spent);
  });
  const glRows = (() => {
    const rows = [...byGlName];
    if (sortMode === "cost-center") rows.sort((a, b) => a.glName.localeCompare(b.glName));
    return rows.slice(0, 14);
  })();
  const tableRows = isCostCenterMode ? costCenterRows : glRows;
  const exportRows = tableRows.map((row) => {
    if (isCostCenterMode) {
      return {
        costCenter: row.costCenter,
        hub: row.hub,
        selectedSpent: roundCurrency(row.total),
        selectedShareOfCostCenter: formatPercent(getShare(row.total, row.spent)),
        selectedGlNames: activeGlNames.join("; "),
      };
    }
    return {
      glName: row.glName,
      spent: roundCurrency(row.amount),
      shareOfSpent: formatPercent(getShare(row.amount, totals.spent)),
    };
  });
  const subtitle = isCostCenterMode
    ? `${activeGlNames.join(", ")} selected. Rows now compare cost centers for the selected GL spend.`
    : "Organized by GL names. Use the Dimension column drilldown to compare selected GLs by cost center.";
  const firstColumnLabel = isCostCenterMode ? "Cost Center" : "GL Name";

  const togglePending = (glName) => {
    setPendingGlNames((current) => (
      current.includes(glName)
        ? current.filter((item) => item !== glName)
        : [...current, glName]
    ));
  };

  const openDrilldown = () => {
    setPendingGlNames(selectedGlNames);
    setIsDrilldownOpen((current) => !current);
  };

  const applyDrilldown = () => {
    setSelectedGlNames(pendingGlNames);
    setIsDrilldownOpen(false);
  };

  const clearDrilldown = () => {
    setPendingGlNames([]);
    setSelectedGlNames([]);
    setSearchTerm("");
    setIsDrilldownOpen(false);
  };

  return (
    <article className="surface-card spend-analysis-card">
      <div className="chart-header">
        <div>
          <p className="eyebrow">Spend Analysis</p>
          <h3>{isCostCenterMode ? "Cost Center Drilldown" : "GL Name Cost Drivers"}</h3>
          <p>{subtitle}</p>
        </div>
        <label className="analysis-sort-control">
          <span>Sort</span>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
            <option value="spent-desc">{isCostCenterMode ? "Highest %" : "Highest spent"}</option>
            <option value="cost-center">Name</option>
            <option value="hub">Hub</option>
          </select>
        </label>
        <button type="button" className="analysis-export-button" onClick={() => downloadCsv("spend-analysis.csv", exportRows)}>Export CSV</button>
      </div>

      <div className="analysis-table-wrap">
        <table className="analysis-table">
          <thead>
            <tr>
              <th className="analysis-dimension-heading">
                <button type="button" onClick={openDrilldown} aria-expanded={isDrilldownOpen}>
                  {firstColumnLabel}
                  <span>{activeGlNames.length ? `${activeGlNames.length} selected` : "Drill down"}</span>
                  <i aria-hidden="true">v</i>
                </button>
                {isDrilldownOpen ? (
                  <div className="dimension-popover">
                    <div className="dimension-popover-head">
                      <strong>Drill down by GL</strong>
                      <span>Select GL names to compare cost centers.</span>
                    </div>
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search GL names"
                    />
                    <div className="dimension-option-list">
                      {filteredGlOptions.map((glName) => (
                        <label key={glName}>
                          <input
                            type="checkbox"
                            checked={pendingGlSet.has(glName)}
                            onChange={() => togglePending(glName)}
                          />
                          <span>{glName}</span>
                        </label>
                      ))}
                    </div>
                    <div className="dimension-popover-actions">
                      <span>{pendingGlNames.length} selected</span>
                      <button type="button" className="ghost-button" onClick={clearDrilldown}>Clear</button>
                      <button type="button" onClick={applyDrilldown}>Apply</button>
                    </div>
                  </div>
                ) : null}
              </th>
              <th>Spend Profile</th>
              <th>Trend</th>
              <th>{isCostCenterMode ? "Selected Spent" : "Spent"}</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => {
              const key = isCostCenterMode ? row.costCenter : row.glName;
              const amount = isCostCenterMode ? row.total : row.amount;
              const percent = isCostCenterMode ? getShare(amount, row.spent) : getShare(amount, totals.spent);
              const segments = isCostCenterMode
                ? activeGlNames.map((glName) => ({
                  label: glName,
                  amount: row.byGl[glName] || 0,
                  percent: getShare(row.byGl[glName] || 0, row.spent),
                }))
                : [];

              return (
                <tr
                  key={key}
                  className={isCostCenterMode ? "is-clickable-row" : ""}
                  onClick={() => {
                    if (isCostCenterMode) onSelectCostCenter?.(row.costCenter);
                  }}
                >
                  <td>
                    <strong>{key}</strong>
                    <span>{isCostCenterMode ? row.hub : "GL category"}</span>
                  </td>
                  <td>
                    <SpendShareBar
                      percent={percent}
                      segments={segments}
                    />
                  </td>
                  <td><SpendingSparkline values={row.sparkline} /></td>
                  <td className="is-number"><strong>{formatCurrency(amount)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function CostCenterProfileDrawer({ costCenterName, byCostCenter, byGlCostCenter, creditNotes, onClose }) {
  if (!costCenterName) return null;

  const summary = byCostCenter.find((row) => row.costCenter === costCenterName);
  const glRows = byGlCostCenter
    .filter((row) => row.costCenter === costCenterName)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 6);
  const cnRows = creditNotes.byCostCenterCategory
    .filter((row) => row.costCenter === costCenterName)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 6);

  return (
    <div className="profile-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="cost-center-profile-drawer" role="dialog" aria-label={`${costCenterName} profile`} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="panel-close" onClick={onClose} aria-label="Close profile">×</button>
        <p className="eyebrow">Cost Center Profile</p>
        <h3>{costCenterName}</h3>
        <span className="profile-hub-label">{summary?.hub || "Unmapped"}</span>

        <div className="profile-metric-grid">
          <div>
            <span>Total spent</span>
            <strong>{formatCurrency(summary?.spent || 0)}</strong>
          </div>
          <div>
            <span>Credit notes</span>
            <strong>{formatCurrency(summary?.creditNotes || 0)}</strong>
          </div>
          <div>
            <span>CN allocation vs spent</span>
            <strong>{formatPercent(getShare(summary?.creditNotes || 0, summary?.spent || 0))}</strong>
          </div>
        </div>

        <section>
          <h4>Top GL Names</h4>
          <div className="profile-list">
            {glRows.map((row) => (
              <div key={row.glName}>
                <span>{row.glName}</span>
                <strong>{formatCurrency(row.amount)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h4>Credit Note Items Received</h4>
          <div className="profile-list">
            {cnRows.length ? cnRows.map((row) => (
              <div key={`${row.category}-${row.issuedBy}`}>
                <span>{row.category} from {row.issuedBy || "Legacy CN"}</span>
                <strong>{formatCurrency(row.amount)}</strong>
              </div>
            )) : <p className="profile-empty-note">No credit notes under the current filters.</p>}
          </div>
        </section>
      </aside>
    </div>
  );
}

export function SpendingReportPage({ filters }) {
  const { totals, monthlyFlow, byCostCenter, byGlName, byGlCostCenter, costCenterSparklineByName, creditNotes, insights } = buildFilteredInputs(financialInputsData, filters);
  const [selectedProfileCostCenter, setSelectedProfileCostCenter] = useState("");
  const chartRows = monthlyFlow.filter((row) => row.spent || row.submitted || row.approved).slice(-16);
  const cnShare = getShare(totals.creditNotes, totals.spent);
  const activeMonths = monthlyFlow.filter((row) => row.spent || row.submitted || row.approved || row.creditNotes);
  const current = activeMonths.at(-1) || {};
  const previous = activeMonths.at(-2) || {};

  return (
    <section className="page-stack financial-inputs-page">
      <div className="page-heading financial-story-heading">
        <p className="eyebrow">Financial Inputs</p>
        <h2>Financial Inputs Dashboard</h2>
        <p>What we spent, what we submitted, what got approved, and how credit notes support cost-center allocation detail.</p>
      </div>

      <div className="financial-story-rail" aria-label="Financial input story">
        <span>Spent</span>
        <span>Submitted</span>
        <span>Approved</span>
        <span>CN</span>
        <span>Net Position</span>
      </div>

      <section className="financial-kpi-grid" aria-label="Financial input summary">
        <FinancialKpiCard icon="spending" label="Total Spent" value={formatCurrency(totals.spent)} context="YTD cost input" tone="blue" trend={getTrend(current.spent, previous.spent)} />
        <FinancialKpiCard icon="submit" label="AFP Submitted" value={formatCurrency(totals.submitted)} context="YTD submitted" tone="green" trend={getTrend(current.submitted, previous.submitted)} />
        <FinancialKpiCard icon="approve" label="AFP Approved" value={formatCurrency(totals.approved)} context="YTD approved" tone="purple" trend={getTrend(current.approved, previous.approved)} />
        <FinancialKpiCard icon="credit" label="CN Allocation Detail" value={formatCurrency(totals.creditNotes)} context={`${formatPercent(cnShare)} of spent, not deducted at IGCC level`} tone="amber" trend={getTrend(current.creditNotes, previous.creditNotes)} />
        <FinancialKpiCard icon="net" label="Net Position" value={formatCurrency(totals.netMovement)} context="Approved - Spent" tone={totals.netMovement >= 0 ? "net-positive" : "net-negative"} trend={getTrend(current.netMovement, previous.netMovement)} featured />
      </section>

      <div className="financial-main-grid">
        <MonthlyTrendChart rows={chartRows} />
        <InsightList insights={insights} />
      </div>

      <SmartSummary
        totals={totals}
        byCostCenter={byCostCenter}
        byGlName={byGlName}
        creditNotes={creditNotes}
        monthlyFlow={monthlyFlow}
      />

      <SpendAnalysisTable
        byCostCenter={byCostCenter}
        byGlCostCenter={byGlCostCenter}
        byGlName={byGlName}
        costCenterSparklineByName={costCenterSparklineByName}
        totals={totals}
        onSelectCostCenter={setSelectedProfileCostCenter}
      />

      <CreditNoteTable creditNotes={creditNotes} totalSpent={totals.spent} onSelectCostCenter={setSelectedProfileCostCenter} />

      <section className="financial-input-note">
        This dashboard shows financial inputs only. Profitability analysis is available in the Profit & Loss page.
      </section>

      <CostCenterProfileDrawer
        costCenterName={selectedProfileCostCenter}
        byCostCenter={byCostCenter}
        byGlCostCenter={byGlCostCenter}
        creditNotes={creditNotes}
        onClose={() => setSelectedProfileCostCenter("")}
      />
    </section>
  );
}
