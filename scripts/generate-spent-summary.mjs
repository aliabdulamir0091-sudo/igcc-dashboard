import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { read, utils } from "xlsx";

const root = process.cwd();
const dataDir = join(root, "public", "data", "spent-report");
const manifestFile = join(dataDir, "manifest.json");
const processedDir = join(dataDir, "processed");
const detailDir = join(processedDir, "details");
const summaryFile = join(processedDir, "summary.json");

const monthOrder = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
  sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const monthLabels = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const costCenterAliases = {
  GRLBG: "GRLBG_23", GRLTOT: "GRLTOT_25", "E&I-MAJ": "E&I-MAJ_24", KAZ: "KAZ_23",
  KAZ_A23: "KAZ_23", UQ_A23: "UQ_23", ZUBAIR_A23: "ZBR_23", "NR-NGL_A25": "NR-NGL_2025",
  "OHTL _25": "OHTL_25", pwri_23: "PWRI_23", "NR-NGL_25": "NR-NGL_2025", BNGL_25: "BNGL-25",
  QUR_23: "QTC_24", MITSOHTL: "MITAS", MITASOHTL: "MITAS", ROOM_23: "CVMNT_23",
  ROOP_23: "GRLRO_23", TMS_26: "MWP_23", EPMNT_23: "EIMNT_23", BGC_23: "GRLBG_23",
  BGCG_23: "GRLBG_23", camp_23: "CmpSB_23", Camp_23: "CmpSB_23", HO_23: "HO_SB_23",
  management: "HO_SB_23", Management: "HO_SB_23", MANAGEMENT: "HO_SB_23", ROOG_23: "GRLRO_23",
  TOTAL_25: "GRLTOT_25",
};

