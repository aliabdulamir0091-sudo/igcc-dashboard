import { CREDIT_NOTE_DATA_SOURCE } from "../../config/dataSources";
import { fetchCreditNoteEntriesFromGoogleSheets } from "./adapters/googleSheetsCreditNoteAdapter";

export async function fetchCreditNoteEntries() {
  if (CREDIT_NOTE_DATA_SOURCE.provider === "google-sheets") {
    return fetchCreditNoteEntriesFromGoogleSheets(CREDIT_NOTE_DATA_SOURCE);
  }

  throw new Error(`Unsupported credit note data provider: ${CREDIT_NOTE_DATA_SOURCE.provider}`);
}
