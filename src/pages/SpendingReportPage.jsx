import spentReportData from "../data/spentReportData.json";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US");

const formatCurrency = (value) => currencyFormatter.format(value || 0);
const formatNumber = (value) => numberFormatter.format(value || 0);

function MetricCard({ label, value, detail, tone = "default" }) {
  return (
    <article className={`metric-card metric-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
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
  const topCostCenter = byCostCenter[0];
  const topHub = byHub[0];
  const topGlName = byGlName[0];
  const averageTransaction = totals.transactions ? totals.amount / totals.transactions : 0;
  const mappedCostCenters = Math.max(totals.costCenters - totals.unmappedCostCenters, 0);
  const mappingStatus = totals.unmappedCostCenters === 0 ? "All workbook cost centers mapped" : "Needs mapping review";

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
          <span>{mappingStatus}</span>
        </div>

        <div className="kpi-grid spent-kpi-grid">
          <MetricCard
            label="Total Spend"
            value={formatCurrency(totals.amount)}
            detail={`${formatNumber(totals.transactions)} source rows`}
            tone="primary"
          />
          <MetricCard
            label="Latest Period"
            value={latestPeriod?.period || "N/A"}
            detail={latestPeriod ? formatCurrency(latestPeriod.amount) : "No period data"}
          />
          <MetricCard
            label="Top Hub"
            value={topHub?.hub || "N/A"}
            detail={topHub ? formatCurrency(topHub.amount) : "No hub data"}
          />
          <MetricCard
            label="Top Cost Center"
            value={topCostCenter?.costCenter || "N/A"}
            detail={topCostCenter ? `${topCostCenter.hub} | ${formatCurrency(topCostCenter.amount)}` : "No cost center data"}
          />
          <MetricCard
            label="Top GL Name"
            value={topGlName?.glName || "N/A"}
            detail={topGlName ? formatCurrency(topGlName.amount) : "No GL data"}
          />
          <MetricCard
            label="Avg. Row Value"
            value={formatCurrency(averageTransaction)}
            detail="Total spend divided by source rows"
          />
          <MetricCard
            label="Mapped Scope"
            value={`${formatNumber(mappedCostCenters)} / ${formatNumber(totals.costCenters)}`}
            detail={`${formatNumber(totals.hubs)} hubs across ${formatNumber(totals.regions)} regions`}
          />
          <MetricCard
            label="Unmapped"
            value={formatNumber(totals.unmappedCostCenters)}
            detail={mappingStatus}
            tone={totals.unmappedCostCenters === 0 ? "success" : "warning"}
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
