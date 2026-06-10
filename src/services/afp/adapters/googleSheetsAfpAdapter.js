import Papa from "papaparse";

import { parseAfpRecords } from "../afpParser";

const buildCsvUrl = ({ googleSheetId, googleSheetGid, googleSheetName }) => {
  const tabSelector = googleSheetName
    ? `sheet=${encodeURIComponent(googleSheetName)}`
    : `gid=${googleSheetGid}`;

  return `https://docs.google.com/spreadsheets/d/${googleSheetId}/gviz/tq?tqx=out:csv&${tabSelector}&cachebust=${Date.now()}`;
};

export async function fetchAfpRecordsFromGoogleSheets(config) {
  const response = await fetch(buildCsvUrl(config), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to read AFP_MASTER from Google Sheets (${response.status}).`);
  }

  const csv = await response.text();
  const parsed = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => String(header || "").trim(),
  });

  if (parsed.errors.length) {
    throw new Error(parsed.errors[0].message || "Unable to parse AFP_MASTER CSV.");
  }

  return parseAfpRecords(parsed.data);
}
