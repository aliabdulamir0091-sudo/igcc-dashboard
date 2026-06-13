const MONTH_NUMBER_BY_NAME = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

const BGC_AFP_START_YEAR = import.meta.env.VITE_AFP_BGC_START_YEAR || import.meta.env.VITE_AFP_MASTER_START_YEAR || "2026";
const ROO_AFP_START_YEAR = import.meta.env.VITE_AFP_ROO_START_YEAR || "2022";

export function getAfpRecordPeriodKey(record) {
  const period = String(record.period || "").trim();
  const periodMatch = period.match(/^([a-z]{3})\s+(\d{4})$/i);
  if (periodMatch) {
    return `${periodMatch[2]}-${MONTH_NUMBER_BY_NAME[periodMatch[1].toLowerCase()] || "01"}`;
  }
  if (/^\d{4}-\d{2}$/.test(period)) return period;
  if (/^\d{4}[-/]\d{1,2}/.test(period)) {
    const [year, month] = period.split(/[-/]/);
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  const submittedDate = new Date(record.submitted_date || "");
  if (!Number.isNaN(submittedDate.getTime())) return submittedDate.toISOString().slice(0, 7);

  const approvedDate = new Date(record.approved_date || "");
  if (!Number.isNaN(approvedDate.getTime())) return approvedDate.toISOString().slice(0, 7);

  return "";
}

const getAfpScopeText = (record) => [
  record.hub_unit,
  record.hub,
  record.cost_center,
  record.costCenter,
  record.sourceCostCenter,
].map((value) => String(value || "").trim().toLowerCase()).join(" ");

export function getAfpRecordStartYear(record) {
  const text = getAfpScopeText(record);
  if (text.includes("bgc")) return BGC_AFP_START_YEAR;
  if (text.includes("roo")) return ROO_AFP_START_YEAR;
  return "";
}

export function isAfpRecordOnOrAfterYear(record, startYear) {
  const periodKey = getAfpRecordPeriodKey(record);
  return periodKey ? periodKey.slice(0, 4) >= String(startYear) : false;
}

export function isAfpRecordInMasterCoverage(record) {
  const startYear = getAfpRecordStartYear(record);
  if (!startYear) return true;
  return isAfpRecordOnOrAfterYear(record, startYear);
}
