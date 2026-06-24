import { useEffect, useMemo, useState } from "react";

import { normalizeCostCenterAlias } from "../data/costCenterAliases";
import financialInputsData from "../data/financialInputsData.json";
import { fetchAfpRecords } from "../services/afp/afpRepository";
import { mergeFinancialInputsWithAfpMaster } from "../services/afp/afpFinancialEntries";
import { fetchCreditNoteEntries } from "../services/creditNotes/creditNoteRepository";
import { fetchSpentEntries } from "../services/spent/spentRepository";

const DEFAULT_COMPARISON = {
  startYear: "Google Sheets only",
  masterSubmitted: 0,
  masterApproved: 0,
  masterRows: 0,
};
const CREDIT_NOTE_START_YEAR = import.meta.env.VITE_CREDIT_NOTE_START_YEAR || "2026";
const MIN_LIVE_SPENT_ROW_COVERAGE = 0.8;

const getSpentEntries = (entries) => entries.filter((entry) => entry.type === "spent");

const isAfpEntry = (entry) => entry.type === "submitted" || entry.type === "approved";

const removeAfpEntries = (entries) => entries.filter((entry) => !isAfpEntry(entry));

const getEntryYears = (entries) => new Set(entries.map((entry) => String(entry.year || "").trim()).filter(Boolean));

const hasAllBaselineYears = (liveEntries, baselineEntries) => {
  const liveYears = getEntryYears(liveEntries);
  return [...getEntryYears(baselineEntries)].every((year) => liveYears.has(year));
};

const isLiveSpentReportCompleteEnough = (liveEntries, baselineEntries) => {
  if (!baselineEntries.length) return liveEntries.length > 0;
  if (!liveEntries.length) return false;
  if (!hasAllBaselineYears(liveEntries, baselineEntries)) return false;
  return liveEntries.length >= baselineEntries.length * MIN_LIVE_SPENT_ROW_COVERAGE;
};

const getSpentPeriodKey = (entry) => String(entry.period || `${entry.year || ""}-${entry.month || ""}`).trim();

const mergeSpentEntriesByLivePeriods = (baselineEntries, liveEntries) => {
  if (!liveEntries.length) return baselineEntries;
  const livePeriods = new Set(liveEntries.map(getSpentPeriodKey).filter(Boolean));
  return [
    ...baselineEntries.filter((entry) => !livePeriods.has(getSpentPeriodKey(entry))),
    ...liveEntries,
  ];
};

const normalizeFinancialEntry = (entry) => ({
  ...entry,
  sourceCostCenter: entry.sourceCostCenter || entry.costCenter,
  costCenter: normalizeCostCenterAlias(entry.costCenter),
  issuedBy: entry.issuedBy ? normalizeCostCenterAlias(entry.issuedBy) : entry.issuedBy,
});

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
      : { entries: removeAfpEntries(financialInputsData.entries || []), comparison: DEFAULT_COMPARISON }
  ), [afpMasterError, afpRecords, isLoadingAfpMaster]);

  const entries = useMemo(() => {
    const baselineSpentEntries = getSpentEntries(merged.entries);
    const shouldReplaceAllSpent = (
      !isLoadingSpentReport
      && !spentReportError
      && isLiveSpentReportCompleteEnough(spentEntries, baselineSpentEntries)
    );
    const shouldUseLiveSpentPeriods = !isLoadingSpentReport && !spentReportError && spentEntries.length > 0;
    const liveMergedSpentEntries = shouldUseLiveSpentPeriods
      ? mergeSpentEntriesByLivePeriods(baselineSpentEntries, spentEntries)
      : baselineSpentEntries;
    const entriesWithSpent = shouldReplaceAllSpent ? [
      ...merged.entries.filter((entry) => entry.type !== "spent"),
      ...spentEntries,
    ] : shouldUseLiveSpentPeriods ? [
      ...merged.entries.filter((entry) => entry.type !== "spent"),
      ...liveMergedSpentEntries,
    ] : merged.entries;

    const combinedEntries = isLoadingCreditNotes || creditNoteError ? entriesWithSpent : [
      ...entriesWithSpent.filter((entry) => (
        entry.type !== "creditNotes" || String(entry.year || entry.period?.slice(0, 4)) < CREDIT_NOTE_START_YEAR
      )),
      ...creditNoteEntries,
    ];

    return combinedEntries.map(normalizeFinancialEntry);
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
