import Papa from "papaparse";

import { parseSpentRows } from "../spentParser";

const buildCsvUrl = ({ googleSheetId, googleSheetGid, googleSheetName }) => {
  const tabSelector = googleSheetName
    ? `sheet=${encodeURIComponent(googleSheetName)}`
    : `gid=${googleSheetGid}`;

  return `https://docs.google.com/spreadsheets/d/${googleSheetId}/gviz/tq?tqx=out:csv&${tabSelector}&cachebust=${Date.now()}`;
};

export async function fetchSpentEntriesFromGoogleSheets(config) {
  const response = await fetch(buildCsvUrl(config), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to read Spent Report from Google Sheets (${response.status}).`);
  }

  const csv = await response.text();
  const parsed = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => String(header || "").trim(),
  });

  if (parsed.errors.length) {
    throw new Error(parsed.errors[0].message || "Unable to parse Spent Report CSV.");
  }

  return parseSpentRows(parsed.data);
}
