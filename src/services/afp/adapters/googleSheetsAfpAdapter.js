import { fetchGoogleSheetCsvRows } from "../../googleSheetsCsv";
import { parseAfpRecords } from "../afpParser";

export async function fetchAfpRecordsFromGoogleSheets(config) {
  const rows = await fetchGoogleSheetCsvRows(config, "AFP_MASTER", [
    "AFP NO",
    "Submitted Value",
    "Period",
  ]);
  return parseAfpRecords(rows);
}
