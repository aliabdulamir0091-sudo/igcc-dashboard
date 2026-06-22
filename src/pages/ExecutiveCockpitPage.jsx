import { useState } from "react";
import {
  ALL_FILTER_VALUE,
  BGC_SUB_HUBS,
  COST_CENTER_HIERARCHY,
  ROO_SUB_HUBS,
  getCostCenterFilterMembers,
  getCostCenterGroupValue,
  matchesCostCenterFilter,
} from "../data/costCenterHierarchy";
import { normalizeCostCenterAlias } from "../data/costCenterAliases";
import { useAfpFinancialInputs } from "../hooks/useAfpFinancialInputs";
import igccLogo from "../assets/igcc-logo.svg";

const DEFAULT_YEAR = "2026";
const GENERAL_COST_ALLOCATIONS = [
  { poolCostCenter: "GRLBG_23", hub: "BGC Hub" },
  { poolCostCenter: "GRLRO_23", hub: "ROO Hub" },
];
const GENERAL_POOL_COST_CENTERS = new Set(GENERAL_COST_ALLOCATIONS.map((rule) => rule.poolCostCenter));
const MANAGEMENT_SOURCE_COST_CENTER = "Management";
const HEAD_OFFICE_COST_CENTER = "HO_SB_23";
const HIDDEN_COST_CENTER_ROWS = new Set(["Camp"]);
const EXECUTIVE_HUB_ORDER = [
  "BGC Hub",
  "ROO Hub",
  "Total Hub",
  "BP Hub",
  "Camp",
  "Head Office",
  "West Qurna",
];
const ROO_ASSIGNED_COST_CENTERS = new Set(ROO_SUB_HUBS.flatMap((group) => group.costCenters));
const BGC_ASSIGNED_COST_CENTERS = new Set(BGC_SUB_HUBS.flatMap((group) => group.costCenters));
const COST_CENTER_LOOKUP = new Map(COST_CENTER_HIERARCHY.flatMap((group) => (
  group.costCenters.map((costCenter) => [costCenter, { hub: group.hub, region: group.region }])
)));

const getSelectedYear = (filters = {}) => (
  filters.year && filters.year !== ALL_FILTER_VALUE ? filters.year : DEFAULT_YEAR
);

const hasSelectedYear = (filters = {}) => filters.year && filters.year !== ALL_FILTER_VALUE;

const MONTH_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NO_BY_NAME = Object.fromEntries(MONTH_ORDER.map((month, index) => [month, String(index + 1).padStart(2, "0")]));
const REPORT_COLORS = ["#2563eb", "#14b8a6", "#22c55e", "#f59e0b", "#f97316", "#ef4444", "#7c3aed", "#db2777"];

const getQuarter = (period) => `Q${Math.ceil(Number(period?.slice(5, 7) || 1) / 3)}`;

const formatWholeNumber = (value) => Math.round(value || 0).toLocaleString("en-US");

const formatPercent = (value) => `${Math.round(value || 0)}%`;

const formatSignedChange = (value, suffix = "%") => {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value)}${suffix}`;
};

const formatSignedWholeNumber = (value) => {
  const rounded = Math.round(value || 0);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toLocaleString("en-US")}`;
};

const getShare = (value, revenue) => (revenue ? (value / revenue) * 100 : 0);

const sumRows = (rows, predicate) => rows.reduce((total, row) => (
  predicate(row) ? total + (Number(row.amount) || 0) : total
), 0);

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
  && (ignoreCostCenter || matchesCostCenterFilter(entry.costCenter, filters.costCenter))
  && (!filters.year || filters.year === ALL_FILTER_VALUE || entry.year === filters.year)
  && (filters.period !== "monthly" || !filters.month || filters.month === ALL_FILTER_VALUE || entry.month === filters.month)
  && (filters.period !== "quarterly" || !filters.quarter || filters.quarter === ALL_FILTER_VALUE || getQuarter(entry.period) === filters.quarter)
);

const matchesIssuedCreditNoteFilters = (entry, filters = {}) => {
  const issuedBy = normalizeCostCenter(entry.issuedBy);
  if (!issuedBy || HIDDEN_COST_CENTER_ROWS.has(issuedBy)) return false;
  const issuedHub = getCostCenterHub(issuedBy, entry.hub);
  const issuedMeta = COST_CENTER_LOOKUP.get(issuedBy);
  return entry.type === "creditNotes"
    && !entry.isAllocatedGeneralCreditNote
    && matchesPortfolio({ hub: issuedHub, region: issuedMeta?.region || entry.region }, filters.portfolio)
    && (!filters.hub || filters.hub === ALL_FILTER_VALUE || issuedHub === filters.hub)
    && matchesCostCenterFilter(issuedBy, filters.costCenter)
    && (!filters.year || filters.year === ALL_FILTER_VALUE || entry.year === filters.year)
    && (filters.period !== "monthly" || !filters.month || filters.month === ALL_FILTER_VALUE || entry.month === filters.month)
    && (filters.period !== "quarterly" || !filters.quarter || filters.quarter === ALL_FILTER_VALUE || getQuarter(entry.period) === filters.quarter);
};

const matchesIssuedCreditNoteScope = (entry, members, filters = {}) => (
  members.has(normalizeCostCenter(entry.issuedBy))
  && matchesIssuedCreditNoteFilters(entry, {
    ...filters,
    hub: ALL_FILTER_VALUE,
    costCenter: ALL_FILTER_VALUE,
  })
);

const getHubCostCenters = (hub, poolCostCenter) => (
  COST_CENTER_HIERARCHY.find((group) => group.hub === hub)?.costCenters || []
).filter((costCenter) => costCenter !== poolCostCenter);

const createAllocatedSpentRow = (entry, costCenter, amount, hub) => ({
  ...entry,
  costCenter,
  sourceCostCenter: entry.sourceCostCenter || entry.costCenter,
  hub,
  amount,
  allocationSourceCostCenter: entry.costCenter,
  isAllocatedGeneralCost: true,
});

const createAllocatedGeneralCreditNoteRow = (entry, costCenter, amount, hub) => ({
  ...entry,
  costCenter,
  sourceCostCenter: entry.sourceCostCenter || entry.costCenter,
  hub,
  amount,
  allocationSourceCostCenter: entry.costCenter,
  isAllocatedGeneralCreditNote: true,
});

const createAllocatedManagementRow = (entry, costCenter, amount, hub) => ({
  ...entry,
  costCenter,
  sourceCostCenter: entry.sourceCostCenter || entry.costCenter,
  hub,
  amount,
  allocationSourceCostCenter: MANAGEMENT_SOURCE_COST_CENTER,
  isAllocatedManagementCost: true,
});

const getAllOperationalCostCenters = () => COST_CENTER_HIERARCHY
  .filter((group) => group.hub !== "Head Office")
  .flatMap((group) => group.costCenters)
  .filter((costCenter) => !GENERAL_POOL_COST_CENTERS.has(costCenter) && costCenter !== HEAD_OFFICE_COST_CENTER && !HIDDEN_COST_CENTER_ROWS.has(costCenter));

