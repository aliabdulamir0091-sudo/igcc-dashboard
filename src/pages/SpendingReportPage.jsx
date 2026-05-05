import { useMemo, useState } from "react";
import financialInputsData from "../data/financialInputsData.json";
import { Icon } from "../components/Icons";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const formatCurrency = (value) => currencyFormatter.format(value || 0);
const formatNumber = (value) => numberFormatter.format(value || 0);
const formatPercent = (value) => `${percentFormatter.format(value || 0)}%`;
const getShare = (amount, total) => (total ? (amount / total) * 100 : 0);
const getTrend = (current, previous) => (previous ? ((current - previous) / Math.abs(previous)) * 100 : 0);

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
    netMovement: roundCurrency(row.approved - row.spent - row.creditNotes),
    afpGap: roundCurrency(row.submitted - row.approved),
  }));

const buildFilteredInputs = (data, filters = {}) => {
  const filteredEntries = data.entries.filter((entry) => (
    matchesPortfolio(entry, filters.portfolio)
    && (!filters.hub || filters.hub === "all" || entry.hub === filters.hub)
    && (!filters.costCenter || filters.costCenter === "all" || entry.costCenter === filters.costCenter)
    && (!filters.year || filters.year === "all" || entry.year === filters.year)
    && (filters.period !== "monthly" || !filters.month || filters.month === "all" || entry.month === filters.month)
    && (filters.period !== "quarterly" || !filters.quarter || filters.quarter === "all" || `Q${Math.ceil(Number(entry.period?.slice(5, 7) || 1) / 3)}` === filters.quarter)
  ));

  const monthlyMap = new Map();
  const costCenterMap = new Map();
  const glMap = new Map();
  const glCostCenterMap = new Map();
  const creditNoteMap = new Map();

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
      addAmount(creditNoteMap, entry.costCenter, {
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
  const byGlCostCenter = normalizeRows([...glCostCenterMap.values()])
    .map((row) => ({ ...row, amount: row.spent }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const creditNoteRows = normalizeRows([...creditNoteMap.values()])
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
  totals.netMovement = roundCurrency(totals.approved - totals.spent - totals.creditNotes);
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
      label: "CN Impact",
      value: totals.creditNotes,
      detail: `Credit notes equal ${formatPercent(cnShare)} of filtered spent.`,
    },
  ].filter(Boolean);

  return {
    totals,
    monthlyFlow,
    byCostCenter,
    byGlName,
    byGlCostCenter,
    creditNotes: {
      total: totals.creditNotes,
      shareOfSpent: cnShare,
      byCostCenter: creditNoteRows,
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

function SummaryTable({ columns, rows }) {
  return (
    <div className="report-table-wrap compact-table">
      <table className="report-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.costCenter || row.glName}-${index}`}>
              {columns.map((column) => (
                <td key={column.key} className={column.align === "right" ? "is-number" : ""}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GlFilterControls({ selectedGlNames, setSelectedGlNames, glOptions, sortMode, setSortMode }) {
  const selectedGlSet = new Set(selectedGlNames);
  const activeGlNames = glOptions.filter((glName) => selectedGlSet.has(glName));

  const toggleGlName = (glName) => {
    setSelectedGlNames((current) => (
      current.includes(glName)
        ? current.filter((item) => item !== glName)
        : [...current, glName]
    ));
  };

  return (
    <div className="gl-drilldown-controls inline-gl-filter">
      <fieldset>
        <legend>Filter table by GL names</legend>
        <div className="gl-checkbox-grid">
          {glOptions.map((glName) => (
            <label key={glName} className={activeGlNames.includes(glName) ? "is-selected" : ""}>
              <input
                type="checkbox"
                checked={activeGlNames.includes(glName)}
                onChange={() => toggleGlName(glName)}
              />
              <span>{glName}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        <span>Sort</span>
        <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
          <option value="spent-desc">Highest total</option>
          <option value="cost-center">Cost center</option>
          <option value="hub">Hub</option>
        </select>
      </label>
      <button type="button" className="secondary-button" onClick={() => setSelectedGlNames([])}>Clear GL selection</button>
    </div>
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

function TopCostCentersTable({ byCostCenter, byGlCostCenter, byGlName, totalSpent, topCostCenter }) {
  const [selectedGlNames, setSelectedGlNames] = useState([]);
  const [sortMode, setSortMode] = useState("spent-desc");
  const glOptions = byGlName.map((row) => row.glName);
  const selectedGlSet = new Set(selectedGlNames);
  const activeGlNames = glOptions.filter((glName) => selectedGlSet.has(glName));
  const filteredRows = useMemo(
    () => getGlFilteredCostCenterRows(byGlCostCenter, activeGlNames, sortMode),
    [byGlCostCenter, activeGlNames, sortMode],
  );
  const tableRows = activeGlNames.length ? filteredRows : byCostCenter.slice(0, 10);
  const titleDetail = activeGlNames.length
    ? `${activeGlNames.join(", ")} selected. Showing cost centers by selected GL spend.`
    : (topCostCenter ? `${topCostCenter.costCenter} is the largest spend input at ${formatPercent(getShare(topCostCenter.spent, totalSpent))}.` : "Largest mapped spend by cost center.");

  return (
    <article className="surface-card top-cost-center-card">
      <h3>Top Cost Centers</h3>
      <p>{titleDetail}</p>
      <GlFilterControls
        selectedGlNames={selectedGlNames}
        setSelectedGlNames={setSelectedGlNames}
        glOptions={glOptions}
        sortMode={sortMode}
        setSortMode={setSortMode}
      />
      <SummaryTable
        rows={tableRows}
        columns={activeGlNames.length ? [
          { key: "costCenter", label: "Cost Center" },
          { key: "hub", label: "Hub" },
          ...activeGlNames.map((glName) => ({
            key: `gl-${glName}`,
            label: glName,
            align: "right",
            render: (row) => formatCurrency(row.byGl[glName] || 0),
          })),
          { key: "share", label: "% of Total", render: (row) => (
            <span className="table-progress purple"><i style={{ "--progress": `${getShare(row.total, totalSpent)}%` }} />{formatPercent(getShare(row.total, totalSpent))}</span>
          ) },
          { key: "count", label: "Entries", align: "right", render: (row) => formatNumber(row.count) },
          { key: "total", label: "Selected Total", align: "right", render: (row) => formatCurrency(row.total) },
        ] : [
          { key: "costCenter", label: "Cost Center" },
          { key: "spent", label: "% of Total", render: (row) => (
            <span className="table-progress"><i style={{ "--progress": `${getShare(row.spent, totalSpent)}%` }} />{formatPercent(getShare(row.spent, totalSpent))}</span>
          ) },
          { key: "spent", label: "Spent", align: "right", render: (row) => formatCurrency(row.spent) },
          { key: "approved", label: "Approved", align: "right", render: (row) => formatCurrency(row.approved) },
        ]}
      />
    </article>
  );
}

export function SpendingReportPage({ filters }) {
  const { totals, monthlyFlow, byCostCenter, byGlName, byGlCostCenter, creditNotes, insights } = buildFilteredInputs(financialInputsData, filters);
  const chartRows = monthlyFlow.filter((row) => row.spent || row.submitted || row.approved).slice(-16);
  const topCostCenter = byCostCenter[0];
  const topGlName = byGlName[0];
  const cnShare = getShare(totals.creditNotes, totals.spent);
  const activeMonths = monthlyFlow.filter((row) => row.spent || row.submitted || row.approved || row.creditNotes);
  const current = activeMonths.at(-1) || {};
  const previous = activeMonths.at(-2) || {};

  return (
    <section className="page-stack financial-inputs-page">
      <div className="page-heading financial-story-heading">
        <p className="eyebrow">Financial Inputs</p>
        <h2>Financial Inputs Dashboard</h2>
        <p>What we spent, what we submitted, what got approved, and how credit notes adjusted the position.</p>
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
        <FinancialKpiCard icon="credit" label="Credit Notes (CN)" value={formatCurrency(totals.creditNotes)} context={`${formatPercent(cnShare)} of spent`} tone="amber" trend={getTrend(current.creditNotes, previous.creditNotes)} />
        <FinancialKpiCard icon="net" label="Net Position" value={formatCurrency(totals.netMovement)} context="Approved - Spent - CN" tone={totals.netMovement >= 0 ? "net-positive" : "net-negative"} trend={getTrend(current.netMovement, previous.netMovement)} featured />
      </section>

      <div className="financial-main-grid">
        <MonthlyTrendChart rows={chartRows} />
        <InsightList insights={insights} />
      </div>

      <section className="surface-card cn-section">
        <div className="chart-header">
          <div>
            <p className="eyebrow">Credit Notes</p>
            <h3>CN Impact</h3>
          </div>
          <div className="cn-impact-pill">
            <strong>{formatCurrency(creditNotes.total)}</strong>
            <span>{formatPercent(creditNotes.shareOfSpent)} vs spent</span>
          </div>
        </div>
        <SummaryTable
          rows={creditNotes.byCostCenter.slice(0, 8)}
          columns={[
            { key: "costCenter", label: "Cost Center" },
            { key: "hub", label: "Hub" },
            { key: "count", label: "Entries", align: "right", render: (row) => formatNumber(row.count) },
            { key: "amount", label: "CN Amount", align: "right", render: (row) => formatCurrency(row.amount) },
          ]}
        />
      </section>

      <div className="content-grid">
        <TopCostCentersTable
          byCostCenter={byCostCenter}
          byGlCostCenter={byGlCostCenter}
          byGlName={byGlName}
          totalSpent={totals.spent}
          topCostCenter={topCostCenter}
        />

        <article className="surface-card">
          <h3>Top GL Names</h3>
          <p>{topGlName ? `${topGlName.glName} is the major cost driver at ${formatPercent(getShare(topGlName.amount, totals.spent))}.` : "Largest GL categories charged across cost centers."}</p>
          <SummaryTable
            rows={byGlName.slice(0, 10)}
            columns={[
              { key: "glName", label: "GL Name" },
              { key: "amount", label: "% of Total", render: (row) => (
                <span className="table-progress purple"><i style={{ "--progress": `${getShare(row.amount, totals.spent)}%` }} />{formatPercent(getShare(row.amount, totals.spent))}</span>
              ) },
              { key: "amount", label: "Spent", align: "right", render: (row) => formatCurrency(row.amount) },
            ]}
          />
        </article>
      </div>

      <section className="financial-input-note">
        This dashboard shows financial inputs only. Profitability analysis is available in the Profit & Loss page.
      </section>
    </section>
  );
}
