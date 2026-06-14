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

const cleanText = (value) => String(value ?? "").trim();

const parseAmount = (value) => {
  const text = cleanText(value)
    .replace(/[$,%\s]/g, "")
    .replace(/,/g, "");
  if (!text) return 0;
  const normalized = text.startsWith("(") && text.endsWith(")") ? `-${text.slice(1, -1)}` : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
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

  return rows
    .map((row) => {
      const rawCostCenter = cleanText(row["Level 2"]) || cleanText(row["Level 1"]) || "Unassigned";
      const rawSourceCostCenter = cleanText(row["Level 1"]) || rawCostCenter;
      const costCenter = normalizeCostCenter(rawCostCenter);
      const sourceCostCenter = normalizeCostCenter(rawSourceCostCenter);
      const month = normalizeMonth(row.Month);
      const year = normalizeYear(row.Year);
      const period = year && month ? `${year}-${MONTH_NUMBER_BY_NAME[month]}` : "";
      const hub = normalizeHub(row["Level 1"], costCenter);

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
        amount: parseAmount(row["Invoice Amount USD"]),
      };
    })
    .filter((entry) => entry.period && entry.amount);
}