const allocateGeneralSpentCosts = (entries, filters = {}) => {
  const periodFilters = {
    ...filters,
    costCenter: ALL_FILTER_VALUE,
    hub: ALL_FILTER_VALUE,
  };
  const periodRows = entries.filter((entry) => matchesFilters(entry, periodFilters));
  const allocatedRows = [];
  const allocatedEntryIds = new Set();

  for (const rule of GENERAL_COST_ALLOCATIONS) {
    const recipients = getHubCostCenters(rule.hub, rule.poolCostCenter);
    if (!recipients.length) continue;

    const poolRows = periodRows.filter((entry) => entry.type === "spent" && entry.costCenter === rule.poolCostCenter);
    const poolCreditNoteRows = periodRows.filter((entry) => entry.type === "creditNotes" && entry.costCenter === rule.poolCostCenter);
    const recipientRows = periodRows.filter((entry) => (
      entry.type === "spent"
      && recipients.includes(entry.costCenter)
      && !entry.isAllocatedGeneralCost
    ));
    const fallbackTotals = recipients.map((costCenter) => ({
      costCenter,
      amount: sumRows(recipientRows, (entry) => entry.costCenter === costCenter),
    })).filter((row) => row.amount > 0);
    const fallbackTotal = fallbackTotals.reduce((total, row) => total + row.amount, 0);

    for (const poolRow of poolRows) {
      const periodRecipientTotals = recipients.map((costCenter) => ({
        costCenter,
        amount: sumRows(recipientRows, (entry) => entry.period === poolRow.period && entry.costCenter === costCenter),
      })).filter((row) => row.amount > 0);
      const periodTotal = periodRecipientTotals.reduce((total, row) => total + row.amount, 0);
      const basisRows = periodTotal > 0 ? periodRecipientTotals : fallbackTotals;
      const basisTotal = periodTotal > 0 ? periodTotal : fallbackTotal;
      if (!basisTotal) continue;

      allocatedEntryIds.add(poolRow);
      for (const basis of basisRows) {
        allocatedRows.push(createAllocatedSpentRow(
          poolRow,
          basis.costCenter,
          (poolRow.amount || 0) * (basis.amount / basisTotal),
          rule.hub,
        ));
      }
    }

    for (const poolCreditNoteRow of poolCreditNoteRows) {
      const periodRecipientTotals = recipients.map((costCenter) => ({
        costCenter,
        amount: sumRows(recipientRows, (entry) => entry.period === poolCreditNoteRow.period && entry.costCenter === costCenter),
      })).filter((row) => row.amount > 0);
      const periodTotal = periodRecipientTotals.reduce((total, row) => total + row.amount, 0);
      const basisRows = periodTotal > 0 ? periodRecipientTotals : fallbackTotals;
      const basisTotal = periodTotal > 0 ? periodTotal : fallbackTotal;
      if (!basisTotal) continue;

      allocatedEntryIds.add(poolCreditNoteRow);
      for (const basis of basisRows) {
        allocatedRows.push(createAllocatedGeneralCreditNoteRow(
          poolCreditNoteRow,
          basis.costCenter,
          (poolCreditNoteRow.amount || 0) * (basis.amount / basisTotal),
          rule.hub,
        ));
      }
    }
  }

  const managementRecipients = getAllOperationalCostCenters();
  const managementRows = periodRows.filter((entry) => (
    entry.type === "spent"
    && entry.sourceCostCenter === MANAGEMENT_SOURCE_COST_CENTER
  ));
  const managementBasisRows = periodRows.filter((entry) => (
    entry.type === "spent"
    && managementRecipients.includes(entry.costCenter)
    && entry.sourceCostCenter !== MANAGEMENT_SOURCE_COST_CENTER
    && !entry.isAllocatedGeneralCost
    && !entry.isAllocatedManagementCost
  ));
  const fallbackManagementTotals = managementRecipients.map((costCenter) => ({
    costCenter,
    amount: sumRows(managementBasisRows, (entry) => entry.costCenter === costCenter),
  })).filter((row) => row.amount > 0);
  const fallbackManagementTotal = fallbackManagementTotals.reduce((total, row) => total + row.amount, 0);

  for (const managementRow of managementRows) {
    const periodRecipientTotals = managementRecipients.map((costCenter) => ({
      costCenter,
      amount: sumRows(managementBasisRows, (entry) => entry.period === managementRow.period && entry.costCenter === costCenter),
    })).filter((row) => row.amount > 0);
    const periodTotal = periodRecipientTotals.reduce((total, row) => total + row.amount, 0);
    const basisRows = periodTotal > 0 ? periodRecipientTotals : fallbackManagementTotals;
    const basisTotal = periodTotal > 0 ? periodTotal : fallbackManagementTotal;
    if (!basisTotal) continue;

    allocatedEntryIds.add(managementRow);
    for (const basis of basisRows) {
      const hub = getCostCenterHub(basis.costCenter, managementRow.hub);
      allocatedRows.push(createAllocatedManagementRow(
        managementRow,
        basis.costCenter,
        (managementRow.amount || 0) * (basis.amount / basisTotal),
        hub,
      ));
    }
  }

  return [
    ...entries.filter((entry) => !allocatedEntryIds.has(entry)),
    ...allocatedRows,
  ];
};

const getCostCenterHub = (costCenter, fallbackHub) => (
  COST_CENTER_LOOKUP.get(costCenter)?.hub || fallbackHub || "Other"
);

const normalizeCostCenter = (costCenter) => normalizeCostCenterAlias(costCenter);

const normalizeOperationalSpentEntry = (entry) => {
  const costCenter = normalizeCostCenter(entry.costCenter);
  const sourceCostCenter = normalizeCostCenter(entry.sourceCostCenter || entry.costCenter);
  const hub = getCostCenterHub(costCenter, entry.hub);
  return {
    ...entry,
    sourceCostCenter,
    costCenter,
    hub,
    region: COST_CENTER_LOOKUP.get(costCenter)?.region || entry.region || "Basra",
  };
};

const formatHubLabel = (hub) => hub.replace(/\s+Hub$/, "");

const getCostCenterRow = (rowsByCostCenter, costCenter, hub) => {
  if (!rowsByCostCenter.has(costCenter)) {
    rowsByCostCenter.set(costCenter, {
      type: "costCenter",
      costCenter,
      hub: getCostCenterHub(costCenter, hub),
      spentCost: 0,
      allocatedGeneralCost: 0,
      allocatedManagementCost: 0,
      receivedCn: 0,
      allocatedGeneralCn: 0,
      totalCost: 0,
      submittedAfp: 0,
      approvedAfp: 0,
      issuedCn: 0,
      submittedRevenue: 0,
      totalRevenue: 0,
      profit: 0,
      margin: 0,
      headOfficeCostShare: 0,
      totalCostAfterHeadOffice: 0,
      profitAfterHeadOffice: 0,
      marginAfterHeadOffice: 0,
    });
  }
  return rowsByCostCenter.get(costCenter);
};

