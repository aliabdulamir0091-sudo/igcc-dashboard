import { SPENT_DATA_SOURCE } from "../../config/dataSources";
import { fetchSpentEntriesFromGoogleSheets } from "./adapters/googleSheetsSpentAdapter";

export async function fetchSpentEntries() {
  if (SPENT_DATA_SOURCE.provider === "google-sheets") {
    return fetchSpentEntriesFromGoogleSheets(SPENT_DATA_SOURCE);
  }

  throw new Error(`Unsupported spent data provider: ${SPENT_DATA_SOURCE.provider}`);
}
