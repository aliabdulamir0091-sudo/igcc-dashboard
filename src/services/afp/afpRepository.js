import { AFP_DATA_SOURCE } from "../../config/dataSources";
import { fetchAfpRecordsFromGoogleSheets } from "./adapters/googleSheetsAfpAdapter";

export async function fetchAfpRecords() {
  if (AFP_DATA_SOURCE.provider === "google-sheets") {
    return fetchAfpRecordsFromGoogleSheets(AFP_DATA_SOURCE);
  }

  throw new Error(`Unsupported AFP data provider: ${AFP_DATA_SOURCE.provider}`);
}