const buildCostCenterSummary = (allocatedEntries, rawEntries, filters) => {
  const yearFilters = { ...filters };
  const rowsByCostCenter = new Map();
  const rawRows = rawEntries.filter((entry) => matchesFilters(entry, yearFilters));
  const rows = allocatedEntries.filter((entry) => matchesFilters(entry, yearFilters));

  for (const entry of rawRows) {
    if (
      entry.type !== "spent"
      || GENERAL_POOL_COST_CENTERS.has(entry.costCenter)
      || HIDDEN_COST_CENTER_ROWS.has(normalizeCostCenter(entry.costCenter))
      || entry.sourceCostCenter === MANAGEMENT_SOURCE_COST_CENTER
    ) continue;
    getCostCenterRow(rowsByCostCenter, normalizeCostCenter(entry.costCenter), entry.hub).spentCost += Number(entry.amount) || 0;
  }

  for (const entry of rows) {
    const costCenter = normalizeCostCenter(entry.costCenter);
    if (HIDDEN_COST_CENTER_ROWS.has(costCenter)) continue;
    const row = getCostCenterRow(rowsByCostCenter, costCenter, entry.hub);
    if (entry.type === "spent" && entry.isAllocatedGeneralCost) {
      row.allocatedGeneralCost += Number(entry.amount) || 0;
    } else if (entry.type === "spent" && entry.isAllocatedManagementCost) {
      row.allocatedManagementCost += Number(entry.amount) || 0;
    } else if (entry.type === "creditNotes" && entry.isAllocatedGeneralCreditNote) {
      row.allocatedGeneralCn += Number(entry.amount) || 0;
    } else if (entry.type === "creditNotes") {
      row.receivedCn += Number(entry.amount) || 0;
    } else if (entry.type === "submitted") {
      row.submittedAfp += Number(entry.amount) || 0;
    } else if (entry.type === "approved") {
      row.approvedAfp += Number(entry.amount) || 0;
    }
  }

  for (const entry of rawRows) {
    if (!matchesIssuedCreditNoteFilters(entry, yearFilters)) continue;
    const issuedBy = normalizeCostCenter(entry.issuedBy);
    getCostCenterRow(rowsByCostCenter, issuedBy, getCostCenterHub(issuedBy, entry.hub)).issuedCn += Number(entry.amount) || 0;
  }

  const summaryRows = [...rowsByCostCenter.values()]
    .map((row) => {
      const totalCost = row.spentCost + row.allocatedGeneralCost + row.allocatedManagementCost + row.receivedCn + row.allocatedGeneralCn;
      const submittedRevenue = row.submittedAfp + row.issuedCn;
      const totalRevenue = row.approvedAfp + row.issuedCn;
      const profit = totalRevenue - totalCost;
      return {
        ...row,
        totalCost,
        submittedRevenue,
        totalRevenue,
        profit,
        margin: getShare(profit, totalRevenue),
        totalCostAfterHeadOffice: totalCost,
        profitAfterHeadOffice: profit,
        marginAfterHeadOffice: getShare(profit, totalRevenue),
      };
    })
    .filter((row) => row.spentCost || row.allocatedGeneralCost || row.receivedCn || row.allocatedGeneralCn || row.submittedAfp || row.approvedAfp || row.issuedCn)
    .sort((a, b) => {
      const hubOrder = COST_CENTER_HIERARCHY.findIndex((group) => group.hub === a.hub)
        - COST_CENTER_HIERARCHY.findIndex((group) => group.hub === b.hub);
      return hubOrder || a.costCenter.localeCompare(b.costCenter);
    });

  const headOfficeCost = summaryRows.find((row) => row.costCenter === HEAD_OFFICE_COST_CENTER)?.totalCost || 0;
  const allocationBasisRows = summaryRows.filter((row) => row.costCenter !== HEAD_OFFICE_COST_CENTER && row.totalCost > 0);
  const allocationBasisTotal = allocationBasisRows.reduce((total, row) => total + row.totalCost, 0);

  if (!headOfficeCost || !allocationBasisTotal) return summaryRows;

  return summaryRows.map((row) => {
    const headOfficeCostShare = row.costCenter === HEAD_OFFICE_COST_CENTER
      ? -headOfficeCost
      : row.totalCost > 0
        ? headOfficeCost * (row.totalCost / allocationBasisTotal)
        : 0;
    const totalCostAfterHeadOffice = row.totalCost + headOfficeCostShare;
    const profitAfterHeadOffice = row.totalRevenue - totalCostAfterHeadOffice;

    return {
      ...row,
      headOfficeCostShare,
      totalCostAfterHeadOffice,
      profitAfterHeadOffice,
      marginAfterHeadOffice: getShare(profitAfterHeadOffice, row.totalRevenue),
    };
  });
};

const sumCostCenterRows = (rows, hub, type = "hub", label = formatHubLabel(hub)) => {
  const total = rows.reduce((sum, row) => ({
    spentCost: sum.spentCost + row.spentCost,
    allocatedGeneralCost: sum.allocatedGeneralCost + row.allocatedGeneralCost,
    allocatedManagementCost: sum.allocatedManagementCost + row.allocatedManagementCost,
    receivedCn: sum.receivedCn + row.receivedCn,
    allocatedGeneralCn: sum.allocatedGeneralCn + row.allocatedGeneralCn,
    totalCost: sum.totalCost + row.totalCost,
    submittedAfp: sum.submittedAfp + row.submittedAfp,
    approvedAfp: sum.approvedAfp + row.approvedAfp,
    issuedCn: sum.issuedCn + row.issuedCn,
    submittedRevenue: sum.submittedRevenue + row.submittedRevenue,
    totalRevenue: sum.totalRevenue + row.totalRevenue,
    profit: sum.profit + row.profit,
    headOfficeCostShare: sum.headOfficeCostShare + row.headOfficeCostShare,
    totalCostAfterHeadOffice: sum.totalCostAfterHeadOffice + row.totalCostAfterHeadOffice,
    profitAfterHeadOffice: sum.profitAfterHeadOffice + row.profitAfterHeadOffice,
  }), {
    spentCost: 0,
    allocatedGeneralCost: 0,
    allocatedManagementCost: 0,
    receivedCn: 0,
    allocatedGeneralCn: 0,
    totalCost: 0,
    submittedAfp: 0,
    approvedAfp: 0,
    issuedCn: 0,
    submittedRevenue: 0,
    totalRevenue: 0,
    profit: 0,
    headOfficeCostShare: 0,
    totalCostAfterHeadOffice: 0,
    profitAfterHeadOffice: 0,
  });

  return {
    type,
    costCenter: label,
    hub,
    ...total,
    margin: getShare(total.profit, total.totalRevenue),
    marginAfterHeadOffice: getShare(total.profitAfterHeadOffice, total.totalRevenue),
  };
};

const buildRooRows = (rows) => {
  const rowsByCostCenter = new Map(rows.map((row) => [row.costCenter, row]));
  const orderedRows = [];
  const unassignedRows = rows
    .filter((row) => !ROO_ASSIGNED_COST_CENTERS.has(row.costCenter))
    .sort((a, b) => a.costCenter.localeCompare(b.costCenter));

  for (const group of ROO_SUB_HUBS) {
    const listedRows = group.costCenters.map((costCenter) => rowsByCostCenter.get(costCenter)).filter(Boolean);
    const groupRows = group.label === "Other Project" ? [...listedRows, ...unassignedRows] : listedRows;
    if (!groupRows.length) continue;
    orderedRows.push({
      ...sumCostCenterRows(groupRows, "ROO Hub", "subgroup", group.label),
      filterCostCenter: getCostCenterGroupValue(group.id),
    }, ...groupRows);
  }

  return orderedRows;
};

const buildGroupedHubRows = (rows, groups, assignedCostCenters) => {
  const rowsByCostCenter = new Map(rows.map((row) => [row.costCenter, row]));
  const orderedRows = [];
  const unassignedRows = rows
    .filter((row) => !assignedCostCenters.has(row.costCenter))
    .sort((a, b) => a.costCenter.localeCompare(b.costCenter));

  for (const group of groups) {
    const groupRows = group.costCenters.map((costCenter) => rowsByCostCenter.get(costCenter)).filter(Boolean);
    if (!groupRows.length) continue;
    orderedRows.push({
      ...sumCostCenterRows(groupRows, group.hub, "subgroup", group.label),
      filterCostCenter: getCostCenterGroupValue(group.id),
    }, ...groupRows);
  }

  return [...orderedRows, ...unassignedRows];
};

