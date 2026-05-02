import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { read, utils } from "xlsx";

const root = process.cwd();
const sourceFile = join(root, "public", "Master Spent Report.xlsx");
const outputFile = join(root, "public", "spent-summary.json");

const monthOrder = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const monthLabels = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const costCenterAliases = {
  GRLBG: "GRLBG_23",
  GRLTOT: "GRLTOT_25",
  "E&I-MAJ": "E&I-MAJ_24",
  KAZ: "KAZ_23",
  KAZ_A23: "KAZ_23",
  UQ_A23: "UQ_23",
  ZUBAIR_A23: "ZBR_23",
  "NR-NGL_A25": "NR-NGL_2025",
  "OHTL _25": "OHTL_25",
  pwri_23: "PWRI_23",
  "NR-NGL_25": "NR-NGL_2025",
  BNGL_25: "BNGL-25",
  QUR_23: "QTC_24",
  MITSOHTL: "MITAS",
  MITASOHTL: "MITAS",
  ROOM_23: "CVMNT_23",
  ROOP_23: "GRLRO_23",
  TMS_26: "MWP_23",
  EPMNT_23: "EIMNT_23",
  BGC_23: "GRLBG_23",
  BGCG_23: "GRLBG_23",
  camp_23: "CmpSB_23",
  Camp_23: "CmpSB_23",
  HO_23: "HO_SB_23",
  management: "HO_SB_23",
  Management: "HO_SB_23",
  MANAGEMENT: "HO_SB_23",
  ROOG_23: "GRLRO_23",
  TOTAL_25: "GRLTOT_25",
};

const normalizeValue = (raw) => String(raw ?? "").replace(/['"\u201C\u201D\u2018\u2019]/g, "").trim();

const normalizeHeader = (row, ...keys) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    const matchingKey = Object.keys(row).find((rowKey) => normalizeValue(rowKey).toLowerCase() === normalizeValue(key).toLowerCase());
    if (matchingKey) return row[matchingKey];
  }

  return "";
};

const cleanupAmount = (raw) => {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[$\s,"]+/g, "").replace(/--/g, "0");
  const number = parseFloat(cleaned);
  return Number.isFinite(number) ? number : 0;
};

const getYearValue = (raw) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.getFullYear();
  const match = String(raw ?? "").match(/\b(20\d{2}|19\d{2})\b/);
  return match ? Number(match[1]) : null;
};

const getMonthNumber = (raw) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.getMonth() + 1;
  const value = normalizeValue(raw).toLowerCase();
  if (!value) return null;
  if (monthOrder[value]) return monthOrder[value];
  const firstWord = value.split(/\s+/)[0];
  if (monthOrder[firstWord]) return monthOrder[firstWord];
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 12 ? numeric : null;
};

const getPeriodParts = (monthRaw, yearRaw) => {
  if (monthRaw instanceof Date && !Number.isNaN(monthRaw.getTime())) {
    const monthNumber = monthRaw.getMonth() + 1;
    const year = getYearValue(yearRaw) ?? monthRaw.getFullYear();
    return { monthNumber, monthName: monthLabels[monthNumber], quarter: Math.ceil(monthNumber / 3), year };
  }

  const monthNumber = getMonthNumber(monthRaw);
  const year = getYearValue(yearRaw);
  return {
    monthNumber,
    monthName: monthNumber ? monthLabels[monthNumber] : normalizeValue(monthRaw),
    quarter: monthNumber ? Math.ceil(monthNumber / 3) : null,
    year,
  };
};

const workbook = read(readFileSync(sourceFile), { type: "buffer", cellDates: true });
const ignoredSheets = new Set(["summary", "sumary", "summay", "list", "data validation", "sheet1", "sheet2"]);
const rows = workbook.Sheets.Master
  ? utils.sheet_to_json(workbook.Sheets.Master, { defval: "" })
  : workbook.SheetNames.filter((name) => !ignoredSheets.has(name.trim().toLowerCase())).flatMap((name) => utils.sheet_to_json(workbook.Sheets[name], { defval: "" }));

const summaryMap = new Map();

rows.forEach((row) => {
  const rawCostCenter = normalizeValue(normalizeHeader(row, "Level 2", "Level2", "level 2", "level2", "Cost Center", "costCenter", "cost_center", "cost center", "Center"));
  const costCenter = costCenterAliases[rawCostCenter] || rawCostCenter;
  const monthValue = normalizeValue(normalizeHeader(row, "Month", "month", "Billing Month", "billing_month"));
  const yearValue = normalizeValue(normalizeHeader(row, "Year", "year"));
  const { monthNumber, monthName, quarter, year } = getPeriodParts(monthValue, yearValue);
  const category = normalizeValue(normalizeHeader(row, "GL Name", "GLName", "Cost Type", "costType", "Category", "category")) || "Uncategorized";
  const amount = cleanupAmount(normalizeHeader(row, "Invoice Amount USD", "Invoice Amount", "InvoiceAmountUSD", "Invoice_Amount_USD", "Amount USD", "Amount", "amount", "Cost", "Total", "total"));

  if (!costCenter && !monthNumber && amount === 0) return;

  const key = [costCenter, year || "", monthNumber || "", category].join("|");
  const current = summaryMap.get(key) ?? {
    costCenter,
    month: year ? `${monthName} ${year}`.trim() : monthValue,
    monthName,
    monthNumber,
    quarter,
    year,
    category,
    vendor: "Summary",
    amount: 0,
    source: "Summary",
    sourceType: "summary",
    rows: 0,
  };

  current.amount += amount;
  current.rows += 1;
  summaryMap.set(key, current);
});

const summaryRows = Array.from(summaryMap.values()).filter((row) => row.amount !== 0);
writeFileSync(outputFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), rows: summaryRows })}\n`);
console.log(`Wrote ${summaryRows.length.toLocaleString()} summary rows to ${outputFile}`);
