const roundCurrency = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const statusKey = (status) => String(status || "Pending").trim().toLowerCase();

export function calculateAfpKpis(records) {
  const totals = records.reduce((summary, record) => {
    summary.submittedValue += record.submitted_value || 0;
    summary.approvedValue += record.approved_value || 0;
    summary.afpCount += 1;
    if (statusKey(record.status).includes("approved")) summary.approvedCount += 1;
    return summary;
  }, {
    submittedValue: 0,
    approvedValue: 0,
    pendingValue: 0,
    approvalPercent: 0,
    afpCount: 0,
    approvedCount: 0,
    pendingCount: 0,
  });

  totals.submittedValue = roundCurrency(totals.submittedValue);
  totals.approvedValue = roundCurrency(totals.approvedValue);
  totals.pendingValue = roundCurrency(Math.max(totals.submittedValue - totals.approvedValue, 0));
  totals.approvalPercent = totals.submittedValue ? (totals.approvedValue / totals.submittedValue) * 100 : 0;
  totals.pendingCount = Math.max(totals.afpCount - totals.approvedCount, 0);

  const byStatus = [...records.reduce((map, record) => {
    const status = record.status || "Pending";
    const current = map.get(status) || { status, count: 0, submittedValue: 0, approvedValue: 0 };
    current.count += 1;
    current.submittedValue += record.submitted_value || 0;
    current.approvedValue += record.approved_value || 0;
    map.set(status, current);
    return map;
  }, new Map()).values()]
    .map((row) => ({
      ...row,
      submittedValue: roundCurrency(row.submittedValue),
      approvedValue: roundCurrency(row.approvedValue),
    }))
    .sort((a, b) => b.submittedValue - a.submittedValue);

  const byHub = [...records.reduce((map, record) => {
    const hub = record.hub_unit || "Unassigned";
    const current = map.get(hub) || { hub, count: 0, submittedValue: 0, approvedValue: 0 };
    current.count += 1;
    current.submittedValue += record.submitted_value || 0;
    current.approvedValue += record.approved_value || 0;
    map.set(hub, current);
    return map;
  }, new Map()).values()]
    .map((row) => ({
      ...row,
      submittedValue: roundCurrency(row.submittedValue),
      approvedValue: roundCurrency(row.approvedValue),
      pendingValue: roundCurrency(Math.max(row.submittedValue - row.approvedValue, 0)),
    }))
    .sort((a, b) => b.submittedValue - a.submittedValue);

  return { totals, byStatus, byHub };
}