const buildHubCostCenterRows = (costCenterRows) => {
  const rowsByHub = costCenterRows.reduce((groups, row) => {
    if (!groups.has(row.hub)) groups.set(row.hub, []);
    groups.get(row.hub).push(row);
    return groups;
  }, new Map());
  const orderedHubs = [
    ...EXECUTIVE_HUB_ORDER.filter((hub) => rowsByHub.has(hub)),
    ...[...rowsByHub.keys()].filter((hub) => !EXECUTIVE_HUB_ORDER.includes(hub)).sort((a, b) => a.localeCompare(b)),
  ];

  const hubRows = orderedHubs.flatMap((hub) => {
    const rows = rowsByHub.get(hub).sort((a, b) => a.costCenter.localeCompare(b.costCenter));
    if (hub === "BGC Hub") return [sumCostCenterRows(rows, hub), ...buildGroupedHubRows(rows, BGC_SUB_HUBS, BGC_ASSIGNED_COST_CENTERS)];
    if (hub === "ROO Hub") return [sumCostCenterRows(rows, hub), ...buildRooRows(rows)];
    return [sumCostCenterRows(rows, hub), ...rows];
  });
  return costCenterRows.length
    ? [sumCostCenterRows(costCenterRows, "IGCC", "igcc", "IGCC Level 1"), ...hubRows]
    : hubRows;
};

function SummaryValue({ value, isPercent = false, tone }) {
  const className = tone || (value < 0 ? "is-negative" : "");
  return (
    <td className={`is-number ${className}`}>
      {isPercent ? formatPercent(value) : formatWholeNumber(value)}
    </td>
  );
}

const getRowCostCenters = (row, costCenterRows) => {
  if (!row) return [];
  if (row.type === "costCenter") return [row.costCenter];
  if (row.type === "subgroup") {
    const members = getCostCenterFilterMembers(row.filterCostCenter);
    return members.length ? members : costCenterRows.filter((item) => item.hub === row.hub).map((item) => item.costCenter);
  }
  if (row.type === "hub") return costCenterRows.filter((item) => item.hub === row.hub).map((item) => item.costCenter);
  if (row.type === "igcc") return costCenterRows.map((item) => item.costCenter);
  return [];
};

const groupAmounts = (entries, getKey) => [...entries.reduce((map, entry) => {
  const key = getKey(entry);
  map.set(key, (map.get(key) || 0) + (Number(entry.amount) || 0));
  return map;
}, new Map())]
  .map(([label, amount]) => ({ label, amount }))
  .filter((item) => item.amount)
  .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

const buildSimpleReport = (row, costCenterRows, allocatedEntries, rawEntries, filters) => {
  if (!row) return null;
  const memberList = getRowCostCenters(row, costCenterRows);
  const members = new Set(memberList);
  const rowsInScope = (entries, type) => entries.filter((entry) => (
    entry.type === type
    && members.has(normalizeCostCenter(entry.costCenter))
    && matchesFilters(entry, filters, { ignoreCostCenter: true })
  ));
  const rawSpentRows = rowsInScope(rawEntries, "spent")
    .filter((entry) => (
      !GENERAL_POOL_COST_CENTERS.has(entry.costCenter)
      && !HIDDEN_COST_CENTER_ROWS.has(normalizeCostCenter(entry.costCenter))
      && entry.sourceCostCenter !== MANAGEMENT_SOURCE_COST_CENTER
    ));
  const cnRows = rowsInScope(allocatedEntries, "creditNotes");
  const issuedCnRows = rawEntries.filter((entry) => matchesIssuedCreditNoteScope(entry, members, filters));
  const period = getReportPeriod(filters, rawEntries);
  const history = buildReportHistory([...members], allocatedEntries, rawEntries, filters, period);
  const memberDetails = row.type === "costCenter"
    ? []
    : buildGroupedReportDetails(memberList, costCenterRows, allocatedEntries, rawEntries, filters);

  const approvedRevenue = row.approvedAfp + row.issuedCn;
  const submittedRevenue = row.submittedAfp + row.issuedCn;
  const approvedMargin = approvedRevenue - row.totalCost;
  const submittedMargin = submittedRevenue - row.totalCost;
  const receivedCnTotal = row.receivedCn + row.allocatedGeneralCn;
  const topCost = groupAmounts(rawSpentRows, (entry) => entry.glName || "Unclassified")[0];

  return {
    title: row.type === "costCenter" ? row.costCenter : row.costCenter,
    scope: row.type === "costCenter" ? row.hub : `${row.type.toUpperCase()} | ${members.size} cost centers`,
    context: buildReportContext(filters),
    periodLabel: formatPeriodLabel(period, filters),
    generatedAt: new Date().toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }),
    approvedAfp: row.approvedAfp,
    submittedAfp: row.submittedAfp,
    issuedCn: row.issuedCn,
    approvedRevenue,
    submittedRevenue,
    directCost: row.spentCost,
    generalHubCost: row.allocatedGeneralCost,
    managementCost: row.allocatedManagementCost,
    receivedCn: row.receivedCn,
    allocatedGeneralCn: row.allocatedGeneralCn,
    receivedCnTotal,
    totalCost: row.totalCost,
    approvedMargin,
    approvedMarginPercent: getShare(approvedMargin, approvedRevenue),
    submittedMargin,
    submittedMarginPercent: getShare(submittedMargin, submittedRevenue),
    spendBreakdown: groupAmounts(rawSpentRows, (entry) => entry.glName || "Unclassified"),
    cnBreakdown: groupAmounts(cnRows.filter((entry) => !entry.isAllocatedGeneralCreditNote), (entry) => entry.category || entry.issuedBy || "Credit Note"),
    generalCnBreakdown: groupAmounts(cnRows.filter((entry) => entry.isAllocatedGeneralCreditNote), (entry) => entry.allocationSourceCostCenter || "CN"),
    issuedCnBreakdown: groupAmounts(issuedCnRows, (entry) => entry.category || entry.costCenter || "Issued Credit Note"),
    history,
    memberDetails,
    topCost,
    insights: buildReportInsights({
      approvedAfp: approvedRevenue,
      totalCost: row.totalCost,
      approvedMargin,
      receivedCnTotal,
      issuedCn: row.issuedCn,
      topCost,
    }),
  };
};

const buildGroupedReportDetails = (memberList, costCenterRows, allocatedEntries, rawEntries, filters) => memberList
  .map((costCenter) => {
    const summary = costCenterRows.find((row) => row.costCenter === costCenter);
    if (!summary) return null;
    const rawRows = rawEntries.filter((entry) => (
      entry.costCenter === costCenter
      && matchesFilters(entry, filters, { ignoreCostCenter: true })
    ));
    const rows = allocatedEntries.filter((entry) => (
      entry.costCenter === costCenter
      && matchesFilters(entry, filters, { ignoreCostCenter: true })
    ));
    const spentRows = rawRows.filter((entry) => (
      entry.type === "spent"
      && !GENERAL_POOL_COST_CENTERS.has(entry.costCenter)
      && !HIDDEN_COST_CENTER_ROWS.has(normalizeCostCenter(entry.costCenter))
      && entry.sourceCostCenter !== MANAGEMENT_SOURCE_COST_CENTER
    ));
    const cnRows = rows.filter((entry) => entry.type === "creditNotes");
    return {
      ...summary,
      spentBreakdown: groupAmounts(spentRows, (entry) => entry.glName || "Unclassified"),
      cnBreakdown: groupAmounts(cnRows.filter((entry) => !entry.isAllocatedGeneralCreditNote), (entry) => entry.category || entry.issuedBy || "Credit Note"),
      generalCnBreakdown: groupAmounts(cnRows.filter((entry) => entry.isAllocatedGeneralCreditNote), (entry) => entry.allocationSourceCostCenter || "CN"),
    };
  })
  .filter(Boolean);

