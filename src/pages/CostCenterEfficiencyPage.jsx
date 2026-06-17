import { Icon } from "../components/Icons";
import { ALL_FILTER_VALUE, matchesCostCenterFilter } from "../data/costCenterHierarchy";
import { useAfpFinancialInputs } from "../hooks/useAfpFinancialInputs";

const STAFF_TARGET = 35;
const TOTAL_LABOR_TARGET = 65;
const MARGIN_TARGET = 10;
const LABOR_RATIO_TARGET = 1.5;

const CURRENCY_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const MONTHS = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  10: "Oct",
  11: "Nov",
  12: "Dec",
};

const formatCurrency = (value) => CURRENCY_FORMAT.format(value || 0);
const formatNumber = (value) => NUMBER_FORMAT.format(value || 0);
const formatPercent = (value) => `${formatNumber(value)}%`;
const roundCurrency = (value) => Math.round(((value || 0) + Number.EPSILON) * 100) / 100;
const getShare = (value, total) => (total ? ((value || 0) / total) * 100 : 0);
const getRatio = (revenue, cost) => (cost ? (revenue || 0) / cost : 0);
const getQuarter = (period) => `Q${Math.ceil(Number(period?.slice(5, 7) || 1) / 3)}`;

const matchesPortfolio = (entry, portfolio) => (
  !portfolio
  || portfolio === ALL_FILTER_VALUE
  || (portfolio === "basra" && entry.region === "Basra")
  || (portfolio === "kirkuk" && entry.region === "Kirkuk")
  || (portfolio === "head-office" && entry.hub === "Head Office")
);

const matchesFilters = (entry, filters = {}) => (
  matchesPortfolio(entry, filters.portfolio)
  && (!filters.hub || filters.hub === ALL_FILTER_VALUE || entry.hub === filters.hub)
  && matchesCostCenterFilter(entry.costCenter, filters.costCenter)
  && (!filters.year || filters.year === ALL_FILTER_VALUE || entry.year === filters.year)
  && (filters.period !== "monthly" || !filters.month || filters.month === ALL_FILTER_VALUE || entry.month === filters.month)
  && (filters.period !== "quarterly" || !filters.quarter || filters.quarter === ALL_FILTER_VALUE || getQuarter(entry.period) === filters.quarter)
);

const isStaffSalary = (entry) => String(entry.glName || "").toLowerCase().includes("staff salary");
const isSubcontractorUnitRate = (entry) => String(entry.glName || "").toLowerCase().includes("subcontractor");
const isThirdPartyManpower = (entry) => String(entry.glName || "").toLowerCase().includes("third party manpower");
const isWorkshopCharge = (entry) => (
  String(entry.category || "").toLowerCase().includes("workshop")
  || String(entry.glName || "").toLowerCase().includes("workshop")
);

const createRow = (entry) => ({
  costCenter: entry.costCenter || "Unassigned",
  businessUnit: entry.hub || "Unassigned",
  month: entry.month || MONTHS[entry.period?.slice(5, 7)] || "All",
  revenue: 0,
  staffSalary: 0,
  workshopCharges: 0,
  subcontractorUnitRate: 0,
  thirdPartyManpower: 0,
  totalCost: 0,
});

const finalizeRow = (row) => {
  const externalLaborCost = row.workshopCharges + row.subcontractorUnitRate + row.thirdPartyManpower;
  const totalLaborCost = row.staffSalary + externalLaborCost;
  const pnlMargin = getShare(row.revenue - row.totalCost, row.revenue);

  return {
    ...row,
    revenue: roundCurrency(row.revenue),
    staffSalary: roundCurrency(row.staffSalary),
    workshopCharges: roundCurrency(row.workshopCharges),
    subcontractorUnitRate: roundCurrency(row.subcontractorUnitRate),
    thirdPartyManpower: roundCurrency(row.thirdPartyManpower),
    totalCost: roundCurrency(row.totalCost),
    externalLaborCost: roundCurrency(externalLaborCost),
    totalLaborCost: roundCurrency(totalLaborCost),
    staffSalaryPercent: getShare(row.staffSalary, row.revenue),
    externalLaborPercent: getShare(externalLaborCost, row.revenue),
    totalLaborPercent: getShare(totalLaborCost, row.revenue),
    workshopPercent: getShare(row.workshopCharges, row.revenue),
    subcontractorPercent: getShare(row.subcontractorUnitRate, row.revenue),
    thirdPartyManpowerPercent: getShare(row.thirdPartyManpower, row.revenue),
    revenueToStaffRatio: getRatio(row.revenue, row.staffSalary),
    revenueToTotalLaborRatio: getRatio(row.revenue, totalLaborCost),
    pnlMargin,
  };
};

