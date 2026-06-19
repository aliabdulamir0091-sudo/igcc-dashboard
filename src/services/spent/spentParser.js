import { COST_CENTER_HIERARCHY } from "../../data/costCenterHierarchy";
import { normalizeCostCenterAlias } from "../../data/costCenterAliases";

const MONTH_NUMBER_BY_NAME = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

const COST_CENTER_LOOKUP = new Map(COST_CENTER_HIERARCHY.flatMap((group) => (
  group.costCenters.map((costCenter) => [costCenter, { hub: group.hub, region: group.region }])
)));
const VALID_COST_CENTERS = new Set(COST_CENTER_LOOKUP.keys());

const cleanText = (value) => String(value ?? "").trim();

const parseAmount = (value) => {
  const original = cleanText(value);
  const text = original
    .replace(/[$,%\s]/g, "")
    .replace(/,/g, "");
  if (!text || text === "-") return 0;
  const normalized = text.startsWith("(") && text.endsWith(")") ? `-${text.slice(1, -1)}` : text;
  const number = Number(normalized);
  if (!Number.isFinite(number)) {
    throw new Error(`invalid Invoice Amount USD "${original}"`);
  }
  return number;
};

const normalizeMonth = (value) => {
  const month = cleanText(value).slice(0, 3);
  return Object.keys(MONTH_NUMBER_BY_NAME).find((item) => item.toLowerCase() === month.toLowerCase()) || "";
};

const normalizeYear = (value) => {
  const year = cleanText(value);
  if (/^\d{4}$/.test(year)) return year;
  if (/^\d{2}$/.test(year)) return `20${year}`;
  return "";
};

const normalizeHub = (level1, costCenter) => {
  const mapped = COST_CENTER_LOOKUP.get(costCenter);
  if (mapped?.hub) return mapped.hub;

  const value = cleanText(level1).toLowerCase();
  if (value.includes("bgc")) return "BGC Hub";
  if (value.includes("roo")) return "ROO Hub";
  if (value.includes("total")) return "Total Hub";
  if (value.includes("ho") || value.includes("head")) return "Head Office";
  if (value.includes("camp")) return "Camp";
  return cleanText(level1) || "Unassigned";
};

const normalizeCostCenter = (costCenter) => normalizeCostCenterAlias(costCenter);

const getRegion = (hub, costCenter) => {
  const mapped = COST_CENTER_LOOKUP.get(costCenter);
  if (mapped?.region) return mapped.region;
  if (hub === "Kirkuk") return "Kirkuk";
  return "Basra";
};

export function parseSpentRows(rows, options = {}) {
  const source = options.source || "SPENT_REPORT";
  const sourceSheet = options.sourceSheet || "";
  const failures = [];

  const entries = rows
    .map((row, index) => {
      const rowNumber = index + 2;
      const rawCostCenter = cleanText(row["Level 2"]);
      const rawSourceCostCenter = rawCostCenter;
      const costCenter = normalizeCostCenter(rawCostCenter);
      const sourceCostCenter = normalizeCostCenter(rawSourceCostCenter);
      const month = normalizeMonth(row.Month);
      const year = normalizeYear(row.Year);
      const period = year && month ? `${year}-${MONTH_NUMBER_BY_NAME[month]}` : "";
      const hub = normalizeHub(row["Level 1"], costCenter);
      let amount = 0;

      try {
        amount = parseAmount(row["Invoice Amount USD"]);
      } catch (error) {
        failures.push(`row ${rowNumber}: ${error.message}`);
      }

      if (amount && !month) failures.push(`row ${rowNumber}: invalid Month "${cleanText(row.Month)}"`);
      if (amount && !year) failures.push(`row ${rowNumber}: invalid Year "${cleanText(row.Year)}"`);
      if (amount && !rawCostCenter) failures.push(`row ${rowNumber}: Level 2 is required for counted spent rows`);
      if (amount && rawCostCenter && !VALID_COST_CENTERS.has(costCenter)) {
        failures.push(`row ${rowNumber}: Level 2 "${rawCostCenter}" is not an approved cost center`);
      }

      return {
        type: "spent",
        source,
        sourceSheet,
        sourceCostCenter,
        costCenter,
        region: getRegion(hub, costCenter),
        hub,
        period,
        month,
        year,
        glName: cleanText(row["GL Name"]) || "Unclassified",
        glAccount: cleanText(row["GL Account"]),
        vendor: cleanText(row.Vendor),
        description: cleanText(row.Description),
        invoiceNo: cleanText(row["Invoice No."]),
        invoiceDate: cleanText(row["Invoice Date"]),
        poNumber: cleanText(row["PO Number"]),
        amount,
      };
    })
    .filter((entry) => entry.period && entry.amount);

  if (failures.length) {
    const sample = failures.slice(0, 6).join("; ");
    const suffix = failures.length > 6 ? `; plus ${failures.length - 6} more` : "";
    throw new Error(`${sourceSheet || "Spent data"} has unreadable rows: ${sample}${suffix}.`);
  }

  if (rows.length && !entries.length) {
    throw new Error(`${sourceSheet || "Spent data"} loaded ${rows.length} rows but no valid spent entries. Check Month, Year, and Invoice Amount USD columns.`);
  }

  return entries;
}
