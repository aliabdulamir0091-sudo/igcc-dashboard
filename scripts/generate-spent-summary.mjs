import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { read, utils } from "xlsx";

const root = process.cwd();
const sourceFile = join(root, "public", "data", "spent-report", "source-excel", "master_spent_report.xlsx");
const spentDir = join(root, "public", "data", "spent-report");
const processedDir = join(spentDir, "processed");
const summaryDir = join(spentDir, "summary");
const creditNoteOutputDir = join(spentDir, "credit-note");
const manifestFile = join(processedDir, "manifest.json");
const creditNoteSummaryFile = join(creditNoteOutputDir, "credit_note_summary.json");
const workshopCreditIssuerCostCenter = "MWS_23";
const creditNoteSourceCandidates = [
  join(spentDir, "Credit Note"),
  join(spentDir, "credit note"),
  join(root, "..", "Spent report", "Credit Note"),
  join(root, "..", "Spent Report", "Credit Note"),
];

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
  TOTAL_25: "GRLTOT_25", "PWT PWRI1_23": "PWRI-PWT", "PWT PWRI_23": "PWRI-PWT", "PWRI1_23": "PWRI-PWT",
};

const costCenterGroups = [
  ["BGC Hub", ["GRLBG_23", "ZBR_23", "KAZ_23", "UQ_23", "QTC_24", "MANPR_23", "SPAS_23", "EX_23", "BNGL-25", "NR-NGL_2025", "NR-NGL25"]],
  ["ROO Hub", ["GRLRO_23", "EITAR_23", "MPTAR_23", "MPMNT_23", "CVMNT_23", "EIMNT_23", "EISP_23", "MPSP_23", "EIESP_23", "PWRI_23", "PWRI-PWT", "WOD_23", "KBR_23", "E&I-MAJ_24", "DS-01SP_24", "Kiosk-25", "OHTL_25", "PWRI2_23", "DG02_PWD", "QAWPT_23", "MWP_23", "FFF_23", "CPSs_23", "FLWLN_23", "MITAS", "RTPFL_23", "CMSN_23", "CMNT_23"]],
  ["Camp", ["CmpSB_23", "MWS_23"]],
  ["Head Office", ["HO_SB_23"]],
  ["Total Hub", ["GRLTOT_25"]],
  ["BP Hub", ["GRL-KR-BP-25"]],
  ["West Qurna Hub", ["WQ1SB_23"]],
  ["Valves", ["Valves_25"]],
];
const hubSections = [
  ["Basra Portfolio", ["BGC Hub", "ROO Hub", "Camp", "Total Hub", "West Qurna Hub", "Valves"]],
  ["Kirkuk Portfolio", ["BP Hub"]],
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
  if (typeof raw === "number" && raw > 1900 && raw < 2100) return raw;
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
const makePeriodKey = (year, monthNumber) => `${year}-${String(monthNumber).padStart(2, "0")}`;
const makeSpentFileName = (year, monthNumber) => `spent_${year}_${String(monthNumber).padStart(2, "0")}.json`;
const getPeriodFromDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const normalizedDate = new Date(value);
    normalizedDate.setDate(normalizedDate.getDate() + 1);
    const monthNumber = normalizedDate.getMonth() + 1;
    const year = normalizedDate.getFullYear();
    return { monthNumber, monthName: monthLabels[monthNumber], quarter: Math.ceil(monthNumber / 3), year };
  }

  const date = new Date(value);
  if (value && !Number.isNaN(date.getTime()) && /[a-z]|\d{4}|-|\/|T/i.test(String(value))) {
    date.setDate(date.getDate() + 1);
    const monthNumber = date.getMonth() + 1;
    const year = date.getFullYear();
    return { monthNumber, monthName: monthLabels[monthNumber], quarter: Math.ceil(monthNumber / 3), year };
  }

  return null;
};
const getPeriodFromFileName = (fileName) => {
  const value = fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
  const monthMatch = value.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i);
  const yearMatch = value.match(/\b(20\d{2}|\d{2})\b/);
  if (!monthMatch || !yearMatch) return null;

  const monthNumber = monthOrder[monthMatch[1].toLowerCase()];
  const rawYear = Number(yearMatch[1]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return { monthNumber, monthName: monthLabels[monthNumber], quarter: Math.ceil(monthNumber / 3), year };
};
const getHeaderPeriod = (header, fallbackPeriod) => {
  const datePeriod = getPeriodFromDate(header);
  if (datePeriod) return datePeriod;

  const value = normalizeValue(header);
  const [monthRaw, yearRaw] = value.split(/\s+|-/);
  const parsed = getPeriodParts(monthRaw, yearRaw);
  return parsed.year && parsed.monthNumber ? parsed : fallbackPeriod;
};

