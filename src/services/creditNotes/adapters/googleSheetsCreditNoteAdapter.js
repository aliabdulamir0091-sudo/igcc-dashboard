import { fetchGoogleSheetCsvRows } from "../../googleSheetsCsv";
import { parseCreditNoteRows } from "../creditNoteParser";

export async function fetchCreditNoteEntriesFromGoogleSheets(config) {
  const rows = await fetchGoogleSheetCsvRows(config, "Credit Note", [
    "Period",
    "Cost Code",
    "Materials",
  ]);
  return parseCreditNoteRows(rows);
}