const getReportPeriod = (filters = {}, entries = []) => {
  if (filters.period === "monthly" && filters.year && filters.year !== ALL_FILTER_VALUE && filters.month && filters.month !== ALL_FILTER_VALUE) {
    return `${filters.year}-${MONTH_NO_BY_NAME[filters.month] || "01"}`;
  }
  return entries
    .map((entry) => entry.period)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] || "";
};

const formatPeriodLabel = (period, filters = {}) => {
  if (filters.period === "monthly" && filters.month && filters.month !== ALL_FILTER_VALUE && filters.year && filters.year !== ALL_FILTER_VALUE) {
    return `${filters.month} ${filters.year}`;
  }
  if (!period) return "Selected period";
  const month = MONTH_ORDER[Number(period.slice(5, 7)) - 1] || period.slice(5, 7);
  return `${month} ${period.slice(0, 4)}`;
};

const buildReportHistory = (members, allocatedEntries, rawEntries, filters, selectedPeriod) => {
  const memberSet = new Set(members);
  const entryInScope = (entry) => (
    memberSet.has(normalizeCostCenter(entry.costCenter))
    && matchesPortfolio(entry, filters.portfolio)
    && (!filters.hub || filters.hub === ALL_FILTER_VALUE || entry.hub === filters.hub)
  );
  const periods = [...new Set([...allocatedEntries, ...rawEntries].map((entry) => entry.period).filter(Boolean))]
    .filter((period) => !selectedPeriod || period <= selectedPeriod)
    .sort((a, b) => a.localeCompare(b))
    .slice(-7);

  return periods.map((period) => {
    const rawRows = rawEntries.filter((entry) => entry.period === period && entryInScope(entry));
    const rows = allocatedEntries.filter((entry) => entry.period === period && entryInScope(entry));
    const directCost = sumRows(rawRows, (entry) => (
      entry.type === "spent"
      && !GENERAL_POOL_COST_CENTERS.has(entry.costCenter)
      && !HIDDEN_COST_CENTER_ROWS.has(normalizeCostCenter(entry.costCenter))
      && entry.sourceCostCenter !== MANAGEMENT_SOURCE_COST_CENTER
    ));
    const generalCost = sumRows(rows, (entry) => entry.type === "spent" && entry.isAllocatedGeneralCost);
    const managementCost = sumRows(rows, (entry) => entry.type === "spent" && entry.isAllocatedManagementCost);
    const receivedCn = sumRows(rows, (entry) => entry.type === "creditNotes" && !entry.isAllocatedGeneralCreditNote);
    const generalCn = sumRows(rows, (entry) => entry.type === "creditNotes" && entry.isAllocatedGeneralCreditNote);
    const totalCost = directCost + generalCost + managementCost + receivedCn + generalCn;
    const approvedAfp = sumRows(rows, (entry) => entry.type === "approved");
    const submittedAfp = sumRows(rows, (entry) => entry.type === "submitted");
    const issuedCn = sumRows(rawEntries, (entry) => entry.period === period && matchesIssuedCreditNoteScope(entry, memberSet, filters));
    const approvedRevenue = approvedAfp + issuedCn;
    const submittedRevenue = submittedAfp + issuedCn;
    const approvedProfit = approvedRevenue - totalCost;
    return {
      period,
      approvedAfp,
      submittedAfp,
      issuedCn,
      approvedRevenue,
      submittedRevenue,
      totalCost,
      receivedCn: receivedCn + generalCn,
      approvedProfit,
      approvedMargin: getShare(approvedProfit, approvedRevenue),
    };
  });
};

const getHistoryMetric = (history, key) => {
  const current = history[history.length - 1]?.[key] || 0;
  const previous = history[history.length - 2]?.[key] || 0;
  const previousSix = history.slice(0, -1).slice(-6);
  const average = previousSix.length ? previousSix.reduce((sum, item) => sum + (item[key] || 0), 0) / previousSix.length : 0;
  return {
    current,
    previous,
    average,
    change: previous ? ((current - previous) / Math.abs(previous)) * 100 : 0,
    averageChange: average ? ((current - average) / Math.abs(average)) * 100 : 0,
    values: history.map((item) => item[key] || 0),
  };
};

const buildReportInsights = ({ approvedAfp, totalCost, approvedMargin, receivedCnTotal, issuedCn, topCost }) => {
  const insights = [];
  if (totalCost > approvedAfp) {
    insights.push(`Total Cost is ${Math.round(getShare(totalCost - approvedAfp, approvedAfp))}% higher than Approved AFP, driving negative margin.`);
  } else {
    insights.push(`Approved AFP covers Total Cost with ${formatPercent(approvedMargin)} approved margin.`);
  }
  if (topCost) {
    insights.push(`${topCost.label} is the top cost driver at ${formatPercent(getShare(topCost.amount, totalCost))} of total cost.`);
  }
  if (receivedCnTotal) {
    insights.push(`Received CN of ${formatWholeNumber(receivedCnTotal)} is shown separately from spent report cost.`);
  }
  if (issuedCn) {
    insights.push(`Issued CN of ${formatWholeNumber(issuedCn)} is included in adjusted AFP revenue.`);
  }
  return insights.slice(0, 3);
};

const buildReportContext = (filters = {}) => {
  const parts = [];
  if (filters.portfolio && filters.portfolio !== ALL_FILTER_VALUE) parts.push(filters.portfolio.replace("-", " "));
  if (filters.hub && filters.hub !== ALL_FILTER_VALUE) parts.push(filters.hub);
  if (filters.year && filters.year !== ALL_FILTER_VALUE) parts.push(`Year ${filters.year}`);
  if (filters.period === "monthly" && filters.month && filters.month !== ALL_FILTER_VALUE) parts.push(filters.month);
  if (filters.period === "quarterly" && filters.quarter && filters.quarter !== ALL_FILTER_VALUE) parts.push(filters.quarter);
  if (!parts.length) return "All active dashboard filters";
  return parts.join(" | ");
};

function MiniSparkline({ values = [], color = "#2563eb" }) {
  const width = 150;
  const height = 44;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  });
  const area = points.length ? `0,${height} ${points.join(" ")} ${width},${height}` : "";
  return (
    <svg className="mini-sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polygon points={area} style={{ fill: color, opacity: 0.12 }} />
      <polyline points={points.join(" ")} style={{ stroke: color }} />
    </svg>
  );
}

