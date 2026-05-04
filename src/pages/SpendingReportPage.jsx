import spentReportData from "../data/spentReportData.json";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US");

const formatCurrency = (value) => currencyFormatter.format(value || 0);
const formatNumber = (value) => numberFormatter.format(value || 0);

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

  return (
    <section className="page-stack">
      <div className="page-heading">
        <p className="eyebrow">GL-based breakdown</p>
        <h2>Spending Report</h2>
        <p>Master spent report loaded from Excel, grouped by mapped cost center, hub, and GL name.</p>
      </div>

      <div className="kpi-grid">
        <article className="metric-card">
          <span>Total Spend</span>
          <strong>{formatCurrency(totals.amount)}</strong>
          <p>{formatNumber(totals.transactions)} source rows</p>
        </article>
        <article className="metric-card">
          <span>Cost Centers</span>
          <strong>{formatNumber(totals.costCenters)}</strong>
          <p>{formatNumber(totals.hubs)} hubs mapped</p>
        </article>
        <article className="metric-card">
          <span>GL Names</span>
          <strong>{formatNumber(totals.glNames)}</strong>
          <p>Normalized GL category names</p>
        </article>
        <article className="metric-card">
          <span>Unmapped</span>
          <strong>{formatNumber(totals.unmappedCostCenters)}</strong>
          <p>Need mapping confirmation</p>
        </article>
      </div>

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
    </section>
  );
}
