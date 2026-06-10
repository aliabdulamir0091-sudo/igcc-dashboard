export const AFP_DATA_SOURCE = {
  provider: import.meta.env.VITE_AFP_DATA_PROVIDER || "google-sheets",
  googleSheetId: import.meta.env.VITE_AFP_GOOGLE_SHEET_ID || "1947QuaCl4NkqzbAb2Fex6M7VhQ0QANVjFIE2lhGFP0w",
  googleSheetGid: import.meta.env.VITE_AFP_GOOGLE_SHEET_GID || "0",
  googleSheetName: import.meta.env.VITE_AFP_GOOGLE_SHEET_NAME || "Standardize AFP-Prjects",
};

export const SPENT_DATA_SOURCE = {
  provider: import.meta.env.VITE_SPENT_DATA_PROVIDER || "google-sheets",
  googleSheetId: import.meta.env.VITE_SPENT_GOOGLE_SHEET_ID || "1947QuaCl4NkqzbAb2Fex6M7VhQ0QANVjFIE2lhGFP0w",
  googleSheetGid: import.meta.env.VITE_SPENT_GOOGLE_SHEET_GID || "",
  googleSheetName: import.meta.env.VITE_SPENT_GOOGLE_SHEET_NAME || "Spent Report",
};

export const CREDIT_NOTE_DATA_SOURCE = {
  provider: import.meta.env.VITE_CREDIT_NOTE_DATA_PROVIDER || "google-sheets",
  googleSheetId: import.meta.env.VITE_CREDIT_NOTE_GOOGLE_SHEET_ID || "1947QuaCl4NkqzbAb2Fex6M7VhQ0QANVjFIE2lhGFP0w",
  googleSheetGid: import.meta.env.VITE_CREDIT_NOTE_GOOGLE_SHEET_GID || "1906624255",
  googleSheetName: import.meta.env.VITE_CREDIT_NOTE_GOOGLE_SHEET_NAME || "Credit Note",
};