function DonutChart({ items, total }) {
  let offset = 25;
  return (
    <div className="report-donut-wrap">
      <svg className="report-donut" viewBox="0 0 42 42" aria-hidden="true">
        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e5edf6" strokeWidth="7" />
        {items.map((item, index) => {
          const value = total ? (Math.abs(item.amount) / total) * 100 : 0;
          const circle = (
            <circle
              key={item.label}
              cx="21"
              cy="21"
              r="15.915"
              fill="transparent"
              stroke={REPORT_COLORS[index % REPORT_COLORS.length]}
              strokeWidth="7"
              strokeDasharray={`${value} ${100 - value}`}
              strokeDashoffset={offset}
            />
          );
          offset -= value;
          return circle;
        })}
      </svg>
      <div>
        <strong>{formatWholeNumber(total)}</strong>
        <span>Total CN</span>
      </div>
    </div>
  );
}

function SimpleReportModal({ report, onClose }) {
  if (!report) return null;
  const approvedRevenueMetric = getHistoryMetric(report.history, "approvedRevenue");
  const submittedRevenueMetric = getHistoryMetric(report.history, "submittedRevenue");
  const totalCostMetric = getHistoryMetric(report.history, "totalCost");
  const profitMetric = getHistoryMetric(report.history, "approvedProfit");
  const marginMetric = getHistoryMetric(report.history, "approvedMargin");
  const costRows = [
    { label: "Approved AFP", value: report.approvedAfp, tone: "is-afp" },
    { label: "Submitted AFP", value: report.submittedAfp, tone: "is-afp is-submitted" },
    { label: "Issued CN", value: report.issuedCn, tone: "is-afp" },
    { label: "Direct Cost from Spent report", value: report.directCost },
    { label: "General Hub Cost", value: report.generalHubCost },
    { label: "Management Cost", value: report.managementCost },
    { label: "CN", value: report.receivedCn + report.allocatedGeneralCn },
  ];
  const kpis = [
    { label: "Approved Revenue", value: report.approvedRevenue, metric: approvedRevenueMetric, tone: "blue", color: "#2563eb" },
    { label: "Submitted Revenue", value: report.submittedRevenue, metric: submittedRevenueMetric, tone: "teal", color: "#0f766e" },
    { label: "Total Cost", value: report.totalCost, metric: totalCostMetric, tone: "amber", color: "#f97316" },
    { label: "Net Profit (Approved)", value: report.approvedMargin, metric: profitMetric, tone: report.approvedMargin < 0 ? "red" : "purple", color: "#7c3aed" },
    { label: "Margin (Approved)", value: report.approvedMarginPercent, metric: marginMetric, tone: "red", color: "#ef4444", isPercent: true, suffix: "pp" },
  ];
  const visualRows = [
    { label: "Approved Revenue", value: report.approvedRevenue, tone: "blue" },
    { label: "Submitted Revenue", value: report.submittedRevenue, tone: "teal" },
    { label: "Issued CN", value: report.issuedCn, tone: "green" },
    { label: "Total Cost", value: report.totalCost, tone: "amber" },
    { label: "Received CN", value: report.receivedCn + report.allocatedGeneralCn, tone: "green" },
  ];
  const maxVisualValue = Math.max(...visualRows.map((item) => Math.abs(item.value)), 1);
  const cnLegend = report.cnBreakdown.filter((item) => item.amount);
  const issuedCnLegend = report.issuedCnBreakdown.filter((item) => item.amount);
  const topSpendRows = report.spendBreakdown.slice(0, 8);
  const maxSpendAmount = Math.max(...topSpendRows.map((item) => Math.abs(item.amount)), 1);
  const movementCards = [
    { label: "Approved Revenue", metric: approvedRevenueMetric, tone: "blue", color: "#2563eb" },
    { label: "Total Cost", metric: totalCostMetric, tone: "amber", color: "#f97316" },
    { label: "Net Profit (Approved)", metric: profitMetric, tone: profitMetric.current < 0 ? "red" : "purple", color: "#7c3aed" },
    { label: "Margin (Approved)", metric: marginMetric, tone: "red", color: "#ef4444", isPercent: true, suffix: "pp" },
  ];
  return (
    <div className="simple-report-backdrop" onClick={onClose}>
      <article className={`simple-report-sheet ${report.memberDetails.length ? "has-group-detail" : ""}`} aria-label={`${report.title} simple report`} onClick={(event) => event.stopPropagation()}>
        <header className="pnl-modern-header">
          <div className="pnl-modern-brand">
            <img src={igccLogo} alt="IGCC" />
            <div>
              <strong>IGCC</strong>
              <span>Financial Dashboard</span>
            </div>
          </div>
          <div className="pnl-modern-title">
            <h3>Profit & Loss Analysis Report</h3>
            <p>Monthly Financial Performance Overview</p>
          </div>
          <div className="pnl-modern-meta">
            <div><span>Report for</span><strong>{report.periodLabel}</strong></div>
            <div><span>Hub</span><strong>{report.scope}</strong></div>
            <div><span>Cost Center</span><strong>{report.title}</strong></div>
          </div>
          <div className={`pnl-modern-status ${report.approvedMargin < 0 ? "is-loss" : "is-profit"}`}>
            <span>{report.approvedMargin < 0 ? "Loss Making" : "Profitable"}</span>
            <strong>{formatPercent(report.approvedMarginPercent)}</strong>
            <em>Margin Approved</em>
          </div>
          <div className="simple-report-actions">
            <button type="button" onClick={() => window.print()}>Save PDF</button>
            <button type="button" onClick={onClose} aria-label="Close report">Close</button>
          </div>
        </header>
        <section className="simple-report-kpi-grid">
          {kpis.map((item) => (
            <div className={`simple-report-kpi tone-${item.tone}`} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.isPercent ? formatPercent(item.value) : formatWholeNumber(item.value)}</strong>
              <em>vs previous {formatSignedChange(item.metric.change, item.suffix || "%")}</em>
              <MiniSparkline values={item.metric.values} color={item.color} />
            </div>
          ))}
        </section>
        <div className="simple-report-landscape">
          <section className="pnl-report-main-grid">
            <article className="pnl-report-card financial-summary-modern">
              <h4>Financial Summary <span>{report.periodLabel}</span></h4>
              {costRows.map((item) => (
                <p key={item.label} className={item.tone || ""}>
                  <span>{item.label}</span>
                  <strong>{formatWholeNumber(item.value)}</strong>
                </p>
              ))}
              <p className="is-total"><span>Total Cost</span><strong>{formatWholeNumber(report.totalCost)}</strong></p>
              <div className="pnl-margin-block">
                <p><span>Net Profit (Approved AFP)</span><strong className={report.approvedMargin < 0 ? "is-bad" : "is-good"}>{formatWholeNumber(report.approvedMargin)}</strong></p>
                <p><span>Margin (Approved AFP)</span><strong className={report.approvedMargin < 0 ? "is-bad" : "is-good"}>{formatPercent(report.approvedMarginPercent)}</strong></p>
                <p><span>Net Profit (Submitted AFP)</span><strong className={report.submittedMargin < 0 ? "is-bad" : "is-good"}>{formatWholeNumber(report.submittedMargin)}</strong></p>
                <p><span>Margin (Submitted AFP)</span><strong className={report.submittedMargin < 0 ? "is-bad" : "is-good"}>{formatPercent(report.submittedMarginPercent)}</strong></p>
              </div>
            </article>
            <article className="pnl-report-card spend-breakdown-modern">
              <h4>Spent + Not Recorded Cost Breakdown</h4>
              {topSpendRows.map((item, index) => (
                <div className="spend-progress-row" key={item.label}>
                  <i style={{ "--dot-color": REPORT_COLORS[index % REPORT_COLORS.length] }}>{item.label.slice(0, 1)}</i>
                  <span>{item.label}</span>
                  <b><em style={{ "--bar-color": REPORT_COLORS[index % REPORT_COLORS.length], "--bar-width": `${(Math.abs(item.amount) / maxSpendAmount) * 100}%` }} /></b>
                  <strong>{formatWholeNumber(item.amount)}</strong>
                  <small>{formatPercent(getShare(item.amount, report.directCost))}</small>
                </div>
              ))}
              <footer><span>Total Cost from Spent + Not Recorded</span><strong>{formatWholeNumber(report.directCost)}</strong></footer>
            </article>
          </section>
          <section className="pnl-report-secondary-grid">
            <article className="pnl-report-card cn-modern-card">
              <h4>Received CN Breakdown</h4>
              <div className="cn-modern-layout">
                <DonutChart items={cnLegend} total={report.receivedCnTotal} />
                <div className="cn-modern-legend">
                  {cnLegend.map((item, index) => (
                    <p key={item.label}>
                      <i style={{ "--dot-color": REPORT_COLORS[index % REPORT_COLORS.length] }} />
                      <span>{item.label}</span>
                      <strong>{formatWholeNumber(item.amount)}</strong>
                      <em>{formatPercent(getShare(item.amount, report.receivedCnTotal))}</em>
                    </p>
                  ))}
                </div>
              </div>
              <footer><span>Total Received CN</span><strong>{formatWholeNumber(report.receivedCnTotal)}</strong></footer>
            </article>
            <article className="pnl-report-card commercial-modern-card">
              <h4>Commercial Snapshot <span>{report.periodLabel}</span></h4>
              <p>AFP, Total Cost and CN impact under the selected filter.</p>
              <div className="simple-report-bars">
                {visualRows.map((item) => (
                  <div className={`simple-report-bar tone-${item.tone}`} key={item.label}>
                    <span>{item.label}</span>
                    <i style={{ "--bar-width": `${Math.max(4, (Math.abs(item.value) / maxVisualValue) * 100)}%` }} />
                    <strong>{formatWholeNumber(item.value)}</strong>
                  </div>
                ))}
              </div>
              {issuedCnLegend.length ? (
                <div className="cn-modern-legend">
                  {issuedCnLegend.map((item, index) => (
                    <p key={`issued-${item.label}`}>
                      <i style={{ "--dot-color": REPORT_COLORS[index % REPORT_COLORS.length] }} />
                      <span>Issued - {item.label}</span>
                      <strong>{formatWholeNumber(item.amount)}</strong>
                      <em>{formatPercent(getShare(item.amount, report.issuedCn))}</em>
                    </p>
                  ))}
                </div>
              ) : null}
            </article>
          </section>
          <section className="pnl-report-bottom-grid">
            <article className="pnl-report-card movement-modern-card">
              <h4>Historical Movement <span>vs Previous 6 Months</span></h4>
              <div className="movement-card-grid">
                {movementCards.map((item) => (
                  <div className={`movement-mini-card tone-${item.tone}`} key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.isPercent ? formatPercent(item.metric.current) : formatWholeNumber(item.metric.current)}</strong>
                    <em>vs 6M Avg {formatSignedChange(item.metric.averageChange, item.suffix || "%")}</em>
                    <MiniSparkline values={item.metric.values} color={item.color} />
                  </div>
                ))}
              </div>
            </article>
            <article className="pnl-report-card insight-modern-card">
              <h4>Key Insights</h4>
              {report.insights.map((insight, index) => (
                <p key={insight}>
                  <i>{index + 1}</i>
                  <span>{insight}</span>
                </p>
              ))}
            </article>
          </section>
          <footer className="pnl-modern-footer">
            <span>Report generated on {report.generatedAt}</span>
            <span>Currency: USD</span>
          </footer>
        </div>
        {report.memberDetails.length ? (
          <section className="group-detail-page">
            <header className="group-detail-header">
              <div>
                <span>Cost Center Detail Breakdown</span>
                <h3>{report.title}</h3>
                <p>{report.periodLabel} | {report.memberDetails.length} cost centers | USD</p>
              </div>
              <strong>Audit view</strong>
            </header>
            <div className="group-detail-grid">
              {report.memberDetails.map((item) => {
                const cnTotal = item.receivedCn + item.allocatedGeneralCn;
                const spentRows = item.spentBreakdown.slice(0, 5);
                const cnRows = item.cnBreakdown.slice(0, 5);
                return (
                  <article className="cost-center-audit-card" key={item.costCenter}>
                    <header>
                      <strong>{item.costCenter}</strong>
                      <span>{item.hub}</span>
                    </header>
                    <div className="audit-metric-grid">
                      <p><span>Submitted AFP</span><b>{formatWholeNumber(item.submittedAfp)}</b></p>
                      <p><span>Approved AFP</span><b>{formatWholeNumber(item.approvedAfp)}</b></p>
                      <p><span>Issued CN</span><b>{formatWholeNumber(item.issuedCn)}</b></p>
                      <p><span>Direct Spent</span><b>{formatWholeNumber(item.spentCost)}</b></p>
                      <p><span>General Cost</span><b>{formatWholeNumber(item.allocatedGeneralCost)}</b></p>
                      <p><span>Management</span><b>{formatWholeNumber(item.allocatedManagementCost)}</b></p>
                      <p><span>Total CN</span><b>{formatWholeNumber(cnTotal)}</b></p>
                      <p className="is-total"><span>Total Cost</span><b>{formatWholeNumber(item.totalCost)}</b></p>
                      <p className={item.profit < 0 ? "is-loss" : "is-profit"}><span>Profit / Margin</span><b>{formatWholeNumber(item.profit)} | {formatPercent(item.margin)}</b></p>
                    </div>
                    <div className="audit-breakdown-grid">
                      <section>
                        <h4>Spent Report Breakdown</h4>
                        {(spentRows.length ? spentRows : [{ label: "No spent detail", amount: 0 }]).map((row) => (
                          <p key={`spent-${item.costCenter}-${row.label}`}>
                            <span>{row.label}</span>
                            <strong>{row.amount ? formatWholeNumber(row.amount) : "-"}</strong>
                          </p>
                        ))}
                      </section>
                      <section>
                        <h4>CN Breakdown</h4>
                        {(cnRows.length ? cnRows : [{ label: "No CN detail", amount: 0 }]).map((row) => (
                          <p key={`cn-${item.costCenter}-${row.label}`}>
                            <span>{row.label}</span>
                            <strong>{row.amount ? formatWholeNumber(row.amount) : "-"}</strong>
                          </p>
                        ))}
                      </section>
                    </div>
                  </article>
                );
              })}
            </div>
            <footer className="pnl-modern-footer">
              <span>Grouped report detail page for construction review</span>
              <span>Currency: USD</span>
            </footer>
          </section>
        ) : null}
      </article>
    </div>
  );
}

