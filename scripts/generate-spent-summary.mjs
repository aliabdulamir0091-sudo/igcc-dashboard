import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { COST_CENTER_HIERARCHY } from "../src/data/costCenterHierarchy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const workbookPath = process.argv[2] || "C:/Users/asus/OneDrive/Desktop/Spent Report/Master Spent Report.xlsx";
const outputPath = path.join(repoRoot, "src/data/spentReportData.json");

const COST_CENTER_ALIASES = {
  "BNGL_25": "BNGL-25",
  "GRLBG": "GRLBG_23",
  "GRLTOT": "GRLTOT_25",
  "TOTAL_25": "GRLTOT_25",
  "GRL_VLV": "General Valves",
  "KAZ": "KAZ_23",
  "NR-NGL25": "NR-NGL_2025",
  "NR-NGL_25": "NR-NGL_2025",
  "OHTL _25": "OHTL_25",
  "camp_23": "Camp",
  "pwri_23": "PWRI_23",
  "E&I-MAJ": "E&I-MAJ_24",
  "QUR_23": "QTC_24",
  "MITSOHTL": "MITAS",
  "MITASOHTL": "MITAS",
  "Management": "HO_SB_23",
  "TMS_26": "MWP_23",
  "CMNT_23": "CVMNT_23",
  "BGCG_23": "GRLBG_23",
  "ROOP_23": "GRLRO_23",
  "BGC_23": "GRLBG_23",
  "ROOM_23": "CVMNT_23",
  "EPMNT_23": "EIMNT_23",
  "HO_23": "HO_SB_23",
  "ROOG_23": "GRLRO_23",
};

const GL_ALIASES = {
  "Air Ticket / Travel": "Air ticket & travel",
  "Air Ticket & Travel": "Air ticket & travel",
  "Communication & Internet": "Communication & internet",
  "Third party Manpower": "Third party manpower",
  "Third party Servcies": "Third party Services",
  "Third party services": "Third party Services",
  "Third Party Services": "Third party Services",
};

const monthOrder = new Map([
  ["Jan", 1],
  ["Feb", 2],
  ["Mar", 3],
  ["Apr", 4],
  ["May", 5],
  ["Jun", 6],
  ["Jul", 7],
  ["Aug", 8],
  ["Sep", 9],
  ["Oct", 10],
  ["Nov", 11],
  ["Dec", 12],
]);

const clean = (value) => String(value ?? "").trim();

const parseAmount = (value) => {
  if (typeof value === "number") return value;
  const normalized = clean(value).replace(/\$/g, "").replace(/,/g, "").replace(/[()]/g, "-");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
};

const roundCurrency = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const canonicalIndex = new Map();
for (const item of COST_CENTER_HIERARCHY) {
  for (const costCenter of item.costCenters) {
    canonicalIndex.set(costCenter, {
      region: item.region,
      hub: item.hub,
      costCenter,
    });
  }
}

const resolveCostCenter = (sourceCostCenter) => {
  const source = clean(sourceCostCenter);
  const canonical = COST_CENTER_ALIASES[source] || source;
  const mapping = canonicalIndex.get(canonical);
  return {
    sourceCostCenter: source,
    canonicalCostCenter: mapping ? canonical : source,
    region: mapping?.region || "Unmapped",
    hub: mapping?.hub || "Unmapped",
    isMapped: Boolean(mapping),
  };
};

const normalizeGl = (value) => {
  const source = clean(value) || "Unclassified";
  return GL_ALIASES[source] || source;
};

const addToMap = (map, key, values) => {
  const current = map.get(key) || { amount: 0, count: 0, ...values };
  current.amount += values.amount || 0;
  current.count += values.count || 0;
  map.set(key, current);
};

const workbook = XLSX.readFile(workbookPath, { cellDates: true });
const sheet = workbook.Sheets.Cost;
if (!sheet) {
  throw new Error("Could not find the Cost sheet in Master Spent Report.xlsx");
}

const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
const transactions = [];
const byRegion = new Map();
const byHub = new Map();
const byCostCenter = new Map();
const byGlName = new Map();
const byMonth = new Map();
const byCostCenterGl = new Map();
const unmapped = new Map();

