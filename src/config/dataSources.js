export const AFP_DATA_SOURCE = {
  provider: import.meta.env.VITE_AFP_DATA_PROVIDER || "google-sheets",
  googleSheetId: import.meta.env.VITE_AFP_GOOGLE_SHEET_ID || "1947QuaCl4NkqzbAb2Fex6M7VhQ0QANVjFIE2lhGFP0w",
  googleSheetGid: import.meta.env.VITE_AFP_GOOGLE_SHEET_GID || "0",
  googleSheetName: import.meta.env.VITE_AFP_GOOGLE_SHEET_NAME || "Standardize AFP-Prjects",
};
