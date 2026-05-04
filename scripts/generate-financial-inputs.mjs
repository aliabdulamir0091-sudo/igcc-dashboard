import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { COST_CENTER_HIERARCHY } from "../src/data/costCenterHierarchy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const spentDataPath = path.join(repoRoot, "src/data/spentReportData.json");
const revenueWorkbookPath = process.argv[2] || "C:/Users/asus/OneDrive/Desktop/Spent Report/Revenue .xlsx";
const creditNoteDir = process.argv[3] || "C:/Users/asus/OneDrive/Desktop/Spent Report/Credit Note";
const outputPath = path.join(repoRoot, "src/data/financialInputsData.json");

const MONTHS = {
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

const COST_CENTER_ALIASES = {
  BNGL_25: "BNGL-25",
  GRLBG: "GRLBG_23",
  GRLTOT: "GRLTOT_25",
  TOTAL_25: "GRLTOT_25",
  KAZ: "KAZ_23",
  KAZ_A23: "KAZ_23",
  ZUBAIR_A23: "ZBR_23",
  UQ_A23: "UQ_23",
  "NR-NGL_A25": "NR-NGL_2025",
  "NR-NGL25": "NR-NGL_2025",
  "NR-NGL_25": "NR-NGL_2025",
  "OHTL _25": "OHTL_25",
  camp_23: "Camp",
  pwri_23: "PWRI_23",
  "E&I-MAJ": "E&I-MAJ_24",
  QUR_23: "QTC_24",
  MITSOHTL: "MITAS",
  MITASOHTL: "MITAS",
  Management: "HO_SB_23",
  TMS_26: "MWP_23",
  CMNT_23: "CVMNT_23",
  BGCG_23: "GRLBG_23",
  ROOP_23: "GRLRO_23",
  BGC_23: "GRLBG_23",
  ROOM_23: "CVMNT_23",
  EPMNT_23: "EIMNT_23",
  HO_23: "HO_SB_23",
  ROOG_23: "GRLRO_23",
};

const clean = (value) => String(value ?? "").trim();

const parseAmount = (value) => {
  if (typeof value === "number") return value;
  const text = clean(value);
  if (!text || text === "-" || text === "$-") return 0;
  const isNegative = /^\(.*\)$/.test(text);
  const normalized = text.replace(/\$/g, "").replace(/,/g, "").replace(/[()]/g, "").replace(/\s/g, "");
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return 0;
  return isNegative ? -amount : amount;
};

const roundCurrency = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const canonicalIndex = new Map();
for (const item of COST_CENTER_HIERARCHY) {
  for (const costCenter of item.costCenters) {
    canonicalIndex.set(costCenter, { region: item.region, hub: item.hub, costCenter });
  }
}

const resolveCostCenter = (value) => {
  const source = clean(value);
  const canonical = COST_CENTER_ALIASES[source] || source;
  const mapping = canonicalIndex.get(canonical);
  return {
    sourceCostCenter: source,
    costCenter: mapping?.costCenter || canonical,
    region: mapping?.region || "Unmapped",
    hub: mapping?.hub || "Unmapped",
    isMapped: Boolean(mapping),
  };
};

const parsePeriodLabel = (label) => {
  const match = clean(label).match(/^([A-Za-z]{3})[-\s]?(\d{2,4})$/);
  if (!match) return null;
  const month = match[1].slice(0, 3);
  const monthNo = MONTHS[month];
  if (!monthNo) return null;
  const year = match[2].length === 2 ? `20${match[2]}` : match[2];
  return { period: `${year}-${monthNo}`, month, year };
};

const addToMap = (map, key, values) => {
  const current = map.get(key) || { amount: 0, count: 0, ...values };
  current.amount += values.amount || 0;
  current.count += values.count || 0;
  map.set(key, current);
};

const addInput = (map, key, base, field, amount) => {
  const current = map.get(key) || { ...base, spent: 0, submitted: 0, approved: 0, creditNotes: 0 };
  current[field] += amount || 0;
  map.set(key, current);
};

const readSpentData = async () => JSON.parse(await fs.readFile(spentDataPath, "utf8"));

const readAfpSheet = (workbook, sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Could not find ${sheetName} in ${revenueWorkbookPath}`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const headers = rows[0].map(parsePeriodLabel);
  const entries = [];

  for (const row of rows.slice(1)) {
    const sourceCostCenter = clean(row[0]);
    if (!sourceCostCenter) continue;
    const mapping = resolveCostCenter(sourceCostCenter);
    row.slice(1).forEach((value, index) => {
      const period = headers[index + 1];
      if (!period) return;
      const amount = parseAmount(value);
      if (!amount) return;
      entries.push({ ...mapping, ...period, amount: roundCurrency(amount) });
    });
  }

  return entries;
};

const getCreditNotePeriodFromFile = (filename) => {
  const match = filename.match(/(?:Summary[_\sfor]*|^)([A-Za-z]{3})[-\s]?(\d{2,4})/i);
  return match ? parsePeriodLabel(`${match[1]}-${match[2]}`) : null;
};

const getHeaderIndex = (headers, names) => headers.findIndex((header) => names.includes(clean(header).toLowerCase()));

const readCreditNoteFile = (filePath) => {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const headers = rows[0].map((header) => clean(header));
  const filePeriod = getCreditNotePeriodFromFile(path.basename(filePath));
  const entries = [];

  if (headers.some((header) => parsePeriodLabel(header))) {
    const costCenterIndex = getHeaderIndex(headers, ["cost code", "cost code"]);
    const periodColumns = headers
      .map((header, index) => ({ index, period: parsePeriodLabel(header) }))
      .filter((item) => item.period);

    for (const row of rows.slice(1)) {
      const mapping = resolveCostCenter(row[costCenterIndex]);
      if (!mapping.sourceCostCenter) continue;
      for (const column of periodColumns) {
        const amount = parseAmount(row[column.index]);
        if (!amount) continue;
        entries.push({ ...mapping, ...column.period, amount: roundCurrency(amount), category: "Credit Note" });
      }
    }
    return entries;
  }

  const costCenterIndex = getHeaderIndex(headers, ["cost code", "cost code"]);
  const totalIndex = getHeaderIndex(headers, ["grand total", "total revenue"]);
  const categoryIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter((item) => item.index !== costCenterIndex && item.index !== totalIndex && item.header);

  if (!filePeriod || costCenterIndex < 0) return entries;

  for (const row of rows.slice(1)) {
    const mapping = resolveCostCenter(row[costCenterIndex]);
    if (!mapping.sourceCostCenter) continue;

    if (totalIndex >= 0) {
      const amount = parseAmount(row[totalIndex]);
      if (amount) entries.push({ ...mapping, ...filePeriod, amount: roundCurrency(amount), category: "Credit Note" });
      continue;
    }

    for (const category of categoryIndexes) {
      const amount = parseAmount(row[category.index]);
      if (!amount) continue;
      entries.push({ ...mapping, ...filePeriod, amount: roundCurrency(amount), category: category.header });
    }
  }

  return entries;
};

const spentData = await readSpentData();
const revenueWorkbook = XLSX.readFile(revenueWorkbookPath, { cellDates: true });
const submittedEntries = readAfpSheet(revenueWorkbook, "Submitted AFP");
const approvedEntries = readAfpSheet(revenueWorkbook, "Approved AFP");
const creditNoteFiles = (await fs.readdir(creditNoteDir))
  .filter((file) => file.toLowerCase().endsWith(".xlsx"))
  .map((file) => path.join(creditNoteDir, file));
const creditNoteEntries = creditNoteFiles.flatMap(readCreditNoteFile);

const monthlyMap = new Map();
const costCenterMap = new Map();
const cnMap = new Map();

for (const item of spentData.byMonth) {
  addInput(monthlyMap, item.period, { period: item.period, month: item.month, year: item.year }, "spent", item.amount);
}

for (const item of spentData.byCostCenter) {
  addInput(costCenterMap, item.costCenter, {
    costCenter: item.costCenter,
    hub: item.hub,
    region: item.region,
  }, "spent", item.amount);
}

for (const item of submittedEntries) {
  addInput(monthlyMap, item.period, { period: item.period, month: item.month, year: item.year }, "submitted", item.amount);
  addInput(costCenterMap, item.costCenter, item, "submitted", item.amount);
}

for (const item of approvedEntries) {
  addInput(monthlyMap, item.period, { period: item.period, month: item.month, year: item.year }, "approved", item.amount);
  addInput(costCenterMap, item.costCenter, item, "approved", item.amount);
}

for (const item of creditNoteEntries) {
  addInput(monthlyMap, item.period, { period: item.period, month: item.month, year: item.year }, "creditNotes", item.amount);
  addInput(costCenterMap, item.costCenter, item, "creditNotes", item.amount);
  addToMap(cnMap, item.costCenter, {
    costCenter: item.costCenter,
    hub: item.hub,
    region: item.region,
    amount: item.amount,
    count: 1,
  });
}

const normalizeInputRows = (rows) => rows
  .map((item) => ({
    ...item,
    spent: roundCurrency(item.spent),
    submitted: roundCurrency(item.submitted),
    approved: roundCurrency(item.approved),
    creditNotes: roundCurrency(item.creditNotes),
    netMovement: roundCurrency(item.approved - item.spent - item.creditNotes),
    afpGap: roundCurrency(item.submitted - item.approved),
  }))
  .sort((a, b) => a.period?.localeCompare(b.period) || Math.abs(b.spent) - Math.abs(a.spent));

const monthlyFlow = normalizeInputRows([...monthlyMap.values()]);
const byCostCenter = normalizeInputRows([...costCenterMap.values()])
  .sort((a, b) => Math.abs(b.spent) - Math.abs(a.spent));
const byCreditNoteCostCenter = [...cnMap.values()]
  .map((item) => ({ ...item, amount: roundCurrency(item.amount) }))
  .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

const latestWithActivity = [...monthlyFlow].reverse().find((item) => item.spent || item.submitted || item.approved || item.creditNotes);
const totals = {
  spent: roundCurrency(spentData.totals.amount),
  submitted: roundCurrency(submittedEntries.reduce((sum, item) => sum + item.amount, 0)),
  approved: roundCurrency(approvedEntries.reduce((sum, item) => sum + item.amount, 0)),
  creditNotes: roundCurrency(creditNoteEntries.reduce((sum, item) => sum + item.amount, 0)),
};
totals.netMovement = roundCurrency(totals.approved - totals.spent - totals.creditNotes);
totals.afpGap = roundCurrency(totals.submitted - totals.approved);

const topCostCenter = byCostCenter[0];
const topGlName = spentData.byGlName[0];
const cnShare = totals.spent ? (totals.creditNotes / totals.spent) * 100 : 0;
const afpApprovalRate = totals.submitted ? (totals.approved / totals.submitted) * 100 : 0;
const costCenterShare = topCostCenter && totals.spent ? (topCostCenter.spent / totals.spent) * 100 : 0;
const glShare = topGlName && totals.spent ? (topGlName.amount / totals.spent) * 100 : 0;

const data = {
  source: {
    spentWorkbook: spentData.source.workbook,
    revenueWorkbook: revenueWorkbookPath,
    creditNoteFolder: creditNoteDir,
    generatedAt: new Date().toISOString(),
  },
  totals,
  latestPeriod: latestWithActivity || null,
  monthlyFlow,
  byCostCenter,
  byGlName: spentData.byGlName,
  creditNotes: {
    total: totals.creditNotes,
    shareOfSpent: roundCurrency(cnShare),
    byCostCenter: byCreditNoteCostCenter,
    entries: creditNoteEntries,
  },
  insights: [
    topCostCenter ? {
      label: "Highest cost center",
      value: topCostCenter.costCenter,
      detail: `${topCostCenter.hub} contributes ${costCenterShare.toFixed(1)}% of total spent.`,
    } : null,
    topGlName ? {
      label: "Major cost driver",
      value: topGlName.glName,
      detail: `${topGlName.glName} represents ${glShare.toFixed(1)}% of total spent.`,
    } : null,
    {
      label: "AFP gap",
      value: roundCurrency(totals.afpGap),
      detail: `Submitted vs approved gap. Approval rate is ${afpApprovalRate.toFixed(1)}%.`,
    },
    {
      label: "Credit note impact",
      value: roundCurrency(totals.creditNotes),
      detail: `CN equals ${cnShare.toFixed(1)}% of total spent.`,
    },
  ].filter(Boolean),
};

await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Generated ${path.relative(repoRoot, outputPath)}`);
console.log(`Spent: ${totals.spent}`);
console.log(`Submitted AFP: ${totals.submitted}`);
console.log(`Approved AFP: ${totals.approved}`);
console.log(`Credit Notes: ${totals.creditNotes}`);
console.log(`Net Movement: ${totals.netMovement}`);
