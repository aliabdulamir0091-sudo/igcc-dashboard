import { COST_CENTER_HIERARCHY } from "../../data/costCenterHierarchy";
import { normalizeCostCenterAlias } from "../../data/costCenterAliases";
import { getAfpRecordPeriodKey } from "./afpPeriods";

const AFP_MASTER_START_YEAR = import.meta.env.VITE_AFP_MASTER_START_YEAR || "2026";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const COST_CENTER_LOOKUP = new Map(COST_CENTER_HIERARCHY.flatMap((group) => (
  group.costCenters.map((costCenter) => [costCenter, { hub: group.hub, region: group.region }])
)));

const roundCurrency = (value) => Math.round(((value || 0) + Number.EPSILON) * 100) / 100;

const normalizeHub = (hubUnit, costCenter) => {
  const mapped = COST_CENTER_LOOKUP.get(costCenter);
  if (mapped?.hub) return mapped.hub;

  const value = String(hubUnit || "").trim().toLowerCase();
  if (value.includes("bgc")) return "BGC Hub";
  if (value.includes("roo")) return "ROO Hub";
  if (value.includes("kirkuk")) return "Kirkuk";
  if (value.includes("total")) return "Total Hub";
  if (value.includes("head")) return "Head Office";
  return hubUnit || "Unassigned";
};

const getRegion = (hub, costCenter) => {
  const mapped = COST_CENTER_LOOKUP.get(costCenter);
  if (mapped?.region) return mapped.region;
  if (hub === "Kirkuk") return "Kirkuk";
  return "Basra";
};

const periodFromDate = (dateValue) => {
  const text = String(dateValue || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}/.test(text)) return text.slice(0, 7);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 7);
};

const normalizePeriod = (record, dateValue) => {
  return getAfpRecordPeriodKey(record) || periodFromDate(dateValue) || periodFromDate(record.submitted_date) || `${AFP_MASTER_START_YEAR}-01`;
};

const monthFromPeriod = (period) => MONTH_NAMES[Math.max(Number(period?.slice(5, 7) || 1) - 1, 0)] || "";

const createAfpEntry = ({ record, type, amount, period }) => {
  const costCenter = normalizeCostCenterAlias(record.cost_center || record.hub_unit || "Unassigned");
  const hub = normalizeHub(record.hub_unit, costCenter);
  return {
    type,
    source: "AFP_MASTER",
    sourceCostCenter: record.source_cost_center || costCenter,
    costCenter,
    region: getRegion(hub, costCenter),
    hub,
    period,
    month: monthFromPeriod(period),
    year: period.slice(0, 4),
    amount: roundCurrency(amount),
    afpNo: record.afp_no,
    description: record.description,
    status: record.status,
  };
};

export function buildAfpFinancialEntries(records) {
  return records.flatMap((record) => {
    const entries = [];
    if (record.submitted_value) {
      entries.push(createAfpEntry({
        record,
        type: "submitted",
        amount: record.submitted_value,
        period: normalizePeriod(record, record.submitted_date),
      }));
    }
    if (record.approved_value) {
      entries.push(createAfpEntry({
        record,
        type: "approved",
        amount: record.approved_value,
        period: normalizePeriod(record, record.approved_date || record.submitted_date),
      }));
    }
    return entries;
  });
}

const isAfpEntry = (entry) => (
  entry.type === "submitted" || entry.type === "approved"
);

const sumByType = (entries, type) => entries.reduce((total, entry) => (
  entry.type === type ? total + (entry.amount || 0) : total
), 0);

export function summarizeMasterAfp(masterEntries) {
  const masterSubmitted = roundCurrency(sumByType(masterEntries, "submitted"));
  const masterApproved = roundCurrency(sumByType(masterEntries, "approved"));

  return {
    startYear: "Google Sheets only",
    masterSubmitted,
    masterApproved,
    masterRows: masterEntries.length,
  };
}

export function mergeFinancialInputsWithAfpMaster(baselineEntries, afpRecords) {
  const masterEntries = buildAfpFinancialEntries(afpRecords);
  const retainedEntries = baselineEntries.filter((entry) => !isAfpEntry(entry));

  return {
    entries: [...retainedEntries, ...masterEntries],
    comparison: summarizeMasterAfp(masterEntries),
  };
}
