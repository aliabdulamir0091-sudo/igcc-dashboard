import financialInputsData from "../data/financialInputsData.json";

const YEAR = "2025";
const QUARTERS = [
  { key: "q1", label: "Q-1", periods: ["2025-01", "2025-02", "2025-03"] },
  { key: "q2", label: "Q-2", periods: ["2025-04", "2025-05", "2025-06"] },
  { key: "q3", label: "Q-3", periods: ["2025-07", "2025-08", "2025-09"] },
  { key: "q4", label: "Q-4", periods: ["2025-10", "2025-11", "2025-12"] },
];

const isHeadOffice = (entry) => entry.hub === "Head Office" || entry.costCenter === "HO_SB_23";

const formatWholeNumber = (value) => Math.round(value || 0).toLocaleString("en-US");

const formatPercent = (value) => `${Math.round(value || 0)}%`;

const getShare = (value, revenue) => (revenue ? (value / revenue) * 100 : 0);

const createEmptySummary = () => ({
  revenue: 0,
  directCost: 0,
  overhead: 0,
  grossProfit: 0,
  totalCost: 0,
  netProfit: 0,
});

const sumRows = (rows, predicate) => rows.reduce((total, row) => (
  predicate(row) ? total + (Number(row.amount) || 0) : total
), 0);

const buildIgccSummary = () => {
  const entries = financialInputsData.entries || [];
  const yearRows = entries.filter((entry) => entry.year === YEAR);
  const byQuarter = {};

  for (const quarter of QUARTERS) {
    const rows = yearRows.filter((entry) => quarter.periods.includes(entry.period));
    const revenue = sumRows(rows, (entry) => entry.type === "approved");
    const directCost = sumRows(rows, (entry) => entry.type === "spent" && !isHeadOffice(entry));
    const overhead = sumRows(rows, (entry) => entry.type === "spent" && isHeadOffice(entry));
    const totalCost = directCost + overhead;
    byQuarter[quarter.key] = {
      revenue,
      directCost,
      overhead,
      grossProfit: revenue - directCost,
      totalCost,
      netProfit: revenue - totalCost,
    };
  }

  const yearTotal = QUARTERS.reduce((total, quarter) => {
    const summary = byQuarter[quarter.key] || createEmptySummary();
    return {
      revenue: total.revenue + summary.revenue,
      directCost: total.directCost + summary.directCost,
      overhead: total.overhead + summary.overhead,
      grossProfit: total.grossProfit + summary.grossProfit,
      totalCost: total.totalCost + summary.totalCost,
      netProfit: total.netProfit + summary.netProfit,
    };
  }, createEmptySummary());

  return { byQuarter, yearTotal };
};

function SummaryValue({ value, isPercent = false, tone }) {
  const className = tone || (value < 0 ? "is-negative" : "");
  return (
    <td className={`is-number ${className}`}>
      {isPercent ? formatPercent(value) : formatWholeNumber(value)}
    </td>
  );
}

export function ExecutiveCockpitPage() {
  const { byQuarter, yearTotal } = buildIgccSummary();
  const rows = [
    { label: "Total Revenue (Approved AFP)", key: "revenue", highlight: true },
    { label: "Direct Cost", key: "directCost" },
    { label: "Gross Profit", key: "grossProfit", highlight: true },
    { label: "Overhead (Head Office)", key: "overhead" },
    { label: "Total Cost", key: "totalCost" },
    { label: "Net Profit", key: "netProfit", highlight: true },
  ];

  return (
    <section className="page-stack executive-cockpit-page">
      <div className="page-heading executive-heading">
        <p className="eyebrow">CEO-level dashboard</p>
        <h2>Executive Cockpit</h2>
        <p>IGCC-level financial summary by quarter, based on approved Application for Payment revenue and actual cost.</p>
      </div>

      <article className="surface-card executive-summary-card">
        <div className="executive-table-title">
          <h3>1- IGCC-Level Summary</h3>
          <span>Year {YEAR}</span>
        </div>
        <div className="executive-table-wrap">
          <table className="executive-summary-table">
            <thead>
              <tr>
                <th>Item</th>
                {QUARTERS.map((quarter) => <th key={quarter.key}>{quarter.label}</th>)}
                <th>Year {YEAR}</th>
                <th>% of Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={row.highlight ? "is-highlight" : ""}>
                  <td>{row.label}</td>
                  {QUARTERS.map((quarter) => (
                    <SummaryValue key={quarter.key} value={byQuarter[quarter.key]?.[row.key] || 0} />
                  ))}
                  <SummaryValue value={yearTotal[row.key]} />
                  <SummaryValue value={getShare(yearTotal[row.key], yearTotal.revenue)} isPercent />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="executive-table-note">Overhead is calculated from Head Office only; all other hubs, including Camp, are treated as direct cost.</p>
      </article>
    </section>
  );
}
