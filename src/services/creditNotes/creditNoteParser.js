import { COST_CENTER_HIERARCHY } from "../../data/costCenterHierarchy";
import { normalizeCostCenterAlias } from "../../data/costCenterAliases";

const CREDIT_NOTE_START_YEAR = import.meta.env.VITE_CREDIT_NOTE_START_YEAR || "2026";
const CATEGORIES = ["Store", "FA", "Scaffolding", "Materials", "Workshop"];
const ISSUED_BY_BY_CATEGORY = {
  Workshop: "MWS_23",
};

const MONTH_NUMBER_BY_NAME = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};
const MONTH_NAME_BY_NUMBER = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
};

const COST_CENTER_LOOKUP = new Map(COST_CENTER_HIERARCHY.flatMap((group) => (
  group.costCenters.map((costCenter) => [costCenter, { hub: group.hub, region: group.region }])
)));

const cleanText = (value) => String(value ?? "").trim();
const normalizeCostCenter = (costCenter) => normalizeCostCenterAlias(costCenter);

const parseAmount = (value) => {
  const text = cleanText(value)
    .replace(/[$,%\s]/g, "")
    .replace(/,/g, "");
  if (!text) return 0;
  const normalized = text.startsWith("(") && text.endsWith(")") ? `-${text.slice(1, -1)}` : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
};

const normalizePeriod = (value) => {
  const text = cleanText(value);
  const monthYear = text.match(/^([a-z]+)[\s-]+(\d{2}|\d{4})$/i);
  if (monthYear) {
    const month = MONTH_NUMBER_BY_NAME[monthYear[1].toLowerCase()];
    const year = monthYear[2].length === 2 ? `20${monthYear[2]}` : monthYear[2];
    return month ? `${year}-${month}` : "";
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 7);
};

const normalizeHub = (costCenter) => COST_CENTER_LOOKUP.get(costCenter)?.hub || "Unassigned";
const getRegion = (costCenter) => COST_CENTER_LOOKUP.get(costCenter)?.region || "Basra";

export function parseCreditNoteRows(rows) {
  return rows.flatMap((row) => {
    const period = normalizePeriod(row.Period);
    if (!period || period.slice(0, 4) < CREDIT_NOTE_START_YEAR) return [];

    const costCenter = normalizeCostCenter(cleanText(row["Cost Code"]) || "Unassigned");
    const hub = normalizeHub(costCenter);

    return CATEGORIES.map((category) => {
      const amount = parseAmount(row[category]);
      if (!amount) return null;

      return {
        type: "creditNotes",
        source: "CREDIT_NOTE",
        sourceCostCenter: costCenter,
        costCenter,
        region: getRegion(costCenter),
        hub,
        period,
        month: MONTH_NAME_BY_NUMBER[period.slice(5, 7)] || "",
        year: period.slice(0, 4),
        category,
        issuedBy: ISSUED_BY_BY_CATEGORY[category] || "CmpSB_23",
        amount,
      };
    }).filter(Boolean);
  });
}