for (const row of rows) {
  const sourceCostCenter = clean(row["Level 2"]);
  if (!sourceCostCenter) continue;

  const mapping = resolveCostCenter(sourceCostCenter);
  const glName = normalizeGl(row["GL Name"]);
  const costType = clean(row["Cost Type"]) || "Unclassified";
  const vendor = clean(row.Vendor) || "Unspecified";
  const description = clean(row.Description);
  const month = clean(row.Month) || "Unknown";
  const year = clean(row.Year) || "Unknown";
  const amount = parseAmount(row[" Invoice Amount USD "]);
  const period = year !== "Unknown" && monthOrder.has(month) ? `${year}-${String(monthOrder.get(month)).padStart(2, "0")}` : `${year}-${month}`;

  const transaction = {
    serial: clean(row.Serial),
    region: mapping.region,
    hub: mapping.hub,
    sourceCostCenter: mapping.sourceCostCenter,
    costCenter: mapping.canonicalCostCenter,
    isMapped: mapping.isMapped,
    costType,
    glName,
    vendor,
    description,
    amount: roundCurrency(amount),
    invoiceNo: clean(row["Invoice No."]),
    invoiceDate: clean(row["Invoice Date"]),
    poNumber: clean(row["PO Number"]),
    month,
    year,
    period,
  };

  transactions.push(transaction);
  addToMap(byRegion, mapping.region, { region: mapping.region, amount, count: 1 });
  addToMap(byHub, `${mapping.region}|${mapping.hub}`, { region: mapping.region, hub: mapping.hub, amount, count: 1 });
  addToMap(byCostCenter, transaction.costCenter, {
    region: mapping.region,
    hub: mapping.hub,
    costCenter: transaction.costCenter,
    amount,
    count: 1,
  });
  addToMap(byGlName, glName, { glName, amount, count: 1 });
  addToMap(byMonth, period, { period, month, year, amount, count: 1 });
  addToMap(byCostCenterGl, `${transaction.costCenter}|${glName}`, {
    region: mapping.region,
    hub: mapping.hub,
    costCenter: transaction.costCenter,
    glName,
    amount,
    count: 1,
  });

  if (!mapping.isMapped) {
    addToMap(unmapped, mapping.sourceCostCenter, {
      sourceCostCenter: mapping.sourceCostCenter,
      amount,
      count: 1,
    });
  }
}

const toSortedArray = (map) => [...map.values()]
  .map((item) => ({ ...item, amount: roundCurrency(item.amount) }))
  .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

const periodSort = (a, b) => a.period.localeCompare(b.period);

const data = {
  source: {
    workbook: workbookPath,
    sheet: "Cost",
    generatedAt: new Date().toISOString(),
  },
  totals: {
    transactions: transactions.length,
    amount: roundCurrency(transactions.reduce((sum, item) => sum + item.amount, 0)),
    regions: new Set(transactions.map((item) => item.region)).size,
    hubs: new Set(transactions.map((item) => `${item.region}|${item.hub}`)).size,
    costCenters: new Set(transactions.map((item) => item.costCenter)).size,
    glNames: new Set(transactions.map((item) => item.glName)).size,
    unmappedCostCenters: unmapped.size,
  },
  byRegion: toSortedArray(byRegion),
  byHub: toSortedArray(byHub),
  byCostCenter: toSortedArray(byCostCenter),
  byGlName: toSortedArray(byGlName),
  byMonth: toSortedArray(byMonth).sort(periodSort),
  byCostCenterGl: toSortedArray(byCostCenterGl),
  unmappedCostCenters: toSortedArray(unmapped),
  transactions: transactions
    .sort((a, b) => b.period.localeCompare(a.period) || Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 500),
};

await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Generated ${path.relative(repoRoot, outputPath)}`);
console.log(`Transactions: ${data.totals.transactions}`);
console.log(`Total amount: ${data.totals.amount}`);
console.log(`Unmapped cost centers: ${data.unmappedCostCenters.map((item) => item.sourceCostCenter).join(", ") || "None"}`);
