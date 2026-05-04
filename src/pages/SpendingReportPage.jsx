import spentReportData from "../data/spentReportData.json";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const formatCurrency = (value) => currencyFormatter.format(value || 0);
const formatNumber = (value) => numberFormatter.format(value || 0);
const formatPercent = (value) => `${percentFormatter.format(value || 0)}%`;

const getShare = (amount, total) => (total ? (amount / total) * 100 : 0);

const getTrend = (current, previous) => {
  if (!previous) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
};

function Sparkline({ values = [] }) {
  const width = 132;
  const height = 42;
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues);
  const min = Math.min(...safeValues);
  const range = max - min || 1;
  const points = safeValues
    .map((value, index) => {
      const x = safeValues.length === 1 ? width : (index / (safeValues.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="metric-sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

function BarsFigure({ values = [] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="metric-bars" aria-hidden="true">
      {values.map((value, index) => (
        <span key={`${value}-${index}`} style={{ "--bar-height": `${Math.max((value / max) * 100, 10)}%` }} />
      ))}
    </div>
  );
}

function MetricCard({ label, value, detail, percent, figure = "spark", figureValues = [], tone = "default" }) {
  return (
    <article className={`metric-card metric-card-${tone}`}>
      <div className="metric-card-top">
        <span>{label}</span>
        <em>{percent}</em>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
      {figure === "bars" ? <BarsFigure values={figureValues} /> : <Sparkline values={figureValues} />}
    </article>
  );
}

function SummaryTable({ columns, rows }) {
  return (
    <div className="report-table-wrap">
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
            <tr key={`${row.costCenter || row.glName || row.hub || row.sourceCostCenter}-${index}`}>
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
  const { totals, byCostCenter, byGlName, byHub, byMonth, unmappedCostCenters } = spentReportData;
  const latestPeriods = byMonth.slice(-6);
  const latestPeriod = byMonth.at(-1);
  const previousPeriod = byMonth.at(-2);
  const topCostCenter = byCostCenter[0];
  const topHub = byHub[0];
  const topGlName = byGlName[0];
  const averageTransaction = totals.transactions ? totals.amount / totals.transactions : 0;
  const monthlyAmounts = latestPeriods.map((period) => Math.abs(period.amount));
  const topHubBars = byHub.slice(0, 6).map((hub) => Math.abs(hub.amount));
  const topCostCenterBars = byCostCenter.slice(0, 6).map((costCenter) => Math.abs(costCenter.amount));
  const topGlBars = byGlName.slice(0, 6).map((glName) => Math.abs(glName.amount));
  const latestTrend = getTrend(latestPeriod?.amount || 0, previousPeriod?.amount || 0);

  return (
    <section className="page-stack">
      <div className="page-heading">
        <p className="eyebrow">GL-based breakdown</p>
        <h2>Spending Report</h2>
        <p>Master spent report loaded from Excel, grouped by mapped cost center, hub, and GL name.</p>
      </div>

      <section className="summary-section" aria-labelledby="spent-key-metrics-title">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Key Metrics</p>
            <h3 id="spent-key-metrics-title">Summary Cards</h3>
          </div>
          <span>Visual spend overview</span>
        </div>

        <div className="kpi-grid spent-kpi-grid">
          <MetricCard
            label="Total Spend"
            value={formatCurrency(totals.amount)}
            detail="Master spent report total"
            percent={latestTrend >= 0 ? `+${formatPercent(latestTrend)}` : formatPercent(latestTrend)}
            figureValues={monthlyAmounts}
            tone="primary"
          />
          <MetricCard
            label="Latest Period"
            value={latestPeriod?.period || "N/A"}
            detail={latestPeriod ? formatCurrency(latestPeriod.amount) : "No period data"}
            percent={latestPeriod ? formatPercent(getShare(latestPeriod.amount, totals.amount)) : "0%"}
            figureValues={monthlyAmounts}
          />
          <MetricCard
            label="Top Hub"
            value={topHub?.hub || "N/A"}
            detail={topHub ? formatCurrency(topHub.amount) : "No hub data"}
            percent={topHub ? formatPercent(getShare(topHub.amount, totals.amount)) : "0%"}
            figure="bars"
            figureValues={topHubBars}
            tone="teal"
          />
          <MetricCard
            label="Top Cost Center"
            value={topCostCenter?.costCenter || "N/A"}
            detail={topCostCenter ? `${topCostCenter.hub} | ${formatCurrency(topCostCenter.amount)}` : "No cost center data"}
            percent={topCostCenter ? formatPercent(getShare(topCostCenter.amount, totals.amount)) : "0%"}
            figure="bars"
            figureValues={topCostCenterBars}
            tone="blue"
          />
          <MetricCard
            label="Top GL Name"
            value={topGlName?.glName || "N/A"}
            detail={topGlName ? formatCurrency(topGlName.amount) : "No GL data"}
            percent={topGlName ? formatPercent(getShare(topGlName.amount, totals.amount)) : "0%"}
            figure="bars"
            figureValues={topGlBars}
            tone="amber"
          />
          <MetricCard
            label="Avg. Row Value"
            value={formatCurrency(averageTransaction)}
            detail="Average transaction value"
            percent={`${formatNumber(totals.costCenters)} cost centers`}
            figureValues={monthlyAmounts.map((amount) => amount / Math.max(totals.transactions, 1))}
            tone="slate"
          />
        </div>
      </section>

      <div className="content-grid">
        <article className="surface-card">
          <h3>Top cost centers</h3>
          <p>Largest mapped spend by cost center from the master spent report.</p>
          <SummaryTable
            rows={byCostCenter.slice(0, 12)}
            columns={[
              { key: "costCenter", label: "Cost Center" },
              { key: "hub", label: "Hub" },
              { key: "count", label: "Rows", align: "right", render: (row) => formatNumber(row.count) },
              { key: "amount", label: "Amount", align: "right", render: (row) => formatCurrency(row.amount) },
            ]}
          />
        </article>

        <article className="surface-card">
          <h3>Top GL names</h3>
          <p>GL categories charged across all cost centers.</p>
          <SummaryTable
            rows={byGlName.slice(0, 12)}
            columns={[
              { key: "glName", label: "GL Name" },
              { key: "count", label: "Rows", align: "right", render: (row) => formatNumber(row.count) },
              { key: "amount", label: "Amount", align: "right", render: (row) => formatCurrency(row.amount) },
            ]}
          />
        </article>
      </div>

      <div className="content-grid">
        <article className="surface-card">
          <h3>Hub summary</h3>
          <p>Spend after applying the cost center hierarchy mapping.</p>
          <SummaryTable
            rows={byHub.slice(0, 10)}
            columns={[
              { key: "region", label: "Region" },
              { key: "hub", label: "Hub" },
              { key: "count", label: "Rows", align: "right", render: (row) => formatNumber(row.count) },
              { key: "amount", label: "Amount", align: "right", render: (row) => formatCurrency(row.amount) },
            ]}
          />
        </article>

        <article className="surface-card">
          <h3>Recent monthly movement</h3>
          <p>Latest six periods available in the workbook.</p>
          <SummaryTable
            rows={latestPeriods}
            columns={[
              { key: "period", label: "Period" },
              { key: "count", label: "Rows", align: "right", render: (row) => formatNumber(row.count) },
              { key: "amount", label: "Amount", align: "right", render: (row) => formatCurrency(row.amount) },
            ]}
          />
        </article>
      </div>

      {unmappedCostCenters.length > 0 && (
        <article className="surface-card">
          <h3>Cost centers not mapped</h3>
          <p>These workbook `Level 2` values were not in the hierarchy or a clear alias, so I left them unmapped.</p>
          <SummaryTable
            rows={unmappedCostCenters}
            columns={[
              { key: "sourceCostCenter", label: "Workbook Cost Center" },
              { key: "count", label: "Rows", align: "right", render: (row) => formatNumber(row.count) },
              { key: "amount", label: "Amount", align: "right", render: (row) => formatCurrency(row.amount) },
            ]}
          />
        </article>
      )}
    </section>
  );
}
