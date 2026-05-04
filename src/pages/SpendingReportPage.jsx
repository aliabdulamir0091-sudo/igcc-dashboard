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

function FinancialKpiCard({ icon, label, value, context, tone = "teal" }) {
  return (
    <article className={`financial-kpi-card tone-${tone}`}>
      <div className="financial-kpi-top">
        <span className="financial-kpi-icon"><Icon name={icon} /></span>
        <span>{context}</span>
      </div>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function MonthlyTrendChart({ rows }) {
  const width = 920;
  const height = 340;
  const padding = { top: 28, right: 28, bottom: 48, left: 64 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const series = [
    { key: "spent", label: "Spent", color: "#0f766e" },
    { key: "submitted", label: "AFP Submitted", color: "#2563eb" },
    { key: "approved", label: "AFP Approved", color: "#d97706" },
  ];
  const maxValue = Math.max(...rows.flatMap((row) => series.map((item) => row[item.key] || 0)), 1);
  const x = (index) => padding.left + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * chartWidth);
  const y = (value) => padding.top + chartHeight - ((value || 0) / maxValue) * chartHeight;
  const buildPath = (key) => rows.map((row, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(row[key]).toFixed(1)}`).join(" ");
  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <article className="surface-card financial-chart-card">
      <div className="chart-header">
        <div>
          <p className="eyebrow">Monthly Trend</p>
          <h3>Spent vs AFP Flow</h3>
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
      <p className="eyebrow">Top Insights</p>
      <h3>Executive Readout</h3>
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

export function SpendingReportPage() {
  const { totals, latestPeriod, monthlyFlow, byCostCenter, byGlName, creditNotes, insights } = financialInputsData;
  const chartRows = monthlyFlow.filter((row) => row.spent || row.submitted || row.approved).slice(-16);
  const topCostCenter = byCostCenter[0];
  const topGlName = byGlName[0];
  const cnShare = getShare(totals.creditNotes, totals.spent);

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
        <FinancialKpiCard icon="spending" label="Total Spent" value={formatCurrency(totals.spent)} context="YTD cost input" tone="teal" />
        <FinancialKpiCard icon="submit" label="AFP Submitted" value={formatCurrency(totals.submitted)} context="YTD submitted" tone="blue" />
        <FinancialKpiCard icon="approve" label="AFP Approved" value={formatCurrency(totals.approved)} context="YTD approved" tone="green" />
        <FinancialKpiCard icon="credit" label="Credit Notes" value={formatCurrency(totals.creditNotes)} context={`${formatPercent(cnShare)} of spent`} tone="amber" />
        <FinancialKpiCard icon="net" label="Net Movement" value={formatCurrency(totals.netMovement)} context="Approved - Spent - CN" tone="slate" />
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
        <article className="surface-card">
          <h3>Top Cost Centers</h3>
          <p>{topCostCenter ? `${topCostCenter.costCenter} is the largest spend input at ${formatPercent(getShare(topCostCenter.spent, totals.spent))}.` : "Largest mapped spend by cost center."}</p>
          <SummaryTable
            rows={byCostCenter.slice(0, 10)}
            columns={[
              { key: "costCenter", label: "Cost Center" },
              { key: "hub", label: "Hub" },
              { key: "spent", label: "Spent", align: "right", render: (row) => formatCurrency(row.spent) },
              { key: "approved", label: "Approved", align: "right", render: (row) => formatCurrency(row.approved) },
            ]}
          />
        </article>

        <article className="surface-card">
          <h3>Top GL Names</h3>
          <p>{topGlName ? `${topGlName.glName} is the major cost driver at ${formatPercent(getShare(topGlName.amount, totals.spent))}.` : "Largest GL categories charged across cost centers."}</p>
          <SummaryTable
            rows={byGlName.slice(0, 10)}
            columns={[
              { key: "glName", label: "GL Name" },
              { key: "count", label: "Rows", align: "right", render: (row) => formatNumber(row.count) },
              { key: "amount", label: "Spent", align: "right", render: (row) => formatCurrency(row.amount) },
            ]}
          />
        </article>
      </div>

      {latestPeriod && (
        <section className="surface-card latest-input-card">
          <p className="eyebrow">Latest Input Month</p>
          <h3>{latestPeriod.period}</h3>
          <div>
            <span>Spent {formatCurrency(latestPeriod.spent)}</span>
            <span>Submitted {formatCurrency(latestPeriod.submitted)}</span>
            <span>Approved {formatCurrency(latestPeriod.approved)}</span>
            <span>CN {formatCurrency(latestPeriod.creditNotes)}</span>
          </div>
        </section>
      )}
    </section>
  );
}