export function ExecutiveCockpitPage({ filters = {}, onNavigate, onApplyFilters }) {
  const [reportRow, setReportRow] = useState(null);
  const {
    entries,
    spentEntries,
    afpMasterComparison,
    isLoadingAfpMaster,
    isLoadingSpentReport,
    afpMasterError,
    spentReportError,
  } = useAfpFinancialInputs();
  const isYearFiltered = hasSelectedYear(filters);
  const year = getSelectedYear(filters);
  const rawEntries = entries.map((entry) => (
    entry.type === "spent" ? normalizeOperationalSpentEntry(entry) : entry
  ));
  const costCenterFilters = isYearFiltered ? { ...filters, year } : { ...filters, year: ALL_FILTER_VALUE };
  const costCenterEntries = allocateGeneralSpentCosts(rawEntries, costCenterFilters);
  const costCenterRows = buildCostCenterSummary(costCenterEntries, rawEntries, costCenterFilters);
  const hubCostCenterRows = buildHubCostCenterRows(costCenterRows);
  const selectedReport = buildSimpleReport(reportRow, costCenterRows, costCenterEntries, rawEntries, costCenterFilters);
  const costCenterYearLabel = isYearFiltered ? `Year ${year}` : "Years 2025 & 2026";
  const titleSpentRows = rawEntries.filter((entry) => entry.type === "spent" && matchesFilters(entry, costCenterFilters));
  const titleHeadOfficeFilters = {
    ...costCenterFilters,
    hub: ALL_FILTER_VALUE,
    costCenter: ALL_FILTER_VALUE,
  };
  const titleSpentReportValue = titleSpentRows.reduce((total, entry) => total + (Number(entry.amount) || 0), 0);
  const titleHeadOfficeCost = rawEntries
    .filter((entry) => (
      entry.type === "spent"
      && entry.costCenter === HEAD_OFFICE_COST_CENTER
      && matchesFilters(entry, titleHeadOfficeFilters)
    ))
    .reduce((total, entry) => total + (Number(entry.amount) || 0), 0);
  const openDetailRow = (row) => {
    setReportRow(row);
  };
  const navigateDetailRow = (row) => {
    if (!onNavigate || !onApplyFilters) return;
    const nextFilters = {
      ...filters,
      hub: ALL_FILTER_VALUE,
      costCenter: ALL_FILTER_VALUE,
    };
    if (row.type === "hub") {
      nextFilters.hub = row.hub;
    } else if (row.type === "subgroup") {
      nextFilters.hub = row.hub;
      nextFilters.costCenter = row.filterCostCenter || ALL_FILTER_VALUE;
    } else if (row.type === "costCenter") {
      nextFilters.hub = row.hub;
      nextFilters.costCenter = row.costCenter;
    }
    onApplyFilters(nextFilters);
    onNavigate("detail");
  };

  return (
    <section className="page-stack executive-cockpit-page">
      <article className="surface-card executive-summary-card executive-cost-center-card">
        <div className="executive-table-title">
          <div>
            <p className="eyebrow">Operations Performance</p>
            <h3>Cost Center Profitability Summary</h3>
            <small>Hub, cost center, AFP, cost, CN, profit, and head office allocation view.</small>
          </div>
          <div className="executive-title-side">
            <div className={`executive-title-meta ${afpMasterError ? "has-error" : ""}`}>
              <span>{costCenterYearLabel} - {costCenterRows.length} cost centers</span>
              <span>{isLoadingAfpMaster ? "Loading AFP_MASTER" : afpMasterError ? "AFP_MASTER unavailable" : `AFP_MASTER ${afpMasterComparison.startYear}`}</span>
              <span>
                Submitted diff {formatSignedWholeNumber(afpMasterComparison.submittedDifference)}
                {" | "}
                Approved diff {formatSignedWholeNumber(afpMasterComparison.approvedDifference)}
              </span>
            </div>
            <div className="executive-title-metrics" aria-label="Filtered operations totals">
              <span>
                <small>Spent + Not Recorded</small>
                <strong>{formatWholeNumber(titleSpentReportValue)}</strong>
              </span>
              <span>
                <small>Head Office Cost</small>
                <strong>{formatWholeNumber(titleHeadOfficeCost)}</strong>
              </span>
            </div>
          </div>
        </div>
        <div className={`executive-data-status ${spentReportError ? "has-error" : isLoadingSpentReport ? "is-loading" : "is-ok"}`} role={spentReportError ? "alert" : "status"}>
          <strong>{spentReportError ? "Spent Report data issue" : isLoadingSpentReport ? "Checking Spent Report data" : "Spent Report data ready"}</strong>
          <span>
            {spentReportError
              ? spentReportError
              : isLoadingSpentReport
                ? "Reading Spent Report and Not Recorded from Google Sheets."
                : `${spentEntries.length.toLocaleString("en-US")} valid rows loaded from Spent Report and Not Recorded.`}
          </span>
        </div>
        <div className="executive-table-wrap executive-cost-center-wrap">
          <table className="executive-summary-table executive-cost-center-table">
            <thead>
              <tr>
                <th rowSpan={2}>Cost Center</th>
                <th className="executive-table-section is-cost-section" colSpan={5}>Cost / Expenses</th>
                <th className="executive-table-section is-revenue-section" colSpan={4}>Revenue</th>
                <th className="executive-table-section is-profit-section" colSpan={6}>Profitability</th>
              </tr>
              <tr>
                <th>Cost from Spent Report</th>
                <th>General Cost Reallocate</th>
                <th>Management Cost</th>
                <th>Received CN</th>
                <th>Total Cost</th>
                <th>Submitted AFP</th>
                <th>Approved AFP</th>
                <th>Issued CN</th>
                <th>Total Revenue</th>
                <th>Profit</th>
                <th>Margin %</th>
                <th>Submitted Margin %</th>
                <th>Share of Head Office Cost</th>
                <th>Total Cost After HO</th>
                <th>Margin After HO %</th>
              </tr>
            </thead>
            <tbody>
              {hubCostCenterRows.length ? hubCostCenterRows.map((row) => (
                <tr
                  key={`${row.type}-${row.hub}-${row.costCenter}`}
                  role="button"
                  tabIndex={0}
                  className={[
                    "is-clickable-row",
                    row.type === "igcc" ? "is-igcc-total" : "",
                    row.type === "hub" ? "is-hub-total" : "",
                    row.type === "subgroup" ? "is-subgroup-total" : "",
                    row.profit < 0 ? "has-loss" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => openDetailRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDetailRow(row);
                    }
                  }}
                  onDoubleClick={() => navigateDetailRow(row)}
                >
                  <td>{row.type === "costCenter" ? <span>{row.costCenter}</span> : row.costCenter}</td>
                  <SummaryValue value={row.spentCost} />
                  <SummaryValue value={row.allocatedGeneralCost} />
                  <SummaryValue value={row.allocatedManagementCost} />
                  <SummaryValue value={row.receivedCn} />
                  <SummaryValue value={row.totalCost} />
                  <SummaryValue value={row.submittedAfp} />
                  <SummaryValue value={row.approvedAfp} />
                  <SummaryValue value={row.issuedCn} />
                  <SummaryValue value={row.totalRevenue} />
                  <SummaryValue value={row.profit} />
                  <SummaryValue value={row.margin} isPercent />
                  <SummaryValue value={getShare(row.submittedRevenue - row.totalCost, row.submittedRevenue)} isPercent />
                  <SummaryValue value={row.headOfficeCostShare} />
                  <SummaryValue value={row.totalCostAfterHeadOffice} />
                  <SummaryValue value={row.marginAfterHeadOffice} isPercent />
                </tr>
              )) : (
                <tr>
                  <td className="executive-empty-row" colSpan={16}>No cost center data for the selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
      <SimpleReportModal report={selectedReport} onClose={() => setReportRow(null)} />
    </section>
  );
}