const addSummary = (map, keyParts, row, overrides = {}) => {
  const key = keyParts.join("|");
  const current = map.get(key) ?? { ...row, ...overrides, id: key, vendor: "Summary", amount: 0, rows: 0, source: "Spent Summary", sourceType: "summary" };
  current.amount += row.amount;
  current.rows += 1;
  map.set(key, current);
};

if (!existsSync(sourceFile)) throw new Error(`Missing source Excel: ${sourceFile}`);

rmSync(processedDir, { recursive: true, force: true });
rmSync(summaryDir, { recursive: true, force: true });
mkdirSync(processedDir, { recursive: true });
mkdirSync(summaryDir, { recursive: true });
mkdirSync(creditNoteOutputDir, { recursive: true });

const workbook = read(readFileSync(sourceFile), { type: "buffer", cellDates: true });
const masterSheet = workbook.Sheets.Master;
if (!masterSheet) throw new Error('Source workbook must include a sheet named "Master".');

const rows = utils.sheet_to_json(masterSheet, { defval: "" });
const detailMap = new Map();
const monthlySummaryMap = new Map();
const yearlySummaryMap = new Map();
const projectSummaryMap = new Map();
const costCenterSummaryMap = new Map();
const hubSummaryMap = new Map();
const invalidRows = [];
const importSummary = {
  sourceFile: "source-excel/master_spent_report.xlsx",
  totalRows: rows.length,
  validRows: 0,
  invalidRows: 0,
  monthsDetected: [],
  filesProcessed: [{ fileName: "master_spent_report.xlsx", totalRows: rows.length, validRows: 0, invalidRows: 0, monthsDetected: [] }],
  fileErrors: [],
};

rows.forEach((row, rowIndex) => {
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
    invalidRows.push({ rowNumber: rowIndex + 2, reason: "Month/year could not be detected.", costCenter, category, amount });
    importSummary.invalidRows += 1;
    importSummary.filesProcessed[0].invalidRows += 1;
    return;
  }

  const detailRow = {
    id: `master-${rowIndex}`,
    fileName: "master_spent_report.xlsx",
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

  const periodKey = makePeriodKey(year, monthNumber);
  if (!detailMap.has(periodKey)) detailMap.set(periodKey, []);
  detailMap.get(periodKey).push(detailRow);

  addSummary(monthlySummaryMap, [year, monthNumber, project, portfolio, hub, costCenter, category], detailRow);
  addSummary(yearlySummaryMap, [year, project, portfolio, hub, costCenter, category], detailRow, { month: String(year), monthName: "", monthNumber: null, quarter: null });
  addSummary(projectSummaryMap, [project || "Unspecified", year, monthNumber, category], detailRow);
  addSummary(costCenterSummaryMap, [costCenter || "Unmapped", year, monthNumber, category], detailRow);
  addSummary(hubSummaryMap, [hub || "Unmapped", year, monthNumber, category], detailRow);

  importSummary.validRows += 1;
  importSummary.filesProcessed[0].validRows += 1;
  importSummary.filesProcessed[0].monthsDetected.push(periodKey);
});

const periods = Array.from(detailMap.keys()).sort();
importSummary.monthsDetected = periods;
importSummary.filesProcessed[0].monthsDetected = periods;

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceFile: importSummary.sourceFile,
  months: periods.map((periodKey) => {
    const [year, month] = periodKey.split("-");
    return {
      periodKey,
      year: Number(year),
      monthNumber: Number(month),
      file: makeSpentFileName(year, month),
      rows: detailMap.get(periodKey).length,
    };
  }),
  importSummary,
};

for (const periodKey of periods) {
  const [year, month] = periodKey.split("-");
  writeFileSync(join(processedDir, makeSpentFileName(year, month)), `${JSON.stringify({ periodKey, rows: detailMap.get(periodKey) })}\n`);
}

const writeSummary = (fileName, map) => {
  writeFileSync(join(summaryDir, fileName), `${JSON.stringify({ generatedAt: manifest.generatedAt, importSummary, invalidRows: invalidRows.slice(0, 500), rows: Array.from(map.values()) })}\n`);
};

writeSummary("monthly_summary.json", monthlySummaryMap);
writeSummary("yearly_summary.json", yearlySummaryMap);
writeSummary("project_summary.json", projectSummaryMap);
writeSummary("cost_center_summary.json", costCenterSummaryMap);
writeSummary("hub_summary.json", hubSummaryMap);
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