const buildEfficiencyRows = (entries = [], filters = {}) => {
  const filteredEntries = entries.filter((entry) => matchesFilters(entry, filters));
  const rowMap = new Map();

  for (const entry of filteredEntries) {
    const key = `${entry.costCenter || "Unassigned"}|${entry.hub || "Unassigned"}`;
    const row = rowMap.get(key) || createRow(entry);
    if (entry.type === "approved") row.revenue += entry.amount || 0;
    if (entry.type === "spent" || entry.type === "creditNotes") row.totalCost += entry.amount || 0;
    if (entry.type === "spent" && isStaffSalary(entry)) row.staffSalary += entry.amount || 0;
    if (entry.type === "spent" && isSubcontractorUnitRate(entry)) row.subcontractorUnitRate += entry.amount || 0;
    if (entry.type === "spent" && isThirdPartyManpower(entry)) row.thirdPartyManpower += entry.amount || 0;
    if (entry.type === "creditNotes" && isWorkshopCharge(entry)) row.workshopCharges += entry.amount || 0;
    rowMap.set(key, row);
  }

  return [...rowMap.values()]
    .map(finalizeRow)
    .filter((row) => row.revenue || row.staffSalary || row.externalLaborCost || row.totalLaborCost)
    .sort((a, b) => a.businessUnit.localeCompare(b.businessUnit) || a.costCenter.localeCompare(b.costCenter));
};

const summarizeRows = (rows) => {
  const totals = rows.reduce((sum, row) => ({
    revenue: sum.revenue + row.revenue,
    staffSalary: sum.staffSalary + row.staffSalary,
    workshopCharges: sum.workshopCharges + row.workshopCharges,
    subcontractorUnitRate: sum.subcontractorUnitRate + row.subcontractorUnitRate,
    thirdPartyManpower: sum.thirdPartyManpower + row.thirdPartyManpower,
    externalLaborCost: sum.externalLaborCost + row.externalLaborCost,
    totalLaborCost: sum.totalLaborCost + row.totalLaborCost,
    pnlMarginTotal: sum.pnlMarginTotal + row.pnlMargin,
  }), {
    revenue: 0,
    staffSalary: 0,
    workshopCharges: 0,
    subcontractorUnitRate: 0,
    thirdPartyManpower: 0,
    externalLaborCost: 0,
    totalLaborCost: 0,
    pnlMarginTotal: 0,
  });

  return {
    ...totals,
    staffSalaryPercent: getShare(totals.staffSalary, totals.revenue),
    externalLaborPercent: getShare(totals.externalLaborCost, totals.revenue),
    totalLaborPercent: getShare(totals.totalLaborCost, totals.revenue),
    averagePnlMargin: rows.length ? totals.pnlMarginTotal / rows.length : 0,
  };
};

const toExportRows = (rows) => rows.map((row) => ({
  "Cost Center": row.costCenter,
  "Business Unit": row.businessUnit,
  Revenue: roundCurrency(row.revenue),
  "Staff Salary & Compensation": roundCurrency(row.staffSalary),
  "Workshop Charges / Credit Notes": roundCurrency(row.workshopCharges),
  "Subcontractor Unit Rate Works": roundCurrency(row.subcontractorUnitRate),
  "Third-Party Manpower Cost": roundCurrency(row.thirdPartyManpower),
  "External Labor Cost": roundCurrency(row.externalLaborCost),
  "Total Labor Cost": roundCurrency(row.totalLaborCost),
  "Staff Salary % of Revenue": roundCurrency(row.staffSalaryPercent),
  "External Labor % of Revenue": roundCurrency(row.externalLaborPercent),
  "Total Labor % of Revenue": roundCurrency(row.totalLaborPercent),
  "Revenue to Staff Salary Ratio": roundCurrency(row.revenueToStaffRatio),
  "Revenue to Total Labor Ratio": roundCurrency(row.revenueToTotalLaborRatio),
  "P&L Margin %": roundCurrency(row.pnlMargin),
}));

