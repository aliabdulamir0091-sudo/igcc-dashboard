import { useEffect, useMemo, useState } from "react";

import financialInputsData from "../data/financialInputsData.json";
import { fetchAfpRecords } from "../services/afp/afpRepository";
import { mergeFinancialInputsWithAfpMaster } from "../services/afp/afpFinancialEntries";
import { fetchCreditNoteEntries } from "../services/creditNotes/creditNoteRepository";
import { fetchSpentEntries } from "../services/spent/spentRepository";

const DEFAULT_COMPARISON = {
  startYear: import.meta.env.VITE_AFP_MASTER_START_YEAR || "2026",
  legacySubmitted: 0,
  legacyApproved: 0,
  masterSubmitted: 0,
  masterApproved: 0,
  submittedDifference: 0,
  approvedDifference: 0,
  replacedLegacyRows: 0,
  masterRows: 0,
};
const CREDIT_NOTE_START_YEAR = import.meta.env.VITE_CREDIT_NOTE_START_YEAR || "2026";

export function useAfpFinancialInputs() {
  const [afpRecords, setAfpRecords] = useState([]);
  const [spentEntries, setSpentEntries] = useState([]);
  const [creditNoteEntries, setCreditNoteEntries] = useState([]);
  const [isLoadingAfpMaster, setIsLoadingAfpMaster] = useState(true);
  const [isLoadingSpentReport, setIsLoadingSpentReport] = useState(true);
  const [isLoadingCreditNotes, setIsLoadingCreditNotes] = useState(true);
  const [afpMasterError, setAfpMasterError] = useState("");
  const [spentReportError, setSpentReportError] = useState("");
  const [creditNoteError, setCreditNoteError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoadingAfpMaster(true);
    setAfpMasterError("");

    fetchAfpRecords()
      .then((records) => {
        if (isMounted) setAfpRecords(records);
      })
      .catch((error) => {
        if (isMounted) setAfpMasterError(error.message || "Unable to load AFP_MASTER.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingAfpMaster(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingCreditNotes(true);
    setCreditNoteError("");

    fetchCreditNoteEntries()
      .then((entries) => {
        if (isMounted) setCreditNoteEntries(entries);
      })
      .catch((error) => {
        if (isMounted) setCreditNoteError(error.message || "Unable to load Credit Note.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingCreditNotes(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingSpentReport(true);
    setSpentReportError("");

    fetchSpentEntries()
      .then((entries) => {
        if (isMounted) setSpentEntries(entries);
      })
      .catch((error) => {
        if (isMounted) setSpentReportError(error.message || "Unable to load Spent Report.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingSpentReport(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const merged = useMemo(() => (
    !isLoadingAfpMaster && !afpMasterError
      ? mergeFinancialInputsWithAfpMaster(financialInputsData.entries || [], afpRecords)
      : { entries: financialInputsData.entries || [], comparison: DEFAULT_COMPARISON }
  ), [afpMasterError, afpRecords, isLoadingAfpMaster]);

  const entries = useMemo(() => {
    const entriesWithSpent = isLoadingSpentReport || spentReportError ? merged.entries : [
      ...merged.entries.filter((entry) => entry.type !== "spent"),
      ...spentEntries,
    ];

    if (isLoadingCreditNotes || creditNoteError) return entriesWithSpent;
    return [
      ...entriesWithSpent.filter((entry) => (
        entry.type !== "creditNotes" || String(entry.year || entry.period?.slice(0, 4)) < CREDIT_NOTE_START_YEAR
      )),
      ...creditNoteEntries,
    ];
  }, [
    creditNoteEntries,
    creditNoteError,
    isLoadingCreditNotes,
    isLoadingSpentReport,
    merged.entries,
    spentEntries,
    spentReportError,
  ]);

  return {
    entries,
    afpMasterComparison: merged.comparison,
    afpRecords,
    spentEntries,
    creditNoteEntries,
    isLoadingAfpMaster,
    isLoadingSpentReport,
    isLoadingCreditNotes,
    afpMasterError,
    spentReportError,
    creditNoteError,
  };
}