const readCreditNoteRows = () => {
  const sourceDir = creditNoteSourceCandidates.find((dir) => existsSync(dir));
  const files = sourceDir
    ? readdirSync(sourceDir).filter((fileName) => /\.xlsx$/i.test(fileName) && !fileName.startsWith("~$")).sort()
    : [];
  const creditRows = [];
  const fileErrors = [];
  const importSummary = {
    sourceFolder: sourceDir ? "Spent report/Credit Note" : "Credit Note folder not found",
    totalFiles: files.length,
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    monthsDetected: [],
    filesProcessed: [],
    fileErrors,
  };

  files.forEach((fileName) => {
    const fileSummary = { fileName, totalRows: 0, validRows: 0, invalidRows: 0, monthsDetected: [] };
    try {
      const workbook = read(readFileSync(join(sourceDir, fileName)), { type: "buffer", cellDates: true });
      const fallbackPeriod = getPeriodFromFileName(fileName);

      workbook.SheetNames.forEach((sheetName) => {
        const rawRows = utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", header: 1, blankrows: false });
        const headerIndex = rawRows.findIndex((row) => row.some((cell) => /cost\s*code|cost\s*center/i.test(normalizeValue(cell))));
        if (headerIndex < 0) return;

        const headers = rawRows[headerIndex];
        const costCenterIndex = headers.findIndex((cell) => /cost\s*code|cost\s*center/i.test(normalizeValue(cell)));
        const dataRows = rawRows.slice(headerIndex + 1);
        fileSummary.totalRows += dataRows.length;
        importSummary.totalRows += dataRows.length;

        dataRows.forEach((row, rowOffset) => {
          const rawCostCenter = normalizeValue(row[costCenterIndex]);
          const costCenter = costCenterAliases[rawCostCenter] || rawCostCenter;
          if (!costCenter || /^total|grand total$/i.test(costCenter)) return;

          let rowHadValue = false;
          headers.forEach((header, columnIndex) => {
            if (columnIndex === costCenterIndex) return;
            const headerLabel = normalizeValue(header);
            const headerLower = headerLabel.toLowerCase();
            if (!headerLabel || /^(no\.?|total revenue|grand total|total)$/i.test(headerLabel)) return;

            const amount = cleanupAmount(row[columnIndex]);
            if (!amount) return;

            const period = getHeaderPeriod(header, fallbackPeriod);
            if (!period?.year || !period?.monthNumber) {
              fileSummary.invalidRows += 1;
              importSummary.invalidRows += 1;
              return;
            }

            const cnReceived = amount;
            const cnIssued = 0;
            const periodKey = makePeriodKey(period.year, period.monthNumber);
            const category = getPeriodFromDate(header) ? "Credit Note" : /fa|fixed/i.test(headerLabel) ? "Fixed Assets" : headerLabel;
            const baseCreditRow = {
              fileName,
              sheetName,
              rowNumber: headerIndex + rowOffset + 2,
              month: `${period.monthName} ${period.year}`,
              monthName: period.monthName,
              monthNumber: period.monthNumber,
              quarter: period.quarter,
              year: period.year,
              category,
              vendor: "Credit Note",
              source: "Credit Note",
              sourceType: "credit-note",
            };

            creditRows.push({
              ...baseCreditRow,
              id: `${fileName}:${sheetName}:${headerIndex + rowOffset + 2}:${columnIndex}`,
              portfolio: getPortfolioForHub(getHubForCostCenter(costCenter)),
              hub: getHubForCostCenter(costCenter),
              costCenter,
              cnReceived,
              cnIssued,
              amount: cnReceived - cnIssued,
            });
            creditRows.push({
              ...baseCreditRow,
              id: `${fileName}:${sheetName}:${headerIndex + rowOffset + 2}:${columnIndex}:workshop-issued`,
              portfolio: getPortfolioForHub(getHubForCostCenter(workshopCreditIssuerCostCenter)),
              hub: getHubForCostCenter(workshopCreditIssuerCostCenter),
              costCenter: workshopCreditIssuerCostCenter,
              cnReceived: 0,
              cnIssued: amount,
              amount: -amount,
              source: "Workshop Credit Note Offset",
            });
            rowHadValue = true;
            fileSummary.validRows += 1;
            importSummary.validRows += 1;
            fileSummary.monthsDetected.push(periodKey);
          });

          if (!rowHadValue) return;
        });
      });
    } catch (error) {
      fileErrors.push({ fileName, error: error.message });
    }

    fileSummary.monthsDetected = Array.from(new Set(fileSummary.monthsDetected)).sort();
    importSummary.filesProcessed.push(fileSummary);
  });

  importSummary.monthsDetected = Array.from(new Set(creditRows.map((row) => makePeriodKey(row.year, row.monthNumber)))).sort();
  return { generatedAt: new Date().toISOString(), importSummary, rows: creditRows };
};

writeFileSync(creditNoteSummaryFile, `${JSON.stringify(readCreditNoteRows())}\n`);

console.log(`Source rows: ${importSummary.totalRows.toLocaleString()}`);
console.log(`Valid rows: ${importSummary.validRows.toLocaleString()}`);
console.log(`Invalid rows: ${importSummary.invalidRows.toLocaleString()}`);
console.log(`Months detected: ${periods.join(", ")}`);
