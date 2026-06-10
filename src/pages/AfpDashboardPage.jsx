import { useEffect, useMemo, useState } from "react";

import { Icon } from "../components/Icons";
import { getAfpDashboardData } from "../services/afp/afpDashboardService";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const formatCurrency = (value) => currencyFormatter.format(value || 0);
const formatPercent = (value) => `${percentFormatter.format(value || 0)}%`;
const formatDateTime = (value) => {
  if (!value) return "Not loaded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

function AfpKpiCard({ icon, label, value, context, tone = "blue" }) {
  return (
    <article className={`financial-kpi-card afp-kpi-card tone-${tone}`}>
      <div className="financial-kpi-top">
        <span className="financial-kpi-icon"><Icon name={icon} /></span>
        <span>{context}</span>
      </div>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function AfpStatusTable({ rows }) {
  return (
    <article className="surface-card afp-table-card">
      <div className="chart-header">
        <div>
          <p className="eyebrow">Status</p>
          <h3>AFP Status Breakdown</h3>
        </div>
      </div>
      <div className="analysis-table-wrap">
        <table className="analysis-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>AFP Count</th>
              <th>Submitted Value</th>
              <th>Approved Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.status}>
                <td><strong>{row.status}</strong></td>
                <td className="is-number">{row.count}</td>
                <td className="is-number">{formatCurrency(row.submittedValue)}</td>
                <td className="is-number">{formatCurrency(row.approvedValue)}</td>
              </tr>
            )) : (
              <tr><td className="pnl-empty-table-cell" colSpan={4}>No AFP records loaded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function AfpHubTable({ rows }) {
  return (
    <article className="surface-card afp-table-card">
      <div className="chart-header">
        <div>
          <p className="eyebrow">Hub Unit</p>
          <h3>AFP Value by Hub</h3>
        </div>
      </div>
      <div className="analysis-table-wrap">
        <table className="analysis-table">
          <thead>
            <tr>
              <th>Hub / Unit</th>
              <th>AFP Count</th>
              <th>Submitted</th>
              <th>Approved</th>
              <th>Pending</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.hub}>
                <td><strong>{row.hub}</strong></td>
                <td className="is-number">{row.count}</td>
                <td className="is-number">{formatCurrency(row.submittedValue)}</td>
                <td className="is-number">{formatCurrency(row.approvedValue)}</td>
                <td className="is-number">{formatCurrency(row.pendingValue)}</td>
              </tr>
            )) : (
              <tr><td className="pnl-empty-table-cell" colSpan={5}>No AFP records loaded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function AfpRecentTable({ records }) {
  const rows = useMemo(() => [...records]
    .sort((a, b) => String(b.submitted_date).localeCompare(String(a.submitted_date)))
    .slice(0, 12), [records]);

  return (
    <article className="surface-card afp-table-card afp-recent-card">
      <div className="chart-header">
        <div>
          <p className="eyebrow">Records</p>
          <h3>Latest AFP Records</h3>
        </div>
      </div>
      <div className="analysis-table-wrap">
        <table className="analysis-table">
          <thead>
            <tr>
              <th>AFP No</th>
              <th>Description</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Approved</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={`${row.afp_no}-${row.row_number}`}>
                <td><strong>{row.afp_no || "-"}</strong><span>{row.submitted_date || "No date"}</span></td>
                <td><strong>{row.description || "-"}</strong><span>{row.cost_center || row.hub_unit || "Unassigned"}</span></td>
                <td><span className="pnl-status">{row.status || "Pending"}</span></td>
                <td className="is-number">{formatCurrency(row.submitted_value)}</td>
                <td className="is-number">{formatCurrency(row.approved_value)}</td>
              </tr>
            )) : (
              <tr><td className="pnl-empty-table-cell" colSpan={5}>No AFP records loaded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function AfpDashboardPage() {
  const [dashboardData, setDashboardData] = useState({
    records: [],
    totals: {
      submittedValue: 0,
      approvedValue: 0,
      pendingValue: 0,
      approvalPercent: 0,
      afpCount: 0,
      approvedCount: 0,
      pendingCount: 0,
    },
    byStatus: [],
    byHub: [],
    loadedAt: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError("");

    getAfpDashboardData()
      .then((data) => {
        if (!isMounted) return;
        setDashboardData(data);
      })
      .catch((loadError) => {
        if (!isMounted) return;
        setError(loadError.message || "Unable to load AFP_MASTER.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const { totals, byStatus, byHub, records, loadedAt } = dashboardData;

  return (
    <section className="page-stack financial-inputs-page afp-dashboard-page">
      <div className="page-heading financial-story-heading">
        <p className="eyebrow">AFP Master</p>
        <h2>AFP Dashboard</h2>
        <p>Live read from AFP_MASTER in Google Sheets. The data service is separated so Supabase can replace the source later without changing this page.</p>
      </div>

      {error ? <section className="afp-load-error">{error}</section> : null}

      <section className="afp-source-strip" aria-label="AFP source status">
        <span><Icon name="download" /> Google Sheets</span>
        <strong>{isLoading ? "Loading AFP_MASTER" : `${records.length} records loaded`}</strong>
        <time>{formatDateTime(loadedAt)}</time>
      </section>

      <section className="financial-kpi-grid afp-kpi-grid" aria-label="AFP KPI summary">
        <AfpKpiCard icon="submit" label="Submitted Value" value={formatCurrency(totals.submittedValue)} context="AFP_MASTER total" tone="green" />
        <AfpKpiCard icon="approve" label="Approved Value" value={formatCurrency(totals.approvedValue)} context={`${totals.approvedCount} approved`} tone="blue" />
        <AfpKpiCard icon="calendar" label="Pending Value" value={formatCurrency(totals.pendingValue)} context={`${totals.pendingCount} pending`} tone="amber" />
        <AfpKpiCard icon="net" label="Approval %" value={formatPercent(totals.approvalPercent)} context="Approved / submitted" tone="purple" />
        <AfpKpiCard icon="folder" label="AFP Count" value={totals.afpCount.toLocaleString("en-US")} context="Total records" tone="slate" />
      </section>

      <div className="afp-main-grid">
        <AfpStatusTable rows={byStatus} />
        <AfpHubTable rows={byHub} />
      </div>

      <AfpRecentTable records={records} />
    </section>
  );
}