function KpiCard({ label, value, tone = "blue", isPercent = false }) {
  return (
    <article className={`efficiency-kpi-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{isPercent ? formatPercent(value) : formatCurrency(value)}</strong>
    </article>
  );
}

function ComparisonChart({ rows }) {
  const visibleRows = rows
    .filter((row) => row.revenue || row.totalLaborCost)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12);
  const maxValue = Math.max(...visibleRows.flatMap((row) => [row.revenue, row.staffSalary, row.externalLaborCost, row.totalLaborCost]), 1);

  return (
    <article className="surface-card efficiency-chart-card">
      <div className="efficiency-card-heading">
        <h3>Cost Comparison</h3>
        <span>Revenue vs salary and external labor by cost center</span>
      </div>
      <div className="efficiency-bar-legend">
        <span className="is-revenue">Revenue</span>
        <span className="is-staff">Staff Salary</span>
        <span className="is-external">External Labor</span>
        <span className="is-total">Total Labor</span>
      </div>
      <div className="efficiency-comparison-chart">
        {visibleRows.map((row) => (
          <div key={row.costCenter} className="efficiency-comparison-row">
            <strong>{row.costCenter}</strong>
            <div>
              <span className="is-revenue" style={{ "--bar-width": `${(row.revenue / maxValue) * 100}%` }} />
              <span className="is-staff" style={{ "--bar-width": `${(row.staffSalary / maxValue) * 100}%` }} />
              <span className="is-external" style={{ "--bar-width": `${(row.externalLaborCost / maxValue) * 100}%` }} />
              <span className="is-total" style={{ "--bar-width": `${(row.totalLaborCost / maxValue) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function ExternalBreakdown({ rows }) {
  const visibleRows = rows
    .filter((row) => row.externalLaborCost)
    .sort((a, b) => b.externalLaborCost - a.externalLaborCost)
    .slice(0, 12);

  return (
    <article className="surface-card efficiency-chart-card">
      <div className="efficiency-card-heading">
        <h3>External Labor Breakdown</h3>
        <span>Workshop, subcontractor unit rate, and third-party manpower</span>
      </div>
      <div className="efficiency-stack-list">
        {visibleRows.map((row) => {
          const workshop = getShare(row.workshopCharges, row.externalLaborCost);
          const subcontractor = getShare(row.subcontractorUnitRate, row.externalLaborCost);
          const manpower = Math.max(0, 100 - workshop - subcontractor);
          return (
            <div key={row.costCenter}>
              <p><strong>{row.costCenter}</strong><span>{formatCurrency(row.externalLaborCost)}</span></p>
              <div className="efficiency-stack-bar">
                <i className="is-workshop" style={{ "--segment-width": `${workshop}%` }} />
                <i className="is-subcontractor" style={{ "--segment-width": `${subcontractor}%` }} />
                <i className="is-manpower" style={{ "--segment-width": `${manpower}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function RankingTable({ title, rows, valueKey, formatter = formatPercent, toneKey }) {
  return (
    <article className="surface-card efficiency-ranking-card">
      <h3>{title}</h3>
      <div>
        {rows.map((row, index) => (
          <p key={`${title}-${row.costCenter}`}>
            <span>{index + 1}</span>
            <strong>{row.costCenter}</strong>
            <em className={toneKey ? row[toneKey] : ""}>{formatter(row[valueKey])}</em>
          </p>
        ))}
      </div>
    </article>
  );
}

export function CostCenterEfficiencyPage({ filters = {} }) {
  const { entries, isLoadingAfpMaster, isLoadingSpentReport, isLoadingCreditNotes } = useAfpFinancialInputs();
  const rows = buildEfficiencyRows(entries, filters);
  const summary = summarizeRows(rows);
  const maxLaborPercent = [...rows].sort((a, b) => b.totalLaborPercent - a.totalLaborPercent)[0]?.totalLaborPercent || 0;
  const isLoading = isLoadingAfpMaster || isLoadingSpentReport || isLoadingCreditNotes;

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(toExportRows(rows));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cost Center Efficiency");
    XLSX.writeFile(workbook, "cost-center-efficiency-dashboard.xlsx");
  };

  return (
    <section className="page-stack efficiency-page">
      <div className="efficiency-header">
        <div>
          <p className="eyebrow">Management Dashboard</p>
          <h2>Cost Center Efficiency Dashboard</h2>
          <p>Factual revenue, staff salary, external labor, and margin indicators by cost center.</p>
        </div>
        <div className="efficiency-actions">
          <button type="button" onClick={exportExcel}><Icon name="download" /> Excel</button>
          <button type="button" onClick={() => window.print()}><Icon name="spending" /> PDF</button>
        </div>
      </div>

      <section className="efficiency-kpi-grid" aria-label="Cost center efficiency KPI summary">
        <KpiCard label="Total Revenue" value={summary.revenue} tone="green" />
        <KpiCard label="Staff Salary & Compensation" value={summary.staffSalary} tone="blue" />
        <KpiCard label="Workshop / Credit Notes" value={summary.workshopCharges} tone="amber" />
        <KpiCard label="Subcontractor Unit Rate" value={summary.subcontractorUnitRate} tone="purple" />
        <KpiCard label="Third-Party Manpower" value={summary.thirdPartyManpower} tone="slate" />
        <KpiCard label="External Labor Cost" value={summary.externalLaborCost} tone="teal" />
        <KpiCard label="Total Labor Cost" value={summary.totalLaborCost} tone="red" />
        <KpiCard label="Staff Salary % of Revenue" value={summary.staffSalaryPercent} tone="blue" isPercent />
        <KpiCard label="External Labor % of Revenue" value={summary.externalLaborPercent} tone="teal" isPercent />
        <KpiCard label="Total Labor % of Revenue" value={summary.totalLaborPercent} tone={summary.totalLaborPercent > TOTAL_LABOR_TARGET ? "red" : "green"} isPercent />
        <KpiCard label="Average P&L Margin" value={summary.averagePnlMargin} tone={summary.averagePnlMargin < MARGIN_TARGET ? "red" : "green"} isPercent />
      </section>

      <section className="efficiency-visual-grid">
        <ComparisonChart rows={rows} />
        <ExternalBreakdown rows={rows} />
      </section>

      <section className="efficiency-ranking-grid">
        <RankingTable
          title="Highest Staff Salary % of Revenue"
          rows={[...rows].sort((a, b) => b.staffSalaryPercent - a.staffSalaryPercent).slice(0, 8)}
          valueKey="staffSalaryPercent"
        />
        <RankingTable
          title="Highest Total Labor % of Revenue"
          rows={[...rows].sort((a, b) => b.totalLaborPercent - a.totalLaborPercent).slice(0, 8)}
          valueKey="totalLaborPercent"
        />
        <RankingTable
          title="Lowest P&L Margin %"
          rows={[...rows].sort((a, b) => a.pnlMargin - b.pnlMargin).slice(0, 8)}
          valueKey="pnlMargin"
        />
        <RankingTable
          title="Highest External Labor Cost"
          rows={[...rows].sort((a, b) => b.externalLaborCost - a.externalLaborCost).slice(0, 8)}
          valueKey="externalLaborCost"
          formatter={formatCurrency}
        />
      </section>

      <article className="surface-card efficiency-table-card">
        <div className="efficiency-card-heading">
          <h3>Main Dashboard Table</h3>
          <span>{rows.length} cost centers | Total labor max {formatPercent(maxLaborPercent)}</span>
        </div>
        <div className="efficiency-table-wrap">
          <table className="efficiency-table">
            <thead>
              <tr>
                <th>Cost Center</th>
                <th>Business Unit</th>
                <th className="is-number">Revenue</th>
                <th className="is-number">Staff Salary & Compensation</th>
                <th className="is-number">Workshop Charges / CN</th>
                <th className="is-number">Subcontractor Unit Rate</th>
                <th className="is-number">Third-Party Manpower</th>
                <th className="is-number">External Labor</th>
                <th className="is-number">Total Labor</th>
                <th className="is-number">Staff Salary %</th>
                <th className="is-number">External Labor %</th>
                <th className="is-number">Total Labor %</th>
                <th className="is-number">Revenue / Staff</th>
                <th className="is-number">Revenue / Labor</th>
                <th className="is-number">P&L Margin %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.businessUnit}-${row.costCenter}`}
                  className={[
                    row.staffSalaryPercent > STAFF_TARGET ? "has-staff-warning" : "",
                    row.totalLaborPercent > TOTAL_LABOR_TARGET ? "has-labor-warning" : "",
                    row.pnlMargin < MARGIN_TARGET ? "has-margin-warning" : "",
                    row.revenueToTotalLaborRatio && row.revenueToTotalLaborRatio < LABOR_RATIO_TARGET ? "has-ratio-warning" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <td><strong>{row.costCenter}</strong></td>
                  <td>{row.businessUnit}</td>
                  <td className="is-number">{formatCurrency(row.revenue)}</td>
                  <td className="is-number">{formatCurrency(row.staffSalary)}</td>
                  <td className="is-number">{formatCurrency(row.workshopCharges)}</td>
                  <td className="is-number">{formatCurrency(row.subcontractorUnitRate)}</td>
                  <td className="is-number">{formatCurrency(row.thirdPartyManpower)}</td>
                  <td className="is-number">{formatCurrency(row.externalLaborCost)}</td>
                  <td className="is-number">{formatCurrency(row.totalLaborCost)}</td>
                  <td className="is-number">{formatPercent(row.staffSalaryPercent)}</td>
                  <td className="is-number">{formatPercent(row.externalLaborPercent)}</td>
                  <td className="is-number">{formatPercent(row.totalLaborPercent)}</td>
                  <td className="is-number">{formatNumber(row.revenueToStaffRatio)}</td>
                  <td className="is-number">{formatNumber(row.revenueToTotalLaborRatio)}</td>
                  <td className="is-number">{formatPercent(row.pnlMargin)}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={15} className="efficiency-empty-cell">
                    {isLoading ? "Loading live financial inputs..." : "No cost center efficiency data matches the selected filters."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