const costCenterGroups = [
  ["BGC Hub", ["GRLBG_23", "ZBR_23", "KAZ_23", "UQ_23", "QTC_24", "MANPR_23", "SPAS_23", "EX_23", "BNGL-25", "NR-NGL_2025", "NR-NGL25"]],
  ["ROO Hub", ["GRLRO_23", "EITAR_23", "MPTAR_23", "MPMNT_23", "CVMNT_23", "EIMNT_23", "EISP_23", "MPSP_23", "EIESP_23", "PWRI_23", "PWRI-PWT", "WOD_23", "KBR_23", "E&I-MAJ_24", "DS-01SP_24", "Kiosk-25", "OHTL_25", "PWRI2_23", "DG02_PWD", "QAWPT_23", "MWP_23", "FFF_23", "CPSs_23", "FLWLN_23", "MITAS", "RTPFL_23", "CMSN_23", "CMNT_23"]],
  ["Camp", ["CmpSB_23", "MWS_23"]],
  ["Head Office", ["HO_SB_23"]],
  ["Total Hub", ["GRLTOT_25"]],
];
const hubSections = [
  ["Basra Portfolio", ["BGC Hub", "ROO Hub", "Camp", "Total Hub"]],
  ["Kirkuk Portfolio", ["Kirkuk Hub"]],
  ["Head Office", ["Head Office"]],
];

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
  const number = parseFloat(String(raw).replace(/[$\s,"]+/g, "").replace(/--/g, "0"));
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
const getHubForCostCenter = (costCenter) => costCenterGroups.find(([, centers]) => centers.includes(costCenter))?.[0] ?? "Unmapped";
const getPortfolioForHub = (hub) => hubSections.find(([, hubs]) => hubs.includes(hub))?.[0] ?? (hub === "Unmapped" ? "Unmapped" : "Other");
const getPeriodParts = (monthRaw, yearRaw) => {
  if (monthRaw instanceof Date && !Number.isNaN(monthRaw.getTime())) {
    const monthNumber = monthRaw.getMonth() + 1;
    const year = getYearValue(yearRaw) ?? monthRaw.getFullYear();
    return { monthNumber, monthName: monthLabels[monthNumber], quarter: Math.ceil(monthNumber / 3), year };
  }
  const monthNumber = getMonthNumber(monthRaw);
  const year = getYearValue(yearRaw);
  return { monthNumber, monthName: monthNumber ? monthLabels[monthNumber] : normalizeValue(monthRaw), quarter: monthNumber ? Math.ceil(monthNumber / 3) : null, year };
};

if (!existsSync(manifestFile)) throw new Error(`Missing manifest: ${manifestFile}`);
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));

rmSync(processedDir, { recursive: true, force: true });
mkdirSync(detailDir, { recursive: true });

const summaryMap = new Map();
const detailMap = new Map();
const invalidRows = [];
const importSummary = { totalRows: 0, validRows: 0, invalidRows: 0, monthsDetected: [], filesProcessed: [], fileErrors: [] };

manifest.forEach((fileName) => {
  const filePath = join(dataDir, fileName);
  const fileSummary = { fileName, totalRows: 0, validRows: 0, invalidRows: 0, monthsDetected: [] };

  if (!existsSync(filePath)) {
    importSummary.fileErrors.push({ fileName, error: "File listed in manifest was not found." });
    return;
  }

  const workbook = read(readFileSync(filePath), { type: "buffer", cellDates: true });
  const masterSheet = workbook.Sheets.Master;
  if (!masterSheet) {
    importSummary.fileErrors.push({ fileName, error: "Missing Master sheet." });
    return;
  }

  const rows = utils.sheet_to_json(masterSheet, { defval: "" });
  rows.forEach((row, rowIndex) => {
    importSummary.totalRows += 1;
    fileSummary.totalRows += 1;
    const rawCostCenter = normalizeValue(normalizeHeader(row, "Level 2", "Level2", "level 2", "level2", "Cost Center", "costCenter", "cost_center", "cost center", "Center"));
    const costCenter = costCenterAliases[rawCostCenter] || rawCostCenter;
    const monthValue = normalizeHeader(row, "Month", "month", "Billing Month", "billing_month", "Period", "period", "Date", "date");
    const yearValue = normalizeHeader(row, "Year", "year", "Billing Year", "billing_year", "Period", "period", "Date", "date");
    const { monthNumber, monthName, quarter, year } = getPeriodParts(monthValue, yearValue);
    const amount = cleanupAmount(normalizeHeader(row, "Invoice Amount USD", "Invoice Amount", "InvoiceAmountUSD", "Invoice_Amount_USD", "Amount USD", "Amount", "amount", "Cost", "Total", "total"));
    const category = normalizeValue(normalizeHeader(row, "GL Name", "GLName", "Cost Type", "costType", "Category", "category")) || "Uncategorized";
    const vendor = normalizeValue(normalizeHeader(row, "Vendor", "Supplier", "Contractor", "vendor", "supplier")) || "Unspecified Vendor";
    const project = normalizeValue(normalizeHeader(row, "Project", "project", "Level 1", "Level1", "Portfolio", "portfolio"));
    const hub = normalizeValue(normalizeHeader(row, "Hub", "hub")) || getHubForCostCenter(costCenter);
    const portfolio = normalizeValue(normalizeHeader(row, "Portfolio", "portfolio")) || getPortfolioForHub(hub);

    if (!year || !monthNumber) {
      invalidRows.push({ fileName, rowNumber: rowIndex + 2, reason: "Month/year could not be detected.", costCenter, category, amount });
      importSummary.invalidRows += 1;
      fileSummary.invalidRows += 1;
      return;
    }

    const detailRow = {
      id: `${fileName}-${rowIndex}`,
      fileName,
      rowNumber: rowIndex + 2,
      project,
      portfolio,
      hub,
      costCenter,
      month: `${monthName} ${year}`,
      monthName,
      monthNumber,
      quarter,
      year,
      category,
      vendor,
      amount,
      source: "Spent Report Master",
      sourceType: "detail",
    };

    const periodKey = `${year}-${String(monthNumber).padStart(2, "0")}`;
    const summaryKey = [year, monthNumber, project, portfolio, hub, costCenter, category].join("|");
    const currentSummary = summaryMap.get(summaryKey) ?? { ...detailRow, id: summaryKey, vendor: "Summary", amount: 0, rows: 0, source: "Spent Summary", sourceType: "summary" };
    currentSummary.amount += amount;
    currentSummary.rows += 1;
    summaryMap.set(summaryKey, currentSummary);

    if (!detailMap.has(periodKey)) detailMap.set(periodKey, []);
    detailMap.get(periodKey).push(detailRow);
    importSummary.validRows += 1;
    fileSummary.validRows += 1;
    fileSummary.monthsDetected.push(periodKey);
  });

  fileSummary.monthsDetected = Array.from(new Set(fileSummary.monthsDetected)).sort();
  importSummary.filesProcessed.push(fileSummary);
});

importSummary.monthsDetected = Array.from(detailMap.keys()).sort();

for (const [periodKey, rows] of detailMap) {
  writeFileSync(join(detailDir, `${periodKey}.json`), `${JSON.stringify({ periodKey, rows })}\n`);
}

writeFileSync(summaryFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), importSummary, invalidRows: invalidRows.slice(0, 500), rows: Array.from(summaryMap.values()) })}\n`);
console.log(`Processed ${importSummary.filesProcessed.length} files.`);
console.log(`Valid rows: ${importSummary.validRows.toLocaleString()} / ${importSummary.totalRows.toLocaleString()}`);
console.log(`Invalid rows: ${importSummary.invalidRows.toLocaleString()}`);
console.log(`Months detected: ${importSummary.monthsDetected.join(", ")}`);
