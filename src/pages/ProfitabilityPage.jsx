import { useMemo, useState } from "react";
import { Icon } from "../components/Icons";
import { ALL_FILTER_VALUE } from "../data/costCenterHierarchy";
import financialInputsData from "../data/financialInputsData.json";

const REVENUE_BASIS_OPTIONS = [
  { id: "approved", label: "Approved AFP" },
  { id: "submitted", label: "Submitted AFP" },
];

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

function PnlKpiCard({ icon, label, value, context, tone = "blue" }) {
  return (
    <article className={`pnl-kpi-card tone-${tone}`}>
      <div className="pnl-kpi-top">
        <span><Icon name={icon} /></span>
        <small>{context}</small>
      </div>
      <p>{label}</p>
      <strong>{value}</strong>
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
    { label: "Revenue", value: pnl.isCostCenterLevel ? pnl.updatedRevenue : pnl.revenue, color: "green" },
    { label: "Total Cost", value: -(pnl.isCostCenterLevel ? pnl.updatedCost : pnl.totalCost), color: "red" },
    { label: "Gross Profit", value: pnl.grossProfit, color: pnl.grossProfit >= 0 ? "blue" : "red" },
    { label: "Net Profit", value: pnl.netProfit, color: pnl.netProfit >= 0 ? "teal" : "red" },
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
        {steps.map((step) => (
          <div key={step.label} className={`waterfall-step tone-${step.color}`}>
            <div className="waterfall-bar-wrap">
              <span style={{ "--bar-height": `${Math.max((Math.abs(step.value) / max) * 100, 6)}%` }} />
            </div>
            <strong>{formatCurrency(step.value)}</strong>
            <small>{step.label}</small>
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
    { key: "revenue", label: "Revenue", color: "#16a34a" },
    { key: "totalCost", label: "Total Cost", color: "#ef4444" },
    { key: "grossProfit", label: "Gross Profit", color: "#2563eb" },
    { key: "netProfit", label: "Net Profit", color: "#0f766e" },
  ];
  const values = rows.flatMap((row) => series.map((item) => row[item.key] || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const x = (index) => padding.left + (rows.length <= 1 ? innerWidth / 2 : (index / (rows.length - 1)) * innerWidth);
  const y = (value) => padding.top + innerHeight - (((value - min) / range) * innerHeight);
  const pathFor = (key) => rows.map((row, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(row[key] || 0).toFixed(1)}`).join(" ");

  return (
    <article className="surface-card pnl-trend-card">
      <div className="pnl-card-heading">
        <div>
          <p className="eyebrow">Monthly Trend</p>
          <h3>Profitability movement over time</h3>
        </div>
        <div className="pnl-chart-legend">
          {series.map((item) => <span key={item.key} style={{ "--legend-color": item.color }}>{item.label}</span>)}
          <span style={{ "--legend-color": "#d97706" }}>Net Margin %</span>
        </div>
      </div>
      {rows.length ? (
        <svg className="pnl-trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly profitability trend">
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
            <path key={item.key} d={pathFor(item.key)} style={{ "--line-color": item.color }} />
          ))}
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
  const [revenueBasis, setRevenueBasis] = useState("approved");
  const [drilldownCostCenter, setDrilldownCostCenter] = useState("");
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

    const glMap = new Map();
    for (const entry of contextRows) {
      if (entry.type !== "spent") continue;
      const current = glMap.get(entry.glName) || { glName: entry.glName || "Unclassified", amount: 0, monthly: new Map() };
      current.amount += entry.amount || 0;
      current.monthly.set(entry.period, (current.monthly.get(entry.period) || 0) + (entry.amount || 0));
      glMap.set(current.glName, current);
    }
    const glRows = [...glMap.values()]
      .map((row) => {
        const periods = [...row.monthly.keys()].sort();
        const current = row.monthly.get(periods.at(-1)) || 0;
        const previous = row.monthly.get(periods.at(-2)) || 0;
        return {
          glName: row.glName,
          amount: roundCurrency(row.amount),
          totalCostShare: getShare(row.amount, pnl.isCostCenterLevel ? pnl.updatedCost : pnl.totalCost),
          monthMovement: getTrend(current, previous),
          costToRevenueImpact: getShare(row.amount, pnl.isCostCenterLevel ? pnl.updatedRevenue : pnl.revenue),
        };
      })
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

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

    return {
      pnl,
      monthlyTrend,
      glRows,
      costCenterRows,
      cnBreakdown: [...cnCategoryMap.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
      transactions,
    };
  }, [filters, revenueBasis, selectedCostCenter]);

  const kpiCards = [
    { icon: "approve", label: "Revenue", value: formatCurrency(analysis.pnl.isCostCenterLevel ? analysis.pnl.updatedRevenue : analysis.pnl.revenue), context: revenueBasisLabel, tone: "green" },
    { icon: "spending", label: "Total Cost", value: formatCurrency(analysis.pnl.isCostCenterLevel ? analysis.pnl.updatedCost : analysis.pnl.totalCost), context: analysis.pnl.isCostCenterLevel ? "Spent + received CN" : "Spent report only", tone: "red" },
    { icon: "pnl", label: "Gross Profit", value: formatCurrency(analysis.pnl.grossProfit), context: "AFP less spent cost", tone: analysis.pnl.grossProfit >= 0 ? "blue" : "red" },
    ...(analysis.pnl.isCostCenterLevel ? [{ icon: "credit", label: "Credit Notes Adjustment", value: formatCurrency(analysis.pnl.creditNotesAdjustment), context: "Issued less received CN", tone: "amber" }] : []),
    { icon: "net", label: "Net Profit", value: formatCurrency(analysis.pnl.netProfit), context: analysis.pnl.isCostCenterLevel ? "CN-adjusted result" : "Clean high-level total", tone: analysis.pnl.netProfit >= 0 ? "teal" : "red" },
    { icon: "executive", label: "Net Margin %", value: formatPercent(analysis.pnl.netMargin), context: "Net profit / revenue", tone: analysis.pnl.netMargin >= 10 ? "green" : "amber" },
    { icon: "costCenter", label: "Cost-to-Revenue %", value: formatPercent(analysis.pnl.costToRevenue), context: "Cost discipline ratio", tone: analysis.pnl.costToRevenue <= 90 ? "blue" : "red" },
  ];

  return (
    <section className="page-stack pnl-page">
      <div className="page-heading pnl-heading">
        <div>
          <p className="eyebrow">Detailed Financial Analysis</p>
          <h2>Profit & Loss Analysis</h2>
          <p>Revenue, cost, margin, Credit Note impact, GL cost drivers, and cost-center profitability drilldown.</p>
        </div>
        <RevenueBasisToggle revenueBasis={revenueBasis} onChange={setRevenueBasis} />
      </div>

      <section className="pnl-kpi-grid" aria-label="P&L KPI summary">
        {kpiCards.map((card) => <PnlKpiCard key={card.label} {...card} />)}
      </section>

      <section className="pnl-main-grid">
        <PnlStatement pnl={analysis.pnl} />
        <WaterfallChart pnl={analysis.pnl} />
      </section>

      <MonthlyTrendChart rows={analysis.monthlyTrend} />

      <section className="pnl-table-grid">
        <article className="surface-card">
          <div className="pnl-card-heading">
            <div>
              <p className="eyebrow">Cost Drivers</p>
              <h3>Cost breakdown by GL</h3>
            </div>
          </div>
          <div className="analysis-table-wrap">
            <table className="analysis-table pnl-table">
              <thead>
                <tr>
                  <th>GL Name</th>
                  <th className="is-number">Amount</th>
                  <th className="is-number">% of Total Cost</th>
                  <th className="is-number">Month Movement</th>
                  <th className="is-number">Cost-to-Revenue Impact</th>
                </tr>
              </thead>
              <tbody>
                {analysis.glRows.slice(0, 18).map((row) => (
                  <tr key={row.glName}>
                    <td><strong>{row.glName}</strong></td>
                    <td className="is-number">{formatCurrency(row.amount)}</td>
                    <td className="is-number">{formatPercent(row.totalCostShare)}</td>
                    <td className={`is-number ${row.monthMovement > 0 ? "is-bad" : "is-good"}`}>{formatPercent(row.monthMovement)}</td>
                    <td className="is-number">{formatPercent(row.costToRevenueImpact)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="surface-card">
          <div className="pnl-card-heading">
            <div>
              <p className="eyebrow">Cost Center Profitability</p>
              <h3>Detailed profitability table</h3>
            </div>
            <span>Click a row for drilldown</span>
          </div>
          <div className="analysis-table-wrap">
            <table className="analysis-table pnl-table pnl-cost-center-table">
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Hub</th>
                  <th>Cost Center</th>
                  <th className="is-number">Revenue</th>
                  <th className="is-number">Total Cost</th>
                  <th className="is-number">Gross Profit</th>
                  <th className="is-number">Net Profit</th>
                  <th className="is-number">Net Margin %</th>
                  <th className="is-number">Cost-to-Revenue %</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {analysis.costCenterRows.map((row) => (
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
