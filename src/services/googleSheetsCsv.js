import Papa from "papaparse";

const buildExportCsvUrl = ({ googleSheetId, googleSheetGid }) => (
  `https://docs.google.com/spreadsheets/d/${googleSheetId}/export?format=csv&gid=${encodeURIComponent(googleSheetGid)}&cachebust=${Date.now()}`
);

const buildGvizCsvUrl = ({ googleSheetId, googleSheetGid, googleSheetName }) => {
  const tabSelector = googleSheetName
    ? `sheet=${encodeURIComponent(googleSheetName)}`
    : `gid=${encodeURIComponent(googleSheetGid)}`;

  return `https://docs.google.com/spreadsheets/d/${googleSheetId}/gviz/tq?tqx=out:csv&${tabSelector}&cachebust=${Date.now()}`;
};

const buildCsvUrl = (config) => {
  if (config.googleSheetGid) {
    return buildExportCsvUrl(config);
  }

  return buildGvizCsvUrl(config);
};

const parseCsvRows = (csv, errorLabel) => {
  const parsed = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => String(header || "").trim(),
  });

  if (parsed.errors.length) {
    throw new Error(parsed.errors[0].message || `Unable to parse ${errorLabel} CSV.`);
  }

  return parsed.data;
};

const normalizeHeader = (header) => String(header || "")
  .trim()
  .toLowerCase()
  .replace(/[_\-/]+/g, " ")
  .replace(/\s+/g, " ");

const hasExpectedHeaders = (rows, expectedHeaders) => {
  if (!expectedHeaders?.length || !rows.length) return true;

  const headers = new Set(Object.keys(rows[0]).map(normalizeHeader));
  return expectedHeaders.every((header) => headers.has(normalizeHeader(header)));
};

const fetchCsvRowsFromUrl = async (url, errorLabel) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to read ${errorLabel} from Google Sheets (${response.status}).`);
  }

  const csv = await response.text();
  return parseCsvRows(csv, errorLabel);
};

export async function fetchGoogleSheetCsvRows(config, errorLabel, expectedHeaders = []) {
  const primaryRows = await fetchCsvRowsFromUrl(buildCsvUrl(config), errorLabel);
  if (hasExpectedHeaders(primaryRows, expectedHeaders)) {
    return primaryRows;
  }

  const fallbackRows = await fetchCsvRowsFromUrl(buildGvizCsvUrl(config), errorLabel);
  if (!hasExpectedHeaders(fallbackRows, expectedHeaders)) {
    throw new Error(`Unable to parse ${errorLabel} CSV: expected sheet headers were not found.`);
  }

  return fallbackRows;
}
