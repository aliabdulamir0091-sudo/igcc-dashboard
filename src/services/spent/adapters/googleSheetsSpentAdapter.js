import { fetchGoogleSheetCsvRows } from "../../googleSheetsCsv";
import { parseSpentRows } from "../spentParser";

const SPENT_REPORT_SHEET_NAME = "Spent Report";
const EXPECTED_SPENT_HEADERS = [
  "Level 1",
  "Level 2",
  "Invoice Amount USD",
];

const getSheetConfig = (config, sheetName) => ({
  ...config,
  googleSheetGid: "",
  googleSheetName: sheetName,
});

export async function fetchSpentEntriesFromGoogleSheets(config) {
  const spentReportSheetName = config.googleSheetName || SPENT_REPORT_SHEET_NAME;
  const notRecordedSheetName = config.notRecordedGoogleSheetName || "Not Recorded";
  const [spentReportRows, notRecordedRows] = await Promise.all([
    fetchGoogleSheetCsvRows(getSheetConfig(config, spentReportSheetName), spentReportSheetName, EXPECTED_SPENT_HEADERS),
    fetchGoogleSheetCsvRows(getSheetConfig(config, notRecordedSheetName), notRecordedSheetName, EXPECTED_SPENT_HEADERS),
  ]);

  return [
    ...parseSpentRows(spentReportRows, {
      source: "SPENT_REPORT",
      sourceSheet: spentReportSheetName,
    }),
    ...parseSpentRows(notRecordedRows, {
      source: "NOT_RECORDED",
      sourceSheet: notRecordedSheetName,
    }),
  ];
}
