import { fetchGoogleSheetCsvRows } from "../../googleSheetsCsv";
import { parseSpentRows } from "../spentParser";

export async function fetchSpentEntriesFromGoogleSheets(config) {
  const rows = await fetchGoogleSheetCsvRows(config, "Spent Report", [
    "Level 1",
    "Level 2",
    "Invoice Amount USD",
  ]);
  return parseSpentRows(rows);
}
